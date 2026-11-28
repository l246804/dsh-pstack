import { mkdirSync, writeFileSync } from "node:fs";

import { stopWeb } from "../container/index.ts";
import { clearBootstrapReady, stopRequestFile, type WorkerPaths } from "../worker/worker.ts";

/** Stop the worker that owns the current scenario, including its server-side agents. */
export function stopWorkerTask(paths: WorkerPaths): void {
  mkdirSync(paths.root, { recursive: true });
  writeFileSync(
    stopRequestFile(paths),
    `${JSON.stringify({ requestedAt: new Date().toISOString(), worker: paths.index }, null, 2)}\n`,
  );
  clearBootstrapReady(paths.environmentId, paths.variant);
  stopWeb(paths);
}
