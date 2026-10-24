/**
 * Validate every declared patch before the tree is generated.
 *
 * Anchors are resolved against the upstream text, matches must equal the
 * declared count, intervals must not overlap, targets must be normalized and
 * inside a patchable scope, and every promised output fragment must survive
 * into a generated asset.
 */
import { readFileSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PATCH_SCOPES, UPSTREAM_ROOT } from "./asset-paths.ts";
import { assertPatchOutput, buildAssets, decodeUtf8 } from "./build-assets.ts";
import { applyFilePatches } from "./patches/apply.ts";
import { EXCLUDED_SKILLS, FILE_PATCHES } from "./patches/index.ts";
import type { FilePatch, SkillExclusion } from "./patches/types.ts";

export interface PatchCheckReport {
  readonly patches: number;
  readonly files: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly problems: readonly string[];
}

export function checkPatches(
  patches: readonly FilePatch[] = FILE_PATCHES,
  exclusions: readonly SkillExclusion[] = EXCLUDED_SKILLS,
): PatchCheckReport {
  const problems: string[] = [];
  const excluded = new Set(exclusions.map((exclusion) => exclusion.skill));
  const byFile = new Map<string, FilePatch[]>();

  for (const patch of patches) {
    if (patch.file !== posix.normalize(patch.file) || patch.file.includes("\\")) {
      problems.push(`${patch.file}: patch target must be a normalized POSIX path`);
      continue;
    }
    const scope = PATCH_SCOPES.find((prefix) => patch.file.startsWith(prefix));
    if (scope === undefined) {
      problems.push(`${patch.file}: patch target is outside ${PATCH_SCOPES.join(", ")}`);
      continue;
    }
    const skill = patch.file.startsWith("skills/") ? patch.file.split("/")[1] : undefined;
    if (skill !== undefined && excluded.has(skill)) {
      problems.push(`${patch.file}: patch targets an excluded skill`);
      continue;
    }
    if (!isRegularFile(join(UPSTREAM_ROOT, patch.file))) {
      problems.push(`${patch.file}: upstream target is not a regular file`);
      continue;
    }
    byFile.set(patch.file, [...(byFile.get(patch.file) ?? []), patch]);
  }

  for (const [file, patches] of byFile) {
    const bytes = readFileSync(join(UPSTREAM_ROOT, file));
    let text: string;
    try {
      text = decodeUtf8(bytes, file);
    } catch (error) {
      problems.push(messageOf(error));
      continue;
    }
    try {
      applyFilePatches(file, text, patches);
    } catch (error) {
      problems.push(messageOf(error));
    }
  }

  if (problems.length === 0) {
    try {
      const built = new Map(
        buildAssets(patches, exclusions).map((asset) => [asset.path, asset.bytes.toString("utf8")]),
      );
      for (const patch of patches) {
        const output = built.get(patch.file);
        if (output === undefined) {
          problems.push(`${patch.file}: no generated asset for this patch`);
          continue;
        }
        assertPatchOutput(patch.file, [patch], output);
      }
    } catch (error) {
      problems.push(messageOf(error));
    }
  }

  const byKind: Record<string, number> = {};
  for (const patch of patches) byKind[patch.kind] = (byKind[patch.kind] ?? 0) + 1;

  return { patches: patches.length, files: byFile.size, byKind, problems };
}

export function main(): number {
  const report = checkPatches();
  const kinds = Object.entries(report.byKind)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(", ");

  if (report.problems.length === 0) {
    console.log(`patches: ${report.patches} across ${report.files} files (${kinds})`);
    console.log(
      "anchors, match counts, scope, overlap, generated assets, and output fragments verified",
    );
    for (const patch of FILE_PATCHES) {
      console.log(`  ${patch.file} (${patch.kind}): ${patch.reason}`);
    }
    return 0;
  }

  console.error(`patch checks failed (${report.problems.length} problem(s)):`);
  for (const problem of report.problems) console.error(`  ${problem}`);
  return 1;
}

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
