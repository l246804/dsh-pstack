// Land the persistent browser profile in each prepared worker: open its tokenized
// URL, dismiss the preview notice, and prove the page shows the workspace and model
// chip instead of a login or 401 wall. `--worker <k>` checks one, `--all` checks all,
// default is the first worker.

import { join } from "node:path";

import { createBrowserSession } from "./lib/browser.ts";
import { readHomePlan, readWebUrl, readWorkspaceStore } from "./lib/env.ts";
import { listWorkers, workerPaths, type WorkerPaths } from "./lib/worker.ts";
import type { Phase } from "../types.ts";

const CONTINUE_LABEL = "继续";
const PREVIEW_NOTICE = "预览版说明";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function selectWorkers(): WorkerPaths[] {
  const environment = argValue("--environment") ?? "base";
  const phase = (argValue("--phase") ?? "adapted") as Phase;
  if (process.argv.includes("--all")) {
    const workers = listWorkers({ environmentId: environment, phase });
    if (workers.length === 0)
      throw new Error("no prepared workers found; run playground:prepare first");
    return workers;
  }
  const workerFlag = argValue("--worker");
  if (workerFlag !== undefined) {
    const index = Number(workerFlag);
    if (!Number.isInteger(index) || index < 0)
      throw new Error("--worker must be a non-negative integer");
    return [workerPaths(index, environment, phase)];
  }
  const workers = listWorkers({ environmentId: environment, phase });
  return workers.length > 0 ? [workers[0] as WorkerPaths] : [workerPaths(0, environment, phase)];
}

function validateWorker(paths: WorkerPaths): string[] {
  const url = readWebUrl(paths);
  const plan = readHomePlan(paths);
  const { defaultTitle } = readWorkspaceStore(paths);

  const session = createBrowserSession({
    session: `${paths.phase}-${paths.environmentId}-w${paths.index}`,
    browserDir: paths.browserDir,
  });
  const failures: string[] = [];
  try {
    session.open(url);
    session.wait(7000);

    let body = session.eval<string>("document.body.innerText");
    for (let attempt = 0; attempt < 3 && body.includes(PREVIEW_NOTICE); attempt++) {
      const clicked = session.eval<boolean>(
        `(() => {
          const button = [...document.querySelectorAll("button")].find((element) => element.innerText.trim() === ${JSON.stringify(CONTINUE_LABEL)});
          if (!button) return false;
          button.click();
          return true;
        })()`,
      );
      if (!clicked) break;
      session.wait(2000);
      body = session.eval<string>("document.body.innerText");
    }

    if (body.includes(PREVIEW_NOTICE))
      failures.push(
        `preview notice "${PREVIEW_NOTICE}" still present after clicking "${CONTINUE_LABEL}"`,
      );
    if (!body.includes(defaultTitle))
      failures.push(`page does not show workspace "${defaultTitle}"`);
    const nameShown =
      body.toLowerCase().includes(plan.name.toLowerCase()) || body.includes(plan.model);
    if (!nameShown) failures.push(`page does not show model chip "${plan.name}"`);
    const effortShown =
      body.toLowerCase().includes(plan.effort.toLowerCase()) || body.includes("低");
    if (!effortShown) failures.push(`page does not show reasoning effort "${plan.effort}"`);
    if (/登录|401|authentication required|sign in|unauthorized|认证失败/i.test(body))
      failures.push("page shows a login / 401 / authentication wall");

    session.screenshot(join(paths.browserDir, "ready.png"));

    if (failures.length > 0) {
      console.error(`[bootstrap] worker ${paths.index} validation failed:`);
      for (const failure of failures) console.error(`  - ${failure}`);
      console.error(`\n[bootstrap] worker ${paths.index} body text:\n${body.slice(0, 2000)}`);
    } else {
      console.log(
        `[bootstrap] worker ${paths.index} ready: workspace="${defaultTitle}" model="${plan.name}" effort="${plan.effort}"`,
      );
      console.log(
        `[bootstrap] worker ${paths.index} screenshot=${join(paths.browserDir, "ready.png")}`,
      );
    }
  } finally {
    session.close();
  }
  return failures;
}

async function main(): Promise<void> {
  const workers = selectWorkers();
  let failed = 0;
  for (const paths of workers) {
    if (validateWorker(paths).length > 0) failed += 1;
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`[bootstrap] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
