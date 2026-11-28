import {
  argValue,
  requiredArg,
  variantArg,
  positiveIntegerArg,
  parseList,
} from "../shared/args.ts";
import { DEFAULT_CONFIG_FILE } from "../shared/paths.ts";
import { readRuntimeConfig } from "../config/config.ts";
import { listScenarioIdsFor, loadScenario, scenarioApplies } from "../scenario/scenarios.ts";
import { runBatch } from "../execution/batch.ts";

async function main(): Promise<void> {
  const variant = variantArg();
  const environment = requiredArg("--environment");
  const explicit = argValue("--scenarios");
  if (process.argv.includes("--full") === (explicit !== undefined))
    throw new Error("pass --full or --scenarios <ids>");
  const ids =
    explicit === undefined ? listScenarioIdsFor(variant, environment) : parseList(explicit);
  for (const id of ids) {
    if (!scenarioApplies(loadScenario(id), variant, environment))
      throw new Error(`scenario ${id} does not run in ${variant}-${environment}`);
  }
  if (ids.length === 0) {
    console.log("[run-batch] no scenarios selected");
    return;
  }
  await readRuntimeConfig(DEFAULT_CONFIG_FILE);
  const result = await runBatch({
    variant,
    environment,
    scenarioIds: ids,
    round: positiveIntegerArg("--round"),
  });
  console.log(`[run-batch] progress=${result.progressFile}`);
  console.log(`[run-batch] log=${result.logFile}`);
  console.log(
    `[run-batch] ${result.progress.done}/${result.progress.total} ${JSON.stringify(result.progress.statuses)}`,
  );
  if (result.notRun.length > 0)
    console.error(
      `[run-batch] workers stopped; ${result.notRun.length} scenario(s) were not run: ${result.notRun.join(", ")}`,
    );
  for (const failure of result.progress.failures)
    console.error(`[run-batch] ${failure.scenarioId} w${failure.worker}: ${failure.reason}`);
  process.exitCode = result.notRun.length > 0 || result.progress.failures.length > 0 ? 1 : 0;
}
main().catch((error: unknown) => {
  console.error(`[run-batch] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
