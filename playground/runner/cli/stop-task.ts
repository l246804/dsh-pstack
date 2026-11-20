import { mkdirSync, writeFileSync } from "node:fs";

import { isTreatment } from "../types.ts";
import type { Treatment } from "../types.ts";
import { stopRequestFile, workerPaths } from "../worker/worker.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";

await readPlaygroundConfig(CONFIG_FILE);

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const treatment = argValue("--treatment") as Treatment | undefined;
if (!isTreatment(treatment)) throw new Error("stop-task requires --treatment native|adapted");
const environment = argValue("--environment");
if (environment === undefined) throw new Error("stop-task requires --environment");
const worker = Number(argValue("--worker") ?? "0");
if (!Number.isInteger(worker) || worker < 0) throw new Error("--worker must be non-negative");
const paths = workerPaths(worker, environment, treatment);
mkdirSync(paths.root, { recursive: true });
writeFileSync(
  stopRequestFile(paths),
  `${JSON.stringify({ requestedAt: new Date().toISOString(), worker }, null, 2)}\n`,
);
console.log(`[stop-task] requested ${treatment}/${environment}/w${worker}`);
