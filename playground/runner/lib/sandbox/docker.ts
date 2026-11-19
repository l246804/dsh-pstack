import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import type { ProviderPlan } from "../env.ts";
import type { WorkerPaths } from "../worker.ts";
import { requireImage } from "./image.ts";
import { CONTAINER_PORT, containerSpec, dockerRunArgs } from "./spec.ts";

export interface StartedWeb {
  url: string;
  port: number;
}

export interface SandboxStatus {
  running: boolean;
  id: string | null;
}

const START_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;

interface DockerResult {
  status: number;
  out: string;
  err: string;
}

function docker(args: string[], timeout = 30_000): DockerResult {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout });
  return {
    status: result.status ?? 1,
    out: result.stdout ?? "",
    err: result.stderr ?? result.error?.message ?? "",
  };
}

function publishedPort(name: string): number {
  const result = docker(["port", name, `${CONTAINER_PORT}/tcp`]);
  const line = result.out.trim().split("\n")[0] ?? "";
  const port = Number(line.slice(line.lastIndexOf(":") + 1));
  if (result.status !== 0 || !Number.isInteger(port) || port <= 0) {
    throw new Error(`cannot read the published port for ${name}: ${result.err || result.out}`);
  }
  return port;
}

function containerRunning(name: string): boolean {
  const result = docker(["inspect", "-f", "{{.State.Running}}", name]);
  return result.status === 0 && result.out.trim() === "true";
}

function logs(name: string): string {
  const result = docker(["logs", name]);
  return `${result.out}${result.err}`.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * One Docker container per worker. The host path layout is mounted unchanged so every
 * absolute path recorded in a session or a RunRecord stays valid.
 */
export class DockerSandbox {
  start(paths: WorkerPaths, plan: ProviderPlan, hostPort?: number): Promise<StartedWeb> {
    const image = requireImage();
    const spec = containerSpec({ paths, plan, image, hostPort });
    docker(["rm", "-f", spec.name]);
    const run = docker(dockerRunArgs(spec), START_TIMEOUT_MS);
    if (run.status !== 0) {
      throw new Error(`docker run failed for ${spec.name}: ${run.err || run.out}`);
    }
    return this.waitForUrl(paths, spec.name);
  }

  private async waitForUrl(paths: WorkerPaths, name: string): Promise<StartedWeb> {
    const port = publishedPort(name);
    const deadline = Date.now() + START_TIMEOUT_MS;
    let tail = "";
    while (Date.now() < deadline) {
      tail = logs(name);
      const found = tail.match(/dsh web:\s*(http:\/\/\S+)/)?.[1];
      if (found) {
        const url = new URL(found);
        url.hostname = "127.0.0.1";
        url.port = String(port);
        mkdirSync(paths.root, { recursive: true });
        writeFileSync(paths.logFile, `${tail}\n`);
        writeFileSync(paths.urlFile, `${url.toString()}\n`);
        return { url: url.toString(), port };
      }
      if (!containerRunning(name)) {
        writeFileSync(paths.logFile, `${tail}\n`);
        throw new Error(`container ${name} exited before reporting a URL: ${tail}`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
    writeFileSync(paths.logFile, `${tail}\n`);
    throw new Error(`container ${name} did not report a URL within 120s: ${tail}`);
  }

  stop(paths: WorkerPaths): { stopped: boolean; id: string | null } {
    const name = paths.containerName;
    const stop = docker(["stop", "-t", "10", name], 20_000);
    const existed = stop.status === 0;
    docker(["rm", "-f", name]);
    try {
      rmSync(paths.urlFile, { force: true });
    } catch {
      // Best effort; the worker root is removed on reset.
    }
    return { stopped: existed, id: existed ? name : null };
  }

  status(paths: WorkerPaths): SandboxStatus {
    return { running: containerRunning(paths.containerName), id: paths.containerName };
  }

  logs(paths: WorkerPaths, tail = 50): string {
    const lines = logs(paths.containerName).split("\n");
    return lines.slice(-tail).join("\n");
  }
}
