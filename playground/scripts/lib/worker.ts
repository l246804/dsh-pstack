import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { workersDirectory } from "./run-metadata.ts";

export interface WorkerPaths {
  index: number;
  environmentId: string;
  root: string;
  home: string;
  browserDir: string;
  workspaceRoot: string;
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
  return {
    index,
    environmentId,
    root,
    home: join(root, "home"),
    browserDir: join(root, "browser"),
    workspaceRoot: join(root, "workspace"),
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
