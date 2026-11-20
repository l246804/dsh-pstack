import { spawnSync } from "node:child_process";
import { hostCommand, hostCommandShell } from "./platform.ts";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

import { PROFILE_NAME, REPOSITORY_ROOT, dshVersion } from "./run-metadata.ts";
import { runtimeSettings } from "../config/runtime.ts";
import { runtimeEnv, type WorkerPaths } from "./worker.ts";

function dshBin(): string {
  return runtimeSettings().dshBin;
}

export function profileDirectory(paths: WorkerPaths): string {
  return join(paths.home, "profiles", PROFILE_NAME);
}

export function profilePatchFile(paths: WorkerPaths): string {
  return join(profileDirectory(paths), "cordis.patch.yml");
}

/** Initialize the shipped web profile in this worker home. */
export function ensureWebProfile(paths: WorkerPaths): void {
  const result = spawnSync(dshBin(), ["plugin", "--profile", PROFILE_NAME, "install"], {
    cwd: paths.home,
    env: { ...process.env, ...runtimeEnv(paths), DSH_HOME: paths.home },
    stdio: "inherit",
    shell: hostCommandShell(),
  });
  if (result.error)
    throw new Error(`failed to initialize the web profile: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`web profile initialization exited ${result.status}`);
}

/** Pack the built plugin once; the tarball is installed into a profile as a copy. */
export function packPlugin(destination: string): string {
  if (!existsSync(join(REPOSITORY_ROOT, "dist", "index.mjs"))) {
    throw new Error("the plugin build is missing; run vp run build before playground:prepare");
  }
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  const result = spawnSync(
    hostCommand("pnpm"),
    ["pack", "--ignore-scripts", "--pack-destination", destination],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`pnpm pack failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
  const tarballs = readdirSync(destination)
    .filter((name) => name.endsWith(".tgz"))
    .map((name) => join(destination, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (tarballs.length === 0) throw new Error(`pnpm pack produced no tarball in ${destination}`);
  return tarballs[0];
}

/** Install one package spec into the worker's web profile. */
export function installPluginPackage(paths: WorkerPaths, spec: string): void {
  const result = spawnSync(dshBin(), ["plugin", "--profile", PROFILE_NAME, "add", spec], {
    cwd: paths.home,
    env: { ...process.env, ...runtimeEnv(paths), DSH_HOME: paths.home },
    stdio: "inherit",
    shell: hostCommandShell(),
  });
  if (result.error) throw new Error(`failed to install ${spec}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`installing ${spec} exited ${result.status}`);
}

export function cloneInstalledProfile(source: WorkerPaths, destination: WorkerPaths): void {
  cpSync(profileDirectory(source), profileDirectory(destination), { recursive: true, force: true });
}

/** The cached version of a package the profile installed under its own node_modules. */
function installedPackageVersion(paths: WorkerPaths, name: string): string {
  const file = join(profileDirectory(paths), "node_modules", name, "package.json");
  if (!existsSync(file)) {
    throw new Error(
      `cannot exempt ${name}: it is not installed in the profile (run install first)`,
    );
  }
  const version = (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version;
  if (!version) throw new Error(`cannot exempt ${name}: its package.json has no version`);
  return version;
}

/**
 * Grant exact-version exemptions so the loader keeps plugin rows whose peer range omits the
 * running dsh. `dsh plugin allow-version` wants an exact `name@version` and the exact runtime
 * version, so both are read from disk and the running CLI rather than hard-coded.
 */
export function grantVersionExemptions(
  paths: WorkerPaths,
  packageNames: readonly string[],
  runtimeVersion = dshVersion(),
): string[] {
  const granted: string[] = [];
  for (const name of packageNames) {
    const packageVersion = `${name}@${installedPackageVersion(paths, name)}`;
    const result = spawnSync(
      dshBin(),
      [
        "plugin",
        "--profile",
        PROFILE_NAME,
        "allow-version",
        packageVersion,
        "--dsh-version",
        runtimeVersion,
        "--accept-risk",
      ],
      {
        cwd: REPOSITORY_ROOT,
        env: { ...process.env, ...runtimeEnv(paths), DSH_HOME: paths.home },
        stdio: "inherit",
        shell: hostCommandShell(),
      },
    );
    if (result.error) {
      throw new Error(
        `failed to grant version exemption ${packageVersion}: ${result.error.message}`,
      );
    }
    if (result.status !== 0) {
      throw new Error(`dsh plugin allow-version ${packageVersion} exited ${result.status}`);
    }
    granted.push(packageVersion);
  }
  return granted;
}
