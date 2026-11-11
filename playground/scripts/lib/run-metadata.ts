import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PlaygroundConfig, RunEnvironment } from "../../types.ts";
import { environments } from "../../scenarios/index.ts";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const PLAYGROUND_DIRECTORY = join(REPOSITORY_ROOT, "playground");
export const DEFAULT_CONFIG_FILE = join(PLAYGROUND_DIRECTORY, "config.json");
export const RAW_ROOT = join(PLAYGROUND_DIRECTORY, "raw/generated");
export const RAW_TREE = join(RAW_ROOT, "tree");
export const RAW_SKILLS = join(RAW_TREE, "skills");
export const REPORT_DIRECTORY = join(PLAYGROUND_DIRECTORY, "reports");
export const WORKERS_ROOT = join(PLAYGROUND_DIRECTORY, ".workers");

export function workersDirectory(): string {
  const override = process.env.PLAYGROUND_WORKERS_DIR;
  return override ? resolve(PLAYGROUND_DIRECTORY, override) : WORKERS_ROOT;
}

export function environmentMatrix(id: string | undefined): RunEnvironment["matrix"] {
  const matrix = environments.find((entry) => entry.id === (id ?? "base"));
  if (!matrix) throw new Error(`unknown playground environment: ${id ?? "base"}`);
  return { id: matrix.id, enabledPluginPackages: [...matrix.enabledPluginPackages] };
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
    ...(config.hostPatchFile === undefined ? {} : { hostPatchFile: config.hostPatchFile }),
    environment: matrix,
  };
  return createHash("sha256").update(JSON.stringify(publicConfig)).digest("hex");
}

function versionFromPackage(file: string): string {
  if (!existsSync(file)) return "unavailable";
  return (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version ?? "unknown";
}

export function dshVersion(): string {
  const result = spawnSync("dsh", ["--version"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim() === "") {
    throw new Error("cannot read the actual dsh version; prepare is blocked");
  }
  return result.stdout.trim();
}

export function adaptedVersion(paths: { home: string }, phase: "raw" | "adapted"): string | null {
  if (phase === "raw") return null;
  return versionFromPackage(
    join(paths.home, "profiles/playground/node_modules/dsh-pstack/package.json"),
  );
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
  phase: "raw" | "adapted";
  paths: { home: string };
}): RunEnvironment {
  return {
    worker: input.worker,
    dshVersion: dshVersion(),
    adaptedVersion: adaptedVersion(input.paths, input.phase),
    matrix: input.matrix,
    upstreamRevision: upstreamRevision(),
    configHash: publicConfigHash(input.config, input.matrix),
  };
}
