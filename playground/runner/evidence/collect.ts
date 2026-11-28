import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { RunRecord, Variant } from "../types.ts";
import { PLAYGROUND_DIRECTORY } from "../shared/paths.ts";
import { latestRecords, readRunRecords } from "./run-record.ts";
import { variantWorkersDirectory } from "../worker/worker.ts";

export const RESULTS_DIRECTORY = join(PLAYGROUND_DIRECTORY, "results");

/** Stopped workers keep their local evidence, so discovery does not depend on a URL file. */
export function collectWorkerScreenshots(
  variant: Variant,
  environment: string,
  scenarioIds: string[],
  batchId?: string,
): { records: RunRecord[]; files: string[] } {
  const directory = variantWorkersDirectory(environment, variant);
  const records = existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^w\d+$/.test(entry.name))
        .flatMap((entry) => readRunRecords(join(directory, entry.name, "evidence")))
    : [];
  const selected = selectRecords(records, variant, environment, scenarioIds, batchId);
  return { records: selected, files: collectScreenshots(selected) };
}

/** Select this request's records before choosing the latest attempt for each scenario. */
export function selectRecords(
  records: RunRecord[],
  variant: Variant,
  environment: string,
  scenarioIds: string[],
  batchId?: string,
): RunRecord[] {
  const selected = latestRecords(
    records.filter(
      (record) =>
        record.variant === variant &&
        record.environment.matrix.id === environment &&
        scenarioIds.includes(record.scenarioId) &&
        (batchId === undefined || record.batchId === batchId),
    ),
  );
  const missing = scenarioIds.filter((id) => !selected.some((record) => record.scenarioId === id));
  if (missing.length > 0) {
    throw new Error(
      `no record for ${missing.join(", ")}${batchId === undefined ? "" : ` in batch ${batchId}`}`,
    );
  }
  return selected;
}

/** Export screenshots only. Conclusions remain authored in each scenario's result.md. */
export function collectScreenshots(records: RunRecord[], root = RESULTS_DIRECTORY): string[] {
  // Validate the entire selection before replacing any existing screenshot.
  for (const record of records) {
    const source = record.artifacts.screenshotFile;
    if (record.status !== "blocked" && (source === undefined || !existsSync(source))) {
      throw new Error(`missing screenshot for ${record.scenarioId} (${record.variant})`);
    }
  }
  const copied: string[] = [];
  for (const record of records) {
    const directory = join(root, record.scenarioId);
    const destination = join(directory, `${record.variant}-${record.environment.matrix.id}.png`);
    const source = record.artifacts.screenshotFile;
    if (source !== undefined && existsSync(source)) {
      mkdirSync(directory, { recursive: true });
      copyFileSync(source, destination);
      copied.push(destination);
    } else {
      // A blocked attempt without an image must not inherit a previous successful image.
      rmSync(destination, { force: true });
    }
  }
  return copied;
}
