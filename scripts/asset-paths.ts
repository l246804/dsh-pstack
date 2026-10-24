/**
 * Single source for every path the generator and checkers touch.
 *
 * Asset paths are POSIX and relative to `assets/`. Repository paths add that
 * prefix when a report line needs to point at a file a reviewer can open.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const UPSTREAM_ROOT = join(ROOT, "upstream", "cursor-plugins", "pstack");
export const UPSTREAM_SKILLS = join(UPSTREAM_ROOT, "skills");

export const ASSETS_ROOT = join(ROOT, "assets");
export const ASSETS_SKILLS = join(ASSETS_ROOT, "skills");
export const ASSETS_AGENTS = join(ASSETS_ROOT, "agents");
export const ASSETS_DOCS = join(ASSETS_ROOT, "docs");
export const ASSETS_GUIDE = join(ASSETS_DOCS, "guide");

/** Staging and backup siblings of `assets/`, swapped in only after a full verification. */
export const STAGING_ROOT = join(ROOT, ".assets-staging");
export const BACKUP_ROOT = join(ROOT, ".assets-backup");

export const GENERATED_HARNESS_DOC = "docs/harness/dsh.md";
export const SKILLS_PREFIX = "skills/";
export const AGENTS_PREFIX = "agents/";
export const GUIDE_PREFIX = "docs/guide/";

/**
 * Prefixes a patch may target. Anything else is an authoring error.
 *
 * The upstream tree and the asset tree share their layout below these prefixes,
 * so an upstream-relative path such as `skills/how/SKILL.md` is also the
 * asset-relative path of the generated file.
 */
export const PATCH_SCOPES = [SKILLS_PREFIX, AGENTS_PREFIX, GUIDE_PREFIX] as const;
