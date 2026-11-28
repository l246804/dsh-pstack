import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeSettings } from "../config/runtime.ts";
export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const PLAYGROUND_DIRECTORY = join(REPOSITORY_ROOT, "playground");
export const DEFAULT_CONFIG_FILE = join(PLAYGROUND_DIRECTORY, "config.ts");
export const UPSTREAM_LOCK_FILE = join(REPOSITORY_ROOT, "native", "upstream.lock.json");
export const NATIVE_ROOT = join(REPOSITORY_ROOT, "native");
export const NATIVE_TREE = join(NATIVE_ROOT, "pstack");
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
