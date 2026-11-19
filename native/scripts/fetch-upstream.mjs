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
//   vpx native/scripts/fetch-upstream.mjs                 # restore from the lock, no version needed
//   vpx native/scripts/fetch-upstream.mjs --version 0.15.43   # move the pin to a released version
//        [--source <git url or local path>] [--path pstack] [--commit <sha>]
//
// Rules:
// - Without --version the script reads native/upstream.lock.json and restores
//   native/upstream/ at the pinned commit; when the tree is already at the
//   pinned version it does nothing and touches no network.
// - The default upgrade pin is the bump commit: the newest commit whose tree
//   switched plugin.json to the requested version relative to its parent.
// - Commits after the bump that touch <path>/ while the version is unchanged are
//   listed as possibly unreleased. Review them against the Cursor marketplace and
//   pass --commit explicitly to move the pin; the script never moves it for you.
// - A --commit pin must still resolve to the requested version.
// - Rerunning with the same version is byte-stable for both tree and lock.
// - "Latest" is never resolved automatically: the version on main may already be
//   the unreleased next release, and the marketplace has no public API.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NATIVE = join(ROOT, "native");
// Scratch lives inside the repo (gitignored): platform temp areas can silently
// deny reading cloned git objects back, which breaks the resolution steps.
const SCRATCH = join(ROOT, ".tmp", "fetch-upstream");
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

const restoreFromLock = !process.argv.includes("--version");
const LOCK_FILE = join(NATIVE, "upstream.lock.json");
const lockOnDisk = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, "utf8")) : undefined;
if (restoreFromLock && !lockOnDisk?.pstackVersion) {
  throw new Error(
    "no usable native/upstream.lock.json; pass --version <x.y.z> to pin a released version first",
  );
}
const version = restoreFromLock ? lockOnDisk.pstackVersion : arg("version");
const path = restoreFromLock ? (lockOnDisk.path ?? "pstack") : arg("path", "pstack");
const source = arg("source", lockOnDisk?.source ?? DEFAULT_SOURCE);
const commitOverride = restoreFromLock ? lockOnDisk.commit : arg("commit");

// Restore fast path: the tree already carries the pinned version. No git, no network.
const pinnedTreeManifest = join(NATIVE, "upstream", "plugin.json");
if (restoreFromLock && commitOverride && existsSync(pinnedTreeManifest)) {
  const present = JSON.parse(readFileSync(pinnedTreeManifest, "utf8")).version;
  if (present === version) {
    console.log(`native/upstream already carries ${version}; nothing to fetch.`);
    process.exit(0);
  }
}

function git(args, cwd, options = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  }
  return result.stdout;
}

// Resolve the work tree: a local git checkout is used as-is; a URL is cloned
// blobless (GitHub does not allow fetching an arbitrary pinned SHA, so even a
// restore resolves through a blobless clone of the commit history).
let work = source;
let cloned;
if (!existsSync(source) || !statSync(source).isDirectory()) {
  mkdirSync(SCRATCH, { recursive: true });
  cloned = join(SCRATCH, `clone-${Date.now()}`);
  git(["clone", "--filter=blob:none", "--no-checkout", source, cloned]);
  work = cloned;
}

const manifest = `${path}/plugin.json`;
function versionAt(work, sha) {
  const text = git(["show", `${sha}:${manifest}`], work);
  return JSON.parse(text).version;
}

/** Expand to a full sha without a redundant spawn when the input is already full. */
function fullSha(sha, work) {
  return /^[0-9a-f]{40}$/.test(sha) ? sha : git(["rev-parse", sha], work).trim();
}

/** The canonical origin URL, read from the checkout's config without a spawn. */
function remoteUrl(work, fallback) {
  const config = join(work, ".git", "config");
  if (existsSync(config)) {
    const match = readFileSync(config, "utf8").match(/\[remote "origin"\][^[]*?url = (\S+)/);
    if (match) return match[1];
  }
  return fallback;
}

let bump;
let followUps = [];
if (commitOverride) {
  // The extracted manifest is verified against the version below, so a pinned
  // commit needs no separate pre-check here.
  bump = fullSha(commitOverride, work);
} else {
  const history = git(["log", "--format=%H", "--", manifest], work)
    .trim()
    .split("\n")
    .filter(Boolean);
  if (history.length === 0) {
    throw new Error(`no commits touch ${manifest} in ${source}`);
  }
  const parentOf = (sha) => {
    const parent = git(["rev-parse", "--short=40", `${sha}^`], work).trim();
    return parent === sha ? undefined : parent;
  };
  // Newest commit that entered the requested version relative to its parent.
  bump = history.find((sha) => {
    if (versionAt(work, sha) !== version) return false;
    const parent = parentOf(sha);
    return parent === undefined || versionAt(work, parent) !== version;
  });
  if (!bump) {
    throw new Error(`no commit in ${source} ever set ${manifest} to ${version}`);
  }
  // Same-version commits after the bump: possibly unreleased marketplace content.
  followUps = git(["log", "--format=%h %s", `${bump}..HEAD`, "--", path], work)
    .trim()
    .split("\n")
    .filter(Boolean);
}

// Extract the subtree at the pin. native/upstream/ holds the tree root itself.
const target = join(NATIVE, "upstream");
const archive = join(SCRATCH, `archive-${Date.now()}.tar`);
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
  commit: fullSha(bump, work),
  path,
  // The canonical remote, not the ephemeral local path that may have served the fetch.
  source: remoteUrl(work, source),
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
