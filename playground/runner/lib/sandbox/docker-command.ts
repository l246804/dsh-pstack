import { spawnSync } from "node:child_process";

/** The docker CLI binary; overridable for tests or alternative runtimes. */
export const DOCKER_BIN = process.env.DOCKER_BIN ?? "docker";

export interface DockerResult {
  status: number;
  out: string;
  err: string;
}

export function docker(args: string[], timeout = 30_000): DockerResult {
  const result = spawnSync(DOCKER_BIN, args, { encoding: "utf8", timeout });
  return {
    status: result.status ?? 1,
    out: result.stdout ?? "",
    err: result.stderr ?? result.error?.message ?? "",
  };
}

/** Run a docker command with inherited stdio, for build progress. */
export function dockerStream(args: string[]): number {
  return spawnSync(DOCKER_BIN, args, { stdio: "inherit" }).status ?? 1;
}
