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
//   vpx native/scripts/fetch-upstream.ts             # restore from the lock; bootstrap with
//                                                    # main's current version when no lock exists
//   vpx native/scripts/fetch-upstream.ts --latest    # force an upgrade check against main
//   vpx native/scripts/fetch-upstream.ts --version 0.15.48   # pin an exact released version
//        [--source <git url or local path>] [--path pstack] [--commit <sha>]
//
// Rules:
// - Without --version or --latest the script reads native/upstream.lock.json and
//   restores native/upstream/ at the pinned commit; when the tree is already at
//   the pinned commit it does nothing and touches no network. With no lock on
//   disk it bootstraps exactly like --latest.
// - --latest resolves the version from <path>/plugin.json on the remote main
//   branch and pins that version's bump commit. Main may carry a version the
//   marketplace has not published yet; use --version when the pin must match a
//   marketplace-confirmed release exactly.
// - The default upgrade pin is the bump commit: the newest commit whose tree
//   switched plugin.json to the requested version relative to its parent.
// - Commits after the bump that touch <path>/ while the version is unchanged are
//   listed as possibly unreleased. Review them against the Cursor marketplace and
//   pass --commit explicitly to move the pin; the script never moves it for you.
// - A --commit pin must still resolve to the requested version.
// - Rerunning with the same version is byte-stable for both tree and lock.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NATIVE = join(ROOT, "native");
// Scratch lives inside the repo (gitignored): platform temp areas can silently
// deny reading cloned git objects back, which breaks the resolution steps.
const SCRATCH = join(ROOT, ".tmp", "fetch-upstream");
const RESTORED_PIN = join(SCRATCH, "restored-pin");
const DEFAULT_SOURCE = "https://github.com/cursor/plugins.git";

interface LockOnDisk {
  pstackVersion?: string;
  commit?: string;
  path?: string;
  source?: string;
}

const { values: args } = parseArgs({
  // `vp run native:fetch -- --version X` forwards a bare `--`; drop it first.
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    version: { type: "string" },
    latest: { type: "boolean", default: false },
    source: { type: "string" },
    path: { type: "string" },
    commit: { type: "string" },
  },
  allowPositionals: false,
});

let latest = args.latest;
let restoreFromLock = args.version === undefined && !latest;
if (args.commit !== undefined && args.version === undefined && !latest) {
  throw new Error("--commit requires --version or --latest");
}
const LOCK_FILE = join(NATIVE, "upstream.lock.json");
const lockOnDisk: LockOnDisk | undefined = existsSync(LOCK_FILE)
  ? JSON.parse(readFileSync(LOCK_FILE, "utf8"))
  : undefined;
if (restoreFromLock && !lockOnDisk?.pstackVersion) {
  // No pin on disk yet: bootstrap with main's current version instead of failing.
  console.log("no native/upstream.lock.json; bootstrapping with --latest.");
  restoreFromLock = false;
  latest = true;
}
// For --latest the version is resolved from origin/main after the work tree exists.
let version = restoreFromLock ? lockOnDisk?.pstackVersion : args.version;
if (version === undefined && !latest) {
  throw new Error("--version needs a value");
}
const path = restoreFromLock ? (lockOnDisk?.path ?? "pstack") : (args.path ?? "pstack");
const source = args.source ?? lockOnDisk?.source ?? DEFAULT_SOURCE;
const commitOverride = restoreFromLock ? lockOnDisk?.commit : args.commit;

function git(gitArgs: string[], cwd: string): string {
  const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${gitArgs.join(" ")} failed in ${cwd}: ${result.stderr}`);
  }
  return result.stdout;
}

// The receipt distinguishes same-version pins after a branch switch or --commit update.
const pinnedTreeManifest = join(NATIVE, "upstream", "plugin.json");
if (
  restoreFromLock &&
  commitOverride &&
  existsSync(pinnedTreeManifest) &&
  existsSync(RESTORED_PIN) &&
  readFileSync(RESTORED_PIN, "utf8") === `${commitOverride}\n${path}\n`
) {
  const present = JSON.parse(readFileSync(pinnedTreeManifest, "utf8")).version;
  if (present === version) {
    console.log(`native/upstream already carries ${version}; nothing to fetch.`);
    process.exit(0);
  }
}

// Resolve the work tree: a local git checkout is used as-is; a URL is cloned
// blobless (GitHub does not allow fetching an arbitrary pinned SHA, so even a
// restore resolves through a blobless clone of the commit history).
let work = source;
let cloned: string | undefined;
if (!existsSync(source) || !statSync(source).isDirectory()) {
  mkdirSync(SCRATCH, { recursive: true });
  cloned = join(SCRATCH, `clone-${Date.now()}`);
  git(["clone", "--filter=blob:none", "--no-checkout", source, cloned], ROOT);
  work = cloned;
}

const manifest = `${path}/plugin.json`;
function versionAt(atWork: string, sha: string): string {
  const text = git(["show", `${sha}:${manifest}`], atWork);
  return JSON.parse(text).version;
}

if (latest) {
  version = versionAt(work, "origin/main");
  if (version === undefined) {
    throw new Error(`origin/main carries no version in ${manifest}`);
  }
  console.log(`origin/main carries ${path}@${version}; resolving its bump commit.`);
}

/** Expand to a full sha without a redundant spawn when the input is already full. */
function fullSha(sha: string, atWork: string): string {
  return /^[0-9a-f]{40}$/.test(sha) ? sha : git(["rev-parse", sha], atWork).trim();
}

/** The canonical origin URL, read from the checkout's config without a spawn. */
function remoteUrl(atWork: string, fallback: string): string {
  const config = join(atWork, ".git", "config");
  if (existsSync(config)) {
    const match = readFileSync(config, "utf8").match(/\[remote "origin"\][^[]*?url = (\S+)/);
    if (match) return match[1];
  }
  return /^https?:\/\//.test(fallback) ? fallback : DEFAULT_SOURCE;
}

let bump: string | undefined;
let followUps: string[] = [];
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
  const parentOf = (sha: string): string | undefined => {
    const [commit, parent] = git(["rev-list", "--parents", "-n", "1", sha], work)
      .trim()
      .split(/\s+/);
    return commit === undefined || commit === parent ? undefined : parent;
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
mkdirSync(SCRATCH, { recursive: true });
const target = join(NATIVE, "upstream");
const archive = join(SCRATCH, `archive-${Date.now()}.tar`);
try {
  git(["archive", "--format=tar", "--output", archive, bump, path], work);
  const expected = versionAt(work, bump);
  if (expected !== version) {
    throw new Error(`commit ${bump} carries version ${expected}, not ${version}`);
  }
  rmSync(RESTORED_PIN, { force: true });
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const stripComponents = path.split("/").length;
  const extract = spawnSync("tar", [
    "-xf",
    archive,
    "-C",
    target,
    "--strip-components",
    String(stripComponents),
  ]);
  if (extract.status !== 0) {
    throw new Error(`tar extract failed: ${String(extract.stderr ?? "unknown tar error")}`);
  }
} finally {
  rmSync(archive, { force: true });
  if (cloned) rmSync(cloned, { recursive: true, force: true });
}

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
writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
writeFileSync(RESTORED_PIN, `${lock.commit}\n${lock.path}\n`);

console.log(`pinned ${path}@${version} at ${lock.commit.slice(0, 10)} -> native/upstream/`);
if (followUps.length > 0) {
  console.log("WARNING: commits after the bump touch the tree at an unchanged version:");
  for (const line of followUps) console.log(`  ${line}`);
  console.log(
    "They may be unreleased. Verify against the marketplace; pass --commit to pin past them.",
  );
}
