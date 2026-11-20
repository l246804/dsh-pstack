import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PlaygroundConfig, RunEnvironment, Treatment } from "../types.ts";
import { runtimeSettings } from "../config/runtime.ts";
import { environments } from "../scenario/environments.ts";
import { stableStringify } from "../shared/stable-json.ts";

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
  return resolve(PLAYGROUND_DIRECTORY, runtimeSettings().workersDir);
}

/**
 * Root of the per-worker state the tested session can reach. Defaults to the ignored
 * .workspace tree, sibling of .workers; only its workspace/home children are mounted.
 */
export function isolatedRootDirectory(): string {
  return resolve(PLAYGROUND_DIRECTORY, runtimeSettings().workspaceRoot);
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

export function publicConfigHash(
  config: PlaygroundConfig,
  matrix: RunEnvironment["matrix"],
): string {
  const publicConfig = {
    testModel: config.testModel,
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([provider, entry]) => [
        provider,
        entry.kind === "pi-ai"
          ? {
              kind: entry.kind,
              api: entry.api,
              baseURL: entry.baseURL,
              models: entry.models.map((model) => model.id),
            }
          : entry.kind === "deepseek-api-key"
            ? {
                kind: entry.kind,
                apiKeyEnv: entry.apiKeyEnv,
                models: entry.models?.map((model) => model.id),
              }
            : { kind: entry.kind, modelOverrides: entry.modelOverrides },
      ]),
    ),
    roleModels: config.roleModels ?? null,
    environment: matrix,
  };
  return createHash("sha256").update(stableStringify(publicConfig)).digest("hex");
}

function versionFromPackage(file: string): string {
  if (!existsSync(file)) throw new Error(`cannot read installed package version: ${file}`);
  const version = (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version;
  if (!version) throw new Error(`installed package has no version: ${file}`);
  return version;
}

export function dshVersion(): string {
  const result = spawnSync("dsh", ["--version"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim() === "") {
    throw new Error("cannot read the actual dsh version; prepare is blocked");
  }
  return result.stdout.trim();
}

export function adaptedVersion(paths: { home: string }, treatment: Treatment): string | null {
  if (treatment === "native") return null;
  return versionFromPackage(
    join(paths.home, `profiles/${PROFILE_NAME}/node_modules/dsh-pstack/package.json`),
  );
}

/**
 * The released pstack version pinned in native/upstream.lock.json. It is run identity and an
 * invalidation axis, recorded on every RunEnvironment at capture time.
 */
export function pstackVersion(): string {
  if (!existsSync(UPSTREAM_LOCK_FILE)) {
    throw new Error(`cannot read the upstream pin: ${UPSTREAM_LOCK_FILE}`);
  }
  const version = (
    JSON.parse(readFileSync(UPSTREAM_LOCK_FILE, "utf8")) as { pstackVersion?: string }
  ).pstackVersion;
  if (!version) throw new Error(`upstream pin has no pstackVersion: ${UPSTREAM_LOCK_FILE}`);
  return version;
}

export function upstreamRevision(): string {
  if (!existsSync(UPSTREAM_LOCK_FILE)) {
    throw new Error(`cannot read the upstream pin: ${UPSTREAM_LOCK_FILE}`);
  }
  const commit = (JSON.parse(readFileSync(UPSTREAM_LOCK_FILE, "utf8")) as { commit?: string })
    .commit;
  if (!commit) throw new Error(`upstream pin has no commit: ${UPSTREAM_LOCK_FILE}`);
  return commit;
}

export function createEnvironment(input: {
  worker: number;
  matrix: RunEnvironment["matrix"];
  config: PlaygroundConfig;
  treatment: Treatment;
  paths: { home: string };
}): RunEnvironment {
  return {
    worker: input.worker,
    dshVersion: dshVersion(),
    pstackVersion: pstackVersion(),
    adaptedVersion: adaptedVersion(input.paths, input.treatment),
    matrix: input.matrix,
    upstreamRevision: upstreamRevision(),
    configHash: publicConfigHash(input.config, input.matrix),
  };
}
