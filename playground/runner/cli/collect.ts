import { pathToFileURL } from "node:url";

import { isVariant } from "../types.ts";
import { argValue, parseList } from "../shared/args.ts";
import { environmentMatrix } from "../scenario/environments.ts";
import { collectWorkerScreenshots } from "../evidence/collect.ts";
import { readBatchMetadata } from "../worker/batch.ts";
import { DEFAULT_CONFIG_FILE as CONFIG_FILE } from "../shared/paths.ts";
import { readRuntimeConfig } from "../config/config.ts";
import { loadScenario, scenarioApplies } from "../scenario/scenarios.ts";

async function main(): Promise<void> {
  await readRuntimeConfig(CONFIG_FILE);
  const variant = argValue("--variant");
  const environment = argValue("--environment");
  if (!isVariant(variant) || environment === undefined) {
    throw new Error("collect requires --variant native|adapted --environment ID [--scenarios a,b]");
  }
  environmentMatrix(environment);
  const explicit = argValue("--scenarios");
  const selection =
    explicit === undefined
      ? readBatchMetadata(variant, environment)
      : {
          scope: parseList(explicit),
          batchId: undefined,
        };
  const ids = selection.scope;
  if (ids.length === 0) throw new Error("no scenarios selected");
  for (const id of ids) {
    if (!scenarioApplies(loadScenario(id), variant, environment)) {
      throw new Error(`scenario ${id} does not run in ${variant}-${environment}`);
    }
  }
  const { records, files } = collectWorkerScreenshots(variant, environment, ids, selection.batchId);
  for (const record of records)
    console.log(
      `[collect] ${record.scenarioId}: ${record.status}; record=${record.artifacts.recordFile}`,
    );
  for (const file of files) console.log(`[collect] screenshot=${file}`);
  console.log("[collect] update the selected scenarios' result.md after reviewing local evidence");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[collect] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
