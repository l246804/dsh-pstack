import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type { RunEnvironment, RunRecord, Variant } from "../types.ts";
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
  writeFileSync(file, `${JSON.stringify(metadata, null, 2)}\n`);
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
  writeFileSync(
    join(directory, EVIDENCE_FILES.record),
    `${JSON.stringify(sanitizeRecord(record), null, 2)}\n`,
  );
  if (source.screenshotFile && existsSync(source.screenshotFile)) {
    copyFileSync(source.screenshotFile, join(directory, EVIDENCE_FILES.screenshot));
  }
  if (source.sessionFile && existsSync(source.sessionFile)) {
    copyFileSync(source.sessionFile, join(directory, EVIDENCE_FILES.session));
  }
}

function scenarioDirectory(
  variant: Variant,
  environment: string,
  scenarioId: string,
  root = REVIEWS_DIRECTORY,
): string {
  return join(
    reviewSnapshotDirectory(variant, environment, root),
    "scenarios",
    scenarioId,
    `${variant}-${environment}`,
  );
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
  const currentIds = new Set(current.map((record) => record.scenarioId));
  const scoped =
    batch === null ? current : current.filter((record) => batch.scope.includes(record.scenarioId));
  const scopedIds = new Set(scoped.map((record) => record.scenarioId));
  const snapshot = reviewSnapshotDirectory(variant, environment, reviewsDirectory);
  const scenarios = join(snapshot, EVIDENCE_DIRECTORIES.scenarios);

  // Only a full batch owns the whole snapshot, so only it may drop scenario dirs that this
  // batch did not rerun. An incremental batch preserves every unrerun scenario.
  if (batch?.mode === "full" && existsSync(scenarios)) {
    for (const scenario of readdirSync(scenarios, { withFileTypes: true })) {
      if (scenario.isDirectory() && !scopedIds.has(scenario.name)) {
        rmSync(join(scenarios, scenario.name), { recursive: true, force: true });
      }
    }
  }

  for (const record of scoped) {
    const directory = scenarioDirectory(variant, environment, record.scenarioId, reviewsDirectory);
    rmSync(directory, { recursive: true, force: true });
    copyRunEvidence(record, directory);
  }

  const manifest: ReviewSnapshotManifest = {
    variant,
    environment,
    dshVersion: current[0]?.environment.dshVersion ?? "",
    pstackVersion: current[0]?.environment.pstackVersion ?? "",
    updatedAt: new Date().toISOString(),
    lastBatchId: batch?.batchId ?? null,
    lastMode: batch?.mode ?? null,
    lastScope: batch?.scope ?? [],
    scenarioIds: [...currentIds].sort(),
    scenarios: current.map((record) => ({
      id: record.scenarioId,
      capturedAt: record.capturedAt,
      batchId: record.batchId ?? null,
      environment: record.environment,
    })),
  };
  mkdirSync(snapshot, { recursive: true });
  writeFileSync(join(snapshot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
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
