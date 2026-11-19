import { createBrowserSession } from "../browser/session.ts";
import { stopWeb } from "../container/web.ts";
import { environmentMatrix } from "../worker/run-metadata.ts";
import { clearBootstrapReady, listWorkers } from "../worker/worker.ts";
import { isTreatment } from "../types.ts";
import type { Treatment } from "../types.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const environment = argValue("--environment");
if (environment) environmentMatrix(environment);
const treatment = argValue("--treatment") as Treatment | undefined;
if (treatment !== undefined && !isTreatment(treatment))
  throw new Error("--treatment must be native or adapted");
for (const paths of listWorkers({
  ...(environment === undefined ? {} : { environmentId: environment }),
  ...(treatment === undefined ? {} : { treatment }),
})) {
  const result = stopWeb(paths);
  clearBootstrapReady(paths.environmentId, paths.treatment);
  console.log(
    `[stop] ${paths.treatment}/${paths.environmentId}/w${paths.index} stopped=${result.stopped}`,
  );
  try {
    createBrowserSession({
      session: `${paths.treatment}-${paths.environmentId}-w${paths.index}`,
      browserDir: paths.browserDir,
    }).raw(["close", "--all"]);
  } catch {
    console.log(
      `[stop] ${paths.treatment}/${paths.environmentId}/w${paths.index} no browser to close`,
    );
  }
}
