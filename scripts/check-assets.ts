/**
 * Audit the generated tree on disk.
 *
 * The checker reads what is committed, not what a fresh build would produce:
 * skill frontmatter, the agent files, the guide, local Markdown links, file
 * modes, and undeclared files. `sync --check` proves the tree is current; this
 * proves the tree is correct.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ASSETS_AGENTS,
  ASSETS_DOCS,
  ASSETS_GUIDE,
  ASSETS_ROOT,
  ASSETS_SKILLS,
  GENERATED_HARNESS_DOC,
  ROOT,
  UPSTREAM_ROOT,
} from "./asset-paths.ts";
import { DSH_INTRO, skillDirectories, walkUpstream } from "./build-assets.ts";
import { CAPABILITIES, detectableCapabilities } from "./capabilities.ts";
import { checkLinks, scanMarkdownLinks } from "./links.ts";
import type { LinkPlaceholder } from "./links.ts";
import { EXCLUDED_SKILLS } from "./patches/index.ts";
import {
  AGENT_DROPPED_FIELDS,
  SKILL_DROPPED_FIELDS,
  parseFrontmatter,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} from "../src/frontmatter.ts";

export interface CapabilityTokenHit {
  readonly id: string;
  readonly token: string;
  readonly count: number;
}

export interface AssetsReport {
  readonly skills: number;
  readonly agents: number;
  readonly guideMarkdown: number;
  readonly guideImages: number;
  readonly executables: number;
  readonly markdownFiles: number;
  readonly linksChecked: number;
  readonly linksSkipped: number;
  readonly placeholders: readonly LinkPlaceholder[];
  readonly capabilityTokens: readonly CapabilityTokenHit[];
  readonly problems: readonly string[];
}

export function checkAssets(): AssetsReport {
  const problems: string[] = [];
  const excluded = EXCLUDED_SKILLS.map((exclusion) => exclusion.skill);

  if (!existsSync(ASSETS_ROOT)) {
    return {
      skills: 0,
      agents: 0,
      guideMarkdown: 0,
      guideImages: 0,
      executables: 0,
      markdownFiles: 0,
      linksChecked: 0,
      linksSkipped: 0,
      placeholders: [],
      capabilityTokens: [],
      problems: ["assets/: missing; run `pnpm sync` first"],
    };
  }

  checkLayout(problems);

  const skills = checkSkills(problems, excluded);
  const agents = checkAgents(problems);
  const guide = checkGuide(problems);
  checkUndeclaredFiles(problems);
  checkHarnessDoc(problems);
  checkLicense(problems);

  const executables = walkFiles(ASSETS_ROOT).filter(
    (file) => (statSync(file).mode & 0o111) !== 0,
  ).length;
  const markdown = walkFiles(ASSETS_ROOT)
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({ file: toRepositoryPath(file), text: readFileSync(file, "utf8") }));

  for (const { file, text } of markdown) {
    for (const link of scanMarkdownLinks(text)) {
      if (link.target.includes("make-bot-ui")) {
        problems.push(`${file}:${link.line}: still links to the excluded skill (${link.target})`);
      }
    }
  }

  const links = checkLinks(markdown, (repositoryRelativePath) =>
    existsSync(join(ROOT, repositoryRelativePath)),
  );
  for (const problem of links.problems) {
    problems.push(
      `${problem.file}:${problem.line}: ${problem.reason} link ${problem.target} -> ${problem.resolved}`,
    );
  }

  const corpus = markdown.map(({ text }) => text).join("\n");
  const capabilityTokens = detectableCapabilities()
    .map((capability) => ({
      id: capability.id,
      token: capability.detect,
      count: countOccurrences(corpus, capability.detect),
    }))
    .filter((hit) => hit.count > 0);

  return {
    skills,
    agents,
    guideMarkdown: guide.markdown,
    guideImages: guide.images,
    executables,
    markdownFiles: markdown.length,
    linksChecked: links.checked,
    linksSkipped: links.skipped,
    placeholders: links.placeholders,
    capabilityTokens,
    problems,
  };
}

export function main(): number {
  const report = checkAssets();
  const coverage = new Map<string, number>();
  for (const capability of CAPABILITIES) {
    coverage.set(capability.coverage, (coverage.get(capability.coverage) ?? 0) + 1);
  }
  const coverageText = [...coverage.entries()]
    .map(([name, count]) => `${count} ${name}`)
    .join(", ");
  const lines = [
    "assets check",
    `  skills            ${report.skills}`,
    `  agents            ${report.agents}`,
    `  guide markdown    ${report.guideMarkdown}`,
    `  guide images      ${report.guideImages}`,
    `  executables       ${report.executables}`,
    `  markdown files    ${report.markdownFiles}`,
    `  links checked     ${report.linksChecked}`,
    `  links skipped     ${report.linksSkipped}`,
    `  capability rows   ${CAPABILITIES.length} (${coverageText})`,
  ];
  console.log(lines.join("\n"));

  for (const placeholder of report.placeholders) {
    console.log(
      `  template link     ${placeholder.file}:${placeholder.line} -> ${placeholder.target}`,
    );
  }
  for (const hit of report.capabilityTokens) {
    console.log(`  capability token  ${hit.id}: ${hit.count} "${hit.token}"`);
  }

  if (report.problems.length === 0) {
    console.log("assets check passed");
    return 0;
  }

  console.error(`assets check failed (${report.problems.length} problem(s)):`);
  for (const problem of report.problems) console.error(`  ${problem}`);
  return 1;
}

function checkLayout(problems: string[]): void {
  const allowedTopLevel = new Set(["skills", "agents", "docs"]);
  for (const entry of readdirSync(ASSETS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !allowedTopLevel.has(entry.name)) {
      problems.push(`assets/${entry.name}: unexpected top-level entry`);
    }
  }

  if (!existsSync(ASSETS_DOCS)) {
    problems.push("assets/docs: missing");
    return;
  }

  const allowedDocs = new Set(["guide", "harness"]);
  for (const entry of readdirSync(ASSETS_DOCS, { withFileTypes: true })) {
    if (!entry.isDirectory() || !allowedDocs.has(entry.name)) {
      problems.push(`assets/docs/${entry.name}: unexpected entry`);
    }
  }

  const harnessFiles = walkFiles(join(ASSETS_DOCS, "harness")).map((file) =>
    relative(ASSETS_DOCS, file).split(sep).join("/"),
  );
  if (harnessFiles.length !== 1 || harnessFiles[0] !== "harness/dsh.md") {
    problems.push(`assets/docs/harness: expected only dsh.md, found ${describeList(harnessFiles)}`);
  }
}

function checkSkills(problems: string[], excluded: readonly string[]): number {
  if (!existsSync(ASSETS_SKILLS)) {
    problems.push("assets/skills: missing");
    return 0;
  }

  const expected = skillDirectories().filter((skill) => !excluded.includes(skill));
  const entries = readdirSync(ASSETS_SKILLS, { withFileTypes: true });
  const actual = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const entry of entries) {
    if (!entry.isDirectory()) problems.push(`assets/skills/${entry.name}: unexpected file`);
  }
  reportSetDifference(problems, "assets/skills", expected, actual);

  for (const skill of actual) {
    const assetFile = `assets/skills/${skill}/SKILL.md`;
    const absolutePath = join(ASSETS_SKILLS, skill, "SKILL.md");
    if (!existsSync(absolutePath)) {
      problems.push(`${assetFile}: missing`);
      continue;
    }
    try {
      const { data, body } = parseFrontmatter(readFileSync(absolutePath, "utf8"));
      const frontmatter = validateSkillFrontmatter(data, assetFile);
      if (frontmatter.name !== skill) {
        problems.push(`${assetFile}: name "${frontmatter.name}" does not match its directory`);
      }
      const introCount = body.split(DSH_INTRO).length - 1;
      if (introCount !== 1) {
        problems.push(`${assetFile}: expected exactly one DSH intro, found ${introCount}`);
      }
      for (const field of SKILL_DROPPED_FIELDS) {
        if (Object.hasOwn(data, field))
          problems.push(`${assetFile}: field "${field}" must be dropped`);
      }
    } catch (error) {
      problems.push(messageOf(error));
    }
  }

  return actual.length;
}

function checkAgents(problems: string[]): number {
  if (!existsSync(ASSETS_AGENTS)) {
    problems.push("assets/agents: missing");
    return 0;
  }

  const expected = walkUpstream("agents")
    .map((path) => path.slice("agents/".length))
    .filter((name) => name.endsWith(".md"));
  const entries = readdirSync(ASSETS_AGENTS, { withFileTypes: true });
  const actual = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    problems.push(`assets/agents/${entry.name}: unexpected directory`);
  }
  reportSetDifference(problems, "assets/agents", expected, actual);

  for (const name of actual) {
    const assetFile = `assets/agents/${name}`;
    try {
      const { data } = parseFrontmatter(readFileSync(join(ASSETS_AGENTS, name), "utf8"));
      const frontmatter = validateAgentFrontmatter(data, assetFile);
      if (frontmatter.name !== name.replace(/\.md$/, "")) {
        problems.push(`${assetFile}: name "${frontmatter.name}" does not match its file name`);
      }
      for (const field of AGENT_DROPPED_FIELDS) {
        if (Object.hasOwn(data, field))
          problems.push(`${assetFile}: field "${field}" must be dropped`);
      }
    } catch (error) {
      problems.push(messageOf(error));
    }
  }

  return actual.length;
}

function checkGuide(problems: string[]): { readonly markdown: number; readonly images: number } {
  const expected = walkUpstream("docs/guide").map((path) => path.slice("docs/guide/".length));
  const actual = walkFiles(ASSETS_GUIDE)
    .map((file) => relative(ASSETS_GUIDE, file).split(sep).join("/"))
    .sort();
  reportSetDifference(problems, "assets/docs/guide", expected, actual);

  const markdown = actual.filter((name) => name.endsWith(".md")).length;
  return { markdown, images: actual.length - markdown };
}

function checkUndeclaredFiles(problems: string[]): void {
  const covered = [ASSETS_SKILLS, ASSETS_AGENTS, ASSETS_GUIDE];
  for (const root of covered) {
    for (const file of walkFiles(root)) {
      const assetRelative = toRepositoryPath(file);
      const upstreamRelative = assetRelative.startsWith("assets/")
        ? assetRelative.slice("assets/".length)
        : assetRelative;
      if (!existsSync(join(UPSTREAM_ROOT, upstreamRelative))) {
        problems.push(`${assetRelative}: no upstream source`);
      }
    }
  }
}

/** Existence only; `sync --check` compares the generated bytes with a fresh build. */
function checkHarnessDoc(problems: string[]): void {
  if (!existsSync(join(ASSETS_ROOT, GENERATED_HARNESS_DOC))) {
    problems.push(`assets/${GENERATED_HARNESS_DOC}: missing`);
  }
}

function checkLicense(problems: string[]): void {
  const text = readFileSync(join(ROOT, "LICENSE"), "utf8");
  if (!text.includes("Lauren Tan")) problems.push("LICENSE: missing the upstream copyright holder");
  if (!/\bMIT\b/.test(text)) problems.push("LICENSE: missing the MIT license");
}

function reportSetDifference(
  problems: string[],
  label: string,
  expected: readonly string[],
  actual: readonly string[],
): void {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  for (const name of expected) if (!actualSet.has(name)) problems.push(`${label}: missing ${name}`);
  for (const name of actual)
    if (!expectedSet.has(name)) problems.push(`${label}: unexpected ${name}`);
}

function walkFiles(directory: string): readonly string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store")
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(path) : [path];
    });
}

function toRepositoryPath(absolutePath: string): string {
  return relative(ROOT, absolutePath).split(sep).join("/");
}

function countOccurrences(corpus: string, token: string): number {
  if (token === "") return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const index = corpus.indexOf(token, from);
    if (index === -1) return count;
    count += 1;
    from = index + token.length;
  }
}

function describeList(names: readonly string[]): string {
  return names.length === 0 ? "nothing" : names.join(", ");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
