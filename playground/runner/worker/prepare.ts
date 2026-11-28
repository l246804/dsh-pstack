import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Variant, PlaygroundConfig } from "../types.ts";
import { environmentMatrix, environmentOffset } from "../scenario/environments.ts";
import { workersDirectory } from "../shared/paths.ts";

import { WORKER_PORT_STRIDE, WORKER_VARIANT_PORT_OFFSET } from "../container/layout.ts";
import {
  copyCredentials,
  mountNativeTree,
  resetHome,
  writeHomePatch,
  writeRoleFile,
  writePstackSettings,
} from "./home.ts";
import { registerWorkspaces } from "../storage/workspaces.ts";
import { loadProviderPlan, type ProviderPlan } from "../config/provider.ts";
import {
  cloneInstalledProfile,
  ensureWebProfile,
  grantVersionExemptions,
  installPluginPackage,
  packPlugin,
} from "./profile.ts";
import { startWeb, stopWeb } from "../container/index.ts";
import { computeWorkers } from "./capacity.ts";
import {
  clearBootstrapReady,
  listWorkers,
  resetVariant,
  workerPaths,
  type WorkerPaths,
} from "./worker.ts";

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
): Promise<Array<{ worker: WorkerPaths; url: string; port: number }>> {
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
  }
  return started;
}

export interface PrepareInput {
  variant: Variant;
  environment: string;
  scenarioIds: string[];
  config: PlaygroundConfig;
  port?: number;
  reset?: boolean;
  reuse?: boolean;
}
export async function prepareWorkers(
  input: PrepareInput,
): Promise<Array<{ worker: WorkerPaths; url: string; port: number }>> {
  const { variant, config, scenarioIds, port, reset = false, reuse = false } = input;
  const matrix = environmentMatrix(input.environment);
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

  const plan = loadProviderPlan(config);
  const count = computeWorkers(scenarioIds.length).workers;
  const portStride = Math.max(WORKER_PORT_STRIDE, count);
  const variantPortOffset = variant === "adapted" ? Math.max(WORKER_VARIANT_PORT_OFFSET, count) : 0;
  const effectivePortBase =
    config.runtime.workerPortBase + variantPortOffset + environmentOffset(matrix.id) * portStride;
  if (port === undefined && effectivePortBase + count - 1 > 65_535) {
    throw new Error("runtime.workerPortBase leaves no room for every worker");
  }
  if (
    port !== undefined &&
    (!Number.isSafeInteger(port) || port < 1 || port > 65_535 || port + count - 1 > 65_535)
  ) {
    throw new Error("--port must be a port number that leaves room for every worker");
  }
  if (reset && reuse) throw new Error("--reset and --reuse are mutually exclusive");
  if (reuse) {
    const workers = Array.from({ length: count }, (_, index) =>
      workerPaths(index, matrix.id, variant),
    );
    for (const worker of workers) {
      if (readVariant(worker) !== variant) {
        throw new Error(
          `cannot reuse ${variant}/${matrix.id}/w${worker.index}: worker is not prepared for ${variant}`,
        );
      }
    }
    for (const worker of listWorkers({ environmentId: matrix.id, variant })) {
      if (worker.index >= count) stopWeb(worker);
    }
    for (const worker of workers) stopWeb(worker);
    // The reused profile points at the worker's native mount outside the repo; refresh it so a
    // cleared temp root does not restart native workers with missing skills.
    for (const worker of workers) {
      if (readVariant(worker) === "native") mountNativeTree(worker);
      writeHomePatch(worker, plan, variant, config.runtime.networkMode);
      writeRoleFile(worker, config);
      writePstackSettings(worker, variant === "adapted");
      registerWorkspaces(worker, scenarioIds);
    }
    return startWorkers(workers, plan, port, config.runtime.networkMode, effectivePortBase);
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
    writeHomePatch(worker, plan, variant, config.runtime.networkMode);
    writeRoleFile(worker, config);
    writePstackSettings(worker, variant === "adapted");
    registerWorkspaces(worker, scenarioIds);
  }
  return startWorkers(workers, plan, port, config.runtime.networkMode, effectivePortBase);
}
