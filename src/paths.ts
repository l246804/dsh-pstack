/**
 * Package-internal resource locations.
 *
 * Every path here is resolved from this module's own location, because the plugin
 * reads its content in place instead of copying it into a user-visible directory.
 * The modules run from `src/` in a checkout and from the bundled `dist/index.mjs`
 * in an installed package; both sit one directory below the package root, so the
 * same expression holds in both cases.
 *
 * Two trees ship, and the split is by provenance rather than by file type.
 *
 * - `pstack/` is the upstream port. `build:assets` rebuilds it wholesale from the
 *   pinned submodule, so nothing hand-written may live there: a file the generator
 *   does not produce is deleted by the next build.
 * - `skills/` holds every skill this package does not take from upstream pstack.
 *   It is never regenerated, so it survives a rebuild. `vendored/` is a
 *   byte-identical copy of one commit per source; `authored/` is written here.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the package root: the repository in a checkout, the install directory after packing. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path of the generated, committed upstream port. Replaced wholesale on every build. */
export const PSTACK_ROOT = join(PACKAGE_ROOT, "pstack");

/** Absolute path of the directory holding the generated pstack skill directories. */
export const SKILLS_ROOT = join(PSTACK_ROOT, "skills");

/** Absolute path of the directory holding the vendored third-party skill sources. */
export const VENDORED_SKILLS_ROOT = join(PACKAGE_ROOT, "skills", "vendored");

/** Absolute path of the directory holding the skills written in this repository. */
export const AUTHORED_SKILLS_ROOT = join(PACKAGE_ROOT, "skills", "authored");

/** Absolute path of the directory holding the generated agent preambles. */
export const AGENTS_ROOT = join(PSTACK_ROOT, "agents");

/**
 * Absolute path of the `poteto-mode` instructions.
 *
 * `pstack_subagent` injects this path into a `poteto-agent` child's prompt, so the
 * child reads the playbook from where it actually is instead of searching a Cursor
 * plugin install for the highest version.
 */
export const POTETO_MODE_SKILL_PATH = join(SKILLS_ROOT, "poteto-mode", "SKILL.md");

/** Absolute path of the shipped copy of the harness mapping document. */
export const HARNESS_DOC_PATH = join(PSTACK_ROOT, "docs", "harness", "dsh.md");

/**
 * One skill root the provider loads.
 *
 * `flat` roots hold skill directories directly. `sourced` roots hold one directory
 * per upstream source, each of which holds the skills. The label names the root in a
 * collision error, so a duplicate says which two trees disagree.
 */
export interface SkillRoot {
  readonly path: string;
  readonly kind: "flat" | "sourced";
  readonly label: string;
}

/**
 * Every skill root, in load order.
 *
 * The provider merges these into one catalog and rejects a name that appears in
 * more than one, so this list is the whole answer to "where do skills come from".
 */
export const SKILL_ROOTS: readonly SkillRoot[] = [
  { path: SKILLS_ROOT, kind: "flat", label: "pstack" },
  { path: VENDORED_SKILLS_ROOT, kind: "sourced", label: "vendored" },
  { path: AUTHORED_SKILLS_ROOT, kind: "flat", label: "authored" },
];

/**
 * Absolute path of one agent preamble.
 *
 * Returns `undefined` for `general`, which is a plain child and gets no preamble.
 */
export function agentPreamblePath(agent: string): string | undefined {
  return agent === "general" ? undefined : join(AGENTS_ROOT, `${agent}.md`);
}
