import { createBrowserSession } from "./lib/browser.ts";
import { stopWeb } from "./lib/env.ts";
import { environmentMatrix } from "./lib/run-metadata.ts";
import { listWorkers } from "./lib/worker.ts";
import type { Phase } from "../types.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const environment = argValue("--environment");
if (environment) environmentMatrix(environment);
const phase = argValue("--phase") as Phase | undefined;
if (phase !== undefined && phase !== "raw" && phase !== "adapted")
  throw new Error("--phase must be raw or adapted");
for (const paths of listWorkers({
  ...(environment === undefined ? {} : { environmentId: environment }),
  ...(phase === undefined ? {} : { phase }),
})) {
  const result = stopWeb(paths);
  console.log(
    `[stop] ${paths.phase}/${paths.environmentId}/w${paths.index} stopped=${result.stopped}`,
  );
  try {
    createBrowserSession({
      session: `${paths.phase}-${paths.environmentId}-w${paths.index}`,
      browserDir: paths.browserDir,
    }).raw(["close", "--all"]);
  } catch {
    console.log(`[stop] ${paths.phase}/${paths.environmentId}/w${paths.index} no browser to close`);
  }
}
