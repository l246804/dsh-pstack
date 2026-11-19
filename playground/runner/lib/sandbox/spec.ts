import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ProviderPlan } from "../provider.ts";
import type { WorkerPaths } from "../worker.ts";
import { runtimeEnv } from "../worker.ts";

/** The port DSH binds inside the container; the host port is published by Docker. */
export const CONTAINER_PORT = 8080;

export interface ContainerMount {
  source: string;
  target: string;
  readonly: boolean;
}

export interface ContainerSpec {
  name: string;
  image: string;
  user: string;
  workdir: string;
  mounts: ContainerMount[];
  env: Record<string, string>;
  hostPort?: number;
  containerPort: number;
}

export interface ContainerSpecInput {
  paths: WorkerPaths;
  plan: ProviderPlan;
  image: string;
  hostPort?: number;
}

/**
 * Everything the agent may reach is an explicit mount: the isolated root (workspace,
 * runtime dirs), the worker home (profile and credentials), and the native tree read-only.
 * Nothing from the repository or the rest of the host is mounted.
 */
export function containerSpec(input: ContainerSpecInput): ContainerSpec {
  const { paths, plan, image, hostPort } = input;
  const runtime = runtimeEnv(paths);
  const mounts: ContainerMount[] = [
    { source: paths.isolatedRoot, target: paths.isolatedRoot, readonly: false },
    { source: paths.home, target: paths.home, readonly: false },
  ];
  if (existsSync(paths.nativeMount)) {
    mounts.push({ source: paths.nativeMount, target: paths.nativeMount, readonly: true });
  }
  return {
    name: paths.containerName,
    image,
    user: `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    workdir: paths.isolatedRoot,
    mounts,
    env: {
      DSH_HOME: paths.home,
      HOME: paths.home,
      XDG_RUNTIME_DIR: runtime.XDG_RUNTIME_DIR,
      TMPDIR: runtime.TMPDIR,
      GH_CONFIG_DIR: join(paths.home, "gh-config"),
      GIT_TERMINAL_PROMPT: "0",
      [plan.apiKeyEnv]: plan.apiKey,
    },
    hostPort,
    containerPort: CONTAINER_PORT,
  };
}

/** Pure translation from a spec to `docker run` arguments, kept separate for tests. */
export function dockerRunArgs(spec: ContainerSpec): string[] {
  const args = [
    "run",
    "--detach",
    "--name",
    spec.name,
    "--user",
    spec.user,
    "--read-only",
    "--init",
    "--tmpfs",
    "/tmp:rw,size=512m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--workdir",
    spec.workdir,
  ];
  for (const mount of spec.mounts) {
    args.push("-v", `${mount.source}:${mount.target}:${mount.readonly ? "ro" : "rw"}`);
  }
  args.push(
    "--publish",
    `127.0.0.1:${spec.hostPort === undefined ? "" : String(spec.hostPort)}:${spec.containerPort}`,
  );
  for (const [key, value] of Object.entries(spec.env)) {
    args.push("--env", `${key}=${value}`);
  }
  args.push(spec.image);
  return args;
}
