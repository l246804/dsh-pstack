import { argValue } from "../shared/args.ts";
import { readBrowserConfig } from "../config/config.ts";
import { DEFAULT_CONFIG_FILE } from "../shared/paths.ts";
import { listWorkers, workerPaths, type WorkerPaths } from "../worker/worker.ts";
import type { Variant } from "../types.ts";
import { bootstrapWorkers } from "../browser/bootstrap.ts";
function selectWorkers(): WorkerPaths[] {
  const environment = argValue("--environment");
  if (environment === undefined) throw new Error("--environment is required");
  const variant = argValue("--variant") as Variant;
  if (variant !== "native" && variant !== "adapted")
    throw new Error("--variant must be native or adapted");
  if (process.argv.includes("--all")) {
    const workers = listWorkers({ environmentId: environment, variant });
    if (workers.length === 0)
      throw new Error("no prepared workers found; run playground:prepare first");
    return workers;
  }
  const workerFlag = argValue("--worker");
  if (workerFlag !== undefined) {
    const index = Number(workerFlag);
    if (!Number.isInteger(index) || index < 0)
      throw new Error("--worker must be a non-negative integer");
    return [workerPaths(index, environment, variant)];
  }
  const workers = listWorkers({ environmentId: environment, variant });
  return workers.length > 0 ? [workers[0] as WorkerPaths] : [workerPaths(0, environment, variant)];
}

async function main(): Promise<void> {
  const config = await readBrowserConfig(DEFAULT_CONFIG_FILE);
  const { alreadyReady, results } = bootstrapWorkers(
    selectWorkers(),
    config.browser,
    process.argv.includes("--all"),
  );
  if (alreadyReady) console.log("[bootstrap] environment already ready");
  for (const result of results) {
    console.log(
      `[bootstrap] w${result.paths.index} ${result.failures.length === 0 ? "ready" : "failed"} screenshot=${result.screenshot}`,
    );
    if (result.failures.length > 0)
      console.error(`[bootstrap] ${result.failures.join("; ")}\n${result.body}`);
  }
  process.exitCode = results.some((result) => result.failures.length > 0) ? 1 : 0;
}
main().catch((error: unknown) => {
  console.error(`[bootstrap] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
