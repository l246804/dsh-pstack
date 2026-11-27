import { isVariant } from "../types.ts";
import { argValue } from "../shared/args.ts";
import type { Variant } from "../types.ts";
import { workerPaths } from "../worker/worker.ts";
import { stopWorkerTask } from "../execution/stop-task.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";

await readPlaygroundConfig(CONFIG_FILE);

const variant = argValue("--variant") as Variant | undefined;
if (!isVariant(variant)) throw new Error("stop-task requires --variant native|adapted");
const environment = argValue("--environment");
if (environment === undefined) throw new Error("stop-task requires --environment");
const worker = Number(argValue("--worker") ?? "0");
if (!Number.isInteger(worker) || worker < 0) throw new Error("--worker must be non-negative");
const paths = workerPaths(worker, environment, variant);
stopWorkerTask(paths);
console.log(
  `[stop-task] stopped ${variant}/${environment}/w${worker}; prepare and bootstrap before reuse`,
);
