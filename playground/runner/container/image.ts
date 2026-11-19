import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { docker, dockerStream } from "./docker-command.ts";
import { REPOSITORY_ROOT, dshVersion } from "../worker/run-metadata.ts";

export const IMAGE_REPOSITORY = "dsh-playground";
const DOCKERFILE_DIR = join(REPOSITORY_ROOT, "playground", "docker");

/** Docker's architecture names, kept aligned with `process.arch` for local builds. */
export function hostArch(): string {
  if (process.arch === "x64") return "amd64";
  if (process.arch === "arm64") return "arm64";
  throw new Error(`unsupported host architecture: ${process.arch}`);
}

export function imageTag(version: string, arch = hostArch()): string {
  return `${IMAGE_REPOSITORY}:${version}-${arch}`;
}

export function currentImage(): string {
  return imageTag(dshVersion());
}

let verifiedImage: string | null = null;

export function imageExists(tag: string): boolean {
  return docker(["image", "inspect", tag]).status === 0;
}

/** The DSH version the image actually runs, or null when the image cannot report it. */
export function imageVersion(tag: string): string | null {
  const result = docker(["run", "--rm", "--entrypoint", "dsh", tag, "--version"]);
  return result.status === 0 ? (result.out.trim().split("\n")[0] ?? null) : null;
}

/** The image architecture, or null when it cannot be inspected. */
export function imageArchitecture(tag: string): string | null {
  const result = docker(["image", "inspect", "--format", "{{.Architecture}}", tag]);
  return result.status === 0 ? result.out.trim() : null;
}

/** Preflight failures that block every worker start; doctor prints them verbatim. */
export function imageProblems(): string[] {
  const problems: string[] = [];
  if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) {
    problems.push(
      "docker daemon is not reachable; start Docker and rerun vp run playground:doctor",
    );
    return problems;
  }
  const tag = currentImage();
  if (!imageExists(tag)) {
    problems.push(`playground image ${tag} is missing; run vp run playground:image`);
    return problems;
  }
  const arch = imageArchitecture(tag);
  if (arch !== hostArch()) {
    problems.push(
      `image ${tag} is ${arch ?? "unknown"}, host needs ${hostArch()}; rebuild on this machine with vp run playground:image`,
    );
  }
  const actual = imageVersion(tag);
  const expected = dshVersion();
  if (actual !== expected) {
    problems.push(
      `image ${tag} runs dsh ${actual ?? "unknown"}, host runs ${expected}; rerun vp run playground:image`,
    );
  }
  return problems;
}

/** Fail fast in prepare; the caller reports the actionable command. */
export function requireImage(): string {
  const tag = currentImage();
  if (verifiedImage === tag) return tag;
  const problems = imageProblems();
  if (problems.length > 0) throw new Error(problems.join("; "));
  verifiedImage = tag;
  return tag;
}

export function buildImage(): string {
  const version = dshVersion();
  verifiedImage = null;
  mkdirSync(DOCKERFILE_DIR, { recursive: true });
  const status = dockerStream([
    "build",
    "--build-arg",
    `DSH_VERSION=${version}`,
    "-t",
    imageTag(version),
    DOCKERFILE_DIR,
  ]);
  if (status !== 0) {
    throw new Error(`docker build failed with status ${String(status)}`);
  }
  return imageTag(version);
}
