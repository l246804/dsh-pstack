import { Buffer } from "node:buffer";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADAPTER_ASSET,
  ADAPTER_SOURCE,
  checkAdapterDoc,
} from "./adapter.ts";
import {
  AGENTS_PREFIX,
  ASSETS_ROOT,
  EXCLUDED_SKILLS,
  GUIDE_PREFIX,
  ROOT,
  SKILLS_PREFIX,
  UPSTREAM_ROOT,
  classifySkills,
  renderSkill,
  retargetLinks,
  skillDirectories,
  walkUpstream,
} from "./build-assets.ts";
import type { SkillCategory } from "./build-assets.ts";
import { SKILLS_EXT_ROOT, isLocal, readSources } from "./sync-skills-ext.ts";
import { RUNTIME_CLIS, RUNTIME_ENTRIES, isReplacedUpstreamScript } from "./runtime-manifest.ts";
import { WORKTREE_ROWS, worktreeRowGuardExpression } from "./worktree-mount.ts";
import {
  PSTACK_MODELS_EXAMPLE_PATH,
  ROLE_MANIFEST,
  renderPstackModelsExample,
} from "./role-manifest.ts";
import {
  AGENT_DROPPED_FIELDS,
  SKILL_DROPPED_FIELDS,
  parseFrontmatter,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} from "../src/frontmatter.ts";
import { loadBundledSkillIndex, loadSourcedSkillIndex } from "../src/provider.ts";
import { parseRoleFile } from "../src/models.ts";

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
  readonly problems: readonly string[];
}

export function checkAssets(): AssetsReport {
  const problems: string[] = [];

  if (!existsSync(ASSETS_ROOT)) {
    return emptyReport(["assets/: missing; run `pnpm run build:assets` first"]);
  }

  checkLayout(problems);
  checkStaticDirectory(problems);
  const skills = checkSkills(problems);
  const bundledSkills = checkBundledSkills(problems);
  const agents = checkAgents(problems);
  const guide = checkGuide(problems);
  checkUndeclaredFiles(problems);
  checkAdapterAsset(problems);
  for (const problem of checkAssetsHostCopy()) problems.push(problem);
  for (const problem of scanReleaseCopy(collectReleaseCopy())) problems.push(problem);
  for (const problem of checkPlaybookClaims()) problems.push(problem);
  checkRoleAssets(problems);
  checkLicense(problems);
  checkPackageManifest(problems);
  for (const problem of checkScriptReferences()) problems.push(problem);
  for (const problem of checkScriptIdReferences()) problems.push(problem);
  for (const problem of checkSkillsExt()) problems.push(problem);

  if (skills.count !== 55) problems.push(`assets: expected 55 skills, found ${skills.count}`);
  // "Upstream skill files, minus the ones a built artifact replaces, plus the artifacts
  // themselves". Derived rather than hardcoded, so it stays honest when the runtime
  // manifest changes.
  const expectedSkillFiles =
    skillDirectories()
      .filter((skill) => !EXCLUDED_SKILLS.includes(skill))
      .reduce(
        (total, skill) =>
          total +
          walkUpstream(`${SKILLS_PREFIX}${skill}`).filter(
            (path) => !isReplacedUpstreamScript(path),
          ).length,
        0,
      ) + RUNTIME_ENTRIES.filter((entry) => entry.assetPath.startsWith("skills/")).length;
  if (skills.files !== expectedSkillFiles) {
    problems.push(`assets: expected ${expectedSkillFiles} skill files, found ${skills.files}`);
  }
  if (agents !== 2) problems.push(`assets: expected 2 agents, found ${agents}`);
  if (guide.markdown !== 11)
    problems.push(`assets: expected 11 guide Markdown files, found ${guide.markdown}`);
  if (guide.images !== 6) problems.push(`assets: expected 6 guide images, found ${guide.images}`);
  if (skills.categories.copy + skills.categories.pointer + skills.categories.stripped !== 55) {
    problems.push("assets: skill categories do not cover all 55 skills");
  }

  const markdown = walkFiles(ASSETS_ROOT)
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({ file: toRepositoryPath(file), text: readFileSync(file, "utf8") }));

  // An excluded skill is still linked from upstream prose on purpose: the generator
  // retargets those links at the upstream file on GitHub, so a reader can follow the
  // reference and the adapter says the skill is not carried. A relative link that
  // survives into the tree would dangle instead, and `danglingLinks` catches it during
  // the build.
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

/**
 * The links that are deliberately not paths, because they appear in a copy-paste
 * template rather than in a sentence about a file.
 *
 * This is an allowlist rather than a guess about the target's shape. The old rule
 * was "no `/` and no `.` in the target means it is a placeholder", which classified
 * `LICENSE` — a real shipped file — as a template link and skipped it, so a typo in
 * `[the license](LICENCE)` would never have failed. Anything not named here is
 * resolved and must exist.
 */
const TEMPLATE_PLACEHOLDERS: readonly string[] = [
  "url",
  "link",
  "pr-url",
  "<url>",
  "#",
];

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
      // A declared template placeholder is skipped; an undeclared one is a problem,
      // so the list cannot silently grow by dropping a real file from the check.
      if (TEMPLATE_PLACEHOLDERS.includes(link.target.toLowerCase())) {
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

  console.log(
    [
      "assets check",
      `  skills            ${report.skills} (copy ${report.categories.copy}, pointer ${report.categories.pointer}, stripped ${report.categories.stripped})`,
      `  skill files       ${report.skillFiles}`,
      `  bundled skills    ${report.bundledSkills}`,
      `  agents            ${report.agents}`,
      `  guide             ${report.guideMarkdown} md, ${report.guideImages} images`,
      `  executables       ${report.executables}`,
      `  markdown files    ${report.markdownFiles}`,
      `  links checked     ${report.linksChecked}`,
      `  links skipped     ${report.linksSkipped}`,
    ].join("\n"),
  );

  for (const placeholder of report.placeholders) {
    console.log(
      `  template link     ${placeholder.file}:${placeholder.line} -> ${placeholder.target}`,
    );
  }

  if (report.problems.length === 0) {
    console.log("assets check passed");
    return 0;
  }

  console.error(`assets check failed (${report.problems.length} problem(s)):`);
  for (const problem of report.problems) console.error(`  ${problem}`);
  return 1;
}

/**
 * Audit the hand-maintained static directory against its declared contents.
 *
 * A new file under `static/` reaches the published package through `files`, so
 * an undeclared one ships without a decision covering it. The declared list is
 * the record of what this package authored; nested directories are refused so
 * the inventory stays a flat, reviewable list.
 */
function checkStaticDirectory(problems: string[]): void {
  if (!existsSync(STATIC_ROOT)) {
    problems.push("static/: missing; it holds the packaged static resources");
    return;
  }
  const actual = walkFiles(STATIC_ROOT).map((file) => toRepositoryPath(file).slice(STATIC_PREFIX.length));
  for (const problem of staticInventoryProblems(STATIC_FILES, actual)) problems.push(problem);
  for (const problem of readmeImageProblems(STATIC_FILES, readFileSync(join(ROOT, "README.md"), "utf8")))
    problems.push(problem);
}

/** The inventory rule on its own, so a test can feed it a directory listing. */
export function staticInventoryProblems(
  declared: readonly string[],
  actual: readonly string[],
): readonly string[] {
  const problems: string[] = [];
  reportSetDifference(problems, "static", [...declared].sort(), actual);
  for (const name of actual) {
    if (name.includes("/")) problems.push(`static/${name}: nested entries are not allowed`);
  }
  return problems;
}

/**
 * README images are the one place a static file is addressed by path, and a
 * rename there breaks the first thing a reader sees. HTML `<img>` is not a
 * Markdown link, so the link checker never sees it.
 */
export function readmeImageProblems(
  declared: readonly string[],
  readme: string,
): readonly string[] {
  const problems: string[] = [];
  for (const match of readme.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)) {
    const target = match[1] as string;
    if (/^[A-Za-z][A-Za-z\d+.-]*:/u.test(target)) continue;
    if (!target.startsWith(STATIC_PREFIX)) {
      problems.push(`README.md: image "${target}" must live under ${STATIC_PREFIX}`);
      continue;
    }
    const name = target.slice(STATIC_PREFIX.length);
    if (!declared.includes(name)) {
      problems.push(`README.md: image "${target}" is not a declared static file`);
    }
  }
  return problems;
}

function checkLayout(problems: string[]): void {
  // Three generated top-level directories, and nothing else. The vendored
  // third-party tree is not here: it lives in `skills-ext/` beside `assets/`,
  // because this directory is replaced wholesale on every `build:assets` and a tree
  // that must survive that belongs outside it.
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
  const allowedDocFiles = new Set([PSTACK_MODELS_EXAMPLE_PATH.replace("docs/", "")]);
  for (const entry of readdirSync(join(ASSETS_ROOT, "docs"), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!allowedDocs.has(entry.name)) {
        problems.push(`assets/docs/${entry.name}: unexpected entry`);
      }
      continue;
    }
    if (!entry.isFile() || !allowedDocFiles.has(entry.name)) {
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

  const excluded = new Set(EXCLUDED_SKILLS);
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

    // A script directory ships as built artifacts, so its upstream sources are
    // neither expected nor unexpected when absent; both sides are compared on the
    // same rule instead of one list being treated as the whole truth.
    const skillPrefix = `${SKILLS_PREFIX}${skill}/`;
    const upstreamFiles = walkUpstream(`${SKILLS_PREFIX}${skill}`)
      .filter((path) => !isReplacedUpstreamScript(path))
      .map((path) => path.slice(skillPrefix.length));
    const declaredScripts = RUNTIME_ENTRIES.filter((entry) =>
      entry.assetPath.startsWith(skillPrefix),
    ).map((entry) => entry.assetPath.slice(skillPrefix.length));
    const expectedFiles = [...upstreamFiles, ...declaredScripts].sort();

    const assetFiles = walkFiles(join(assetsSkills, skill))
      .map((file) => relative(join(assetsSkills, skill), file).split(sep).join("/"))
      .sort();
    files += assetFiles.length;

    for (const path of expectedFiles) {
      if (!assetFiles.includes(path)) problems.push(`assets/skills/${skill}/${path}: missing`);
    }
    for (const path of assetFiles) {
      if (!expectedFiles.includes(path))
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

      const expectedBody = parseFrontmatter(renderSkill(sourceText, skillFile)).body;
      if (assetData.body !== expectedBody) {
        problems.push(`assets/${skillFile}: body differs from a fresh build (${category})`);
      }

      for (const path of upstreamFiles) {
        if (path === "SKILL.md") continue;
        const upstreamPath = `${SKILLS_PREFIX}${skill}/${path}`;
        const asset = readFileSync(join(ASSETS_ROOT, upstreamPath));
        const source = readFileSync(join(UPSTREAM_ROOT, upstreamPath));
        const expectedBytes = Buffer.from(
          retargetLinks(source.toString("utf8")),
          "utf8",
        );
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
      const sourceText = readFileSync(join(UPSTREAM_ROOT, path), "utf8");
      const source = parseFrontmatter(sourceText);
      const asset = parseFrontmatter(readFileSync(join(assetsAgents, name), "utf8"));
      const frontmatter = validateAgentFrontmatter(asset.data, `assets/${path}`);

      if (frontmatter.name !== name.replace(/\.md$/, "")) {
        problems.push(`assets/${path}: name "${frontmatter.name}" does not match its file name`);
      }
      if (asset.body !== retargetLinks(source.body)) {
        problems.push(`assets/${path}: body differs from a fresh build`);
      }
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
    // Only Markdown carries links. Decoding a binary through a string and re-encoding it
    // corrupts the bytes, so images are compared as what they are.
    const expectedBytes = path.endsWith(".md")
      ? Buffer.from(retargetLinks(source.toString("utf8")), "utf8")
      : source;
    if (!asset.equals(expectedBytes))
      problems.push(`assets/${GUIDE_PREFIX}${path}: differs from its source`);
  }

  const markdown = actual.filter((name) => name.endsWith(".md")).length;
  return { markdown, images: actual.length - markdown };
}

/**
 * Every asset must come from an upstream file or the runtime build.
 *
 * The two generated documents and the built scripts are the agreed exceptions.
 * Without the runtime list, nine artifacts would each read as an undeclared file.
 *
 * This now needs no exclusion for another origin: every directory under `assets/`
 * that holds copied upstream text is walked here, and the rest of the tree is the
 * generated set named above. The vendored third-party tree needs no exclusion because
 * it is not in `assets/` at all — it is `skills-ext/`, beside it, checked by
 * `checkSkillsExt`.
 */
function checkUndeclaredFiles(problems: string[]): void {
  const covered = [
    join(ASSETS_ROOT, "skills"),    join(ASSETS_ROOT, "agents"),
    join(ASSETS_ROOT, "docs", "guide"),
  ];
  const generated = new Set([
    ADAPTER_ASSET,
    PSTACK_MODELS_EXAMPLE_PATH,
    ...RUNTIME_ENTRIES.map((entry) => entry.assetPath),
  ]);
  for (const root of covered) {
    for (const file of walkFiles(root)) {
      const assetRelative = toRepositoryPath(file).slice(ASSETS_PREFIX.length);
      if (generated.has(assetRelative)) continue;
      if (!existsSync(join(UPSTREAM_ROOT, assetRelative))) {
        problems.push(`${toRepositoryPath(file)}: no upstream source`);
      }
    }
  }
}

/**
 * The adapter document answers for every Cursor name the shipped prose uses.
 *
 * The requirement is derived from the tree that actually ships, so no hand-maintained
 * list of differences can fall out of date. Two earlier shapes are worth not repeating:
 * a generated capability table, then a hand-written divergence ledger with a count and
 * a member check. Both stayed green while the tree drifted, because both checked what
 * someone had written down about the tree instead of the tree.
 *
 * The document is a source file copied in unchanged, not a generated one. A generator
 * can render a table; it cannot decide what a reader should do with a no-write child on
 * a host that offers no sandbox for one, and generating the rows would put that judgement
 * back inside the code this shape exists to keep it out of.
 */
function checkAdapterAsset(problems: string[]): void {
  const assetPath = join(ASSETS_ROOT, ADAPTER_ASSET);
  const sourcePath = join(ROOT, ADAPTER_SOURCE);
  if (!existsSync(sourcePath)) {
    problems.push(
      `${ADAPTER_SOURCE}: missing; it is the only place a host difference is written down`,
    );
    return;
  }
  if (!existsSync(assetPath)) {
    problems.push(`assets/${ADAPTER_ASSET}: missing; run \`pnpm run build:assets\` first`);
    return;
  }

  const source = readFileSync(sourcePath, "utf8");
  if (readFileSync(assetPath, "utf8") !== source) {
    problems.push(`assets/${ADAPTER_ASSET}: differs from ${ADAPTER_SOURCE}`);
    return;
  }

  // Every shipped Markdown file is prose a reader may follow, so every one is in scope.
  // Restricting this to skills would let a guide page introduce a name the adapter never
  // answers for.
  const texts = walkFiles(ASSETS_ROOT)
    .filter((file) => file.endsWith(".md"))
    .map((file) => readFileSync(file, "utf8"));

  for (const problem of checkAdapterDoc(source, texts)) problems.push(problem);
}

/**
 * The one install command form, and the one role-file path, the shipped copy may
 * show.
 *
 * A reader follows these literally. Two spellings of the same install, or a path
 * that only resolves on another host, is a defect review catches late, so the
 * release gate checks it mechanically instead of trusting a read-through.
 */
const INSTALL_COMMAND_PREFIX = "dsh plugin --profile <profile> ";

/** The role file's basename, without the `$DSH_HOME/` prefix. */
const ROLE_FILE_BASENAME = "pstack-models.md";

/** The shipped example's basename, which a reader may name package-relatively. */
const ROLE_FILE_EXAMPLE_BASENAME = "pstack-models.example.md";
/**
 * The one directory for hand-maintained static resources.
 *
 * `assets/` is generated from upstream and refuses undeclared files, so artwork
 * this package authors itself needs somewhere else. New static files are added
 * here and to `STATIC_FILES` in the same change; anything else under `static/`
 * is a file shipped without review.
 */
const STATIC_ROOT = join(ROOT, "static");
const STATIC_FILES: readonly string[] = ["icon.png"];

/**
 * Install commands belonging to a host this package is not.
 *
 * Applies to the copy this repository authors. Upstream skill bodies and guide pages
 * name `/add-plugin pstack` because that is how pstack installs into Cursor, and the
 * adapter document says what installation is here; rewriting them is the work this
 * shape removed.
 */
const FOREIGN_INSTALL_TOKENS: readonly string[] = [
  "/add-plugin",
  "plugin marketplace",
  "/plugin install",
];

/**
 * Promises in shipped prose that would be false on this host.
 *
 * Shipped skill bodies are upstream text, so they name Cursor mechanisms freely. That is
 * expected and is the adapter document's job to translate. What is not expected is a
 * sentence that *recommends* one of these as an action, because a reader who follows it
 * calls something that does not exist here.
 *
 * This is a promise rule, not a vocabulary rule. Naming `/loop` to say the host has no
 * such command is correct and must pass; telling a reader to run `/loop 1h` is the
 * defect. `excludesTerm` decides per clause, so both cases land where they belong.
 *
 * Only mechanisms that a skill would otherwise *instruct* a reader to use are listed.
 * `automation` is not matched bare: "browser automation" and "review-automation
 * comments" are ordinary technical English about testing and PR comments.
 */
const FALSE_PROMISES: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "/loop", pattern: /\/loop\b/ },
  { label: "a cloud agent", pattern: /cloud agents?\b/i },
  { label: "a Cursor Project", pattern: /Cursor Projects?\b/ },
  { label: "make-bot-ui", pattern: /make-bot-ui/ },
  {
    label: "Cursor Automations",
    pattern: /(?<![-\w])(?:\bAutomations\b|Cursor Automations?|scheduled automations?\b|nightly automations?\b)/,
  },
];

/**
 * Where one clause ends and the next begins.
 *
 * Sentence punctuation, a colon, and a contrastive conjunction. The colon matters
 * for the exact shapes that shipped: "No waiting: use /loop" puts the negation in
 * the lead-in and the recommendation after it, so treating the colon as ordinary
 * punctuation made the whole line one "excluding" clause. A comma stays inside the
 * clause, because "no cloud agents, so run it locally" excludes the term.
 */
const CLAUSE_SPLIT = /(?<=[.;!?:])\s+|\s+(?:but|however|instead|yet)\b\s*/i;

/**
 * A sentence counts as excluding a term when it reports the term as absent.
 *
 * Applied per clause by `excludesTerm`; the list itself is the vocabulary of
 * negation, not the whole rule. `without` is deliberately absent: it negates
 * whatever follows it, which in "ship without review by adding automations" is the
 * review, so `excludesTerm` checks it against the term's own window instead.
 */
const EXCLUSION_MARKERS: readonly RegExp[] = [
  /\bno\b/i,
  /\bnone\b/i,
  /\bnot\b/i,
  /\bnever\b/i,
  /\bexcluded\b/i,
  /\bunsupported\b/i,
  /\bcannot\b/i,
  /\bdoes not\b/i,
  /\bhas no\b/i,
  /\bis not\b/i,
];

/**
 * Negations that follow the term, because Chinese puts them there.
 *
 * "`make-bot-ui` 不在支持范围" is an exclusion, and its marker sits after the term.
 * Kept separate from `EXCLUSION_MARKERS` so the English side stays a pure
 * "negation before the term" rule.
 */
const CJK_EXCLUSION_MARKERS: readonly RegExp[] = [/没有/, /不在/, /不支持/, /无等价/, /不可用/];

/**
 * Whether a line names `term` in order to say the host lacks it.
 *
 * The previous rule was "this line contains any negation word", which is a
 * different question and passes sentences that *recommend* the very thing the
 * capability table calls unavailable:
 *
 *     "No waiting: use /loop and let it run until done."
 *     "Never skip it: run /make-bot-ui to build the page."
 *     "Ship without review by adding automations that fire nightly."
 *
 * Each has a negation word and none of them excludes anything. So the negation has
 * to be in the same clause as the term, and before it:
 *
 * 1. Take the clause the term sits in, cutting at sentence punctuation and at
 *    contrastive conjunctions ("no cloud agents, but /loop keeps going" does not
 *    exclude `/loop`).
 * 2. Require a negation marker before the term inside that clause.
 *
 * This is still a lexical check, not a parser, so it is deliberately conservative in
 * one direction: an unusual paraphrase that does exclude a term may be reported, and
 * the fix is then to phrase the exclusion plainly. The opposite error — silently
 * accepting a recommendation — is the one that shipped.
 */
export function excludesTerm(line: string, term: RegExp): boolean {
  const match = term.exec(line);
  if (match === null) return false;
  const start = match.index ?? 0;
  const end = start + match[0].length;

  // The clause the term appears in, up to and including the term itself.
  const before = line.slice(0, start);
  const clause = `${before.split(CLAUSE_SPLIT).at(-1) ?? ""}${match[0]}`;

  // A Chinese exclusion can put the negation on either side of the term —
  // "`make-bot-ui` 不在支持范围" and "专属能力没有等价物，包括 Automations" are both
  // exclusions. So the CJK markers are checked against the whole line: they are
  // unambiguous (no technical English uses 不支持 to recommend something), and the
  // English markers cannot match them.
  if (CJK_EXCLUSION_MARKERS.some((marker) => marker.test(line))) return true;

  // Negation before the term, in the same clause.
  if (EXCLUSION_MARKERS.some((marker) => marker.test(clause))) return true;

  // English can also negate *after* the term: "Cursor Project is not supported on
  // this host", "X has no equivalent". Only a short predicate directly after the
  // term counts, so "use /loop. There is no reason to wait" does not become an
  // exclusion of `/loop`.
  const after = (line.slice(end).split(CLAUSE_SPLIT)[0] ?? "").trimStart();
  if (/^(?:is|are|was|were|has|have|can|could|will|would|does|do)\s+(?:not|never)\b/i.test(after)) {
    return true;
  }
  if (/^(?:is|are)\s+(?:unsupported|excluded|unavailable|not supported)\b/i.test(after)) return true;
  if (/^(?:has|have)\s+no\b/i.test(after)) return true;

  // "without" is the one marker a recommendation can carry: "ship without review by
  // adding automations" negates the *review*, not the automation. It only excludes
  // when it binds directly to the term — "without /loop", "no support for cloud
  // agents" — so it is checked against a window ending at the term, and the term has
  // to be the thing the preposition governs.
  const window = line.slice(Math.max(0, start - 32), end);
  const binding = /(?:\bwithout|\bno support for|\bthere (?:is|are) no|\bhas no|\bhave no)\s+(?:[\w`/-]+\s+){0,2}$/.exec(
    window,
  );
  return binding !== null;
}

/** The number of ported playbooks, so a dropped file is visible. */
const PLAYBOOK_COUNT = 23;

export interface ReleaseCopyInput {
  readonly file: string;
  readonly text: string;
  /**
   * Whether the marketing-term placement rule applies.
   *
   * It is a rule about the reader-facing pages, where a promise to add a Cursor
   * feature would be read as a claim about this host. A skill body may name browser
   * automation as a testing technique, and that sentence is not a promise.
   */
  readonly exclusions?: boolean;
}

/**
 * Audit one body of shipped copy against the release rules.
 *
 * Exported so a test can prove the rules fire on a known-bad fixture instead of
 * only observing that the real tree happens to pass.
 */
export function scanReleaseCopy(inputs: readonly ReleaseCopyInput[]): readonly string[] {
  const problems: string[] = [];

  for (const { file, text, exclusions = true } of inputs) {
    if (exclusions) {
      for (const token of FOREIGN_INSTALL_TOKENS) {
        for (const found of findLines(text, token)) {
          problems.push(
            `${file}:${found.number}: install command from another host (${JSON.stringify(token)})`,
          );
        }
      }
    }

    for (const found of findLines(text, "dsh plugin")) {
      if (!found.text.includes("--profile <profile>")) {
        problems.push(
          `${file}:${found.number}: "dsh plugin" must name the profile as --profile <profile>`,
        );
      }
    }

    for (const match of text.matchAll(/\b(?:add|remove) dsh-pstack(?:@latest)?/g)) {
      const start = match.index ?? 0;
      const before = text.slice(Math.max(0, start - INSTALL_COMMAND_PREFIX.length), start);
      if (before !== INSTALL_COMMAND_PREFIX) {
        problems.push(
          `${file}: ${JSON.stringify(match[0])} must be written as "${INSTALL_COMMAND_PREFIX}${match[0]}"`,
        );
      }
    }

    // The shipped role-file example is this package's own text, so it has exactly one
    // name. A skill body is upstream text and may name the Cursor rules file; the
    // adapter document says what that becomes here.
    for (const match of text.matchAll(/pstack-models[\w.-]*\.md/g)) {
      const found = match[0];
      if (found === ROLE_FILE_BASENAME || found === ROLE_FILE_EXAMPLE_BASENAME) continue;
      const line = text.slice(0, match.index ?? 0).split("\n").length;
      problems.push(
        `${file}:${line}: a role file name must be ${ROLE_FILE_BASENAME} or ` +
          `${ROLE_FILE_EXAMPLE_BASENAME}; found ${JSON.stringify(found)}`,
      );
    }
    // The repository's own copy is held to the promise rule; a skill body is upstream
    // text and is not. `exclusions: false` is how a caller says so.
    if (!exclusions) continue;
    for (const line of linesOf(text)) {
      for (const term of FALSE_PROMISES) {
        if (!term.pattern.test(line.text)) continue;
        if (excludesTerm(line.text, term.pattern)) continue;
        problems.push(
          `${file}:${line.number}: promises ${term.label}, which this host does not have: ${JSON.stringify(line.text.slice(0, 120))}`,
        );
      }
    }
  }
  return problems;
}

/**
 * Every shipped file this package generates, checked for the other host's name.
 *
 * The whole generated tree is in scope, not just Markdown: a resource file or a
 * script comment is shipped copy too. `scripts/patches.ts` is out of scope on
 * purpose, because it keeps upstream wording or `sync` stops matching.
 *
 * The vendored third-party tree is absent here for a different reason: it is not in
 * `assets/`. Its authors write for whatever hosts they support, and rewriting their
 * wording would break the content hash that proves the copy still matches the pinned
 * revision, so it would have needed an exclusion either way. Living outside the
 * generated tree means this walk never reaches it, and the exclusion is unnecessary
 * rather than merely switched off. A vendored skill that gave Claude-specific
 * instructions is caught by review of its provenance entry, not by this name grep.
 */
export function checkAssetsHostCopy(): readonly string[] {
  const problems: string[] = [];
  for (const file of repositoryOwnedShippedFiles()) {
    const repositoryPath = toRepositoryPath(file);
    // The adapter document quotes upstream names in backticks and fenced blocks to say
    // what each one becomes here. That is its purpose, so those spans are exempt.
    const raw = readFileSync(file, "utf8");
    const text =
      repositoryPath === `assets/${ADAPTER_ASSET}` ? raw.replace(/`[^`]*`/g, "").replace(/```[sS]*?```/g, "") : raw;
    const hits = otherHostMentionCount(text);
    if (hits > 0) {
      problems.push(
        `${repositoryPath}: names Claude ${hits} time(s); this package's own copy is the DSH build and ships no other host's install text`,
      );
    }
  }
  return problems;
}

/**
 * Shipped files whose text this repository authors, rather than upstream.
 *
 * The split matters for every rule phrased as "do not mention another host": upstream
 * pstack says `Task`, `/loop`, and the Claude Code adapter, and the shipped tree keeps
 * that text on purpose. Only the copy written here has to be about this host.
 */
function repositoryOwnedShippedFiles(): readonly string[] {
  return [
    join(ASSETS_ROOT, ADAPTER_ASSET),
    join(ASSETS_ROOT, PSTACK_MODELS_EXAMPLE_PATH),
    ...RUNTIME_CLIS.map((entry) => join(ASSETS_ROOT, entry.assetPath)),
  ].filter((file) => existsSync(file));
}

/** Case-insensitive mention count for the other host's name in one body of text. */
export function otherHostMentionCount(text: string): number {
  return countOccurrences(text.toLowerCase(), "claude");
}

/** The shipped copy this repository authors, which the release rules apply to. */
export function collectReleaseCopy(): readonly ReleaseCopyInput[] {
  const inputs: ReleaseCopyInput[] = [
    { file: "README.md", text: readFileSync(join(ROOT, "README.md"), "utf8") },
  ];
  // Guide pages and skill bodies are upstream prose. They name `/loop`, cloud agents, and
  // the Cursor adapters because that is what pstack says, and the adapter document is
  // where a reader learns what each becomes on this host. The install-command rule still
  // applies to them, because a shipped install line a reader would follow has to be this
  // package's; the promise rule does not.
  for (const root of [join(ASSETS_ROOT, "docs", "guide"), join(ASSETS_ROOT, "skills")]) {
    for (const file of walkFiles(root)) {
      if (!file.endsWith(".md")) continue;
      inputs.push({
        file: toRepositoryPath(file),
        text: readFileSync(file, "utf8"),
        exclusions: false,
      });
    }
  }
  return inputs;
}

/**
 * Check that every *shipped* script path the prose names actually exists.
 *
 * Four pieces of copy told a reader to run a file that was not in the tree:
 * `scripts/log.sh` (only `log.mjs` ships), `scripts/orch/orch.ts` (only
 * `orch/orch.mjs`), a bare `scripts/watch-pr/watch-pr`, and a `check-plan.mjs` run
 * through a `node` the Desktop build does not have on PATH. Each was fixed by hand,
 * and nothing stopped the next rename from reintroducing the same class of mistake.
 *
 * The rule: a backticked `…/scripts/<name>.mjs` path in a shipped Markdown file
 * must resolve to a file under `assets/`. `.mjs` is the extension of every artifact
 * that actually ships, so a reference with it is a claim the reader can act on.
 *
 * Two things are deliberately out of scope:
 *
 * - `.ts` and `.sh` references are *this repository's* build scripts
 *   (`scripts/check-assets.ts`, `scripts/capabilities.ts`) or upstream's shell
 *   originals. They never ship and the reader is not meant to run them, so
 *   requiring them under `assets/` would be wrong. Their correctness is covered by
 *   `pnpm run check` itself, which is what runs them.
 * - A path is resolved beside the file that names it, because that is how the
 *   reader resolves it: `scripts/log.mjs` inside `skills/show-me-your-work/SKILL.md`
 *   means `skills/show-me-your-work/scripts/log.mjs`. The asset root is tried too,
 *   so a guide may name a path from the package root.
 *
 * `SCRIPT_REFERENCE_ALLOWLIST` carries any `.mjs` reference that is intentionally
 * not a shipped path. Each entry states a reason, so the list cannot quietly absorb
 * a real breakage.
 *
 * The list is **empty on purpose**. It previously held `scripts/check-plan.mjs`,
 * described as "the plan template names the checker by bundle-relative path as an
 * illustration" — but once §9 retargeted that line at `pstack_script` with
 * `id: "check-plan"`, no such reference existed anywhere in `assets/`. The entry
 * matched nothing and described a situation that had stopped existing, so it was
 * removed rather than left as an example of an exemption nobody needs. Every `.mjs`
 * path reference in shipped prose must now resolve.
 */
const SCRIPT_REFERENCE_ALLOWLIST: readonly {
  readonly reference: string;
  readonly reason: string;
}[] = [];

/**
 * A `pstack_script` call whose `id` names a bundled CLI.
 *
 * The window stops at the next sentence boundary (`.` or newline within 120
 * characters), which is what keeps an unrelated `id:` field out of the match: the
 * watch-pr fixtures contain `headRefOid: "head"` and similar, and an unbounded
 * pattern reported eleven of those as bad script ids.
 */
const SCRIPT_ID_REFERENCE = /`pstack_script`[^\n.]{0,120}?\bid: \\?"([a-z0-9][a-z0-9-]*)\\?"/g;

/**
 * Every `id` the prose passes to `pstack_script` must name a shipped CLI.
 *
 * The sibling check above validates *paths*, and paths are no longer how the prose
 * reaches these scripts: `shipping.md`, `orchestrate.md`, `worktree-cleanup.md`, and
 * `multi-phase-plan.md` all say `` `pstack_script` with `id: "…"` ``. A typo there
 * (`id: "watch-prr"`) is a call the tool rejects at runtime, and nothing caught it —
 * the path check does not match it and `id` is not otherwise audited.
 *
 * The truth source is `RUNTIME_CLIS`, the same list `pstack_script`'s closed enum is
 * built from, so the two cannot disagree. `RUNTIME_TESTS` ids are excluded because the
 * tool cannot be asked to run a test bundle.
 */
export function checkScriptIdReferences(): readonly string[] {
  const problems: string[] = [];
  const known = new Set(RUNTIME_CLIS.map((entry) => entry.id));

  for (const file of walkFiles(ASSETS_ROOT).filter((path) => path.endsWith(".md"))) {
    const repositoryPath = toRepositoryPath(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(SCRIPT_ID_REFERENCE)) {
      const id = match[1] as string;
      if (known.has(id)) continue;
      const line = text.slice(0, match.index).split("\n").length;
      problems.push(
        `${repositoryPath}:${line}: passes id ${JSON.stringify(id)} to pstack_script, but no ` +
          `shipped CLI has that id (known: ${[...known].join(", ")})`,
      );
    }
  }
  return problems;
}

/**
 * A `.mjs` path with a `scripts/` segment, as it appears inside a code span.
 *
 * `.mjs` only: that is the extension of every artifact that ships, so a reference
 * with it is a claim a reader can act on. `.ts` and `.sh` references point at this
 * repository's own build scripts or at upstream's shell originals, neither of which
 * ships and neither of which the prose is telling the reader to run.
 *
 * The match stops at `.mjs` and does **not** require a closing backtick. A code span
 * usually continues with the arguments — `` `scripts/log.mjs <logfile> <phase>` `` —
 * and requiring the backtick there made the pattern match only the one shape that
 * never occurs, so it silently reported nothing.
 *
 * The leading segment is optional (`(?:[\w./-]*\/)?`) rather than repeated
 * (`(?:[\w.-]+\/)*`): the repeated form demands a directory between the path start
 * and `scripts`, so a bare `scripts/log.mjs` would not match.
 */
const SCRIPT_REFERENCE = /((?:[\w./-]*\/)?scripts\/[\w./-]+\.mjs)\b/g;

export function checkScriptReferences(): readonly string[] {
  const problems: string[] = [];
  const allowlisted = new Set(SCRIPT_REFERENCE_ALLOWLIST.map((entry) => entry.reference));

  for (const file of repositoryOwnedShippedFiles().filter((path) => path.endsWith(".md"))) {
    const repositoryPath = toRepositoryPath(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(SCRIPT_REFERENCE)) {
      const reference = match[1] as string;
      if (allowlisted.has(reference)) continue;
      // The adapter document quotes upstream's own invocation beside the replacement.
      if (repositoryPath === `assets/${ADAPTER_ASSET}`) continue;
      const beside = join(dirname(file), reference);
      if (existsSync(beside) || existsSync(join(ASSETS_ROOT, reference))) continue;
      const line = text.slice(0, match.index).split("\n").length;
      problems.push(
        `${repositoryPath}:${line}: names \`${reference}\`, which is not in the shipped tree ` +
          `(looked for ${toRepositoryPath(beside)})`,
      );
    }
  }
  return problems;
}

/**
 * Check the playbook promise against the playbook directory.
 *
 * `poteto-help` states that every playbook in `poteto-mode`'s list is ported and
 * that each dependent one names its gate. Both halves are data: 23 files exist,
 * every file is listed, and every gate the claim names is stated in the body of
 * the playbook it names.
 */
export function checkPlaybookClaims(): readonly string[] {
  const problems: string[] = [];
  const directory = join(ASSETS_ROOT, "skills", "poteto-mode", "playbooks");
  if (!existsSync(directory)) {
    return ["assets/skills/poteto-mode/playbooks: missing the ported playbooks"];
  }

  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .sort();
  if (files.length !== PLAYBOOK_COUNT) {
    problems.push(
      `assets/skills/poteto-mode/playbooks: expected ${PLAYBOOK_COUNT} playbooks, found ${files.length}`,
    );
  }

  const listingPath = join(ASSETS_ROOT, "skills", "poteto-mode", "SKILL.md");
  const listing = existsSync(listingPath) ? readFileSync(listingPath, "utf8") : "";
  const listed: string[] = [];
  for (const line of linesOf(playbooksSection(listing))) {
    const title = /^- \*\*([^*]+?)\.\*\*/.exec(line.text);
    if (title === null) continue;
    const explicit = /File: `playbooks\/([^`]+)`/.exec(line.text);
    listed.push(explicit?.[1] ?? `${kebabCase(title[1] as string)}.md`);
  }
  reportSetDifference(
    problems,
    "assets/skills/poteto-mode/SKILL.md playbooks",
    files,
    [...new Set(listed)].sort(),
  );

  return problems;
}

interface TextLine {
  readonly number: number;
  readonly text: string;
}

function linesOf(text: string): readonly TextLine[] {
  return text.split("\n").map((line, index) => ({ number: index + 1, text: line }));
}

function findLines(text: string, token: string): readonly TextLine[] {
  return linesOf(text).filter((line) => line.text.includes(token));
}

function kebabCase(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

/** The `## Playbooks` section of a skill body, up to the next level-2 heading. */
function playbooksSection(body: string): string {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Playbooks");
  if (start === -1) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if ((lines[index] as string).startsWith("## ")) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/**
 * Audit the generated role-file example and the skill that reads it.
 *
 * The example is the only place the role list appears in shipped text, and it is
 * generated from the manifest. The `setup-pstack` skill points at it instead of
 * restating the keys, so a hand-written copy cannot drift from the parser.
 */
function checkRoleAssets(problems: string[]): void {
  const path = join(ASSETS_ROOT, PSTACK_MODELS_EXAMPLE_PATH);
  if (!existsSync(path)) {
    problems.push(
      `assets/${PSTACK_MODELS_EXAMPLE_PATH}: missing; setup-pstack reads it for the role list`,
    );
    return;
  }

  const text = readFileSync(path, "utf8");
  if (text !== renderPstackModelsExample()) {
    problems.push(
      `assets/${PSTACK_MODELS_EXAMPLE_PATH}: differs from the renderer in scripts/role-manifest.ts`,
    );
  }
  for (const role of ROLE_MANIFEST) {
    const count = text.split(`\n${role.key}: `).length - 1 + (text.startsWith(`${role.key}: `) ? 1 : 0);
    if (count !== 1) {
      problems.push(
        `assets/${PSTACK_MODELS_EXAMPLE_PATH}: expected exactly one line for role "${role.key}", found ${count}`,
      );
    }
  }
  if (text.includes("claude-") || text.includes("grok-") || text.includes("gpt-")) {
    problems.push(
      `assets/${PSTACK_MODELS_EXAMPLE_PATH}: must not hardcode a model id; this package cannot know which routes a deployment serves`,
    );
  }

  // The example doubles as a convergence baseline, so it has to parse as a role
  // file: copying it must yield a working policy, not a page of diagnostics.
  const parsed = parseRoleFile(text, `assets/${PSTACK_MODELS_EXAMPLE_PATH}`);
  if (parsed.status !== "loaded") {
    problems.push(`assets/${PSTACK_MODELS_EXAMPLE_PATH}: does not parse as a role file`);
  } else {
    if (parsed.issues.length > 0) {
      const first = parsed.issues[0] as { line?: number; message: string };
      problems.push(
        `assets/${PSTACK_MODELS_EXAMPLE_PATH}:${first.line ?? 0}: the example must parse cleanly: ${first.message}`,
      );
    }
    if (parsed.roles.size !== ROLE_MANIFEST.length) {
      problems.push(
        `assets/${PSTACK_MODELS_EXAMPLE_PATH}: expected ${ROLE_MANIFEST.length} roles, parsed ${parsed.roles.size}`,
      );
    }
  }

  const skillPath = join(ASSETS_ROOT, "skills", "setup-pstack", "SKILL.md");
  if (!existsSync(skillPath)) {
    problems.push("assets/skills/setup-pstack/SKILL.md: missing");
    return;
  }
  const skill = readFileSync(skillPath, "utf8");

  // `setup-pstack` is the one bundled skill the model may invoke, because its whole job
  // is to be routable. Its wording stays upstream's; the adapter document carries the
  // host translation, so nothing here asserts what the body says about paths or routes.
  if (skill.includes("disable-model-invocation: true")) {
    problems.push(
      "assets/skills/setup-pstack/SKILL.md: must stay model-invocable; it is the only bundled skill the model may call",
    );
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

  const excluded = new Set(EXCLUDED_SKILLS);
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
  for (const subpath of ["./cordis.patch.yml", "./locale/*.json", "./icon", "./subagent"]) {
    if (!(subpath in exportsMap)) {
      problems.push(`package.json: "exports" must expose "${subpath}"`);
    }
  }

  checkBundlePatch(problems, exportsMap);

  const shipped = Array.isArray(record["files"])
    ? record["files"].filter((value): value is string => typeof value === "string")
    : [];
  // `skills-ext` is listed here, not implied by `assets`: it is a sibling directory,
  // and leaving it out of `files` would publish a package whose provider loads one
  // tree and silently reports no third-party skills. The two exclusions above make
  // the difference invisible at runtime, so the release gate has to state it.
  for (const required of ["dist", "assets", "skills-ext", "cordis.patch.yml", "locale/*.json", "static"]) {
    if (!shipped.includes(required)) {
      problems.push(`package.json: "files" must include "${required}"`);
    }
  }

  const icon = record["icon"];
  if (typeof icon !== "string") {
    problems.push('package.json: "icon" must name the packaged icon');
  } else {
    const iconPath = join(ROOT, icon);
    if (!isInside(STATIC_ROOT, iconPath)) {
      problems.push(`package.json: "icon" must live under static/, found "${icon}"`);
    }
    checkIcon(iconPath, icon, problems);
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

  checkReadmeLinksReachableInTarball(problems, shipped);
}

/** Whether a `files` entry covers a repository-relative path. */
function filesEntryCovers(entry: string, repositoryPath: string): boolean {
  // npm treats a trailing `/*` as "the directory's contents" and a bare name or
  // directory as the path itself; both forms are handled by prefix matching here.
  const prefix = entry.replace(/\/\*$/, "");
  return repositoryPath === prefix || repositoryPath.startsWith(`${prefix}/`);
}

/**
 * Check that every relative link in the README resolves inside the npm tarball.
 *
 * The README is rendered on the npm page with its own relative links intact, so a
 * link to `docs/decisions/…` is a 404 there unless `files` ships `docs/`. It was
 * exactly that: `files` lists `dist`, `assets`, `cordis.patch.yml`, `locale/*.json`,
 * `static`, `README.md`, and `LICENSE`, and the decision-record link pointed at
 * `docs/decisions/2026-10-24-no-agent-team-coexistence.md`.
 *
 * `scanReleaseCopy` could not catch it, because it checks the *repository* path and
 * `docs/` exists in the checkout. This check asks the narrower question the npm page
 * asks: is the target inside the published file set? An absolute URL is always
 * acceptable and is what the README now uses.
 */
export function checkReadmeLinksReachableInTarball(
  problems: string[],
  shipped: readonly string[],
): void {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  for (const link of scanMarkdownLinks(readme)) {
    const target = link.target.replace(/^<|>$/g, "").split("#")[0]?.split("?")[0] ?? "";
    if (target === "" || /^(?:https?:|mailto:|tel:)/.test(target)) continue;
    // A pure fragment is on the page already.
    if (target.startsWith("#")) continue;

    const resolved = posix.normalize(posix.join(posix.dirname("README.md"), target));
    if (resolved.startsWith("../") || resolved === "..") {
      problems.push(`README.md:${link.line}: link ${target} leaves the package`);
      continue;
    }
    if (!shipped.some((entry) => filesEntryCovers(entry, resolved))) {
      problems.push(
        `README.md:${link.line}: link ${target} is outside "files", so it 404s on the npm page; ` +
          `use an absolute URL or ship the target`,
      );
    }
  }
}

/**
 * Check the bundle patch against the delivered rows.
 *
 * Six rows ship: the skill provider, the delegation tool, the two official worktree
 * rows whose `disabled: !!js` expressions have to stay byte identical to
 * `scripts/worktree-mount.ts`, the restricted history tool, and `pstack_script`.
 * That module is the one place the guard logic is written and tested, so a hand edit
 * here fails instead of shipping a mount decision nothing verified.
 *
 * The row count is asserted structurally below (`expectedIds`), not by this
 * sentence: it used to say "Five rows" while `expectedIds` listed six, and a comment
 * cannot fail. Anyone adding a row edits `expectedIds` and this prose together.
 */
function checkBundlePatch(
  problems: string[],
  exportsMap: Record<string, unknown>,
): void {
  const path = join(ROOT, "cordis.patch.yml");
  if (!existsSync(path)) {
    problems.push("cordis.patch.yml: missing the bundle patch");
    return;
  }

  const text = readFileSync(path, "utf8");
  const rows = parseBundlePatchRows(text);

  const expectedIds = [
    "pstack",
    "pstack-subagent",
    "pstack-worktree",
    "pstack-tool-worktree",
    "pstack-history",
    "pstack-script",
  ];
  const actualIds = rows.map((row) => row.id);
  if (actualIds.join(",") !== expectedIds.join(",")) {
    problems.push(
      `cordis.patch.yml: expected rows ${expectedIds.join(", ")}, found ${describeList(actualIds)}`,
    );
  }

  const worktreeRows = new Map(WORKTREE_ROWS.map((row) => [row.id, row]));
  for (const row of rows) {
    const worktree = worktreeRows.get(row.id);
    if (worktree !== undefined) {
      if (row.name !== worktree.plugin) {
        problems.push(
          `cordis.patch.yml: row "${row.id}" must mount ${worktree.plugin}, found ${row.name}`,
        );
      }
      const expectedGuard = worktreeRowGuardExpression(worktree);
      if (row.disabledJs !== expectedGuard) {
        problems.push(
          `cordis.patch.yml: row "${row.id}" must carry the guard from scripts/worktree-mount.ts`,
        );
      }
      continue;
    }
    if (row.disabledJs !== undefined) {
      problems.push(`cordis.patch.yml: row "${row.id}" is not a conditional row`);
    }
    if (row.name === "dsh-pstack") continue;
    const subpath = `./${row.name.replace(/^dsh-pstack\//, "")}`;
    if (!row.name.startsWith("dsh-pstack/")) {
      problems.push(`cordis.patch.yml: row "${row.id}" must load this package or a subpath of it`);
    } else if (!(subpath in exportsMap)) {
      problems.push(
        `cordis.patch.yml: row "${row.id}" loads "${row.name}", but package.json exports has no "${subpath}"`,
      );
    }
  }

  for (const row of WORKTREE_ROWS) {
    if (!rows.some((candidate) => candidate.id === row.id)) {
      problems.push(`cordis.patch.yml: missing the conditional worktree row "${row.id}"`);
    }
  }

  if (!rows.some((row) => row.id === "pstack-history" && row.name === "dsh-pstack/history")) {
    problems.push('cordis.patch.yml: the history row must mount "dsh-pstack/history"');
  }
  // The script tool is what makes the bundled CLIs runnable without a `node` on
  // PATH, so its row is load-bearing for the release, not optional.
  if (!rows.some((row) => row.id === "pstack-script" && row.name === "dsh-pstack/script")) {
    problems.push('cordis.patch.yml: the script row must mount "dsh-pstack/script"');
  }
  if (!/maxDepth:\s*2\b/.test(text)) {
    problems.push("cordis.patch.yml: pstack-subagent must carry config.maxDepth: 2");
  }
}

interface BundlePatchRow {
  readonly id: string;
  readonly name: string;
  /** Raw text of a `disabled: !!js "..."` value, when the row is conditional. */
  readonly disabledJs?: string;
}

/** Read the `- id:` rows of the bundle patch, including their guard expression. */
function parseBundlePatchRows(text: string): readonly BundlePatchRow[] {
  const rows: { id: string; name: string; disabledJs?: string }[] = [];
  for (const line of text.split("\n")) {
    const idMatch = /^\s*- id: (\S+)\s*$/.exec(line);
    if (idMatch !== null) {
      rows.push({ id: idMatch[1] as string, name: "" });
      continue;
    }
    const current = rows[rows.length - 1];
    if (current === undefined) continue;
    const nameMatch = /^\s*name: ['"]?([^'"\s]+)['"]?\s*$/.exec(line);
    if (nameMatch !== null) {
      current.name = nameMatch[1] as string;
      continue;
    }
    const disabledMatch = /^\s*disabled: !!js "(.*)"\s*$/.exec(line);
    if (disabledMatch !== null) current.disabledJs = disabledMatch[1] as string;
  }
  return rows;
}

/** Extensions a plugin icon may use, as the host reads them. */
const ICON_EXTENSIONS = new Map([
  [".svg", "svg"],
  [".png", "png"],
  [".jpg", "jpeg"],
  [".jpeg", "jpeg"],
  [".webp", "webp"],
]);

function checkIcon(path: string, relativePath: string, problems: string[]): void {
  if (!existsSync(path)) {
    problems.push(`${relativePath}: missing the packaged icon`);
    return;
  }
  const bytes = statSync(path).size;
  if (bytes === 0) {
    problems.push(`${relativePath}: icon is empty`);
  }
  if (bytes > 256 * 1024) {
    problems.push(`${relativePath}: icon is larger than 256 KiB`);
  }
  const extension = extname(path).toLowerCase();
  if (!ICON_EXTENSIONS.has(extension)) {
    problems.push(`${relativePath}: icon must be SVG, PNG, JPEG, or WebP`);
    return;
  }
  // The host sniffs the same four formats and rejects the rest, so the check
  // reads the leading bytes rather than trusting the file name.
  const head = readFileSync(path).subarray(0, 12);
  const kind = ICON_EXTENSIONS.get(extension);
  if (!sniffIcon(head, kind)) {
    problems.push(`${relativePath}: contents are not a ${kind?.toUpperCase()} image`);
  }
}

function sniffIcon(head: Buffer, kind: string | undefined): boolean {
  switch (kind) {
    case "png":
      return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "webp":
      return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP";
    case "svg": {
      const text = head.toString("utf8").trimStart();
      return text.startsWith("<svg") || text.startsWith("<?xml");
    }
    default:
      return false;
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

/**
 * One Cursor concept that a port has to dispose of somehow.
 *
 * `disposition` is the sentence a reviewer needs when the concept shows up in a file
 * no unit rewrote: it says what the port decided to do about it, so the fix is
 * "apply this disposition", not "invent a policy at review time".
 */
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
  return { copy: 0, pointer: 0, stripped: 0 };
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

/**
 * Audit the vendored third-party tree.
 *
 * `skills-ext/<source>/<skill>/` holds text this package did not write. It sits beside
 * `assets/` rather than inside it, because `build:assets` replaces that whole
 * directory and these files must survive a regeneration. Three things have to stay
 * true, and none of them is covered by the checks over `assets/skills/`, which assume
 * a pstack upstream file for every path:
 *
 * 1. Every shipped file is recorded in `scripts/skills-ext/sources.yml` with the
 *    upstream path and revision it came from. A file with no record is text of
 *    unknown origin shipping under this package's licence.
 * 2. The tree loads through the same provider loader the model uses, so a malformed
 *    vendored skill fails here rather than at activation.
 * 3. No vendored skill takes a name the pstack tree already uses, because a
 *    collision would silently shadow one of them.
 *
 * Content hashes are checked by `scripts/sync-skills-ext.ts`, which owns the pin. This
 * function owns the packaging rules.
 */
function checkSkillsExt(): readonly string[] {
  const problems: string[] = [];
  const extRoot = SKILLS_EXT_ROOT;
  // Absent is a defect now, not an initial state. The provider returns an empty
  // catalog for a missing source root, so a dropped tree would start clean and lose
  // every vendored skill without an error. The directory ships with a declared source,
  // so its absence means something removed it.
  if (!existsSync(extRoot)) {
    return [
      `skills-ext/: missing, but scripts/skills-ext/sources.yml declares sources; the provider would load no vendored skill and report no error`,
    ];
  }

  let sources;
  try {
    sources = readSources();
  } catch (error) {
    return [`scripts/skills-ext/sources.yml: ${messageOf(error)}`];
  }

  const declared = new Map<string, string>();
  for (const source of sources.sources) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id)) {
      problems.push(`scripts/skills-ext/sources.yml: source id "${source.id}" is not kebab-case`);
    }
    if (source.origin !== undefined && source.origin !== "local" && source.origin !== "vendored") {
      problems.push(
        `scripts/skills-ext/sources.yml: "${source.id}" has origin "${source.origin}"; it is \`local\` or \`vendored\``,
      );
    }
    // A vendored source is a copy of one commit, so the pin and the URL are what make
    // the copy checkable. A local source has neither, and demanding them would
    // invite a placeholder revision that means nothing.
    if (isLocal(source)) {
      if (source.repository !== undefined) {
        problems.push(
          `scripts/skills-ext/sources.yml: "${source.id}" is local, so it names no repository; a URL here promises an upstream that does not exist`,
        );
      }
    } else {
      if (source.repository === undefined || !/^https?:\/\//.test(source.repository)) {
        problems.push(`scripts/skills-ext/sources.yml: "${source.id}" has no repository URL`);
      }
      if (source.revision === undefined || !/^[0-9a-f]{40}$/.test(source.revision)) {
        problems.push(
          `scripts/skills-ext/sources.yml: "${source.id}" pins "${source.revision}", which is not a 40-character commit SHA; a branch name is not a pin`,
        );
      }
    }
    if (source.license.trim() === "") {
      problems.push(`scripts/skills-ext/sources.yml: "${source.id}" records no licence`);
    }
    for (const skill of source.skills) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)) {
        problems.push(`scripts/skills-ext/sources.yml: skill name "${skill.name}" is not kebab-case`);
      }
      if (isLocal(source)) {
        if (skill.upstream !== undefined) {
          problems.push(
            `scripts/skills-ext/sources.yml: "${source.id}/${skill.name}" is local, so it has no upstream path`,
          );
        }
        if (skill.hashes !== undefined) {
          problems.push(
            `scripts/skills-ext/sources.yml: "${source.id}/${skill.name}" is local, so a content hash pins nothing it could drift from`,
          );
        }
        if (skill.invocation === undefined) {
          problems.push(
            `scripts/skills-ext/sources.yml: "${source.id}/${skill.name}" is local, so it declares invocation: model or user next to the reason for that reach`,
          );
        } else if (skill.invocation !== "model" && skill.invocation !== "user") {
          problems.push(
            `scripts/skills-ext/sources.yml: "${source.id}/${skill.name}" declares invocation "${skill.invocation}"; it is \`model\` or \`user\``,
          );
        }
      } else {
        if (skill.upstream === undefined) {
          problems.push(`scripts/skills-ext/sources.yml: "${source.id}/${skill.name}" has no upstream path`);
        }
        if (skill.invocation !== undefined) {
          problems.push(
            `scripts/skills-ext/sources.yml: "${source.id}/${skill.name}" is vendored, so upstream owns its invocation and the manifest does not restate it`,
          );
        }
      }
      if (skill.files.length === 0) {
        problems.push(`scripts/skills-ext/sources.yml: "${source.id}/${skill.name}" lists no files`);
      }
      declared.set(skill.name, source.id);
    }
  }

  // Every shipped file belongs to exactly one declared skill.
  let index;
  try {
    index = loadSourcedSkillIndex(extRoot);
  } catch (error) {
    problems.push(`skills-ext: ${messageOf(error)}`);
    return problems;
  }

  const pstackNames = new Set(
    skillDirectories().filter((skill) => !EXCLUDED_SKILLS.includes(skill)),
  );
  for (const skill of index.values()) {
    if (!declared.has(skill.name)) {
      problems.push(
        `skills-ext: "${skill.name}" loads but is not declared in scripts/skills-ext/sources.yml`,
      );
    }
    if (pstackNames.has(skill.name)) {
      problems.push(
        `skills-ext: "${skill.name}" also exists in assets/skills, so one would shadow the other`,
      );
    }
    if (!isInside(extRoot, skill.directory)) {
      problems.push(`skills-ext: "${skill.name}" resolves outside the extension tree`);
    }
  }

  for (const source of sources.sources) {
    for (const skill of source.skills) {
      const directory = join(extRoot, source.id, skill.name);
      if (!existsSync(directory)) {
        problems.push(`skills-ext/${source.id}/${skill.name}: declared but absent`);
        continue;
      }
      for (const file of walkFiles(directory)) {
        const assetRelative = toRepositoryPath(file).slice(SKILLS_EXT_PREFIX.length);
        if (assetRelative.split("/").length < 3) {
          problems.push(
            `skills-ext: "${assetRelative}" sits outside a source/skill directory pair`,
          );
        }
      }

      // The manifest's declared reach and the frontmatter agree, both ways. A local
      // skill picks model or user reach on purpose, and this is what keeps that choice
      // visible in review instead of living in one frontmatter line.
      if (!isLocal(source) || skill.invocation === undefined) continue;
      const loaded = index.get(directory);
      if (loaded === undefined) continue;
      const actual: string = loaded.invocation.modelInvocable ? "model" : "user";
      if (actual !== skill.invocation) {
        problems.push(
          `skills-ext/${source.id}/${skill.name}: declares invocation "${skill.invocation}" but its SKILL.md is ${actual === "model" ? "model-invocable (no \`disable-model-invocation\`)" : "user-invoked (\`disable-model-invocation: true\`)"}; state the reach you mean in both places`,
        );
      }
    }
  }

  return problems;
}

const ASSETS_PREFIX = "assets/";
const STATIC_PREFIX = "static/";
/** Repository-relative prefix of the vendored tree, which lives beside `assets/`. */
const SKILLS_EXT_PREFIX = "skills-ext/";
const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
