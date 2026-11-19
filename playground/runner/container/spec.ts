import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ProviderPlan } from "../config/provider.ts";
import type { WorkerPaths } from "../worker/worker.ts";
import { runtimeEnv } from "../worker/worker.ts";

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
  user: string | null;
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
 * Everything the agent may reach is an explicit mount under /dsh: the workspace, the
 * worker home, the native tree read-only, and the runtime temp dirs. The repository and
 * the host home are never mounted.
 */
export function containerSpec(input: ContainerSpecInput): ContainerSpec {
  const { paths, plan, image, hostPort } = input;
  // Ensure the host-side runtime directories exist before they become mount sources.
  runtimeEnv(paths);
  const mounts: ContainerMount[] = [
    { source: paths.workspaceRoot, target: paths.containerWorkspace, readonly: false },
    { source: paths.home, target: paths.containerHome, readonly: false },
    {
      source: join(paths.isolatedRoot, "tmp"),
      target: paths.containerTmp,
      readonly: false,
    },
    {
      source: join(paths.isolatedRoot, "xdg-runtime"),
      target: paths.containerRuntime,
      readonly: false,
    },
  ];
  if (existsSync(paths.nativeMount)) {
    mounts.push({ source: paths.nativeMount, target: paths.containerNative, readonly: true });
  }
  return {
    name: paths.containerName,
    image,
    // Docker Desktop maps bind-mount ownership itself; asking for a host uid fails there.
    user:
      process.platform === "linux"
        ? `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`
        : null,
    workdir: paths.containerWorkspace,
    mounts,
    env: {
      DSH_HOME: paths.containerHome,
      HOME: paths.containerHome,
      XDG_RUNTIME_DIR: paths.containerRuntime,
      TMPDIR: paths.containerTmp,
      GH_CONFIG_DIR: join(paths.containerHome, "gh-config"),
      GIT_TERMINAL_PROMPT: "0",
      ...(plan.apiKeyEnv === undefined || plan.apiKey === undefined
        ? {}
        : { [plan.apiKeyEnv]: plan.apiKey }),
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
  if (spec.user !== null) args.push("--user", spec.user);
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
