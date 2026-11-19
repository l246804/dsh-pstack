import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SEMANTIC_REVIEW_STATUSES,
  type Treatment,
  type RunRecord,
  type SemanticReview,
  type SemanticReviewStatus,
  type TestTarget,
} from "../../runner/types.ts";
import { isRunRecord } from "../../runner/lib/evidence.ts";
import { EVIDENCE_DIRECTORIES, EVIDENCE_FILES } from "../../runner/lib/evidence-files.ts";
import { reviewSnapshotDirectory } from "../../runner/lib/review-snapshot.ts";

export type ReviewReviewer = { kind: "human"; name: string } | { kind: "model"; route: TestTarget };

/** One scenario's reviewed result, matching the non-pending `SemanticReview` variant. */
export interface ReviewEntry {
  status: SemanticReviewStatus;
  reason: string;
  reviewer: ReviewReviewer;
}

export type ReviewEntries = Record<string, ReviewEntry>;

export interface SnapshotRecord {
  scenarioId: string;
  file: string;
  record: RunRecord;
}

export const REVIEW_FILE = "review.json";

export function reviewInputPath(treatment: Treatment, environment: string, root?: string): string {
  return join(reviewSnapshotDirectory(treatment, environment, root), REVIEW_FILE);
}

function routeOf(value: unknown, context: string): TestTarget {
  if (value === null || typeof value !== "object") {
    throw new Error(`${context}: reviewer.route must be an object`);
  }
  const route = value as Partial<TestTarget>;
  for (const key of ["provider", "model", "effort"] as const) {
    if (typeof route[key] !== "string" || route[key] === "") {
      throw new Error(`${context}: reviewer.route.${key} must be a non-empty string`);
    }
  }
  return { provider: route.provider!, model: route.model!, effort: route.effort! };
}

function reviewerOf(value: unknown, context: string): ReviewReviewer {
  if (value === null || typeof value !== "object") {
    throw new Error(`${context}: reviewer must be an object`);
  }
  const reviewer = value as { kind?: unknown; name?: unknown; route?: unknown };
  if (reviewer.kind === "human") {
    if (typeof reviewer.name !== "string" || reviewer.name === "") {
      throw new Error(`${context}: human reviewer.name must be a non-empty string`);
    }
    return { kind: "human", name: reviewer.name };
  }
  if (reviewer.kind === "model") {
    return { kind: "model", route: routeOf(reviewer.route, context) };
  }
  throw new Error(`${context}: reviewer.kind must be "human" or "model"`);
}

function entryOf(scenarioId: string, value: unknown): ReviewEntry {
  const context = `review ${scenarioId}`;
  if (value === null || typeof value !== "object") {
    throw new Error(`${context}: entry must be an object`);
  }
  const entry = value as { status?: unknown; reason?: unknown; reviewer?: unknown };
  const status = entry.status;
  if (typeof status !== "string" || !SEMANTIC_REVIEW_STATUSES.some((known) => known === status)) {
    throw new Error(
      `${context}: status ${JSON.stringify(status)} is not one of ${SEMANTIC_REVIEW_STATUSES.join("/")}`,
    );
  }
  if (typeof entry.reason !== "string") {
    throw new Error(`${context}: reason must be a string`);
  }
  return {
    status: status as SemanticReviewStatus,
    reason: entry.reason,
    reviewer: reviewerOf(entry.reviewer, context),
  };
}

/**
 * Parse a `review.json` payload. The file is external analysis input, so this is the one
 * place it is narrowed to typed entries; both CLI checks and status reads trust the result.
 */
export function parseReviewEntries(text: string, file = REVIEW_FILE): ReviewEntries {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${file}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file}: review.json must be an object keyed by scenario id`);
  }
  const entries: ReviewEntries = {};
  for (const [scenarioId, value] of Object.entries(parsed)) {
    entries[scenarioId] = entryOf(scenarioId, value);
  }
  return entries;
}

export function readReviewEntries(
  treatment: Treatment,
  environment: string,
  root?: string,
): ReviewEntries {
  const file = reviewInputPath(treatment, environment, root);
  if (!existsSync(file)) throw new Error(`review.json is missing: ${file}`);
  return parseReviewEntries(readFileSync(file, "utf8"), file);
}

/** Convert a parsed review entry to the reviewed `SemanticReview` variant. */
export function toSemanticReview(entry: ReviewEntry): SemanticReview {
  return { status: entry.status, reason: entry.reason, reviewer: entry.reviewer };
}

/**
 * Every committed record.json in one review snapshot, ordered by scenario id. A record is
 * a `record.json` under `scenarios/<scenarioId>/<treatment>-<environment>/`.
 */
export function listSnapshotRecords(
  treatment: Treatment,
  environment: string,
  root?: string,
): SnapshotRecord[] {
  const scenarios = join(
    reviewSnapshotDirectory(treatment, environment, root),
    EVIDENCE_DIRECTORIES.scenarios,
  );
  if (!existsSync(scenarios)) return [];
  const found: SnapshotRecord[] = [];
  for (const entry of readdirSync(scenarios, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(scenarios, entry.name, `${treatment}-${environment}`, EVIDENCE_FILES.record);
    if (!existsSync(file)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(
        `invalid RunRecord JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!isRunRecord(parsed)) throw new Error(`not a RunRecord: ${file}`);
    found.push({ scenarioId: parsed.scenarioId, file, record: parsed });
  }
  return found.sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));
}
