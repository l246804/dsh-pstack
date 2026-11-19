#!/usr/bin/env node
// Pin the RELEASED upstream pstack tree into native/upstream/ + native/upstream.lock.json.
//
// The upstream monorepo (github.com/cursor/plugins) has no tags, and the Cursor
// marketplace publishes reviewed snapshots pinned to commit SHAs it does not
// expose. The only version boundary reconstructable from the repository itself
// is the commit that bumped <path>/plugin.json to a given version. This script
// pins that bump commit: version-first, never a moving branch.
//
// Usage:
//   vpx native/scripts/fetch-upstream.mjs --version 0.15.43
//        [--source <git url or local path>] [--path pstack] [--commit <sha>]
//
// Rules:
// - The default pin is the bump commit: the newest commit whose tree switched
//   plugin.json to the requested version relative to its parent.
// - Commits after the bump that touch <path>/ while the version is unchanged are
//   listed as possibly unreleased. Review them against the Cursor marketplace and
//   pass --commit explicitly to move the pin; the script never moves it for you.
// - A --commit pin must still resolve to the requested version.
// - Rerunning with the same version is byte-stable for both tree and lock.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NATIVE = join(ROOT, "native");
const DEFAULT_SOURCE = "https://github.com/cursor/plugins.git";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`--${name} needs a value`);
  }
  return value;
}

const version = arg("version");
const path = arg("path", "pstack");
const source = arg("source", DEFAULT_SOURCE);
const commitOverride = arg("commit");
if (!version) {
  throw new Error(
    "usage: fetch-upstream.mjs --version <x.y.z> [--source <git url|path>] [--path pstack] [--commit <sha>]",
  );
}

function git(args, cwd, options = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  }
  return result.stdout;
}

const manifest = `${path}/plugin.json`;
function versionAt(work, sha) {
  const text = git(["show", `${sha}:${manifest}`], work);
  return JSON.parse(text).version;
}

// Resolve the work tree: a local git checkout is used as-is; a URL is cloned
// blobless into a scratch directory.
let work = source;
let cloned;
if (!existsSync(source) || !statSync(source).isDirectory()) {
  cloned = join(tmpdir(), `fetch-upstream-${Date.now()}`);
  git(["clone", "--filter=blob:none", "--no-checkout", source, cloned]);
  work = cloned;
}

const history = git(["log", "--format=%H", "--", manifest], work)
  .trim()
  .split("\n")
  .filter(Boolean);
if (history.length === 0) {
  throw new Error(`no commits touch ${manifest} in ${source}`);
}

function parentOf(sha) {
  const parent = git(["rev-parse", "--short=40", `${sha}^`], work).trim();
  return parent === sha ? undefined : parent;
}

let bump;
if (commitOverride) {
  bump = git(["rev-parse", "--short=40", commitOverride], work).trim();
  if (versionAt(work, bump) !== version) {
    throw new Error(`commit ${bump} carries version ${versionAt(work, bump)}, not ${version}`);
  }
} else {
  // Newest commit that entered the requested version relative to its parent.
  bump = history.find((sha) => {
    if (versionAt(work, sha) !== version) return false;
    const parent = parentOf(sha);
    return parent === undefined || versionAt(work, parent) !== version;
  });
  if (!bump) {
    throw new Error(`no commit in ${source} ever set ${manifest} to ${version}`);
  }
}

// Same-version commits after the bump: possibly unreleased marketplace content.
const followUps = git(["log", "--format=%h %s", `${bump}..HEAD`, "--", path], work)
  .trim()
  .split("\n")
  .filter(Boolean);

// Extract the subtree at the pin. native/upstream/ holds the tree root itself.
const target = join(NATIVE, "upstream");
const archive = join(tmpdir(), `fetch-upstream-${Date.now()}.tar`);
git(["archive", "--format=tar", "--output", archive, bump, path], work);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const extract = spawnSync("tar", ["-xf", archive, "-C", target, "--strip-components=1"]);
if (extract.status !== 0) {
  throw new Error(`tar extract failed: ${extract.stderr}`);
}
rmSync(archive, { force: true });
if (cloned) rmSync(cloned, { recursive: true, force: true });

const pinned = JSON.parse(readFileSync(join(target, "plugin.json"), "utf8")).version;
if (pinned !== version) {
  throw new Error(`extracted tree carries version ${pinned}, not ${version}`);
}

const lock = {
  pstackVersion: version,
  commit: git(["rev-parse", bump], work).trim(),
  path,
  // The canonical remote, not the ephemeral local path that may have served the fetch.
  source: git(["remote", "get-url", "origin"], work).trim() || source,
};
writeFileSync(join(NATIVE, "upstream.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

console.log(`pinned ${path}@${version} at ${lock.commit.slice(0, 10)} -> native/upstream/`);
if (followUps.length > 0) {
  console.log("WARNING: commits after the bump touch the tree at an unchanged version:");
  for (const line of followUps) console.log(`  ${line}`);
  console.log(
    "They may be unreleased. Verify against the marketplace; pass --commit to pin past them.",
  );
}
