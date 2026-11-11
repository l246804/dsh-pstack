import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { isolatedRootDirectory, workersDirectory } from "./run-metadata.ts";

export interface WorkerPaths {
  index: number;
  environmentId: string;
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

export function workerPaths(index: number, environmentId = "base"): WorkerPaths {
  if (!/^[a-z0-9-]+$/.test(environmentId))
    throw new Error(`invalid environment id: ${environmentId}`);
  const root = join(workersDirectory(), environmentId, `w${index}`);
  const isolatedRoot = join(isolatedRootDirectory(), environmentId, `w${index}`);
  return {
    index,
    environmentId,
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

export function listWorkers(environmentId?: string): WorkerPaths[] {
  const root = workersDirectory();
  if (!existsSync(root)) return [];
  const environments = environmentId ? [environmentId] : readdirSync(root);
  return environments.flatMap((environment) => {
    const directory = join(root, environment);
    if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
    return readdirSync(directory)
      .filter((name) => /^w\d+$/.test(name) && statSync(join(directory, name)).isDirectory())
      .map((name) => workerPaths(Number(name.slice(1)), environment))
      .filter((paths) => existsSync(paths.pidFile) || existsSync(paths.urlFile));
  });
}

export function workerCount(environmentId = "base"): number {
  const root = join(workersDirectory(), environmentId);
  if (!existsSync(root)) return 0;
  return readdirSync(root).filter((name) => /^w\d+$/.test(name)).length;
}
