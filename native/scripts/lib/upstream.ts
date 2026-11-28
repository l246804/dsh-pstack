/** Git operations for resolving a plugin version to its introducing commit. */
import { spawnSync } from "node:child_process";

export function git(gitArgs: string[], cwd: string): string {
  const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${gitArgs.join(" ")} failed in ${cwd}: ${result.stderr}`);
  }
  return result.stdout;
}

export function versionAt(work: string, manifest: string, sha: string): string | undefined {
  // ls-tree distinguishes an absent manifest from an invalid ref or failed Git operation.
  const object = git(["ls-tree", "--format=%(objectname)", sha, "--", manifest], work).trim();
  if (object === "") return undefined;
  const version = (JSON.parse(git(["cat-file", "blob", object], work)) as { version?: unknown })
    .version;
  return typeof version === "string" ? version : undefined;
}

/** Newest commit that entered the version, including a plugin's first publication. */
export function resolveVersionCommit(work: string, manifest: string, version: string): string {
  const history = git(["log", "--format=%H", "--", manifest], work)
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const sha of history) {
    if (versionAt(work, manifest, sha) !== version) continue;
    const parent = git(["rev-list", "--parents", "-n", "1", sha], work).trim().split(/\s+/)[1];
    if (parent === undefined || versionAt(work, manifest, parent) !== version) return sha;
  }
  throw new Error(`no commit in ${work} ever set ${manifest} to ${version}`);
}
