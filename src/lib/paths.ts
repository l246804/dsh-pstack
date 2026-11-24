/**
 * Package-internal resource locations.
 *
 * The bundler writes public entries to `dist/`. The generated pstack tree is
 * copied to `dist/pstack/`, and vendored and authored skills to `dist/skills/`.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute locations of every resource shipped inside one `dsh-pstack` package. */
export interface PstackPackagePaths {
  readonly packageRoot: string;
  readonly pstackRoot: string;
  readonly docsRoot: string;
  readonly dshAdapter: string;
  readonly skillsRoot: string;
  readonly vendoredSkillsRoot: string;
  readonly authoredSkillsRoot: string;
}

/**
 * Derive every package path from a bundled entry URL, such as `dist/index.mjs`.
 *
 * The package root is the entry's parent directory. Every other path hangs off
 * it under the shipped `dist/` tree.
 */
export function resolvePackagePaths(entryUrl: string): PstackPackagePaths {
  const packageRoot = resolve(dirname(fileURLToPath(entryUrl)), "..");
  const distRoot = join(packageRoot, "dist");
  const pstackRoot = join(distRoot, "pstack");
  const docsRoot = join(pstackRoot, "docs");
  return {
    packageRoot,
    pstackRoot,
    docsRoot,
    dshAdapter: join(docsRoot, "harness", "dsh.md"),
    skillsRoot: join(pstackRoot, "skills"),
    vendoredSkillsRoot: join(distRoot, "skills", "vendored"),
    authoredSkillsRoot: join(distRoot, "skills", "authored"),
  };
}

/** The installed package's resource paths, resolved from this module's entry URL. */
export const PSTACK_PACKAGE_PATHS: PstackPackagePaths = resolvePackagePaths(import.meta.url);

/**
 * The `poteto-mode` instruction path used by the `poteto-agent` delegate brief.
 */
export const POTETO_MODE_SKILL_PATH = join(
  PSTACK_PACKAGE_PATHS.skillsRoot,
  "poteto-mode",
  "SKILL.md",
);
