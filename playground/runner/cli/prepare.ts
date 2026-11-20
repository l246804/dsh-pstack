import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isVariant } from "../types.ts";
import type { Variant } from "../types.ts";
import { environmentMatrix, workersDirectory } from "../worker/run-metadata.ts";
import {
  copyCredentials,
  mountNativeTree,
  readPlaygroundConfig,
  registerWorkspaces,
  resetHome,
  writeHomePatch,
  writeRoleFile,
  writePstackSettings,
  writeWorkerInstructions,
  CONFIG_FILE,
} from "../worker/home.ts";
import { loadProviderPlan, type ProviderPlan } from "../config/provider.ts";
import {
  cloneInstalledProfile,
  ensureWebProfile,
  grantVersionExemptions,
  installPluginPackage,
  packPlugin,
} from "../worker/profile.ts";
import { startWeb, stopWeb } from "../container/index.ts";
import { listScenarioIds } from "../scenario/scenarios.ts";
import { computeWorkers } from "../worker/capacity.ts";
import {
  clearBootstrapReady,
  listWorkers,
  resetVariant,
  workerPaths,
  type WorkerPaths,
} from "../worker/worker.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readVariant(paths: WorkerPaths): string {
  return existsSync(paths.variantFile) ? readFileSync(paths.variantFile, "utf8").trim() : "";
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

async function startWorkers(
  paths: WorkerPaths[],
  plan: ProviderPlan,
  port: number | undefined,
  networkMode: NonNullable<Parameters<typeof startWeb>[3]>,
  workerPortBase: number,
): Promise<void> {
  const started = await Promise.all(
    paths.map(async (worker, index) => ({
      worker,
      ...(await startWeb(
        worker,
        plan,
        port === undefined ? workerPortBase + index : port + index,
        networkMode,
      )),
    })),
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
  const variant = argValue("--variant") as Variant | undefined;
  if (!isVariant(variant)) {
    throw new Error(
      "usage: prepare.ts --variant native|adapted --environment ID [--workers N] [--port N] [--reset|--reuse]",
    );
  }
  const environmentId = argValue("--environment");
  if (environmentId === undefined) throw new Error("--environment is required");
  const matrix = environmentMatrix(environmentId);
  clearBootstrapReady(matrix.id, variant);
  if (
    variant === "native" &&
    matrix.enabledPluginPackages.length > 0 &&
    matrix.kind !== "capability"
  ) {
    throw new Error(
      "native only accepts additional packages in an explicit capability environment",
    );
  }
  const enabledPackages =
    variant === "adapted"
      ? ["dsh-pstack", ...matrix.enabledPluginPackages]
      : matrix.enabledPluginPackages;
  const config = await readPlaygroundConfig(CONFIG_FILE);

  const plan = loadProviderPlan(config);
  const workerFlag = argValue("--workers");
  const requested = workerFlag === undefined ? undefined : Number(workerFlag);
  const count = computeWorkers(requested).workers;
  const portFlag = argValue("--port");
  const port = portFlag === undefined ? undefined : Number(portFlag);
  if (
    port !== undefined &&
    (!Number.isSafeInteger(port) || port < 1 || port > 65_535 || port + count - 1 > 65_535)
  ) {
    throw new Error("--port must be a port number that leaves room for every worker");
  }
  const reset = process.argv.includes("--reset");
  const reuse = process.argv.includes("--reuse");
  if (reset && reuse) throw new Error("--reset and --reuse are mutually exclusive");
  if (reuse) {
    const workers = Array.from({ length: count }, (_, index) =>
      workerPaths(index, matrix.id, variant),
    );
    for (const worker of workers) stopWeb(worker);
    // The reused profile points at the worker's native mount outside the repo; refresh it so a
    // cleared temp root does not restart native workers with missing skills.
    for (const worker of workers) {
      if (readVariant(worker) === "native") mountNativeTree(worker);
      writeHomePatch(worker, plan, variant, matrix.teamMode === true, config.runtime?.networkMode);
      writeWorkerInstructions(worker);
      writeRoleFile(worker, config);
      writePstackSettings(worker, variant === "adapted");
    }
    await startWorkers(
      workers,
      plan,
      port,
      config.runtime.networkMode,
      config.runtime.workerPortBase,
    );
    return;
  }

  const workers = Array.from({ length: count }, (_, index) =>
    workerPaths(index, matrix.id, variant),
  );
  if (reset) {
    for (const worker of listWorkers({ environmentId: matrix.id, variant })) stopWeb(worker);
    resetVariant(matrix.id, variant);
  } else {
    for (const worker of listWorkers({ environmentId: matrix.id, variant })) {
      if (worker.index >= count) stopWeb(worker);
    }
  }
  mkdirSync(workersDirectory(), { recursive: true });
  const pluginTarball =
    variant === "adapted"
      ? packPlugin(join(workersDirectory(), variant, matrix.id, "package"))
      : null;
  let installed: WorkerPaths | null = null;
  for (const worker of workers) {
    if (reset) resetHome(worker);
    else mkdirSync(worker.home, { recursive: true });
    if (variant === "native") mountNativeTree(worker);
    if (installed === null) {
      ensureWebProfile(worker);
      if (pluginTarball !== null) installPluginPackage(worker, pluginTarball);
      for (const name of enabledPackages.filter((name) => name !== "dsh-pstack")) {
        installPluginPackage(worker, name);
      }
      const exemptions = matrix.versionExemptions ?? [];
      if (exemptions.length > 0) grantVersionExemptions(worker, exemptions);
      installed = worker;
    } else {
      cloneInstalledProfile(installed, worker);
    }
    writeFileSync(worker.variantFile, `${variant}\n`);
    if (config.copyCredentials) copyCredentials(worker, config.credentialsFile);
    writeHomePatch(worker, plan, variant, matrix.teamMode === true, config.runtime?.networkMode);
    writeRoleFile(worker, config);
    writePstackSettings(worker, variant === "adapted");
    registerWorkspaces(worker, listScenarioIds());
  }
  await startWorkers(
    workers,
    plan,
    port,
    config.runtime.networkMode,
    config.runtime.workerPortBase,
  );
  console.log(
    `[prepare] variant=${variant} environment=${matrix.id} workers=${count} model=${plan.main.provider}/${plan.main.model}[${plan.main.effort}]`,
  );
}

main().catch((error: unknown) => {
  console.error(`[prepare] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
