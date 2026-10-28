/**
 * Package-internal resource locations.
 *
 * Every shipped resource is read from `dist/`, and from nowhere else. The generator
 * writes `dist/pstack` and `dist/skills`, the bundler writes `dist/*.mjs`, and this
 * module names both below one root.
 *
 * That single root holds in exactly two layouts, because the module that computes it
 * sits one level below the package root in both:
 *
 * - a checkout: this file is `src/paths.ts`, so the parent is the repository root;
 * - an install: the bundle is `dist/index.mjs`, so the parent is the package root.
 *
 * The alternative, probing `dist` first and falling back to the repository root, would
 * give one resource two possible locations. A checkout and an install would then
 * disagree about which files are real, and a path that works in one would fail in the
 * other instead of failing in both. The checkout case is why every task that reads
 * these paths depends on the build: a resource absent from `dist` is a bug, not a
 * reason to look elsewhere.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the package root: the repository in a checkout, the install directory after packing. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path of the one shipped output tree. */
export const DIST_ROOT = join(PACKAGE_ROOT, "dist");

/** Absolute path of the generated port, `pstack/pstack` in a checkout. */
export const PORT_ROOT = join(DIST_ROOT, "pstack");

/** Absolute path of the directory holding the ported pstack skill directories. */
export const SKILLS_ROOT = join(PORT_ROOT, "skills");

/** Absolute path of the directory holding the vendored skill directories. */
export const VENDORED_SKILLS_ROOT = join(DIST_ROOT, "skills", "vendored");

/** Absolute path of the directory holding the skills written in this repository. */
export const AUTHORED_SKILLS_ROOT = join(DIST_ROOT, "skills", "authored");

/** Absolute path of the directory holding the generated agent preambles. */
export const AGENTS_ROOT = join(PORT_ROOT, "agents");

/**
 * Absolute path of the `poteto-mode` instructions.
 *
 * `pstack_subagent` injects this path into a `poteto-agent` child's prompt, so the
 * child reads the playbook from where it actually is instead of searching an install
 * for the highest version.
 */
export const POTETO_MODE_SKILL_PATH = join(SKILLS_ROOT, "poteto-mode", "SKILL.md");

/** Absolute path of the shipped copy of the harness mapping document. */
export const HARNESS_DOC_PATH = join(PORT_ROOT, "docs", "harness", "dsh.md");

/**
 * One skill root the provider loads.
 *
 * Every root holds skill directories directly. The label names the root in a
 * collision error, so a duplicate says which two trees disagree.
 */
export interface SkillRoot {
  readonly path: string;
  readonly label: string;
}

/**
 * Every skill root, in load order.
 *
 * The provider merges these into one catalog and rejects a name that appears in more
 * than one, so this list is the whole answer to "where do skills come from".
 */
export const SKILL_ROOTS: readonly SkillRoot[] = [
  { path: SKILLS_ROOT, label: "pstack" },
  { path: VENDORED_SKILLS_ROOT, label: "vendored" },
  { path: AUTHORED_SKILLS_ROOT, label: "authored" },
];

/**
 * Absolute path of one agent preamble.
 *
 * Returns `undefined` for `general`, which is a plain child and gets no preamble.
 */
export function agentPreamblePath(agent: string): string | undefined {
  return agent === "general" ? undefined : join(AGENTS_ROOT, `${agent}.md`);
}
