import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { Phase } from "../types.ts";
import { environmentMatrix, workersDirectory } from "./lib/run-metadata.ts";
import {
  buildProfile,
  cloneInstalledProfile,
  copyCredentials,
  installPlugins,
  loadProviderPlan,
  mountRawTree,
  readPlaygroundConfig,
  registerWorkspaces,
  resetHome,
  startWeb,
  stopWeb,
  writeHomePatch,
  CONFIG_FILE,
  type ProviderPlan,
} from "./lib/env.ts";
import { listScenarioIds } from "./lib/scenarios.ts";
import { computeWorkers } from "./lib/capacity.ts";
import {
  listWorkers,
  resetPhase,
  workerCount,
  workerPaths,
  type WorkerPaths,
} from "./lib/worker.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readPhase(paths: WorkerPaths): string {
  return existsSync(paths.phaseFile) ? readFileSync(paths.phaseFile, "utf8").trim() : "";
}

async function waitReachable(url: string): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "manual" });
      return true;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  }
  return false;
}

async function startWorkers(paths: WorkerPaths[], plan: ProviderPlan): Promise<void> {
  const started = await Promise.all(
    paths.map(async (worker) => ({ worker, ...(await startWeb(worker, plan)) })),
  );
  const ports = started.map((entry) => entry.port);
  if (new Set(ports).size !== ports.length) throw new Error("workers bound duplicate ports");
  for (const entry of started) {
    if (!(await waitReachable(entry.url))) {
      throw new Error(`worker ${entry.worker.index} is not reachable at ${entry.url}`);
    }
    console.log(`[prepare] ${entry.worker.environmentId}/w${entry.worker.index} url=${entry.url}`);
  }
}

async function main(): Promise<void> {
  const phase = argValue("--phase") as Phase | undefined;
  if (phase !== "raw" && phase !== "adapted") {
    throw new Error(
      "usage: prepare.ts --phase raw|adapted [--environment base] [--workers N] [--reset|--reuse]",
    );
  }
  const matrix = environmentMatrix(argValue("--environment"));
  if (phase === "raw" && matrix.enabledPluginPackages.length > 0) {
    throw new Error("raw baseline does not allow additional plugin packages");
  }
  const enabledPackages =
    phase === "adapted" ? ["dsh-pstack", ...matrix.enabledPluginPackages] : [];
  const configFile = argValue("--config") ?? process.env.PLAYGROUND_CONFIG_FILE ?? CONFIG_FILE;
  const config = readPlaygroundConfig(configFile);
  const plan = loadProviderPlan(config);
  const workerFlag = argValue("--workers");
  const requested = workerFlag === undefined ? undefined : Number(workerFlag);
  const count = computeWorkers(requested).workers;
  const reset = process.argv.includes("--reset");
  const reuse = process.argv.includes("--reuse");
  if (reset && reuse) throw new Error("--reset and --reuse are mutually exclusive");
  if (reuse) {
    const workers = Array.from({ length: requested ?? workerCount(matrix.id, phase) }, (_, index) =>
      workerPaths(index, matrix.id, phase),
    );
    for (const worker of workers) stopWeb(worker);
    // The reused profile points at the worker's raw mount outside the repo; refresh it so a
    // cleared temp root does not restart raw workers with missing skills.
    for (const worker of workers) {
      if (readPhase(worker) === "raw") mountRawTree(worker);
    }
    await startWorkers(workers, plan);
    return;
  }

  const workers = Array.from({ length: count }, (_, index) => workerPaths(index, matrix.id, phase));
  if (reset) {
    for (const worker of listWorkers({ environmentId: matrix.id, phase })) stopWeb(worker);
    resetPhase(matrix.id, phase);
  } else {
    for (const worker of listWorkers({ environmentId: matrix.id, phase })) {
      if (worker.index >= count) stopWeb(worker);
    }
  }
  mkdirSync(workersDirectory(), { recursive: true });
  let installed: WorkerPaths | null = null;
  for (const worker of workers) {
    if (reset) resetHome(worker);
    else mkdirSync(worker.home, { recursive: true });
    if (phase === "raw") mountRawTree(worker);
    buildProfile(worker, phase, enabledPackages);
    writeFileSync(worker.phaseFile, `${phase}\n`);
    copyCredentials(worker, config.credentialsFile);
    writeHomePatch(worker, plan, phase);
    registerWorkspaces(worker, listScenarioIds());
    if (enabledPackages.length > 0) {
      if (installed === null) {
        installPlugins(worker);
        installed = worker;
      } else {
        cloneInstalledProfile(installed, worker);
      }
    }
  }
  await startWorkers(workers, plan);
  console.log(
    `[prepare] phase=${phase} environment=${matrix.id} workers=${count} model=${plan.main.provider}/${plan.main.model}[${plan.main.effort}]`,
  );
}

main().catch((error: unknown) => {
  console.error(`[prepare] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
