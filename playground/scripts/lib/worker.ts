import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import type { Phase } from "../../types.ts";
import { isolatedRootDirectory, workersDirectory } from "./run-metadata.ts";

const PHASES: readonly Phase[] = ["raw", "adapted"];

export interface WorkerPaths {
  index: number;
  environmentId: string;
  /** The evidence phase this worker belongs to: raw and adapted never share a directory. */
  phase: Phase;
  /** Audited worker state inside the repository: home, browser, evidence, pid, log. */
  root: string;
  /** Per-worker root outside the repository tree for everything the tested session can reach. */
  isolatedRoot: string;
  home: string;
  browserDir: string;
  workspaceRoot: string;
  rawMount: string;
  evidenceDir: string;
  urlFile: string;
  pidFile: string;
  logFile: string;
  phaseFile: string;
}

export function workerPaths(index: number, environmentId: string, phase: Phase): WorkerPaths {
  if (!/^[a-z0-9-]+$/.test(environmentId))
    throw new Error(`invalid environment id: ${environmentId}`);
  const root = join(workersDirectory(), phase, environmentId, `w${index}`);
  const isolatedRoot = join(isolatedRootDirectory(), phase, environmentId, `w${index}`);
  return {
    index,
    environmentId,
    phase,
    root,
    isolatedRoot,
    home: join(root, "home"),
    browserDir: join(root, "browser"),
    workspaceRoot: join(isolatedRoot, "workspace"),
    rawMount: join(isolatedRoot, "raw"),
    evidenceDir: join(root, "evidence"),
    urlFile: join(root, "web-url.txt"),
    pidFile: join(root, "web.pid"),
    logFile: join(root, "web.log"),
    phaseFile: join(root, "phase.txt"),
  };
}

/** The in-repo directory that holds every worker of one phase and environment. */
export function phaseWorkersDirectory(environmentId: string, phase: Phase): string {
  return join(workersDirectory(), phase, environmentId);
}

/** The isolated (outside-repo) root for one phase and environment. */
export function phaseIsolatedDirectory(environmentId: string, phase: Phase): string {
  return join(isolatedRootDirectory(), phase, environmentId);
}

/**
 * Remove one phase's worker state for an environment, and nothing else. Reset must never
 * reach a sibling phase: raw evidence captured before an adapted prepare stays on disk.
 */
export function resetPhase(environmentId: string, phase: Phase): void {
  rmSync(phaseWorkersDirectory(environmentId, phase), { recursive: true, force: true });
  rmSync(phaseIsolatedDirectory(environmentId, phase), { recursive: true, force: true });
}

export interface WorkerFilter {
  phase?: Phase;
  environmentId?: string;
}

export function listWorkers(filter: WorkerFilter = {}): WorkerPaths[] {
  const root = workersDirectory();
  if (!existsSync(root)) return [];
  const phases = filter.phase ? [filter.phase] : PHASES;
  const workers: WorkerPaths[] = [];
  for (const phase of phases) {
    const phaseRoot = join(root, phase);
    if (!existsSync(phaseRoot) || !statSync(phaseRoot).isDirectory()) continue;
    const environments = filter.environmentId ? [filter.environmentId] : readdirSync(phaseRoot);
    for (const environmentId of environments) {
      const directory = join(phaseRoot, environmentId);
      if (!existsSync(directory) || !statSync(directory).isDirectory()) continue;
      for (const name of readdirSync(directory)) {
        if (!/^w\d+$/.test(name) || !statSync(join(directory, name)).isDirectory()) continue;
        const paths = workerPaths(Number(name.slice(1)), environmentId, phase);
        if (existsSync(paths.pidFile) || existsSync(paths.urlFile)) workers.push(paths);
      }
    }
  }
  return workers;
}

export function workerCount(environmentId: string, phase: Phase): number {
  const root = phaseWorkersDirectory(environmentId, phase);
  if (!existsSync(root)) return 0;
  return readdirSync(root).filter((name) => /^w\d+$/.test(name)).length;
}
