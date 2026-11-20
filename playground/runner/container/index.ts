import { readFileSync } from "node:fs";

import type { ProviderPlan } from "../config/provider.ts";
import type { WorkerPaths } from "../worker/worker.ts";
import { DockerSandbox, type StartedWeb } from "./docker.ts";
import type { NetworkMode } from "./spec.ts";

export type { StartedWeb } from "./docker.ts";

const sandbox = new DockerSandbox();

export function startWeb(
  paths: WorkerPaths,
  plan: ProviderPlan,
  port = 0,
  networkMode?: NetworkMode,
): Promise<StartedWeb> {
  return sandbox.start(paths, plan, port > 0 ? port : undefined, networkMode);
}

export function stopWeb(paths: WorkerPaths): { stopped: boolean; id: string | null } {
  return sandbox.stop(paths);
}

export function readWebUrl(paths: WorkerPaths): string {
  return readFileSync(paths.urlFile, "utf8").trim();
}
