import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Phase, RunRecord, SemanticReview, TestTarget } from "../../types.ts";
import { evaluateAssertions, isRunRecord, latestRecords, verdictFor } from "./evidence.ts";
import { PLAYGROUND_DIRECTORY } from "./run-metadata.ts";
import { loadScenario } from "./scenarios.ts";

export const REVIEWS_DIRECTORY = join(PLAYGROUND_DIRECTORY, "reviews");

const REVIEWED_STATUSES = ["supported", "gap", "inconclusive"] as const;
export type ReviewedStatus = (typeof REVIEWED_STATUSES)[number];
export type Review = Extract<SemanticReview, { status: ReviewedStatus }>;
export type ReviewFile = Review & { reviewedAt: string };

export interface ReviewIdentity {
  scenarioId: string;
  phase: Phase;
  environmentId: string;
}

export interface ReviewSidecar {
  file: string;
  identity: ReviewIdentity;
  review: ReviewFile;
}

const PHASES: readonly Phase[] = ["raw", "adapted"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Route values that are editing placeholders, not a reviewer identity. */
const ROUTE_PLACEHOLDERS = new Set(["pending"]);

/**
 * A sidecar name is `<scenarioId>-<phase>-<environmentId>.json`. Neither scenario ids nor
 * environment ids are free of hyphens, so resolve the scenario against the registry and take
 * the longest match first instead of splitting on every hyphen.
 */
export function parseReviewFileName(
  fileName: string,
  scenarioIds: string[],
): ReviewIdentity | null {
  if (!fileName.endsWith(".json")) return null;
  const stem = fileName.slice(0, -".json".length);
  for (const scenarioId of [...scenarioIds].sort((a, b) => b.length - a.length)) {
    const prefix = `${scenarioId}-`;
    if (!stem.startsWith(prefix)) continue;
    const rest = stem.slice(prefix.length);
    for (const phase of PHASES) {
      const phasePrefix = `${phase}-`;
      if (!rest.startsWith(phasePrefix)) continue;
      const environmentId = rest.slice(phasePrefix.length);
      if (/^[a-z0-9-]+$/.test(environmentId)) return { scenarioId, phase, environmentId };
    }
  }
  return null;
}

/** Validate one parsed sidecar. Every missing field is reported, not just the first. */
export function parseReviewValue(value: unknown): { review?: ReviewFile; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { errors: ["review must be a JSON object"] };
  if (
    !nonEmptyString(value.status) ||
    !REVIEWED_STATUSES.includes(value.status as ReviewedStatus)
  ) {
    errors.push('status must be one of "supported", "gap", "inconclusive"');
  }
  if (!nonEmptyString(value.reason)) errors.push("reason must be a non-empty string");
  if (!nonEmptyString(value.reviewedAt) || Number.isNaN(Date.parse(value.reviewedAt))) {
    errors.push("reviewedAt must be a valid ISO timestamp");
  }
  let reviewer: ReviewFile["reviewer"] | undefined;
  const rawReviewer = value.reviewer;
  if (!isRecord(rawReviewer)) {
    errors.push("reviewer is required");
  } else if (rawReviewer.kind === "model") {
    const route = rawReviewer.route;
    if (!isRecord(route)) {
      errors.push("reviewer.route is required for a model reviewer");
    } else {
      const target: Partial<TestTarget> = {};
      for (const field of ["provider", "model", "effort"] as const) {
        const value = route[field];
        if (!nonEmptyString(value)) {
          errors.push(`reviewer.route.${field} must be a non-empty string`);
        } else if (ROUTE_PLACEHOLDERS.has(value.trim().toLowerCase())) {
          errors.push(`reviewer.route.${field} must not be the placeholder "${value}"`);
        } else {
          target[field] = value;
        }
      }
      if (errors.length === 0) reviewer = { kind: "model", route: target as TestTarget };
    }
  } else if (rawReviewer.kind === "human") {
    if (nonEmptyString(rawReviewer.name)) reviewer = { kind: "human", name: rawReviewer.name };
    else errors.push("reviewer.name must be a non-empty string for a human reviewer");
  } else {
    errors.push('reviewer.kind must be "model" or "human"');
  }
  if (errors.length > 0 || !reviewer) return { errors };
  return {
    review: {
      status: value.status as ReviewedStatus,
      reason: value.reason as string,
      reviewer,
      reviewedAt: value.reviewedAt as string,
    },
    errors,
  };
}

export function readReviewSidecars(
  reviewsDirectory: string,
  scenarioIds: string[],
): { sidecars: ReviewSidecar[]; errors: string[] } {
  if (!existsSync(reviewsDirectory)) return { sidecars: [], errors: [] };
  const sidecars: ReviewSidecar[] = [];
  const errors: string[] = [];
  for (const name of readdirSync(reviewsDirectory).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = join(reviewsDirectory, name);
    if (!statSync(file).isFile()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(
        `${name}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }
    const { review, errors: valueErrors } = parseReviewValue(parsed);
    const identity = parseReviewFileName(name, scenarioIds);
    const issues = [...valueErrors];
    if (!identity) issues.push("file name must be <scenarioId>-<phase>-<environmentId>.json");
    if (issues.length > 0) {
      for (const issue of issues) errors.push(`${name}: ${issue}`);
      continue;
    }
    sidecars.push({ file, identity: identity as ReviewIdentity, review: review as ReviewFile });
  }
  return { sidecars, errors };
}

/** Recursively read the RunRecords a worker tree keeps beside its state files. */
export function readRunRecords(directory: string): RunRecord[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return readRunRecords(file);
    if (!entry.name.endsWith(".json")) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
      return isRunRecord(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

function environmentDirectories(workersRoot: string): string[] {
  if (!existsSync(workersRoot)) return [];
  return readdirSync(workersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function keyOf(identity: ReviewIdentity): string {
  return `${identity.scenarioId}\0${identity.phase}\0${identity.environmentId}`;
}

/**
 * The mechanical failures the reviewed run recorded. A record captured with the
 * mechanicalFailures field carries the exact list its verdict saw, so a supported review
 * can never launder a failure the pending verdict hid. Records written before the field
 * existed lack it on disk; for those, re-evaluate the scenario assertions from the
 * record's own session facts, and fall back to the failures a non-pending verdict already
 * exposes when the scenario is unknown.
 */
function recordFailures(record: RunRecord): { failures: string[]; blockedReason?: string } {
  if (record.verdict.status === "blocked")
    return { failures: [], blockedReason: record.verdict.reason };
  if (Array.isArray(record.mechanicalFailures)) return { failures: record.mechanicalFailures };
  if (!record.session) return { failures: [] };
  try {
    const scenario = loadScenario(record.scenarioId);
    return {
      failures: evaluateAssertions(
        scenario.assertions,
        record.session,
        record.session.workspacePath ?? "",
      ),
    };
  } catch {
    const verdict = record.verdict;
    if (verdict.status === "gap" || verdict.status === "not-verified") {
      const reasons = "gaps" in verdict ? verdict.gaps : verdict.failures;
      return { failures: reasons.filter((entry) => entry !== record.semanticReview.reason) };
    }
    return { failures: [] };
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
}

export interface ApplyResult {
  written: Array<{ identity: ReviewIdentity; recordFile: string }>;
  skipped: ReviewIdentity[];
  /** Sidecars whose latest record was captured after the review: a rerun superseded them. */
  stale: ReviewIdentity[];
  missingRecord: ReviewIdentity[];
  errors: string[];
}

export interface ReviewPaths {
  reviewsDirectory: string;
  workersDirectory: string;
  scenarioIds: string[];
  now?: () => Date;
}

/**
 * For every valid sidecar, append a new RunRecord revision to the latest record it
 * reviews. A sidecar only reviews evidence captured no later than its reviewedAt: when the
 * latest record is newer, the case was rerun and the sidecar is counted stale instead of
 * laundering the old verdict onto evidence the reviewer never saw. Re-applying the same
 * sidecar is a no-op: the latest revision already carries that review's semanticReview and
 * reviewedAt. Original records are never deleted.
 */
export function applyReviews(paths: ReviewPaths): ApplyResult {
  const { sidecars, errors } = readReviewSidecars(paths.reviewsDirectory, paths.scenarioIds);
  const now = paths.now ?? (() => new Date());
  const result: ApplyResult = { written: [], skipped: [], stale: [], missingRecord: [], errors };
  const cache = new Map<string, RunRecord[]>();
  const recordsFor = (environmentId: string): RunRecord[] => {
    const cached = cache.get(environmentId);
    if (cached) return cached;
    const records = readRunRecords(join(paths.workersDirectory, environmentId));
    cache.set(environmentId, records);
    return records;
  };
  for (const { identity, review } of sidecars) {
    const latest = latestRecords(recordsFor(identity.environmentId)).find(
      (entry) => entry.scenarioId === identity.scenarioId && entry.phase === identity.phase,
    );
    if (!latest) {
      result.missingRecord.push(identity);
      continue;
    }
    const semanticReview: SemanticReview = {
      status: review.status,
      reason: review.reason,
      reviewer: review.reviewer,
    };
    if (
      latest.reviewedAt === review.reviewedAt &&
      JSON.stringify(latest.semanticReview) === JSON.stringify(semanticReview)
    ) {
      result.skipped.push(identity);
      continue;
    }
    // The idempotence check must stay ahead of this one: a revision captures at apply
    // time, always later than the reviewedAt it merged, and must stay a no-op, not stale.
    if (Date.parse(latest.capturedAt) > Date.parse(review.reviewedAt)) {
      result.stale.push(identity);
      continue;
    }
    const verdictInput = { phase: identity.phase, semanticReview, ...recordFailures(latest) };
    const capturedAt = now().toISOString();
    const stamp = capturedAt.replace(/[:.]/g, "-");
    const recordFile = join(
      dirname(resolve(latest.artifacts.recordFile)),
      `${identity.scenarioId}-${identity.phase}-${identity.environmentId}-review-${stamp}.json`,
    );
    const revision: RunRecord = {
      ...latest,
      semanticReview,
      reviewedAt: review.reviewedAt,
      mechanicalFailures: verdictInput.failures,
      verdict: verdictFor(verdictInput),
      capturedAt,
      artifacts: { ...latest.artifacts, recordFile },
    };
    writeJsonAtomic(recordFile, revision);
    cache.set(identity.environmentId, [...recordsFor(identity.environmentId), revision]);
    result.written.push({ identity, recordFile });
  }
  return result;
}

export interface ReviewInspection {
  sidecars: ReviewSidecar[];
  errors: string[];
  reviewed: ReviewIdentity[];
  pending: ReviewIdentity[];
  orphaned: ReviewIdentity[];
}

/** Read-only view for the command without --apply: what is reviewed and what still waits. */
export function inspectReviews(paths: Omit<ReviewPaths, "now">): ReviewInspection {
  const { sidecars, errors } = readReviewSidecars(paths.reviewsDirectory, paths.scenarioIds);
  const sidecarKeys = new Set(sidecars.map((sidecar) => keyOf(sidecar.identity)));
  const recordKeys = new Set<string>();
  const reviewed: ReviewIdentity[] = [];
  const pending: ReviewIdentity[] = [];
  for (const environmentId of environmentDirectories(paths.workersDirectory)) {
    for (const record of latestRecords(
      readRunRecords(join(paths.workersDirectory, environmentId)),
    )) {
      const identity: ReviewIdentity = {
        scenarioId: record.scenarioId,
        phase: record.phase,
        environmentId: record.environment.matrix.id,
      };
      const key = keyOf(identity);
      if (recordKeys.has(key)) continue;
      recordKeys.add(key);
      (sidecarKeys.has(key) ? reviewed : pending).push(identity);
    }
  }
  const orphaned = sidecars
    .map((sidecar) => sidecar.identity)
    .filter((identity) => !recordKeys.has(keyOf(identity)));
  return { sidecars, errors, reviewed, pending, orphaned };
}
