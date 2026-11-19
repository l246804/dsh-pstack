import { readFileSync } from "node:fs";

import type { ProviderPlan } from "./provider.ts";
import type { WorkerPaths } from "./worker.ts";
import { DockerSandbox, type StartedWeb } from "./sandbox/docker.ts";

export type { StartedWeb } from "./sandbox/docker.ts";

const sandbox = new DockerSandbox();

export function startWeb(paths: WorkerPaths, plan: ProviderPlan, port = 0): Promise<StartedWeb> {
  return sandbox.start(paths, plan, port > 0 ? port : undefined);
}

export function stopWeb(paths: WorkerPaths): { stopped: boolean; id: string | null } {
  return sandbox.stop(paths);
}

export function webStatus(paths: WorkerPaths): { running: boolean; id: string | null } {
  return sandbox.status(paths);
}

export function webLogs(paths: WorkerPaths, tail = 50): string {
  return sandbox.logs(paths, tail);
}

export function readWebUrl(paths: WorkerPaths): string {
  return readFileSync(paths.urlFile, "utf8").trim();
}
