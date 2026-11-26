import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  SEMANTIC_REVIEW_STATUSES,
  type RunEnvironment,
  type RunRecord,
  type SemanticReview,
  type SemanticReviewStatus,
  type TestTarget,
  type Variant,
} from "../types.ts";
import { isRunRecord, latestRecords, recordFileName } from "./evidence.ts";
import { EVIDENCE_DIRECTORIES, EVIDENCE_FILES } from "./evidence-files.ts";
import { sanitizeRecord } from "./redaction.ts";
import { PLAYGROUND_DIRECTORY, workersDirectory } from "../worker/run-metadata.ts";
import { workerPaths } from "../worker/worker.ts";

export const REVIEWS_DIRECTORY = join(PLAYGROUND_DIRECTORY, "evidence", "runs");

export interface BatchMetadata {
  batchId: string;
  variant: Variant;
  environment: string;
  mode: "full" | "incremental";
  scope: string[];
  startedAt: string;
  upstreamRevision?: string;
}

export function reviewSnapshotDirectory(
  variant: Variant,
  environment: string,
  root = REVIEWS_DIRECTORY,
): string {
  return join(root, `${variant}-${environment}`);
}

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

export function reviewInputPath(variant: Variant, environment: string, root?: string): string {
  return join(reviewSnapshotDirectory(variant, environment, root), REVIEW_FILE);
}

function routeOf(value: unknown, context: string): TestTarget {
  if (value === null || typeof value !== "object") {
    throw new Error(`${context}: reviewer.route must be an object`);
  }
  const route = value as { provider?: unknown; model?: unknown; effort?: unknown };
  if (typeof route.provider !== "string" || route.provider === "") {
    throw new Error(`${context}: reviewer.route.provider must be a non-empty string`);
  }
  if (typeof route.model !== "string" || route.model === "") {
    throw new Error(`${context}: reviewer.route.model must be a non-empty string`);
  }
  if (typeof route.effort !== "string" || route.effort === "") {
    throw new Error(`${context}: reviewer.route.effort must be a non-empty string`);
  }
  return { provider: route.provider, model: route.model, effort: route.effort };
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
  const status = SEMANTIC_REVIEW_STATUSES.find((known) => known === entry.status);
  if (status === undefined) {
    throw new Error(
      `${context}: status ${JSON.stringify(entry.status)} is not one of ${SEMANTIC_REVIEW_STATUSES.join("/")}`,
    );
  }
  if (typeof entry.reason !== "string") {
    throw new Error(`${context}: reason must be a string`);
  }
  return {
    status,
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
  variant: Variant,
  environment: string,
  root?: string,
): ReviewEntries {
  const file = reviewInputPath(variant, environment, root);
  if (!existsSync(file)) throw new Error(`review.json is missing: ${file}`);
  return parseReviewEntries(readFileSync(file, "utf8"), file);
}

/** Convert a parsed review entry to the reviewed `SemanticReview` variant. */
export function toSemanticReview(entry: ReviewEntry): SemanticReview {
  return { status: entry.status, reason: entry.reason, reviewer: entry.reviewer };
}

/**
 * Every committed record.json in one review snapshot, ordered by scenario id. A record is
 * a `record.json` under `scenarios/<scenarioId>/<variant>-<environment>/`.
 */
export interface SnapshotRecordFile {
  scenarioId: string;
  file: string;
}

/** List the canonical record.json paths without parsing them. */
export function listSnapshotRecordFiles(
  variant: Variant,
  environment: string,
  root?: string,
): SnapshotRecordFile[] {
  const scenarios = join(
    reviewSnapshotDirectory(variant, environment, root),
    EVIDENCE_DIRECTORIES.scenarios,
  );
  if (!existsSync(scenarios)) return [];
  const found: SnapshotRecordFile[] = [];
  for (const entry of readdirSync(scenarios, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(scenarios, entry.name, `${variant}-${environment}`, EVIDENCE_FILES.record);
    if (existsSync(file)) found.push({ scenarioId: entry.name, file });
  }
  return found.sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));
}

/**
 * Every committed record.json in one review snapshot, ordered by scenario id. A record is
 * a `record.json` under `scenarios/<scenarioId>/<variant>-<environment>/`.
 */
export function listSnapshotRecords(
  variant: Variant,
  environment: string,
  root?: string,
): SnapshotRecord[] {
  return listSnapshotRecordFiles(variant, environment, root).map(({ scenarioId, file }) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(
        `invalid RunRecord JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!isRunRecord(parsed)) throw new Error(`not a RunRecord: ${file}`);
    return { scenarioId, file, record: parsed };
  });
}

export function batchMetadataFile(variant: Variant, environment: string): string {
  return join(workersDirectory(), variant, environment, "current-batch.json");
}

export function readBatchMetadata(variant: Variant, environment: string): BatchMetadata | null {
  const file = batchMetadataFile(variant, environment);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<BatchMetadata>;
    if (
      typeof parsed.batchId !== "string" ||
      parsed.variant !== variant ||
      parsed.environment !== environment ||
      (parsed.mode !== "full" && parsed.mode !== "incremental") ||
      !Array.isArray(parsed.scope)
    ) {
      throw new Error("current batch metadata has an invalid shape");
    }
    return {
      batchId: parsed.batchId,
      variant: parsed.variant,
      environment: parsed.environment,
      mode: parsed.mode,
      scope: parsed.scope.filter((entry): entry is string => typeof entry === "string"),
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
      ...(typeof parsed.upstreamRevision === "string"
        ? { upstreamRevision: parsed.upstreamRevision }
        : {}),
    };
  } catch (error) {
    throw new Error(
      `invalid batch metadata ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function writeBatchMetadata(metadata: BatchMetadata): void {
  const file = batchMetadataFile(metadata.variant, metadata.environment);
  mkdirSync(dirname(file), { recursive: true });
  writeJsonAtomically(file, metadata);
}

/** Lock file that prevents two batches from writing the same variant/environment. */
export function batchLockFile(variant: Variant, environment: string): string {
  return join(workersDirectory(), variant, environment, "batch.lock");
}

/** Acquire the batch lock; returns an idempotent release function. */
export function acquireBatchLock(metadata: BatchMetadata): () => void {
  const file = batchLockFile(metadata.variant, metadata.environment);
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(
      file,
      `${JSON.stringify({ batchId: metadata.batchId, pid: process.pid, startedAt: metadata.startedAt })}\n`,
      { flag: "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`another batch holds ${file}; stop it before starting ${metadata.batchId}`);
    }
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    rmSync(file, { force: true });
  };
}

/** Write one JSON file through a same-directory temporary file and rename. */
function writeJsonAtomically(file: string, value: unknown): void {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
}

/** Problems when a batch would reuse a record produced by an earlier batch. */
export function batchRecordProblems(batch: BatchMetadata, records: readonly RunRecord[]): string[] {
  return records
    .filter((record) => record.batchId !== batch.batchId)
    .map((record) => `${record.scenarioId} has no record in batch ${batch.batchId}`)
    .sort();
}

function readRecords(directory: string): RunRecord[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return readRecords(file);
    if (!entry.name.endsWith(".json")) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
      return isRunRecord(parsed) ? [parsed] : [];
    } catch (error) {
      throw new Error(
        `invalid RunRecord JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

interface RecordSource {
  recordFile?: string;
  screenshotFile?: string;
  sessionFile?: string;
}

function sourceFor(record: RunRecord): RecordSource {
  const paths = workerPaths(
    record.environment.worker,
    record.environment.matrix.id,
    record.variant,
  );
  const stamp = record.capturedAt.replace(/[:.]/g, "-");
  const sourceFile = join(
    paths.evidenceDir,
    recordFileName(record.scenarioId, record.variant, record.environment.matrix.id, stamp).replace(
      /\.json$/,
      EVIDENCE_FILES.sourceSuffix,
    ),
  );
  if (!existsSync(sourceFile)) throw new Error(`missing evidence source file: ${sourceFile}`);
  return JSON.parse(readFileSync(sourceFile, "utf8")) as RecordSource;
}

function copyRunEvidence(record: RunRecord, directory: string): void {
  mkdirSync(directory, { recursive: true });
  const source = sourceFor(record);
  writeJsonAtomically(join(directory, EVIDENCE_FILES.record), sanitizeRecord(record));
  if (source.screenshotFile && existsSync(source.screenshotFile)) {
    copyFileSync(source.screenshotFile, join(directory, EVIDENCE_FILES.screenshot));
    return;
  }
  if (record.verdict.status !== "blocked" && record.blockedReason === undefined) {
    throw new Error(`missing screenshot for ${record.scenarioId} (${record.variant})`);
  }
}

export interface ReviewSnapshotManifest {
  variant: Variant;
  environment: string;
  dshVersion: string;
  pstackVersion: string;
  updatedAt: string;
  lastBatchId: string | null;
  lastMode: "full" | "incremental" | null;
  lastScope: string[];
  scenarioIds: string[];
  scenarios: Array<{
    id: string;
    capturedAt: string;
    batchId: string | null;
    environment: RunEnvironment;
  }>;
}

export function writeReviewSnapshot(
  variant: Variant,
  environment: string,
  batch: BatchMetadata | null,
  allRecords: RunRecord[],
  reviewsDirectory = REVIEWS_DIRECTORY,
): ReviewSnapshotManifest {
  const latest = latestRecords(allRecords);
  const current = latest.filter(
    (record) => record.variant === variant && record.environment.matrix.id === environment,
  );
  if (current.length === 0) {
    throw new Error(
      `no records for ${variant}-${environment}; refusing to write an empty snapshot`,
    );
  }
  const scoped =
    batch === null ? current : current.filter((record) => batch.scope.includes(record.scenarioId));
  const scopedIds = new Set(scoped.map((record) => record.scenarioId));
  if (batch !== null) {
    const missing = batch.scope.filter((scenarioId) => !scopedIds.has(scenarioId)).sort();
    if (missing.length > 0) {
      throw new Error(
        `batch ${batch.batchId} has no record for ${missing.join(", ")}; refusing to reuse previous snapshot records`,
      );
    }
    const reused = batchRecordProblems(batch, scoped);
    if (reused.length > 0) {
      throw new Error(
        `batch ${batch.batchId} has no fresh record for ${reused.join(", ")}; refusing to reuse previous snapshot records`,
      );
    }
  }
  const retained =
    batch?.mode === "full"
      ? []
      : listSnapshotRecords(variant, environment, reviewsDirectory)
          .filter(({ scenarioId }) => !scopedIds.has(scenarioId))
          .map(({ record }) => record);
  const manifestRecords = [...retained, ...scoped];
  const manifestIds = new Set(manifestRecords.map((record) => record.scenarioId));
  const dshVersions = new Set(manifestRecords.map((record) => record.environment.dshVersion));
  const pstackVersions = new Set(manifestRecords.map((record) => record.environment.pstackVersion));
  if (dshVersions.size > 1 || pstackVersions.size > 1) {
    throw new Error(
      `snapshot mixes DSH/pstack versions (${[...dshVersions].join(", ")} / ${[...pstackVersions].join(", ")}); rerun the full batch`,
    );
  }
  const snapshot = reviewSnapshotDirectory(variant, environment, reviewsDirectory);
  const temporary = `${snapshot}.tmp-${process.pid}-${Date.now()}`;

  try {
    // A full batch owns the whole snapshot and starts from an empty tree; an incremental
    // batch preserves every unrerun scenario. review.json is user-authored, so keep it in
    // both modes.
    if (batch?.mode === "full") {
      mkdirSync(temporary, { recursive: true });
      const reviewFile = join(snapshot, REVIEW_FILE);
      if (existsSync(reviewFile)) copyFileSync(reviewFile, join(temporary, REVIEW_FILE));
    } else if (existsSync(snapshot)) {
      cpSync(snapshot, temporary, { recursive: true });
    } else {
      mkdirSync(temporary, { recursive: true });
    }

    for (const record of scoped) {
      const directory = join(
        temporary,
        EVIDENCE_DIRECTORIES.scenarios,
        record.scenarioId,
        `${variant}-${environment}`,
      );
      rmSync(directory, { recursive: true, force: true });
      copyRunEvidence(record, directory);
    }

    const manifest: ReviewSnapshotManifest = {
      variant,
      environment,
      dshVersion: manifestRecords[0]?.environment.dshVersion ?? "",
      pstackVersion: manifestRecords[0]?.environment.pstackVersion ?? "",
      updatedAt: new Date().toISOString(),
      lastBatchId: batch?.batchId ?? null,
      lastMode: batch?.mode ?? null,
      lastScope: batch?.scope ?? [],
      scenarioIds: [...manifestIds].sort(),
      scenarios: manifestRecords.map((record) => ({
        id: record.scenarioId,
        capturedAt: record.capturedAt,
        batchId: record.batchId ?? null,
        environment: record.environment,
      })),
    };
    mkdirSync(temporary, { recursive: true });
    writeJsonAtomically(join(temporary, "manifest.json"), manifest);
    rmSync(snapshot, { recursive: true, force: true });
    renameSync(temporary, snapshot);
    return manifest;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function collectReviewSnapshot(
  variant: Variant,
  environment: string,
): ReviewSnapshotManifest {
  return writeReviewSnapshot(
    variant,
    environment,
    readBatchMetadata(variant, environment),
    readRecords(workersDirectory()),
  );
}
