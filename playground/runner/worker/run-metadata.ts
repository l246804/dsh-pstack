import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RunEnvironment } from "../types.ts";
import { runtimeSettings } from "../config/runtime.ts";
import { environments } from "../scenario/environments.ts";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const PLAYGROUND_DIRECTORY = join(REPOSITORY_ROOT, "playground");
export const DEFAULT_CONFIG_FILE = join(PLAYGROUND_DIRECTORY, "config.ts");
/** Stock DSH profile name used by every worker image. */
export const PROFILE_NAME = "web";
export const UPSTREAM_LOCK_FILE = join(REPOSITORY_ROOT, "native", "upstream.lock.json");
export const NATIVE_ROOT = join(REPOSITORY_ROOT, "native");
export const NATIVE_TREE = join(NATIVE_ROOT, "pstack");
export const NATIVE_SKILLS = join(NATIVE_TREE, "skills");
export const WORKERS_ROOT = join(PLAYGROUND_DIRECTORY, ".workers");
export const WORKSPACE_ROOT = join(PLAYGROUND_DIRECTORY, ".workspace");

export function workersDirectory(): string {
  return resolve(REPOSITORY_ROOT, runtimeSettings().workersDir);
}

/**
 * Root of the per-worker state the tested session can reach. Defaults to the ignored
 * .workspace tree, sibling of .workers; only its workspace/home children are mounted.
 */
export function isolatedRootDirectory(): string {
  return resolve(REPOSITORY_ROOT, runtimeSettings().workspaceRoot);
}

export function environmentMatrix(id: string): RunEnvironment["matrix"] {
  if (id.trim() === "") throw new Error("playground environment id is required");
  const matrix = environments.find((entry) => entry.id === id);
  if (!matrix) throw new Error(`unknown playground environment: ${id}`);
  return {
    id: matrix.id,
    description: matrix.description,
    kind: matrix.kind,
    enabledPluginPackages: [...matrix.enabledPluginPackages],
    ...(matrix.versionExemptions === undefined
      ? {}
      : { versionExemptions: [...matrix.versionExemptions] }),
    ...(matrix.teamMode === undefined ? {} : { teamMode: matrix.teamMode }),
  };
}

export function dshVersion(): string {
  const result = spawnSync(runtimeSettings().dshBin, ["--version"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim() === "") {
    throw new Error("cannot read the actual dsh version; prepare is blocked");
  }
  return result.stdout.trim();
}

/** Read the released pstack pin recorded in native/upstream.lock.json. */
function readUpstreamLock(): { pstackVersion: string; commit: string } {
  if (!existsSync(UPSTREAM_LOCK_FILE)) {
    throw new Error(`cannot read the upstream pin: ${UPSTREAM_LOCK_FILE}`);
  }
  const raw = JSON.parse(readFileSync(UPSTREAM_LOCK_FILE, "utf8")) as {
    pstackVersion?: string;
    commit?: string;
  };
  if (!raw.pstackVersion) {
    throw new Error(`upstream pin has no pstackVersion: ${UPSTREAM_LOCK_FILE}`);
  }
  if (!raw.commit) throw new Error(`upstream pin has no commit: ${UPSTREAM_LOCK_FILE}`);
  return { pstackVersion: raw.pstackVersion, commit: raw.commit };
}

/**
 * The released pstack version pinned in native/upstream.lock.json. It is run identity and an
 * invalidation axis, recorded on every RunEnvironment at capture time.
 */
export function pstackVersion(): string {
  return readUpstreamLock().pstackVersion;
}

export function upstreamRevision(): string {
  return readUpstreamLock().commit;
}

export function createEnvironment(input: {
  worker: number;
  matrix: RunEnvironment["matrix"];
}): RunEnvironment {
  const pin = readUpstreamLock();
  return {
    worker: input.worker,
    dshVersion: dshVersion(),
    pstackVersion: pin.pstackVersion,
    matrix: input.matrix,
    upstreamRevision: pin.commit,
  };
}
