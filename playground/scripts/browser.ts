// Small manual CLI for poking the running playground in one browser process. The
// agent-browser daemon is bound to the process that started it, so open, act, and
// capture must happen in a single invocation.
//
// Usage:
//   vpx playground/scripts/browser.ts [--worker <k>] [url] [steps...]
//   --worker defaults to 0; url defaults to that worker's web-url.txt.
// Steps (run in the order given):
//   --wait <ms>            wait for a duration
//   --wait-for <selector>  wait until a selector is present
//   --eval <js>            eval a JS expression and print its JSON value
//   --click <selector>     click a selector
//   --type <text>          type text with real keystrokes
//   --press <key>          press a key (Enter, Tab, ...)
//   --screenshot <path>    screenshot to a path
//   --keep-open            leave the browser session open

import { join } from "node:path";

import { createBrowserSession } from "./lib/browser.ts";
import { readWebUrl } from "./lib/env.ts";
import { workerPaths } from "./lib/worker.ts";

function main(): void {
  const argv = process.argv.slice(2);
  let workerIndex = 0;
  let environmentId = "base";
  const environmentPos = argv.indexOf("--environment");
  if (environmentPos >= 0) {
    environmentId = argv[environmentPos + 1] as string;
    argv.splice(environmentPos, 2);
  }
  const workerPos = argv.indexOf("--worker");
  if (workerPos >= 0) {
    const parsed = Number(argv[workerPos + 1]);
    if (!Number.isInteger(parsed) || parsed < 0)
      throw new Error("--worker must be a non-negative integer");
    workerIndex = parsed;
    argv.splice(workerPos, 2);
  }
  const paths = workerPaths(workerIndex, environmentId);

  let url: string | undefined;
  if (argv.length > 0 && !argv[0].startsWith("--")) url = argv.shift();
  const target = url ?? readWebUrl(paths);
  const session = createBrowserSession({
    session: `w${workerIndex}`,
    browserDir: paths.browserDir,
  });
  let keepOpen = false;

  try {
    console.log(session.open(target));
    while (argv.length > 0) {
      const step = argv.shift() as string;
      switch (step) {
        case "--wait": {
          session.wait(Number(argv.shift()));
          break;
        }
        case "--wait-for": {
          session.wait(argv.shift() as string);
          break;
        }
        case "--eval": {
          console.log(`eval: ${JSON.stringify(session.eval(argv.shift() as string))}`);
          break;
        }
        case "--click": {
          console.log(session.click(argv.shift() as string));
          break;
        }
        case "--type": {
          console.log(session.keyboardType(argv.shift() as string));
          break;
        }
        case "--press": {
          console.log(session.press(argv.shift() as string));
          break;
        }
        case "--screenshot": {
          console.log(session.screenshot(argv.shift() as string));
          break;
        }
        case "--keep-open": {
          keepOpen = true;
          break;
        }
        default: {
          throw new Error(`unknown step: ${step}`);
        }
      }
    }
    if (!keepOpen) session.screenshot(join(paths.evidenceDir, `browser-${Date.now()}.png`));
  } finally {
    if (!keepOpen) session.close();
  }
}

main();
