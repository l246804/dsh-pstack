import { createBrowserSession } from "../browser/session.ts";
import { argValue } from "../shared/args.ts";
import { stopWeb } from "../container/index.ts";
import { environmentMatrix } from "../scenario/environments.ts";
import { clearBootstrapReady, listWorkers } from "../worker/worker.ts";
import { isVariant } from "../types.ts";
import type { Variant } from "../types.ts";
import { DEFAULT_CONFIG_FILE as CONFIG_FILE } from "../shared/paths.ts";
import { readRuntimeConfig } from "../config/config.ts";

await readRuntimeConfig(CONFIG_FILE);

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
  // UI browsers belong to the inspecting agent, not the scenario runner.
  if (paths.environmentId === "ui") continue;
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
