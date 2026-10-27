/**
 * The overlay: hand-written files that replace their upstream counterparts.
 *
 * An overlay file is a whole file, not a patch. It wins over the upstream file at the same
 * path, and it is the only way hand-written prose reaches the generated tree.
 *
 * **The overlay mirrors the tree.** `pstack/overlay/skills/x/SKILL.md` replaces the tree's
 * `skills/x/SKILL.md`, and `pstack/overlay/agents/y.md` replaces `agents/y.md`. The path
 * inside the overlay is the path inside the tree, so `overlay.yml` carries one path per
 * entry instead of two that a maintainer has to keep in step, and adding an `agents/`
 * override needs no new convention: it is the directory it already looks like.
 *
 * Whole-file replacement buys that simple rule and pays for it with drift. A patch table
 * fails loudly when upstream re-wraps a line and succeeds quietly when upstream changes the
 * meaning without moving the anchor; a replaced file has neither failure, because nothing
 * compares it to upstream at all. So `overlay.yml` records, for each replaced file, the
 * upstream path it rewrites, the revision, and the SHA-256 of the upstream text. The
 * generator hashes the pinned upstream file and refuses to build when the two disagree,
 * which turns drift into a build failure that names the file to rewrite.
 *
 * The manifest is a separate file rather than a header line in each overlay, because a
 * `SKILL.md` must begin with its `---` frontmatter. Anything above that line makes the
 * skill unparseable, and a per-skill header would also ship inside the tree.
 */

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import yaml from "js-yaml";

import { ADAPTER_SOURCE } from "./adapter.ts";

/** The adapter's path inside the overlay and inside the tree. */
export const ADAPTER_ASSET = ADAPTER_SOURCE;

/** The manifest's path, relative to the overlay root. */
export const OVERLAY_MANIFEST = "overlay.yml";

/** One entry of the overlay manifest. */
export interface OverlayEntry {
  /** Path inside the overlay, which is also its path inside the generated tree. */
  readonly path: string;
  /**
   * Upstream path this entry replaces, or `none`.
   *
   * `none` marks a file with no upstream counterpart: the adapter document is written here
   * rather than replacing anything, so there is no upstream text to go stale.
   */
  readonly replaces: string;
  /** Pinned upstream commit the hash was taken at. Required when `replaces` is not `none`. */
  readonly revision?: string;
  /** SHA-256 of the upstream file at `revision`. Required when `replaces` is not `none`. */
  readonly sha256?: string;
}

function bad(detail: string): never {
  throw new Error(`pstack/overlay/${OVERLAY_MANIFEST}: ${detail}`);
}

/** Read and validate the overlay manifest. */
export function readOverlayManifest(overlayRoot: string): readonly OverlayEntry[] {
  const path = join(overlayRoot, OVERLAY_MANIFEST);
  if (!existsSync(path)) bad("missing");

  let parsed: unknown;
  try {
    parsed = yaml.load(readFileSync(path, "utf8"));
  } catch (error) {
    bad(error instanceof Error ? error.message : String(error));
  }
  const list = (parsed as { overlay?: unknown } | null)?.overlay;
  if (!Array.isArray(list)) bad('must carry an "overlay" list');

  const entries: OverlayEntry[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const entry = raw as Partial<OverlayEntry>;
    if (typeof entry.path !== "string" || entry.path === "") bad('every entry needs a "path"');
    if (seen.has(entry.path)) bad(`"${entry.path}" is listed twice`);
    seen.add(entry.path);
    if (!existsSync(join(overlayRoot, ...entry.path.split("/")))) {
      bad(`"${entry.path}" is listed but missing`);
    }
    if (entry.replaces === "none") {
      if (entry.sha256 !== undefined || entry.revision !== undefined) {
        bad(`"${entry.path}" replaces nothing, so it must not name a hash or revision`);
      }
      entries.push({ path: entry.path, replaces: "none" });
      continue;
    }
    if (typeof entry.replaces !== "string" || entry.replaces === "") {
      bad(`"${entry.path}" needs "replaces"`);
    }
    if (typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      bad(`"${entry.path}" needs a 64-hex "sha256"`);
    }
    if (typeof entry.revision !== "string" || !/^[0-9a-f]{40}$/.test(entry.revision)) {
      bad(`"${entry.path}" needs a 40-hex "revision"`);
    }
    entries.push({
      path: entry.path,
      replaces: entry.replaces,
      revision: entry.revision,
      sha256: entry.sha256,
    });
  }
  return entries;
}

/** Absolute path of the adapter source inside the overlay. */
export function adapterSourcePath(overlayRoot: string): string {
  return join(overlayRoot, ...ADAPTER_ASSET.split("/"));
}

/**
 * Why one overlay entry may not be used, or `undefined` when it is usable.
 *
 * Two ways to fail, each naming the file and what to do about it: the entry claims to
 * replace an upstream file the pinned tree does not have, or the upstream file's bytes no
 * longer hash to the recorded value.
 */
export function overlayEntryProblem(upstreamRoot: string, entry: OverlayEntry): string | undefined {
  if (entry.replaces === "none") return undefined;

  const upstream = join(upstreamRoot, ...entry.replaces.split("/"));
  if (!existsSync(upstream)) {
    return `pstack/overlay/${entry.path}: replaces ${entry.replaces}, which the pinned upstream tree does not have`;
  }
  const actual = createHash("sha256").update(readFileSync(upstream)).digest("hex");
  if (actual === entry.sha256) return undefined;
  return [
    `pstack/overlay/${entry.path}: stale overlay.`,
    `It replaces ${entry.replaces} at upstream revision ${entry.revision}, whose bytes hashed ${entry.sha256}.`,
    `The pinned upstream file now hashes ${actual}, so upstream changed the page this overlay rewrites.`,
    `Read the upstream diff, apply it to the overlay by hand, then set sha256: ${actual} in pstack/overlay/${OVERLAY_MANIFEST}.`,
  ].join("\n");
}

/** Every overlay problem, for the check and for a build failure. */
export function overlayProblems(overlayRoot: string, upstreamRoot: string): readonly string[] {
  let entries: readonly OverlayEntry[];
  try {
    entries = readOverlayManifest(overlayRoot);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const problems: string[] = [];
  for (const entry of entries) {
    const problem = overlayEntryProblem(upstreamRoot, entry);
    if (problem !== undefined) problems.push(problem);
  }
  return problems;
}
