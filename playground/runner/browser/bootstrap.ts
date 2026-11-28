import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserConfig } from "../types.ts";
import { createBrowserSession } from "./session.ts";
import { collapseSidebar, openPage, startSession, waitForComposer } from "./page.ts";
import { readHomePlan } from "../worker/home.ts";
import { readWorkspaceStore } from "../storage/workspaces.ts";
import { readWebUrl } from "../container/index.ts";
import { bootstrapReadyFile, hasBootstrapReady, type WorkerPaths } from "../worker/worker.ts";

export interface WorkerReadiness {
  paths: WorkerPaths;
  failures: string[];
  screenshot: string;
  body: string;
}
function validateWorker(paths: WorkerPaths, browser?: BrowserConfig): WorkerReadiness {
  const url = readWebUrl(paths);
  const plan = readHomePlan(paths);
  const { defaultTitle } = readWorkspaceStore(paths);

  const session = createBrowserSession({
    session: `${paths.variant}-${paths.environmentId}-w${paths.index}`,
    browserDir: paths.browserDir,
    ...(browser === undefined ? {} : { browser }),
  });
  const failures: string[] = [];
  try {
    openPage(session, url);
    startSession(session, defaultTitle);
    waitForComposer(session);
    const body = session.eval<string>("document.body.innerText");
    if (!body.includes(defaultTitle))
      failures.push(`page does not show workspace "${defaultTitle}"`);
    const modelSelected = session.eval<boolean>(
      `(() => {
        const provider = ${JSON.stringify(plan.provider)};
        const model = ${JSON.stringify(plan.model)};
        const visible = (element) => !!element && (element.offsetParent !== null || element.getClientRects().length > 0);
        return [...document.querySelectorAll("[data-model-id]")].some((element) => {
          if (!visible(element) || element.getAttribute("data-model-id") !== model) return false;
          const elementProvider = element.getAttribute("data-provider-id");
          return elementProvider === null || elementProvider === provider;
        });
      })()`,
    );
    if (!modelSelected) failures.push(`page does not show model chip "${plan.model}"`);
    const effortLabels: Record<string, string[]> = {
      off: ["off", "关闭"],
      minimal: ["minimal", "最小"],
      low: ["low", "低"],
      medium: ["medium", "中"],
      high: ["high", "高"],
      max: ["max", "最大"],
    };
    const wantedEffortLabels = effortLabels[plan.effort] ?? [plan.effort];
    const effortText = session.eval<string>(
      `(() => {
        const model = [...document.querySelectorAll("[data-model-id]")].find((element) => element.getAttribute("data-model-id") === ${JSON.stringify(plan.model)});
        const button = model?.closest("button");
        return button ? (button.getAttribute("aria-label") || "") + " " + (button.innerText || "") : "";
      })()`,
    );
    const effortShown = wantedEffortLabels.some((label) =>
      effortText.toLowerCase().includes(label.toLowerCase()),
    );
    if (!effortShown) failures.push(`page does not show reasoning effort "${plan.effort}"`);
    if (/登录|401|authentication required|sign in|unauthorized|认证失败/i.test(body))
      failures.push("page shows a login / 401 / authentication wall");

    collapseSidebar(session);
    session.screenshot(join(paths.browserDir, "ready.png"));

    return {
      paths,
      failures,
      screenshot: join(paths.browserDir, "ready.png"),
      body: body.slice(0, 2000),
    };
  } finally {
    session.close();
  }
}

export function bootstrapWorkers(
  workers: WorkerPaths[],
  browser?: BrowserConfig,
  markReady = false,
): { alreadyReady: boolean; results: WorkerReadiness[] } {
  const first = workers[0];
  if (!first) throw new Error("no prepared workers found; run playground:prepare first");
  const { environmentId, variant } = first;
  if (hasBootstrapReady(environmentId, variant)) return { alreadyReady: true, results: [] };
  const results = workers.map((paths) => validateWorker(paths, browser));
  if (markReady && results.every((result) => result.failures.length === 0)) {
    writeFileSync(
      bootstrapReadyFile(environmentId, variant),
      `${JSON.stringify({ checkedAt: new Date().toISOString(), workers: workers.map((worker) => worker.index) }, null, 2)}\n`,
    );
  }
  return { alreadyReady: false, results };
}
