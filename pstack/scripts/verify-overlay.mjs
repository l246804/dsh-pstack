#!/usr/bin/env node

/**
 * Verify `pstack/overlay/overlay.yml` before the generated tree is rendered.
 *
 * An overlay page is written against a particular upstream page. Once that upstream page
 * changes, the overlay keeps shipping text that describes an upstream that no longer
 * exists, and nothing about the render fails. `overlay.yml` records the upstream file's
 * `sha256` for exactly this reason: this script hashes the file the generator is about to
 * read and refuses to render when the two disagree.
 *
 * The checks are all fatal unless noted:
 *
 * - the manifest parses, and every entry is an object with `path` and `replaces` and no
 *   unexpected keys (a misspelled `sha256` must not silently skip the hash check);
 * - `path` is a normalized tree-relative path, and the overlay file exists;
 * - `path` equals `replaces`, because the generator looks the overlay up by its tree path;
 *   a differing `replaces` would guard an upstream file that is never read from here;
 * - the upstream file exists and its sha256 matches the recorded hash;
 * - every file under `pstack/overlay/` is registered, and no path or upstream file is
 *   claimed twice.
 *
 * A `revision` that differs from the checked-out submodule is reported as a warning, not a
 * failure: the sha256 comparison already gates the exact bytes the generator reads, and
 * the rest of the upstream tree is expected to advance. Recording the mismatch lets the
 * next person re-pin the hash after they confirm the overlaid page still applies.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OVERLAY_DIR = join(ROOT, "pstack", "overlay");
const MANIFEST = join(OVERLAY_DIR, "overlay.yml");
const UPSTREAM = join(ROOT, "upstream", "cursor-plugins", "pstack");

/** Keys an entry may carry; anything else is a typo waiting to bypass a check. */
const FIELDS = new Set(["path", "replaces", "revision", "sha256"]);
const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;

const problems = [];
const warnings = [];

function fail(message) {
  problems.push(message);
}

function warn(message) {
  warnings.push(message);
}

/** Every regular file below `dir`, skipping the editor and dependency noise. */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** A tree-relative POSIX path with no escape, no empty segments, and no normalization to hide either. */
function isTreePath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("\\") || value.startsWith("/")) return false;
  if (posix.normalize(value) !== value) return false;
  return !value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function toDisk(base, treePath) {
  return join(base, ...treePath.split("/"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

let head;
/** The upstream submodule's checked-out commit, read once and only when needed. */
function upstreamHead() {
  if (head !== undefined) return head;
  try {
    head = execFileSync("git", ["-C", UPSTREAM, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch (error) {
    head = null;
    warn(`cannot read the upstream submodule revision: ${error.message.split("\n")[0]}`);
  }
  return head;
}

function entry(entry, index) {
  const at = `overlay[${index}]`;
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`${at} is not an object`);
    return undefined;
  }
  for (const key of Object.keys(entry)) {
    if (!FIELDS.has(key)) fail(`${at} has unknown key ${JSON.stringify(key)}`);
  }
  for (const key of ["path", "replaces"]) {
    if (!(key in entry)) fail(`${at} is missing ${JSON.stringify(key)}`);
  }
  if (!isTreePath(entry.path)) {
    fail(`${at}.path is not a normalized tree-relative path: ${JSON.stringify(entry.path)}`);
    return undefined;
  }
  const file = toDisk(OVERLAY_DIR, entry.path);
  if (!existsSync(file) || !statSync(file).isFile()) {
    fail(`${at}.path names pstack/overlay/${entry.path}, which does not exist`);
    return undefined;
  }
  if (entry.replaces === "none") {
    for (const key of ["revision", "sha256"]) {
      if (key in entry) fail(`${at} has replaces: none but also ${key}`);
    }
    return { path: entry.path, replaces: "none" };
  }
  if (!isTreePath(entry.replaces)) {
    fail(
      `${at}.replaces is neither "none" nor a normalized tree-relative path: ${JSON.stringify(entry.replaces)}`,
    );
    return undefined;
  }
  if (entry.path !== entry.replaces) {
    fail(
      `${at}.path (${entry.path}) differs from .replaces (${entry.replaces}); the generator reads the overlay by path`,
    );
  }
  const upstream = toDisk(UPSTREAM, entry.replaces);
  if (!existsSync(upstream) || !statSync(upstream).isFile()) {
    fail(`${at} replaces upstream/${entry.replaces}, which does not exist`);
    return { path: entry.path, replaces: entry.replaces };
  }
  if (!DIGEST.test(entry.sha256)) {
    fail(
      `${at}.sha256 is not a lowercase 64-character hex digest: ${JSON.stringify(entry.sha256)}`,
    );
  } else {
    const actual = sha256(upstream);
    if (actual !== entry.sha256) {
      fail(
        `${at}.sha256 does not match upstream/${entry.replaces}\n  expected ${entry.sha256}\n  actual   ${actual}`,
      );
    }
  }
  if (!COMMIT.test(entry.revision)) {
    fail(
      `${at}.revision is not a 40-character lowercase hex commit: ${JSON.stringify(entry.revision)}`,
    );
  } else if (upstreamHead() && upstreamHead() !== entry.revision) {
    warn(
      `${at} was pinned at ${entry.revision}, but the submodule is at ${upstreamHead()}; re-pin after reviewing the overlaid page`,
    );
  }
  if (sha256(toDisk(OVERLAY_DIR, entry.path)) === sha256(upstream)) {
    warn(
      `pstack/overlay/${entry.path} is identical to upstream/${entry.replaces}; drop the overlay instead`,
    );
  }
  return { path: entry.path, replaces: entry.replaces };
}

function main() {
  if (!existsSync(UPSTREAM)) {
    fail(`upstream/cursor-plugins is missing; run \`git submodule update --init --recursive\``);
  }
  if (!existsSync(MANIFEST)) {
    fail("pstack/overlay/overlay.yml is missing");
  }

  let manifest;
  if (existsSync(MANIFEST)) {
    try {
      manifest = load(readFileSync(MANIFEST, "utf8"));
    } catch (error) {
      fail(`overlay.yml is not valid YAML: ${error.message}`);
    }
  }

  const entries = manifest?.overlay;
  if (!Array.isArray(entries)) {
    fail("overlay.yml has no top-level `overlay:` list");
  } else {
    const paths = new Map();
    const replaces = new Map();
    entries.forEach((raw, index) => {
      const parsed = entry(raw, index);
      if (!parsed) return;
      if (paths.has(parsed.path))
        fail(
          `overlay[${index}].path ${parsed.path} is also declared by overlay[${paths.get(parsed.path)}]`,
        );
      else paths.set(parsed.path, index);
      if (parsed.replaces === "none") return;
      if (replaces.has(parsed.replaces)) {
        fail(
          `overlay[${index}].replaces ${parsed.replaces} is also declared by overlay[${replaces.get(parsed.replaces)}]`,
        );
      } else {
        replaces.set(parsed.replaces, index);
      }
    });

    for (const file of walk(OVERLAY_DIR)) {
      const path = relative(OVERLAY_DIR, file).split(sep).join("/");
      if (path === "overlay.yml") continue;
      if (!paths.has(path)) fail(`pstack/overlay/${path} is not registered in overlay.yml`);
    }
  }

  for (const warning of warnings) console.warn(`WARN ${warning}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL ${problem}`);
    console.error(
      `verify:overlay: ${problems.length} problem(s); refusing to render the generated tree`,
    );
    process.exit(1);
  }
  const replaced = entries.filter((raw) => raw.replaces !== "none").length;
  console.log(
    `verify:overlay: ${entries.length} entries valid (${replaced} checked against upstream)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { main as verifyOverlay };
