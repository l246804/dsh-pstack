import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import type { Treatment } from "../types.ts";
import { isolatedRootDirectory, workersDirectory } from "./run-metadata.ts";

const TREATMENTS: readonly Treatment[] = ["native", "adapted"];

export interface WorkerPaths {
  index: number;
  environmentId: string;
  /** The evidence treatment this worker belongs to: native and adapted never share a directory. */
  treatment: Treatment;
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
  treatmentFile: string;
}

export function workerPaths(
  index: number,
  environmentId: string,
  treatment: Treatment,
): WorkerPaths {
  if (!/^[a-z0-9-]+$/.test(environmentId))
    throw new Error(`invalid environment id: ${environmentId}`);
  const root = join(workersDirectory(), treatment, environmentId, `w${index}`);
  const isolatedRoot = join(isolatedRootDirectory(), treatment, environmentId, `w${index}`);
  return {
    index,
    environmentId,
    treatment,
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
    treatmentFile: join(root, "treatment.txt"),
  };
}

export function stopRequestFile(paths: WorkerPaths): string {
  return join(paths.root, "stop-request");
}

export function bootstrapReadyFile(environmentId: string, treatment: Treatment): string {
  return join(treatmentWorkersDirectory(environmentId, treatment), "bootstrap-ready.json");
}

export function hasBootstrapReady(environmentId: string, treatment: Treatment): boolean {
  return existsSync(bootstrapReadyFile(environmentId, treatment));
}

export function clearBootstrapReady(environmentId: string, treatment: Treatment): void {
  rmSync(bootstrapReadyFile(environmentId, treatment), { force: true });
}

export function currentTaskFile(paths: WorkerPaths): string {
  return join(paths.root, "current-task.json");
}

/** The in-repo directory that holds every worker of one treatment and environment. */
export function treatmentWorkersDirectory(environmentId: string, treatment: Treatment): string {
  return join(workersDirectory(), treatment, environmentId);
}

/** The isolated (outside-repo) root for one treatment and environment. */
export function treatmentIsolatedDirectory(environmentId: string, treatment: Treatment): string {
  return join(isolatedRootDirectory(), treatment, environmentId);
}

/**
 * Remove one treatment's worker state for an environment, and nothing else. Reset must never
 * reach a sibling treatment: native evidence captured before an adapted prepare stays on disk.
 */
export function resetTreatment(environmentId: string, treatment: Treatment): void {
  rmSync(treatmentWorkersDirectory(environmentId, treatment), { recursive: true, force: true });
  rmSync(treatmentIsolatedDirectory(environmentId, treatment), { recursive: true, force: true });
}

export interface WorkerFilter {
  treatment?: Treatment;
  environmentId?: string;
}

export function listWorkers(filter: WorkerFilter = {}): WorkerPaths[] {
  const root = workersDirectory();
  if (!existsSync(root)) return [];
  const treatments = filter.treatment ? [filter.treatment] : TREATMENTS;
  const workers: WorkerPaths[] = [];
  for (const treatment of treatments) {
    const treatmentRoot = join(root, treatment);
    if (!existsSync(treatmentRoot) || !statSync(treatmentRoot).isDirectory()) continue;
    const environments = filter.environmentId ? [filter.environmentId] : readdirSync(treatmentRoot);
    for (const environmentId of environments) {
      const directory = join(treatmentRoot, environmentId);
      if (!existsSync(directory) || !statSync(directory).isDirectory()) continue;
      for (const name of readdirSync(directory)) {
        if (!/^w\d+$/.test(name) || !statSync(join(directory, name)).isDirectory()) continue;
        const paths = workerPaths(Number(name.slice(1)), environmentId, treatment);
        if (existsSync(paths.pidFile) || existsSync(paths.urlFile)) workers.push(paths);
      }
    }
  }
  return workers;
}

export function workerCount(environmentId: string, treatment: Treatment): number {
  const root = treatmentWorkersDirectory(environmentId, treatment);
  if (!existsSync(root)) return 0;
  return readdirSync(root).filter((name) => /^w\d+$/.test(name)).length;
}
