import { existsSync, readFileSync } from "node:fs";

import { isVariant } from "../types.ts";
import type { Variant } from "../types.ts";
import { environmentMatrix } from "../worker/run-metadata.ts";
import { progressFilePath, readProgress } from "../worker/progress.ts";
import { currentTaskFile, workerPaths } from "../worker/worker.ts";
import { latestSessionFile } from "../execution/run.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";

await readPlaygroundConfig(CONFIG_FILE);

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const variant = argValue("--variant") as Variant | undefined;
if (!isVariant(variant)) throw new Error("status requires --variant native|adapted");
const environment = argValue("--environment");
if (environment === undefined) throw new Error("status requires --environment");
environmentMatrix(environment);
const file = progressFilePath(environment, variant);
const state = readProgress(file);
if (!state) {
  console.log(`[status] no progress at ${file}`);
} else {
  console.log(
    `[status] ${variant} ${environment} round=${state.round} ${state.done}/${state.total}`,
  );
  console.log(JSON.stringify(state.statuses));
  console.log(
    `[status] running=${state.running.map((entry) => `w${entry.worker}:${entry.scenarioId}`).join(",") || "none"}`,
  );
  for (const entry of state.running) {
    const paths = workerPaths(entry.worker, environment, variant);
    const task = currentTaskFile(paths);
    if (!existsSync(task)) continue;
    try {
      const value = JSON.parse(readFileSync(task, "utf8")) as {
        scenarioId?: string;
        startedAt?: string;
      };
      const elapsed =
        value.startedAt === undefined
          ? "unknown"
          : `${Math.max(0, Math.round((Date.now() - Date.parse(value.startedAt)) / 1000))}s`;
      const session = latestSessionFile(paths, {
        scenarioId: entry.scenarioId,
        rootOnly: true,
        ...(value.startedAt === undefined ? {} : { startedAt: value.startedAt }),
      });
      console.log(
        `[status] current w${entry.worker}: ${value.scenarioId ?? entry.scenarioId} age=${elapsed} session=${session?.file ?? "none"}`,
      );
    } catch {
      console.log(`[status] current w${entry.worker}: unreadable current-task.json`);
    }
  }
  for (const failure of state.failures) {
    console.log(`[status] ${failure.scenarioId} w${failure.worker}: ${failure.reason}`);
  }
}
