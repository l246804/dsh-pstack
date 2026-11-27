import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isVariant } from "../types.ts";
import { argValue } from "../shared/args.ts";
import { environmentMatrix } from "../worker/run-metadata.ts";
import { collectScreenshots, selectRecords } from "../evidence/collect.ts";
import { readRunRecords } from "../evidence/run-record.ts";
import { readBatchMetadata } from "../worker/batch.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";
import { variantWorkersDirectory } from "../worker/worker.ts";
import { loadScenario, scenarioApplies } from "../scenario/scenarios.ts";

async function main(): Promise<void> {
  await readPlaygroundConfig(CONFIG_FILE);
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
          scope: [
            ...new Set(
              explicit
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean),
            ),
          ],
          batchId: undefined,
        };
  const ids = selection.scope;
  if (ids.length === 0) throw new Error("no scenarios selected");
  for (const id of ids) {
    if (!scenarioApplies(loadScenario(id), variant, environment)) {
      throw new Error(`scenario ${id} does not run in ${variant}-${environment}`);
    }
  }
  const directory = variantWorkersDirectory(environment, variant);
  const records = existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^w\d+$/.test(entry.name))
        .flatMap((entry) => readRunRecords(join(directory, entry.name, "evidence")))
    : [];
  const selected = selectRecords(records, variant, environment, ids, selection.batchId);
  for (const record of selected)
    console.log(
      `[collect] ${record.scenarioId}: ${record.status}; record=${record.artifacts.recordFile}`,
    );
  const files = collectScreenshots(selected);
  for (const file of files) console.log(`[collect] screenshot=${file}`);
  console.log("[collect] update the selected scenarios' result.md after reviewing local evidence");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[collect] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
