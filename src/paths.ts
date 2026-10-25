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

/** Absolute path of the directory holding the 55 bundled skill directories. */
export const SKILLS_ROOT = join(ASSETS_ROOT, "skills");

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
