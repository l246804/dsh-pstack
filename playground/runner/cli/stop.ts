import { createBrowserSession } from "../browser/session.ts";
import { stopWeb } from "../container/index.ts";
import { environmentMatrix } from "../worker/run-metadata.ts";
import { clearBootstrapReady, listWorkers } from "../worker/worker.ts";
import { isVariant } from "../types.ts";
import type { Variant } from "../types.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";

await readPlaygroundConfig(CONFIG_FILE);

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const environment = argValue("--environment");
if (environment) environmentMatrix(environment);
const variant = argValue("--variant") as Variant | undefined;
if (variant !== undefined && !isVariant(variant))
  throw new Error("--variant must be native or adapted");
for (const paths of listWorkers({
  ...(environment === undefined ? {} : { environmentId: environment }),
  ...(variant === undefined ? {} : { variant }),
})) {
  const result = stopWeb(paths);
  clearBootstrapReady(paths.environmentId, paths.variant);
  console.log(
    `[stop] ${paths.variant}/${paths.environmentId}/w${paths.index} stopped=${result.stopped}`,
  );
  try {
    createBrowserSession({
      session: `${paths.variant}-${paths.environmentId}-w${paths.index}`,
      browserDir: paths.browserDir,
    }).raw(["close", "--all"]);
  } catch {
    console.log(
      `[stop] ${paths.variant}/${paths.environmentId}/w${paths.index} no browser to close`,
    );
  }
}
