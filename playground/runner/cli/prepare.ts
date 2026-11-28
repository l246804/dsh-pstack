import { argValue, requiredArg, variantArg } from "../shared/args.ts";
import { DEFAULT_CONFIG_FILE } from "../shared/paths.ts";
import { readConfig } from "../config/config.ts";
import { listScenarioIdsFor } from "../scenario/scenarios.ts";
import { prepareWorkers } from "../worker/prepare.ts";

async function main(): Promise<void> {
  const variant = variantArg();
  const environment = requiredArg("--environment");
  const port = argValue("--port");
  const workers = await prepareWorkers({
    variant,
    environment,
    config: await readConfig(DEFAULT_CONFIG_FILE),
    scenarioIds: listScenarioIdsFor(variant, environment),
    port: port === undefined ? undefined : Number(port),
    reset: process.argv.includes("--reset"),
    reuse: process.argv.includes("--reuse"),
  });
  for (const { worker, url } of workers)
    console.log(`[prepare] ${worker.variant}/${worker.environmentId}/w${worker.index} url=${url}`);
}
main().catch((error: unknown) => {
  console.error(`[prepare] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
