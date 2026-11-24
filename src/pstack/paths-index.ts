/**
 * The runtime package path index.
 *
 * `$DSH_HOME/pstack/paths.json` records the absolute package roots and every
 * bundled skill directory, so the DSH adapter can resolve sibling skills,
 * playbooks, references and docs without model-side relative path arithmetic.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomically } from "../lib/atomic-write.ts";
import { PSTACK_PACKAGE_PATHS, type PstackPackagePaths } from "../lib/paths.ts";

/** The serialized shape of `$DSH_HOME/pstack/paths.json`. */
export interface PstackPathsDocument {
  readonly version: 1;
  readonly packageRoot: string;
  readonly pstackRoot: string;
  readonly docsRoot: string;
  readonly dshAdapter: string;
  readonly skills: Readonly<Record<string, string>>;
}

/** A skill directory is a child directory that contains a `SKILL.md` file. */
function isSkillDirectory(directory: string): boolean {
  return existsSync(join(directory, "SKILL.md"));
}

/**
 * Map each bundled skill name to its absolute directory.
 *
 * Scans one level under the pstack, vendored and authored roots in that order.
 * A missing root is ignored, and a name that appears twice keeps its first
 * occurrence.
 */
export function scanSkillDirectories(paths: PstackPackagePaths): Record<string, string> {
  const skills: Record<string, string> = {};
  for (const root of [paths.skillsRoot, paths.vendoredSkillsRoot, paths.authoredSkillsRoot]) {
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = join(root, entry.name);
      if (!isSkillDirectory(directory)) continue;
      if (Object.hasOwn(skills, entry.name)) continue;
      skills[entry.name] = directory;
    }
  }
  return skills;
}

/** Build the path-index document for one package. */
export function buildPstackPathsDocument(paths: PstackPackagePaths): PstackPathsDocument {
  const scanned = scanSkillDirectories(paths);
  const skills: Record<string, string> = {};
  for (const name of Object.keys(scanned).sort()) skills[name] = scanned[name]!;
  return {
    version: 1,
    packageRoot: paths.packageRoot,
    pstackRoot: paths.pstackRoot,
    docsRoot: paths.docsRoot,
    dshAdapter: paths.dshAdapter,
    skills,
  };
}

/**
 * Write the path index to `target`, leaving an identical file untouched.
 *
 * The output is deterministic, so repeated startups converge on one file and a
 * changed skill set rewrites it.
 */
export function writePstackPathsIndex(
  target: string,
  paths: PstackPackagePaths = PSTACK_PACKAGE_PATHS,
): void {
  const text = `${JSON.stringify(buildPstackPathsDocument(paths), null, 2)}\n`;
  let existing: string | undefined;
  try {
    existing = readFileSync(target, "utf8");
  } catch {}
  if (existing === text) return;
  writeFileAtomically(target, text);
}
