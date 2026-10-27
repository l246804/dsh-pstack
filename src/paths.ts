/**
 * Package-internal resource locations.
 *
 * The provider reads generated assets in place instead of copying them into a
 * user-visible skills directory, so every path here is resolved from this
 * module's own location. The modules run from `src/` in a checkout and from the
 * bundled `dist/index.mjs` in an installed package; both sit one directory below
 * the package root, so the same expression holds in both cases.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the package root: the repository in a checkout, the install directory after packing. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path of the generated, committed assets directory. */
export const ASSETS_ROOT = join(PACKAGE_ROOT, "assets");

/** Absolute path of the directory holding the 55 bundled pstack skill directories. */
export const SKILLS_ROOT = join(ASSETS_ROOT, "skills");

/**
 * Absolute path of the third-party skill tree.
 *
 * One directory per upstream source, then one per skill. A sibling of `assets/`
 * rather than a subtree, because the two trees have different owners: `assets/` is
 * rewritten wholesale from the pinned pstack submodule on every `build:assets`,
 * while this tree changes only when a maintainer re-pins a source. Files that must
 * survive a regeneration cannot live in the directory that regeneration replaces.
 * Each source's revision is recorded in `scripts/skills-ext/sources.yml`.
 *
 * The manifest sits outside the skill root on purpose: the provider treats every
 * entry under a skill root as a skill directory, so a stray file there fails
 * activation.
 */
export const SKILLS_EXT_ROOT = join(PACKAGE_ROOT, "skills-ext");

/** Absolute path of the directory holding the generated agent preambles. */
export const AGENTS_ROOT = join(ASSETS_ROOT, "agents");

/**
 * Absolute path of the `poteto-mode` instructions.
 *
 * `pstack_subagent` injects this path into a `poteto-agent` child's prompt, so the
 * child reads the playbook from where it actually is instead of searching a Cursor
 * plugin install for the highest version.
 */
export const POTETO_MODE_SKILL_PATH = join(SKILLS_ROOT, "poteto-mode", "SKILL.md");

/** Absolute path of the generated harness mapping document. */
export const HARNESS_DOC_PATH = join(ASSETS_ROOT, "docs", "harness", "dsh.md");

/**
 * Absolute path of one agent preamble.
 *
 * Returns `undefined` for `general`, which is a plain child and gets no preamble.
 */
export function agentPreamblePath(agent: string): string | undefined {
  return agent === "general" ? undefined : join(AGENTS_ROOT, `${agent}.md`);
}
