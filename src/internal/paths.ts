/**
 * Package-internal resource locations.
 *
 * Every shipped resource is read from `dist/` and nowhere else. The bundler writes the
 * public entries at `dist/*.mjs` and shared helper chunks under `dist/internal/`, the
 * pstack build writes `dist/pstack/`, and the packaging step writes `dist/skills/`.
 *
 * `PACKAGE_ROOT` therefore sits either one level above this module (an entry bundle in
 * `dist/`) or two (a helper chunk in `dist/internal/`). Both layouts are known, so the
 * directory name decides instead of probing for `dist` first and falling back.
 */

import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path of the package root. */
export const PACKAGE_ROOT =
  basename(HERE) === "internal" ? resolve(HERE, "..", "..") : resolve(HERE, "..");

/** Absolute path of the one shipped output tree. */
export const DIST_ROOT = join(PACKAGE_ROOT, "dist");

/** Absolute path of the generated pstack tree. */
export const PORT_ROOT = join(DIST_ROOT, "pstack");

/** Absolute path of the ported pstack skill directories. */
export const SKILLS_ROOT = join(PORT_ROOT, "skills");

/** Absolute path of the vendored skill directories (`skills/vendored` at pack time). */
export const VENDORED_SKILLS_ROOT = join(DIST_ROOT, "skills", "vendored");

/** Absolute path of the skills authored in this repository. */
export const AUTHORED_SKILLS_ROOT = join(DIST_ROOT, "skills", "authored");

/** Absolute path of the generated agent preambles. */
export const AGENTS_ROOT = join(PORT_ROOT, "agents");

/** Absolute path of the `poteto-mode` instructions injected into a poteto-agent brief. */
export const POTETO_MODE_SKILL_PATH = join(SKILLS_ROOT, "poteto-mode", "SKILL.md");

/** Absolute path of the shipped harness mapping document. */
export const HARNESS_DOC_PATH = join(PORT_ROOT, "docs", "harness", "dsh.md");

/** One skill root the provider loads, labelled for collision errors. */
export interface SkillRoot {
  readonly path: string;
  readonly label: string;
}

/** Every skill root, in load order. Recursive discovery handles each root's nesting. */
export const SKILL_ROOTS: readonly SkillRoot[] = [
  { path: SKILLS_ROOT, label: "pstack" },
  { path: VENDORED_SKILLS_ROOT, label: "vendored" },
  { path: AUTHORED_SKILLS_ROOT, label: "authored" },
];

/** Absolute path of one agent preamble; `general` is a plain child and gets none. */
export function agentPreamblePath(agent: string): string | undefined {
  return agent === "general" ? undefined : join(AGENTS_ROOT, `${agent}.md`);
}
