import { spawnSync } from "node:child_process";

import { runtimeSettings } from "../config/runtime.ts";

/** The docker CLI binary from config.runtime. */
export function dockerBin(): string {
  return runtimeSettings().dockerBin;
}

export interface DockerResult {
  status: number;
  out: string;
  err: string;
}

export function docker(args: string[], timeout = 30_000): DockerResult {
  const result = spawnSync(dockerBin(), args, { encoding: "utf8", timeout });
  return {
    status: result.status ?? 1,
    out: result.stdout ?? "",
    err: result.stderr ?? result.error?.message ?? "",
  };
}

/** Run a docker command with inherited stdio, for build progress. */
export function dockerStream(args: string[]): number {
  return spawnSync(dockerBin(), args, { stdio: "inherit" }).status ?? 1;
}
