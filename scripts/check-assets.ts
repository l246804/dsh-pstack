import { Buffer } from "node:buffer";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGENTS_PREFIX,
  ASSETS_ROOT,
  DSH_INTRO,
  GUIDE_PREFIX,
  ROOT,
  SKILLS_PREFIX,
  UPSTREAM_ROOT,
  classifySkills,
  insertIntro,
  introCandidates,
  skillDirectories,
  walkUpstream,
} from "./build-assets.ts";
import type { SkillCategory } from "./build-assets.ts";
import { CAPABILITIES, HARNESS_DOC_PATH, HARNESS_DOC_SCOPE_LINE, detectableCapabilities } from "./capabilities.ts";
import { applyFilePatches } from "./apply-patches.ts";
import { EXCLUDED_SKILLS, INTRO_SKILLS, patchesForFile } from "./patches.ts";
import {
  AGENT_DROPPED_FIELDS,
  SKILL_DROPPED_FIELDS,
  parseFrontmatter,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} from "../src/frontmatter.ts";
import { loadBundledSkillIndex } from "../src/provider.ts";

export interface MarkdownLink {
  readonly line: number;
  readonly target: string;
}

export interface LinkPlaceholder {
  readonly file: string;
  readonly line: number;
  readonly target: string;
}

export interface LinkProblem {
  readonly file: string;
  readonly line: number;
  readonly target: string;
  readonly resolved: string;
  readonly reason: "missing" | "outside-repository";
}

export interface LinkReport {
  readonly checked: number;
  readonly skipped: number;
  readonly placeholders: readonly LinkPlaceholder[];
  readonly problems: readonly LinkProblem[];
}

export interface CapabilityTokenHit {
  readonly id: string;
  readonly token: string;
  readonly count: number;
}

export interface AssetsReport {
  readonly skills: number;
  readonly skillFiles: number;
  readonly bundledSkills: number;
  readonly agents: number;
  readonly guideMarkdown: number;
  readonly guideImages: number;
  readonly executables: number;
  readonly markdownFiles: number;
  readonly linksChecked: number;
  readonly linksSkipped: number;
  readonly categories: Readonly<Record<SkillCategory, number>>;
  readonly placeholders: readonly LinkPlaceholder[];
  readonly capabilityTokens: readonly CapabilityTokenHit[];
  readonly problems: readonly string[];
}

export function checkAssets(): AssetsReport {
  const problems: string[] = [];

  if (!existsSync(ASSETS_ROOT)) {
    return emptyReport(["assets/: missing; run `pnpm sync` first"]);
  }

  checkLayout(problems);
  const skills = checkSkills(problems);
  const bundledSkills = checkBundledSkills(problems);
  const agents = checkAgents(problems);
  const guide = checkGuide(problems);
  checkUndeclaredFiles(problems);
  checkHarnessDoc(problems);
  checkLicense(problems);
  checkPackageManifest(problems);
  checkIntroScope(problems);

  if (skills.count !== 55) problems.push(`assets: expected 55 skills, found ${skills.count}`);
  const expectedSkillFiles = skillDirectories()
    .filter((skill) => !EXCLUDED_SKILLS.some((exclusion) => exclusion.skill === skill))
    .reduce((total, skill) => total + walkUpstream(`${SKILLS_PREFIX}${skill}`).length, 0);
  if (skills.files !== expectedSkillFiles) {
    problems.push(`assets: expected ${expectedSkillFiles} skill files, found ${skills.files}`);
  }
  if (agents !== 2) problems.push(`assets: expected 2 agents, found ${agents}`);
  if (guide.markdown !== 11)
    problems.push(`assets: expected 11 guide Markdown files, found ${guide.markdown}`);
  if (guide.images !== 6) problems.push(`assets: expected 6 guide images, found ${guide.images}`);
  if (skills.categories.copy + skills.categories["intro-only"] + skills.categories.patched !== 55) {
    problems.push("assets: skill categories do not cover all 55 skills");
  }

  for (const candidate of introCandidates()) {
    if (!Object.hasOwn(INTRO_SKILLS, candidate)) {
      problems.push(`skills/${candidate}: contains host terms but has no declared intro`);
    }
  }

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

  const executables = walkFiles(ASSETS_ROOT).filter((file) => (statSync(file).mode & 0o111) !== 0);
  if (executables.length !== 5) {
    problems.push(`assets: expected 5 executable files, found ${executables.length}`);
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
    skills: skills.count,
    skillFiles: skills.files,
    bundledSkills,
    agents,
    guideMarkdown: guide.markdown,
    guideImages: guide.images,
    executables: executables.length,
    markdownFiles: markdown.length,
    linksChecked: links.checked,
    linksSkipped: links.skipped,
    categories: skills.categories,
    placeholders: links.placeholders,
    capabilityTokens,
    problems,
  };
}

export function scanMarkdownLinks(text: string): readonly MarkdownLink[] {
  const links: MarkdownLink[] = [];
  let inFence = false;

  text.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    for (const match of line.matchAll(pattern)) {
      links.push({ line: index + 1, target: match[1] as string });
    }
  });

  return links;
}

export function checkLinks(
  files: readonly { readonly file: string; readonly text: string }[],
  exists: (repositoryRelativePath: string) => boolean,
): LinkReport {
  const placeholders: LinkPlaceholder[] = [];
  const problems: LinkProblem[] = [];
  let checked = 0;
  let skipped = 0;

  for (const { file, text } of files) {
    for (const link of scanMarkdownLinks(text)) {
      const target = link.target.replace(/^<|>$/g, "").split("#")[0]?.split("?")[0] ?? "";
      if (target === "" || /^(?:https?:|mailto:|tel:)/.test(target)) {
        skipped += 1;
        continue;
      }
      if (!target.includes("/") && !target.includes(".")) {
        placeholders.push({ file, line: link.line, target });
        continue;
      }

      checked += 1;
      const resolved = posix.normalize(posix.join(posix.dirname(file), target));
      if (resolved.startsWith("../") || resolved === "..") {
        problems.push({ file, line: link.line, target, resolved, reason: "outside-repository" });
      } else if (!exists(resolved)) {
        problems.push({ file, line: link.line, target, resolved, reason: "missing" });
      }
    }
  }

  return { checked, skipped, placeholders, problems };
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

  console.log(
    [
      "assets check",
      `  skills            ${report.skills} (copy ${report.categories.copy}, intro-only ${report.categories["intro-only"]}, patched ${report.categories.patched})`,
      `  skill files       ${report.skillFiles}`,
      `  bundled skills    ${report.bundledSkills}`,
      `  agents            ${report.agents}`,
      `  guide             ${report.guideMarkdown} md, ${report.guideImages} images`,
      `  executables       ${report.executables}`,
      `  markdown files    ${report.markdownFiles}`,
      `  links checked     ${report.linksChecked}`,
      `  links skipped     ${report.linksSkipped}`,
      `  capability rows   ${CAPABILITIES.length} (${coverageText})`,
    ].join("\n"),
  );

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

  if (!existsSync(join(ASSETS_ROOT, "docs"))) {
    problems.push("assets/docs: missing");
    return;
  }

  const allowedDocs = new Set(["guide", "harness"]);
  for (const entry of readdirSync(join(ASSETS_ROOT, "docs"), { withFileTypes: true })) {
    if (!entry.isDirectory() || !allowedDocs.has(entry.name)) {
      problems.push(`assets/docs/${entry.name}: unexpected entry`);
    }
  }

  const harnessFiles = walkFiles(join(ASSETS_ROOT, "docs", "harness")).map((file) =>
    relative(join(ASSETS_ROOT, "docs"), file).split(sep).join("/"),
  );
  if (harnessFiles.length !== 1 || harnessFiles[0] !== "harness/dsh.md") {
    problems.push(`assets/docs/harness: expected only dsh.md, found ${describeList(harnessFiles)}`);
  }
}

function checkSkills(problems: string[]): {
  readonly count: number;
  readonly files: number;
  readonly categories: Readonly<Record<SkillCategory, number>>;
} {
  const assetsSkills = join(ASSETS_ROOT, "skills");
  if (!existsSync(assetsSkills)) {
    problems.push("assets/skills: missing");
    return { count: 0, files: 0, categories: emptyCategories() };
  }

  const excluded = new Set(EXCLUDED_SKILLS.map((exclusion) => exclusion.skill));
  const expected = skillDirectories().filter((skill) => !excluded.has(skill));
  const entries = readdirSync(assetsSkills, { withFileTypes: true });
  const actual = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const entry of entries) {
    if (!entry.isDirectory()) problems.push(`assets/skills/${entry.name}: unexpected file`);
  }
  reportSetDifference(problems, "assets/skills", expected, actual);

  const categories = emptyCategories();
  const classifications = new Map(classifySkills().map((item) => [item.skill, item.category]));
  let files = 0;

  for (const skill of actual) {
    const category = classifications.get(skill);
    if (category === undefined) {
      problems.push(`assets/skills/${skill}: no declared category`);
      continue;
    }
    categories[category] += 1;

    const upstreamFiles = walkUpstream(`${SKILLS_PREFIX}${skill}`).map((path) =>
      path.slice(`${SKILLS_PREFIX}${skill}/`.length),
    );
    const assetFiles = walkFiles(join(assetsSkills, skill))
      .map((file) => relative(join(assetsSkills, skill), file).split(sep).join("/"))
      .sort();
    files += assetFiles.length;

    for (const path of upstreamFiles) {
      if (!assetFiles.includes(path)) problems.push(`assets/skills/${skill}/${path}: missing`);
    }
    for (const path of assetFiles) {
      if (!upstreamFiles.includes(path))
        problems.push(`assets/skills/${skill}/${path}: unexpected file`);
    }

    const skillFile = `${SKILLS_PREFIX}${skill}/SKILL.md`;
    const skillPath = join(assetsSkills, skill, "SKILL.md");
    if (!existsSync(skillPath)) {
      problems.push(`assets/${skillFile}: missing`);
      continue;
    }

    try {
      const sourceText = readFileSync(join(UPSTREAM_ROOT, skillFile), "utf8");
      const assetText = readFileSync(skillPath, "utf8");
      const assetData = parseFrontmatter(assetText);
      const frontmatter = validateSkillFrontmatter(assetData.data, `assets/${skillFile}`);

      if (frontmatter.name !== skill) {
        problems.push(
          `assets/${skillFile}: name "${frontmatter.name}" does not match its directory`,
        );
      }
      for (const field of SKILL_DROPPED_FIELDS) {
        if (Object.hasOwn(assetData.data, field)) {
          problems.push(`assets/${skillFile}: field "${field}" must be dropped`);
        }
      }

      const expectedBody = expectedSkillBody(skill, category, sourceText, skillFile);
      if (assetData.body !== expectedBody) {
        problems.push(`assets/${skillFile}: body differs from the ${category} expectation`);
      }
      const expectedIntroCount = category === "copy" ? 0 : 1;
      const actualIntroCount = assetData.body.split(DSH_INTRO).length - 1;
      if (actualIntroCount !== expectedIntroCount) {
        problems.push(
          `assets/${skillFile}: expected ${expectedIntroCount} DSH intro(s), found ${actualIntroCount}`,
        );
      }

      for (const path of upstreamFiles) {
        if (path === "SKILL.md") continue;
        const upstreamPath = `${SKILLS_PREFIX}${skill}/${path}`;
        const asset = readFileSync(join(ASSETS_ROOT, upstreamPath));
        const source = readFileSync(join(UPSTREAM_ROOT, upstreamPath));
        const patches = patchesForFile(upstreamPath);
        const expectedBytes =
          patches.length === 0
            ? source
            : Buffer.from(applyFilePatches(upstreamPath, source.toString("utf8"), patches), "utf8");
        if (!asset.equals(expectedBytes)) {
          problems.push(`assets/${upstreamPath}: differs from its source`);
        }
      }
    } catch (error) {
      problems.push(messageOf(error));
    }
  }

  return { count: actual.length, files, categories };
}

function expectedSkillBody(
  skill: string,
  category: SkillCategory,
  sourceText: string,
  file: string,
): string {
  const sourceBody = parseFrontmatter(sourceText).body;
  if (category === "copy") return sourceBody;
  if (category === "intro-only") return insertIntro(sourceBody, file);

  const patched = applyFilePatches(
    `skills/${skill}/SKILL.md`,
    sourceText,
    patchesForFile(`skills/${skill}/SKILL.md`),
  );
  const patchedBody = parseFrontmatter(patched).body;
  return Object.hasOwn(INTRO_SKILLS, skill) ? insertIntro(patchedBody, file) : patchedBody;
}

function checkAgents(problems: string[]): number {
  const assetsAgents = join(ASSETS_ROOT, "agents");
  if (!existsSync(assetsAgents)) {
    problems.push("assets/agents: missing");
    return 0;
  }

  const expected = walkUpstream("agents")
    .map((path) => path.slice(AGENTS_PREFIX.length))
    .filter((name) => name.endsWith(".md"));
  const entries = readdirSync(assetsAgents, { withFileTypes: true });
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
    const path = `${AGENTS_PREFIX}${name}`;
    try {
      const source = parseFrontmatter(readFileSync(join(UPSTREAM_ROOT, path), "utf8"));
      const asset = parseFrontmatter(readFileSync(join(assetsAgents, name), "utf8"));
      const frontmatter = validateAgentFrontmatter(asset.data, `assets/${path}`);

      if (frontmatter.name !== name.replace(/\.md$/, "")) {
        problems.push(`assets/${path}: name "${frontmatter.name}" does not match its file name`);
      }
      if (asset.body !== source.body) problems.push(`assets/${path}: body differs from its source`);
      for (const field of AGENT_DROPPED_FIELDS) {
        if (Object.hasOwn(asset.data, field)) {
          problems.push(`assets/${path}: field "${field}" must be dropped`);
        }
      }
    } catch (error) {
      problems.push(messageOf(error));
    }
  }

  return actual.length;
}

function checkGuide(problems: string[]): { readonly markdown: number; readonly images: number } {
  const assetsGuide = join(ASSETS_ROOT, "docs", "guide");
  const expected = walkUpstream("docs/guide").map((path) => path.slice(GUIDE_PREFIX.length));
  const actual = walkFiles(assetsGuide)
    .map((file) => relative(assetsGuide, file).split(sep).join("/"))
    .sort();
  reportSetDifference(problems, "assets/docs/guide", expected, actual);

  for (const path of expected) {
    if (!actual.includes(path)) continue;
    const asset = readFileSync(join(ASSETS_ROOT, GUIDE_PREFIX, path));
    const source = readFileSync(join(UPSTREAM_ROOT, GUIDE_PREFIX, path));
    const patches = patchesForFile(`${GUIDE_PREFIX}${path}`);
    const expectedBytes =
      patches.length === 0
        ? source
        : Buffer.from(
            applyFilePatches(`${GUIDE_PREFIX}${path}`, source.toString("utf8"), patches),
            "utf8",
          );
    if (!asset.equals(expectedBytes))
      problems.push(`assets/${GUIDE_PREFIX}${path}: differs from its source`);
  }

  const markdown = actual.filter((name) => name.endsWith(".md")).length;
  return { markdown, images: actual.length - markdown };
}

function checkUndeclaredFiles(problems: string[]): void {
  const covered = [
    join(ASSETS_ROOT, "skills"),
    join(ASSETS_ROOT, "agents"),
    join(ASSETS_ROOT, "docs", "guide"),
  ];
  for (const root of covered) {
    for (const file of walkFiles(root)) {
      const assetRelative = toRepositoryPath(file).slice(ASSETS_PREFIX.length);
      if (!existsSync(join(UPSTREAM_ROOT, assetRelative))) {
        problems.push(`${toRepositoryPath(file)}: no upstream source`);
      }
    }
  }
}

function checkHarnessDoc(problems: string[]): void {
  const path = join(ASSETS_ROOT, HARNESS_DOC_PATH);
  if (!existsSync(path)) {
    problems.push(`assets/${HARNESS_DOC_PATH}: missing`);
    return;
  }
  const text = readFileSync(path, "utf8");
  if (!text.includes(HARNESS_DOC_SCOPE_LINE)) {
    problems.push(
      `assets/${HARNESS_DOC_PATH}: must state that the tree ships static assets plus the bundled skill provider`,
    );
  }
  for (const deferred of ["`Task` spawn", "restricted `sessionQuery` reads", "worktree isolation"]) {
    const row = text.split("\n").find((line) => line.includes(`| ${deferred} |`));
    if (row === undefined) {
      problems.push(`assets/${HARNESS_DOC_PATH}: missing the "${deferred}" row`);
      continue;
    }
    if (!row.includes("| deferred |")) {
      problems.push(`assets/${HARNESS_DOC_PATH}: "${deferred}" must stay deferred`);
    }
  }
}

/**
 * Audit the tree exactly as the bundled provider reads it.
 *
 * This runs the provider's own loader, so a tree the provider would reject fails
 * `pnpm check:assets` too instead of only failing at plugin activation.
 */
function checkBundledSkills(problems: string[]): number {
  const root = join(ASSETS_ROOT, "skills");
  if (!existsSync(root)) {
    problems.push("assets/skills: missing; cannot audit the bundled skill provider");
    return 0;
  }

  let index;
  try {
    index = loadBundledSkillIndex(root);
  } catch (error) {
    problems.push(`bundled provider: ${messageOf(error)}`);
    return 0;
  }

  const excluded = new Set(EXCLUDED_SKILLS.map((exclusion) => exclusion.skill));
  const expected = new Set(
    skillDirectories().filter((skill) => !excluded.has(skill)),
  );
  if (index.size !== 55) {
    problems.push(`bundled provider: expected 55 skills, found ${index.size}`);
  }

  for (const skill of index.values()) {
    if (!expected.has(skill.name)) {
      problems.push(`bundled provider: unexpected skill "${skill.name}"`);
    }
    if (!isInside(ASSETS_ROOT, skill.directory)) {
      problems.push(`bundled provider: "${skill.name}" resource base is outside assets/`);
    }
    if (!isInside(skill.directory, skill.instructionFile)) {
      problems.push(`bundled provider: "${skill.name}" instruction file is outside its directory`);
    }
    if (!existsSync(skill.instructionFile)) {
      problems.push(`bundled provider: "${skill.name}" instruction file is missing`);
    }
  }

  return index.size;
}

/** Check the package fields the bundle and its display metadata depend on. */
function checkPackageManifest(problems: string[]): void {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  } catch (error) {
    problems.push(`package.json: ${messageOf(error)}`);
    return;
  }
  if (typeof manifest !== "object" || manifest === null) {
    problems.push("package.json: must be an object");
    return;
  }

  const record = manifest as Record<string, unknown>;
  const dsh = asRecord(record["dsh"]);
  if (dsh?.["manifestVersion"] !== 1) {
    problems.push('package.json: "dsh.manifestVersion" must be 1');
  }

  const bundle = asRecord(dsh?.["bundle"]);
  const declaredPatch = bundle?.["patch"];
  const patches = typeof declaredPatch === "string" ? [declaredPatch] : [];
  if (patches.length === 0) {
    problems.push('package.json: "dsh.bundle.patch" must name the bundle patch file');
  }
  for (const patch of patches) {
    if (!existsSync(join(ROOT, patch))) {
      problems.push(`package.json: bundle patch "${patch}" does not exist`);
    }
  }

  const engines = asRecord(record["engines"]);
  if (typeof engines?.["dsh"] !== "string" || engines["dsh"].trim() === "") {
    problems.push('package.json: "engines.dsh" must declare the supported DSH version');
  }

  const exportsMap = asRecord(record["exports"]) ?? {};
  for (const subpath of ["./cordis.patch.yml", "./locale/*.json", "./icon"]) {
    if (!(subpath in exportsMap)) {
      problems.push(`package.json: "exports" must expose "${subpath}"`);
    }
  }

  const shipped = Array.isArray(record["files"])
    ? record["files"].filter((value): value is string => typeof value === "string")
    : [];
  for (const required of ["dist", "assets", "cordis.patch.yml", "locale/*.json", "icon.svg"]) {
    if (!shipped.includes(required)) {
      problems.push(`package.json: "files" must include "${required}"`);
    }
  }

  const icon = record["icon"];
  if (typeof icon !== "string") {
    problems.push('package.json: "icon" must name the packaged icon');
  } else {
    checkIcon(join(ROOT, icon), icon, problems);
  }

  const localeDirectory = join(ROOT, "locale");
  const locales = existsSync(localeDirectory)
    ? readdirSync(localeDirectory).filter((name) => name.endsWith(".json"))
    : [];
  if (!locales.includes("en.json")) {
    problems.push("locale/en.json: missing the required English metadata");
  }
  for (const locale of locales) {
    const file = `locale/${locale}`;
    let metadata: unknown;
    try {
      metadata = JSON.parse(readFileSync(join(localeDirectory, locale), "utf8"));
    } catch (error) {
      problems.push(`${file}: ${messageOf(error)}`);
      continue;
    }
    const meta = asRecord(asRecord(metadata)?.["meta"]);
    for (const field of ["title", "description"]) {
      const value = meta?.[field];
      if (typeof value !== "string" || value.trim() === "") {
        problems.push(`${file}: "meta.${field}" must be a non-empty string`);
      }
    }
  }
}

function checkIcon(path: string, relativePath: string, problems: string[]): void {
  if (!existsSync(path)) {
    problems.push(`${relativePath}: missing the packaged icon`);
    return;
  }
  const bytes = statSync(path).size;
  if (bytes > 256 * 1024) {
    problems.push(`${relativePath}: icon is larger than 256 KiB`);
  }
  const head = readFileSync(path, "utf8").slice(0, 64).trimStart();
  if (!head.startsWith("<svg") && !head.startsWith("<?xml")) {
    problems.push(`${relativePath}: icon must be an SVG document`);
  }
}

function isInside(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate));
  if (path === "" || isAbsolute(path)) return false;
  return path !== ".." && !path.startsWith(`..${sep}`);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function checkLicense(problems: string[]): void {
  const text = readFileSync(join(ROOT, "LICENSE"), "utf8");
  if (!text.includes("Lauren Tan")) problems.push("LICENSE: missing the upstream copyright holder");
  if (!/\bMIT\b/.test(text)) problems.push("LICENSE: missing the MIT license");
}

function checkIntroScope(problems: string[]): void {
  const existing = new Set(skillDirectories());
  for (const [skill, reason] of Object.entries(INTRO_SKILLS)) {
    if (!existing.has(skill)) problems.push(`INTRO_SKILLS: unknown skill "${skill}"`);
    if (reason.trim() === "") problems.push(`INTRO_SKILLS: "${skill}" needs a reason`);
  }
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

function emptyCategories(): Record<SkillCategory, number> {
  return { copy: 0, "intro-only": 0, patched: 0 };
}

function emptyReport(problems: readonly string[]): AssetsReport {
  return {
    skills: 0,
    skillFiles: 0,
    bundledSkills: 0,
    agents: 0,
    guideMarkdown: 0,
    guideImages: 0,
    executables: 0,
    markdownFiles: 0,
    linksChecked: 0,
    linksSkipped: 0,
    categories: emptyCategories(),
    placeholders: [],
    capabilityTokens: [],
    problems,
  };
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

const ASSETS_PREFIX = "assets/";
const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
