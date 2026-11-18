import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PlaygroundConfig, RunEnvironment, Treatment } from "../types.ts";
import { environments } from "../scenario/environments.ts";
import { stableStringify } from "./stable-json.ts";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const PLAYGROUND_DIRECTORY = join(REPOSITORY_ROOT, "playground");
export const DEFAULT_CONFIG_FILE = join(PLAYGROUND_DIRECTORY, "config.json");
export const PORT_BASELINE_FILE = join(REPOSITORY_ROOT, "port", "baseline.json");
export const NATIVE_ROOT = join(PLAYGROUND_DIRECTORY, "native");
export const NATIVE_TREE = join(NATIVE_ROOT, "pstack");
export const NATIVE_SKILLS = join(NATIVE_TREE, "skills");
export const WORKERS_ROOT = join(PLAYGROUND_DIRECTORY, ".workers");
export const ISOLATED_ROOT = join(tmpdir(), "dsh-pstack-playground");

export function workersDirectory(): string {
  const override = process.env.PLAYGROUND_WORKERS_DIR;
  return override ? resolve(PLAYGROUND_DIRECTORY, override) : WORKERS_ROOT;
}

/**
 * Root of the per-worker directories the tested session can reach: its workspace and the
 * native skill mount. The sandbox limits writes but not reads, so this root must stay outside
 * the repository tree; a workspace inside the repo lets the session read scenario rubrics
 * and assertions and answer to them.
 */
export function isolatedRootDirectory(): string {
  const override = process.env.PLAYGROUND_WORKSPACE_ROOT;
  return override ? resolve(override) : ISOLATED_ROOT;
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
      Object.entries(config.providers).map(([provider, entry]) => [provider, entry.models]),
    ),
    roleModels: config.roleModels ?? null,
    ...(config.hostPatchFile === undefined ? {} : { hostPatchFile: config.hostPatchFile }),
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
    join(paths.home, "profiles/playground/node_modules/dsh-pstack/package.json"),
  );
}

/**
 * The released pstack version pinned in port/baseline.json. It is run identity and an
 * invalidation axis, recorded on every RunEnvironment at capture time.
 */
export function pstackVersion(): string {
  if (!existsSync(PORT_BASELINE_FILE)) {
    throw new Error(`cannot read the pstack baseline: ${PORT_BASELINE_FILE}`);
  }
  const version = (
    JSON.parse(readFileSync(PORT_BASELINE_FILE, "utf8")) as { pstackVersion?: string }
  ).pstackVersion;
  if (!version) throw new Error(`pstack baseline has no pstackVersion: ${PORT_BASELINE_FILE}`);
  return version;
}

export function upstreamRevision(): string {
  const result = spawnSync(
    "git",
    ["-C", join(REPOSITORY_ROOT, "upstream/cursor-plugins"), "rev-parse", "HEAD"],
    {
      encoding: "utf8",
    },
  );
  if (result.status !== 0) throw new Error("cannot read the actual upstream revision");
  return result.stdout.trim();
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
