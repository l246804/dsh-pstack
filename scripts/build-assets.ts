/**
 * Deterministic construction of the asset tree.
 *
 * `buildAssets` reads the pinned upstream tree and returns the files the
 * package ships. It writes nothing, so `sync --check` and the tests can rebuild
 * in memory and compare. Every rewrite is a single patch splice over the
 * upstream text plus the frontmatter rebuild; everything else is a byte copy.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Buffer } from "node:buffer";

import {
  AGENTS_PREFIX,
  GENERATED_HARNESS_DOC,
  GUIDE_PREFIX,
  SKILLS_PREFIX,
  UPSTREAM_ROOT,
  UPSTREAM_SKILLS,
} from "./asset-paths.ts";
import { renderHarnessDoc } from "./capabilities.ts";
import { applyFilePatches } from "./patches/apply.ts";
import { EXCLUDED_SKILLS, FILE_PATCHES } from "./patches/index.ts";
import type { FilePatch, SkillExclusion } from "./patches/types.ts";
import {
  parseFrontmatter,
  serializeAgentFrontmatter,
  serializeSkillFrontmatter,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} from "../src/frontmatter.ts";

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

export function buildAssets(
  patches: readonly FilePatch[] = FILE_PATCHES,
  exclusions: readonly SkillExclusion[] = EXCLUDED_SKILLS,
): readonly Asset[] {
  const excluded = new Set(exclusions.map((exclusion) => exclusion.skill));
  const assets: Asset[] = [];

  for (const skill of skillDirectories()) {
    if (excluded.has(skill)) continue;
    const files = walkUpstream(`${SKILLS_PREFIX}${skill}`);
    if (!files.includes(`${SKILLS_PREFIX}${skill}/SKILL.md`)) {
      throw new Error(`skills/${skill}: missing SKILL.md`);
    }
    for (const file of files) assets.push(buildAsset(file, patches));
  }
  for (const file of walkUpstream("agents")) assets.push(buildAsset(file, patches));
  for (const file of walkUpstream("docs/guide")) assets.push(buildAsset(file, patches));

  assets.push({
    path: GENERATED_HARNESS_DOC,
    bytes: Buffer.from(renderHarnessDoc(), "utf8"),
    executable: false,
    origin: "generated",
  });

  return assets.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
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

function buildAsset(upstreamRelativePath: string, allPatches: readonly FilePatch[]): Asset {
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
      ? renderSkill(patched, upstreamRelativePath)
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

export function assertPatchOutput(
  file: string,
  patches: readonly FilePatch[],
  output: string,
): void {
  for (const patch of patches) {
    for (const fragment of patch.outputIncludes ?? []) {
      if (!output.includes(fragment)) {
        throw new Error(`${file}: generated output is missing ${JSON.stringify(fragment)}`);
      }
    }
  }
}

type AssetFormat = "skill" | "agent" | "plain";

function assetFormat(upstreamRelativePath: string): AssetFormat {
  if (/^skills\/[^/]+\/SKILL\.md$/.test(upstreamRelativePath)) return "skill";
  if (/^agents\/[^/]+\.md$/.test(upstreamRelativePath)) return "agent";
  return "plain";
}

export function renderSkill(text: string, file: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = eol === "\r\n" ? text.replaceAll("\r\n", "\n") : text;
  const { data, body } = parseFrontmatter(normalized);
  const frontmatter = validateSkillFrontmatter(data, file);
  const rendered = `${serializeSkillFrontmatter(frontmatter)}${insertIntro(body, file)}`;
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

/**
 * Places the DSH pointer after the H1. Three skills have no heading, so their
 * body gets the pointer at the start instead. The rest of the body is copied as
 * is, including blank lines, trailing spaces, and the original line endings.
 */
function insertIntro(body: string, file: string): string {
  if (body.includes("DSH port of pstack.")) {
    throw new Error(`${file}: body already contains the DSH intro`);
  }
  const heading = /^# .+$/m.exec(body);
  if (heading === null) {
    const content = body.replace(/^\n+/, "");
    return `\n${DSH_INTRO}\n\n${content}`;
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

export function decodeUtf8(bytes: Buffer, file: string): string {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    throw new Error(`${file}: not valid UTF-8, so text rules do not apply`);
  }
  return text;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
