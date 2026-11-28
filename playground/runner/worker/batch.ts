import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { z } from "zod";

import { VARIANTS, type Variant } from "../types.ts";
import { workersDirectory } from "../shared/paths.ts";

const batchMetadata = z.object({
  batchId: z.string(),
  variant: z.enum(VARIANTS),
  environment: z.string(),
  scope: z.array(z.string()),
  startedAt: z.string(),
});

export type BatchMetadata = z.infer<typeof batchMetadata>;

function batchMetadataFile(variant: Variant, environment: string): string {
  return join(workersDirectory(), variant, environment, "current-batch.json");
}

export function readBatchMetadata(variant: Variant, environment: string): BatchMetadata {
  const file = batchMetadataFile(variant, environment);
  if (!existsSync(file))
    throw new Error("no current batch; collect a standalone run with --scenarios <ids>");
  const batch = batchMetadata.parse(JSON.parse(readFileSync(file, "utf8")));
  if (batch.variant !== variant || batch.environment !== environment) {
    throw new Error(`batch identity does not match ${variant}-${environment}`);
  }
  return batch;
}

export function writeBatchMetadata(batch: BatchMetadata): void {
  const file = batchMetadataFile(batch.variant, batch.environment);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(batch, null, 2)}\n`);
}

export function batchLockFile(variant: Variant, environment: string): string {
  return join(workersDirectory(), variant, environment, "batch.lock");
}

/** Prevent concurrent batches from assigning the same worker or replacing its scope. */
export function acquireBatchLock(batch: BatchMetadata): () => void {
  const file = batchLockFile(batch.variant, batch.environment);
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(file, JSON.stringify({ batchId: batch.batchId, pid: process.pid }), {
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new Error(
      `another batch holds ${file}; remove a stale lock only after all batches have stopped`,
    );
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    rmSync(file);
  };
}
