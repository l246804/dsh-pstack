import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import type { Variant } from "../types.ts";
import { VARIANTS } from "../types.ts";
import { isolatedRootDirectory, workersDirectory } from "./run-metadata.ts";
import { CONTAINER_LAYOUT } from "../container/layout.ts";

/** The runtime directory pair every worker child inherits. */
export function runtimeEnv(paths: WorkerPaths): Record<string, string> {
  // These paths stay under the ignored .workspace tree; the container only sees /dsh.
  const runtime = join(paths.isolatedRoot, "xdg-runtime");
  const tmp = join(paths.isolatedRoot, "tmp");
  mkdirSync(runtime, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  chmodSync(runtime, 0o700);
  return { XDG_RUNTIME_DIR: runtime, TMPDIR: tmp };
}

export interface WorkerPaths {
  index: number;
  environmentId: string;
  /** The evidence variant this worker belongs to: native and adapted never share a directory. */
  variant: Variant;
  /** Audited worker state inside the repository: home, browser, evidence, log. */
  root: string;
  /** Per-worker root under the ignored .workspace tree for everything the tested session can reach. */
  isolatedRoot: string;
  home: string;
  browserDir: string;
  workspaceRoot: string;
  nativeMount: string;
  evidenceDir: string;
  urlFile: string;
  logFile: string;
  variantFile: string;
  /** Deterministic container name; the executor owns the container lifecycle. */
  containerName: string;
  /** Fixed container paths; host paths never cross the container boundary. */
  containerHome: string;
  containerWorkspace: string;
  containerNative: string;
  containerTmp: string;
  containerRuntime: string;
}

export function workerPaths(index: number, environmentId: string, variant: Variant): WorkerPaths {
  if (!/^[a-z0-9-]+$/.test(environmentId))
    throw new Error(`invalid environment id: ${environmentId}`);
  const root = join(workersDirectory(), variant, environmentId, `w${index}`);
  const isolatedRoot = join(isolatedRootDirectory(), variant, environmentId, `w${index}`);
  return {
    index,
    environmentId,
    variant,
    root,
    isolatedRoot,
    home: join(root, "home"),
    browserDir: join(root, "browser"),
    workspaceRoot: join(isolatedRoot, "workspace"),
    nativeMount: join(isolatedRoot, "native"),
    evidenceDir: join(root, "evidence"),
    urlFile: join(root, "web-url.txt"),
    logFile: join(root, "web.log"),
    variantFile: join(root, "variant.txt"),
    containerName: `dsh-playground-${variant}-${environmentId}-w${index}`,
    containerHome: CONTAINER_LAYOUT.home,
    containerWorkspace: CONTAINER_LAYOUT.workspace,
    containerNative: CONTAINER_LAYOUT.native,
    containerTmp: CONTAINER_LAYOUT.tmp,
    containerRuntime: CONTAINER_LAYOUT.runtime,
  };
}

export function stopRequestFile(paths: WorkerPaths): string {
  return join(paths.root, "stop-request");
}

export function bootstrapReadyFile(environmentId: string, variant: Variant): string {
  return join(variantWorkersDirectory(environmentId, variant), "bootstrap-ready.json");
}

export function hasBootstrapReady(environmentId: string, variant: Variant): boolean {
  return existsSync(bootstrapReadyFile(environmentId, variant));
}

export function clearBootstrapReady(environmentId: string, variant: Variant): void {
  rmSync(bootstrapReadyFile(environmentId, variant), { force: true });
}

export function currentTaskFile(paths: WorkerPaths): string {
  return join(paths.root, "current-task.json");
}

/** The in-repo directory that holds every worker of one variant and environment. */
export function variantWorkersDirectory(environmentId: string, variant: Variant): string {
  return join(workersDirectory(), variant, environmentId);
}

/** The .workspace state root for one variant and environment. */
export function variantIsolatedDirectory(environmentId: string, variant: Variant): string {
  return join(isolatedRootDirectory(), variant, environmentId);
}

/**
 * Remove one variant's worker state for an environment, and nothing else. Reset must never
 * reach a sibling variant: native evidence captured before an adapted prepare stays on disk.
 */
export function resetVariant(environmentId: string, variant: Variant): void {
  rmSync(variantWorkersDirectory(environmentId, variant), { recursive: true, force: true });
  rmSync(variantIsolatedDirectory(environmentId, variant), { recursive: true, force: true });
}

export interface WorkerFilter {
  variant?: Variant;
  environmentId?: string;
}

export function listWorkers(filter: WorkerFilter = {}): WorkerPaths[] {
  const root = workersDirectory();
  if (!existsSync(root)) return [];
  const variants = filter.variant ? [filter.variant] : VARIANTS;
  const workers: WorkerPaths[] = [];
  for (const variant of variants) {
    const variantRoot = join(root, variant);
    if (!existsSync(variantRoot) || !statSync(variantRoot).isDirectory()) continue;
    const environments = filter.environmentId ? [filter.environmentId] : readdirSync(variantRoot);
    for (const environmentId of environments) {
      const directory = join(variantRoot, environmentId);
      if (!existsSync(directory) || !statSync(directory).isDirectory()) continue;
      for (const name of readdirSync(directory)) {
        if (!/^w\d+$/.test(name) || !statSync(join(directory, name)).isDirectory()) continue;
        const paths = workerPaths(Number(name.slice(1)), environmentId, variant);
        if (existsSync(paths.urlFile)) workers.push(paths);
      }
    }
  }
  return workers;
}

export function workerCount(environmentId: string, variant: Variant): number {
  const root = variantWorkersDirectory(environmentId, variant);
  if (!existsSync(root)) return 0;
  return readdirSync(root).filter(
    (name) =>
      /^w\d+$/.test(name) &&
      existsSync(workerPaths(Number(name.slice(1)), environmentId, variant).urlFile),
  ).length;
}
