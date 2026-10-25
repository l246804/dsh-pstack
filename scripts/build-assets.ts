import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Buffer } from "node:buffer";

import { HARNESS_DOC_PATH, renderHarnessDoc } from "./capabilities.ts";
import { PSTACK_MODELS_EXAMPLE_PATH, renderPstackModelsExample } from "./role-manifest.ts";
import { assertPatchOutput, applyFilePatches, validatePatchTargets } from "./apply-patches.ts";
import { EXCLUDED_SKILLS, FILE_PATCHES, INTRO_SKILLS, patchesForFile } from "./patches.ts";
import type { FilePatch, SkillExclusion } from "./patches.ts";
import { RUNTIME_ROOT } from "./build-runtime.ts";
import { RUNTIME_ENTRIES, isReplacedUpstreamScript } from "./runtime-manifest.ts";
import { ROOT } from "./root.ts";
import {
  parseFrontmatter,
  serializeAgentFrontmatter,
  serializeSkillFrontmatter,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} from "../src/frontmatter.ts";

/**
 * Re-exported so every existing `from "./build-assets.ts"` import keeps working.
 *
 * The constant itself lives in `./root.ts`, which imports nothing, because
 * `build-runtime.ts` needs the repository root and this module needs the built
 * runtime. Keeping the constant in a leaf breaks that cycle.
 */
export { ROOT };
export const UPSTREAM_ROOT = join(ROOT, "upstream", "cursor-plugins", "pstack");
export const UPSTREAM_SKILLS = join(UPSTREAM_ROOT, "skills");
export const ASSETS_ROOT = join(ROOT, "assets");
export const STAGING_ROOT = join(ROOT, ".assets-staging");
export const BACKUP_ROOT = join(ROOT, ".assets-backup");
export const SKILLS_PREFIX = "skills/";
export const AGENTS_PREFIX = "agents/";
export const GUIDE_PREFIX = "docs/guide/";

export interface Asset {
  /** POSIX path relative to `assets/`. */
  readonly path: string;
  readonly bytes: Buffer;
  readonly executable: boolean;
  readonly origin: "copy" | "generated";
}

export const DSH_INTRO =
  "> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.";

export interface AssetSummary {
  readonly files: number;
  readonly skills: number;
  readonly agents: number;
  readonly guideMarkdown: number;
  readonly guideImages: number;
  readonly executables: number;
  readonly generated: number;
}

export type SkillCategory = "copy" | "intro-only" | "patched";

export interface SkillClassification {
  readonly skill: string;
  readonly category: SkillCategory;
}

const HOST_TERMS: readonly RegExp[] = [
  /\bCursor\b/,
  /\bClaude Code\b/,
  /`Task`|\bTask (tool|subagent|call)/,
  /AskQuestion/,
  /\btodo ?list\b/i,
  /generalPurpose/,
  /poteto-agent/,
  /comment-sicko/,
  /readonly: (true|false)/,
  /environment: "(cloud|local)"/,
  /cloud_base_branch/,
  /run_in_background/,
  /`resume`/,
  /file_attachments/,
  /\bclaude-[a-z]+-\d/,
  /\bgrok-\d/,
  /\bgpt-\d/,
  /inherit-parent/,
  /pstack-models\.mdc/,
  /\.cursor\/skills/,
  /\.cursor\/plugins|\.cursor-plugin/,
  /\.cursor\/rules|always-applied rule/,
  /agent-transcripts|\.cursor\/projects/,
  /Bugbot|Cursor [Aa]utomation|[Cc]loud [Aa]gent|built-in PR tool/,
  /`\/loop`/,
];

export function buildAssets(
  patches: readonly FilePatch[] = FILE_PATCHES,
  exclusions: readonly SkillExclusion[] = EXCLUDED_SKILLS,
  introSkills: Readonly<Record<string, string>> = INTRO_SKILLS,
): readonly Asset[] {
  validatePatchTargets(patches, exclusions, UPSTREAM_ROOT);
  validateIntroScope(exclusions, introSkills);

  const excluded = new Set(exclusions.map((exclusion) => exclusion.skill));
  const assets: Asset[] = [];

  for (const skill of skillDirectories()) {
    if (excluded.has(skill)) continue;
    const files = walkUpstream(`${SKILLS_PREFIX}${skill}`);
    if (!files.includes(`${SKILLS_PREFIX}${skill}/SKILL.md`)) {
      throw new Error(`skills/${skill}: missing SKILL.md`);
    }
    for (const file of files) {
      // A script directory ships as built Node artifacts, never as its upstream
      // shell or Bun sources. The replacement set is asserted non-empty below, so a
      // prefix here can never silently drop a whole directory.
      if (isReplacedUpstreamScript(file)) continue;
      assets.push(buildAsset(file, patches, introSkills));
    }
  }
  for (const file of walkUpstream("agents")) assets.push(buildAsset(file, patches, introSkills));
  for (const file of walkUpstream("docs/guide"))
    assets.push(buildAsset(file, patches, introSkills));

  assets.push(...builtRuntimeAssets());

  assets.push({
    path: HARNESS_DOC_PATH,
    bytes: Buffer.from(renderHarnessDoc(), "utf8"),
    executable: false,
    origin: "generated",
  });
  assets.push({
    path: PSTACK_MODELS_EXAMPLE_PATH,
    bytes: Buffer.from(renderPstackModelsExample(), "utf8"),
    executable: false,
    origin: "generated",
  });

  const sorted = assets.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  assertPatchesLanded(sorted, patches);
  assertRuntimeAssets(sorted);
  return sorted;
}

/**
 * Read the built runtime as assets.
 *
 * `runtime/` is gitignored build output; `assets/` is the committed tree. This is
 * the one place the two meet, so a build that forgot to run the bundler fails here
 * with a path-qualified message instead of shipping a stale tree.
 */
function builtRuntimeAssets(): readonly Asset[] {
  const assets: Asset[] = [];
  for (const entry of RUNTIME_ENTRIES) {
    const path = join(RUNTIME_ROOT, ...entry.out.split("/"));
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      throw new Error(
        `assets/${entry.assetPath}: missing built runtime; run \`node scripts/build-runtime.ts\` first`,
      );
    }
    assets.push({
      path: entry.assetPath,
      bytes,
      executable: entry.executable,
      origin: "generated",
    });
  }
  return assets;
}

/**
 * Fail when the built scripts are not exactly the manifest.
 *
 * Every replaced script directory must contribute the artifacts the manifest names,
 * and no upstream script source may survive into the tree. Without this, a wrong
 * prefix would quietly ship both forms and the executable count would still pass.
 */
function assertRuntimeAssets(assets: readonly Asset[]): void {
  const present = new Map(assets.map((asset) => [asset.path, asset]));
  for (const entry of RUNTIME_ENTRIES) {
    if (!present.has(entry.assetPath)) {
      throw new Error(`assets/${entry.assetPath}: the runtime manifest names it, the tree lacks it`);
    }
  }
  for (const asset of assets) {
    if (!isReplacedUpstreamScript(asset.path)) continue;
    if (/\.(?:sh|ts)$/.test(asset.path)) {
      throw new Error(
        `assets/${asset.path}: upstream script source survived; only built .mjs artifacts ship there`,
      );
    }
  }
}

export function summarizeAssets(assets: readonly Asset[]): AssetSummary {
  const skillNames = new Set<string>();
  let agents = 0;
  let guideMarkdown = 0;
  let guideImages = 0;

  for (const asset of assets) {
    if (asset.path.startsWith(SKILLS_PREFIX)) {
      skillNames.add(asset.path.slice(SKILLS_PREFIX.length).split("/")[0] as string);
    } else if (asset.path.startsWith(AGENTS_PREFIX)) {
      agents += 1;
    } else if (asset.path.startsWith(GUIDE_PREFIX)) {
      if (asset.path.endsWith(".md")) guideMarkdown += 1;
      else guideImages += 1;
    }
  }

  return {
    files: assets.length,
    skills: skillNames.size,
    agents,
    guideMarkdown,
    guideImages,
    executables: assets.filter((asset) => asset.executable).length,
    generated: assets.filter((asset) => asset.origin === "generated").length,
  };
}

export function classifySkills(): readonly SkillClassification[] {
  const excluded = new Set(EXCLUDED_SKILLS.map((exclusion) => exclusion.skill));
  return skillDirectories()
    .filter((skill) => !excluded.has(skill))
    .map((skill) => {
      const intro = Object.hasOwn(INTRO_SKILLS, skill);
      const patched = patchesForFile(`${SKILLS_PREFIX}${skill}/SKILL.md`).length > 0;
      return {
        skill,
        category: patched ? "patched" : intro ? "intro-only" : "copy",
      };
    });
}

export function skillDirectories(): readonly string[] {
  return readdirSync(UPSTREAM_SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareStrings);
}

/** Upstream-relative POSIX paths of every file below a directory, sorted. */
export function walkUpstream(relativeDirectory: string): readonly string[] {
  return readdirSync(join(UPSTREAM_ROOT, relativeDirectory), { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store")
    .sort((left, right) => compareStrings(left.name, right.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? walkUpstream(`${relativeDirectory}/${entry.name}`)
        : [`${relativeDirectory}/${entry.name}`],
    );
}

export function hasHostTerms(text: string): boolean {
  return HOST_TERMS.some((pattern) => pattern.test(text));
}

export function introCandidates(
  exclusions: readonly SkillExclusion[] = EXCLUDED_SKILLS,
): ReadonlySet<string> {
  const excluded = new Set(exclusions.map((exclusion) => exclusion.skill));
  const candidates = new Set<string>();
  for (const skill of skillDirectories()) {
    if (excluded.has(skill)) continue;
    const files = walkUpstream(`${SKILLS_PREFIX}${skill}`).filter((file) => file.endsWith(".md"));
    if (files.some((file) => hasHostTerms(readFileSync(join(UPSTREAM_ROOT, file), "utf8")))) {
      candidates.add(skill);
    }
  }
  return candidates;
}

/**
 * Candidates that still rely on the shared pointer.
 *
 * A skill whose own `SKILL.md` this tree rewrote carries the DSH vocabulary in
 * its own words, so the generic intro would only restate the mapping in front of
 * text that no longer needs it. `poteto-mode` is the first skill in that state:
 * its body still matches the host-term scan for `poteto-agent` and
 * `inherit-parent`, which are this host's own values, not Cursor's.
 */
export function introRequirement(
  exclusions: readonly SkillExclusion[] = EXCLUDED_SKILLS,
): ReadonlySet<string> {
  return new Set(
    [...introCandidates(exclusions)].filter(
      (skill) => patchesForFile(`${SKILLS_PREFIX}${skill}/SKILL.md`).length === 0,
    ),
  );
}

export function insertIntro(body: string, file: string): string {
  if (body.includes("DSH port of pstack.")) {
    throw new Error(`${file}: body already contains the DSH intro`);
  }
  const heading = /^# .+$/m.exec(body);
  if (heading === null) {
    throw new Error(`${file}: intro skill has no H1 heading`);
  }
  if (body.slice(0, heading.index).trim() !== "") {
    throw new Error(`${file}: H1 heading must be the first content line`);
  }

  const headingEnd = heading.index + heading[0].length;
  const rest = body.startsWith("\n", headingEnd)
    ? body.slice(headingEnd + 1)
    : body.slice(headingEnd);
  const tail = rest === "" || rest.startsWith("\n") ? rest : `\n${rest}`;
  return `${body.slice(0, heading.index)}${heading[0]}\n\n${DSH_INTRO}\n${tail}`;
}

export function renderSkill(text: string, file: string, intro: boolean): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = eol === "\r\n" ? text.replaceAll("\r\n", "\n") : text;
  const { data, body } = parseFrontmatter(normalized);
  const frontmatter = validateSkillFrontmatter(data, file);
  const renderedBody = intro ? insertIntro(body, file) : body;
  const rendered = `${serializeSkillFrontmatter(frontmatter)}${renderedBody}`;
  return eol === "\r\n" ? rendered.replaceAll("\n", "\r\n") : rendered;
}

export function renderAgent(text: string, file: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = eol === "\r\n" ? text.replaceAll("\r\n", "\n") : text;
  const { data, body } = parseFrontmatter(normalized);
  const frontmatter = validateAgentFrontmatter(data, file);
  const rendered = `${serializeAgentFrontmatter(frontmatter)}${body}`;
  return eol === "\r\n" ? rendered.replaceAll("\n", "\r\n") : rendered;
}

export function decodeUtf8(bytes: Buffer, file: string): string {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    throw new Error(`${file}: not valid UTF-8, so text rules do not apply`);
  }
  return text;
}

function buildAsset(
  upstreamRelativePath: string,
  allPatches: readonly FilePatch[],
  introSkills: Readonly<Record<string, string>>,
): Asset {
  const absolutePath = join(UPSTREAM_ROOT, upstreamRelativePath);
  const source = readFileSync(absolutePath);
  const executable = (statSync(absolutePath).mode & 0o111) !== 0;
  const patches = allPatches.filter((patch) => patch.file === upstreamRelativePath);
  const format = assetFormat(upstreamRelativePath);

  if (patches.length === 0 && format === "plain") {
    return { path: upstreamRelativePath, bytes: source, executable, origin: "copy" };
  }

  const text = decodeUtf8(source, upstreamRelativePath);
  const patched =
    patches.length === 0 ? text : applyFilePatches(upstreamRelativePath, text, patches);
  const output =
    format === "skill"
      ? renderSkill(
          patched,
          upstreamRelativePath,
          Object.hasOwn(introSkills, skillName(upstreamRelativePath)),
        )
      : format === "agent"
        ? renderAgent(patched, upstreamRelativePath)
        : patched;

  assertPatchOutput(upstreamRelativePath, patches, output);

  const bytes = Buffer.from(output, "utf8");
  return {
    path: upstreamRelativePath,
    bytes,
    executable,
    origin: bytes.equals(source) ? "copy" : "generated",
  };
}

function validateIntroScope(
  exclusions: readonly SkillExclusion[],
  introSkills: Readonly<Record<string, string>>,
): void {
  const excluded = new Set(exclusions.map((exclusion) => exclusion.skill));
  const skills = new Set(skillDirectories());

  for (const skill of Object.keys(introSkills)) {
    if (!skills.has(skill)) throw new Error(`intro skill "${skill}" does not exist upstream`);
    if (excluded.has(skill)) throw new Error(`intro skill "${skill}" is excluded from the port`);
    const body = parseFrontmatter(
      readFileSync(join(UPSTREAM_SKILLS, skill, "SKILL.md"), "utf8"),
    ).body;
    if (!/^# /m.test(body)) {
      throw new Error(
        `intro skill "${skill}" has no H1; add a patch or remove it from INTRO_SKILLS`,
      );
    }
  }

  const candidates = introRequirement(exclusions);
  for (const skill of candidates) {
    if (!Object.hasOwn(introSkills, skill)) {
      throw new Error(`skill "${skill}" contains host terms but is not in INTRO_SKILLS`);
    }
  }
}

/**
 * Assert every declared patch reached the tree.
 *
 * `FILE_PATCHES` targets are asset files, so a missing one is a build error: it
 * means a patch names a file the tree does not contain. `RUNTIME_SOURCE_PATCHES`
 * targets are script *sources*, which deliberately do not ship — a patch on
 * `orch.ts` lands in the `orch.mjs` artifact instead, and the bundler is what proves
 * it landed. Skipping the second list here is therefore not a weakening: the runtime
 * build asserts its own patches through `assertPatchOutput` before emitting, and
 * `assertRuntimeAssets` below checks that every declared artifact exists.
 */
function assertPatchesLanded(assets: readonly Asset[], patches: readonly FilePatch[]): void {
  const byPath = new Map(assets.map((asset) => [asset.path, asset]));
  for (const patch of patches) {
    const asset = byPath.get(patch.file);
    if (asset === undefined) {
      throw new Error(`${patch.file}: patch has no generated asset`);
    }
    assertPatchOutput(patch.file, [patch], asset.bytes.toString("utf8"));
  }
}

function skillName(upstreamRelativePath: string): string {
  return upstreamRelativePath.split("/")[1] as string;
}

type AssetFormat = "skill" | "agent" | "plain";

function assetFormat(upstreamRelativePath: string): AssetFormat {
  if (/^skills\/[^/]+\/SKILL\.md$/.test(upstreamRelativePath)) return "skill";
  if (/^agents\/[^/]+\.md$/.test(upstreamRelativePath)) return "agent";
  return "plain";
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
