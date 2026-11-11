import type { Phase } from "../types.ts";
import { progressFilePath, readProgress } from "./lib/progress.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const phase = argValue("--phase") as Phase | undefined;
if (phase !== "raw" && phase !== "adapted") throw new Error("status requires --phase raw|adapted");
const environment = argValue("--environment") ?? "base";
const file = progressFilePath(environment, phase);
const state = readProgress(file);
if (!state) {
  console.log(`[status] no progress at ${file}`);
} else {
  console.log(`[status] ${phase} ${environment} round=${state.round} ${state.done}/${state.total}`);
  console.log(JSON.stringify(state.statuses));
  console.log(
    `[status] running=${state.running.map((entry) => `w${entry.worker}:${entry.scenarioId}`).join(",") || "none"}`,
  );
  for (const failure of state.failures) {
    console.log(`[status] ${failure.scenarioId} w${failure.worker}: ${failure.reason}`);
  }
}
