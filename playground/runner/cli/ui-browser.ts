import { join } from "node:path";

import { createBrowserSession } from "../browser/session.ts";
import { readWebUrl } from "../container/index.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";
import { workerPaths } from "../worker/worker.ts";

async function main(): Promise<void> {
  await readPlaygroundConfig(CONFIG_FILE);
  const paths = workerPaths(0, "ui", "adapted");
  const url = readWebUrl(paths);
  // UI inspection owns a managed browser, independently of the batch's CDP configuration.
  const session = createBrowserSession({ session: "ui-w0", browserDir: paths.browserDir });
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  if (args.length === 0) args.push("snapshot", "-i");
  if (args[0] === "open" && args.length === 1) args.push(url);
  if (args[0] === "screenshot" && args.length === 1) {
    console.log(session.screenshot(join(paths.evidenceDir, "ui.png")));
  } else {
    console.log(session.raw(args));
  }
}

main().catch((error: unknown) => {
  console.error(`[ui-browser] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
