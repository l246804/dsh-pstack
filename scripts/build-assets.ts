/**
 * Build the shipped `assets/` tree from the pinned upstream tree.
 *
 * The tree is upstream pstack text. Four mechanical transforms turn a source file into
 * an asset, and nothing else does:
 *
 * 1. Frontmatter is narrowed to the fields this host consumes. Upstream declares
 *    `icon`, `color`, `paths`, and `is_background`, which no DSH loader reads, so
 *    shipping them would be a field a model could believe it had set.
 * 2. A relative link that would leave the shipped tree is repointed. `make-bot-ui` is
 *    not carried, and `automations/`, `README.md`, and the Claude Code adapter are not
 *    in the tree either, so those links would dangle in an installed package.
 * 3. The adapter pointer is inserted under the H1 of every skill whose prose uses a
 *    Cursor name. This is upstream's own mechanism: its Claude Code tree injects one
 *    line into 23 of 56 skills and leaves the rest alone.
 * 4. The adapter document is copied in from `docs/harness/dsh.md`.
 *
 * Everything a skill says about the host is translated at read time by the reader, using
 * `docs/harness/dsh.md`. There is deliberately no fifth step. A generator that rewrites
 * tool names and capability sentences has to keep 322 hand-tuned patches in sync with
 * upstream on one side and with the host on the other, and this repository did exactly
 * that until the patches, a generated capability table, a divergence ledger, and four
 * overlapping prose documents had all drifted from the tree they described.
 *
 * The tradeoff is that a shipped skill reads `Task` and `readonly: true`. That is the
 * upstream tradeoff too, and it is why the pointer in step 3 is load-bearing rather than
 * decorative: without it a reader follows a skill literally.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { Buffer } from "node:buffer";

import { ADAPTER_ASSET, ADAPTER_POINTER, ADAPTER_SOURCE, termsUsedIn } from "./adapter.ts";
import { PSTACK_MODELS_EXAMPLE_PATH, renderPstackModelsExample } from "./role-manifest.ts";
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
 * `build-runtime.ts` needs the repository root and this module needs the built runtime.
 * Keeping the constant in a leaf breaks that cycle.
 */
export { ROOT };
export const UPSTREAM_ROOT = join(ROOT, "upstream", "cursor-plugins", "pstack");
export const UPSTREAM_SKILLS = join(UPSTREAM_ROOT, "skills");

/**
 * The generated, committed port tree.
 *
 * An `Asset.path` is relative to this directory and is also its path below the upstream
 * root, with no exceptions. The port keeps upstream's own relative layout on purpose:
 * 110 shipped links run between `docs/guide/`, `skills/`, and `agents/`, and moving one
 * of those directories relative to the others breaks every one of them. Regrouping
 * inside `pstack/` would trade a cosmetic ordering for a table of link rewrites.
 */
export const PSTACK_ROOT = join(ROOT, "pstack");
export const STAGING_ROOT = join(ROOT, ".pstack-staging");
export const BACKUP_ROOT = join(ROOT, ".pstack-backup");
export const SKILLS_PREFIX = "skills/";
export const AGENTS_PREFIX = "agents/";
export const GUIDE_PREFIX = "docs/guide/";

export interface Asset {
  /** POSIX path relative to `pstack/`. */
  readonly path: string;
  readonly bytes: Buffer;
  readonly executable: boolean;
  readonly origin: "copy" | "generated";
}

export interface AssetSummary {
  readonly files: number;
  readonly skills: number;
  readonly agents: number;
  readonly guideMarkdown: number;
  readonly guideImages: number;
  readonly executables: number;
  readonly generated: number;
}

export type SkillCategory = "copy" | "pointer" | "stripped";

export interface SkillClassification {
  readonly skill: string;
  readonly category: SkillCategory;
}

/**
 * Upstream skills this package does not carry.
 *
 * A skill is excluded only when it is entirely about a host feature with no equivalent
 * here, never because porting it is inconvenient. `make-bot-ui` builds a page that wakes
 * a Cursor Grok Bot over a webhook and requests a sender key; there is no ingress, no
 * routine, and no wake call on this host, so the body could only be a stub describing
 * something a reader cannot do.
 */
export const EXCLUDED_SKILLS: readonly string[] = ["make-bot-ui"];

/**
 * Links that would leave the shipped tree, and where each is repointed.
 *
 * Every entry is a link that works in an upstream checkout and breaks in an installed
 * package, because the target is not shipped. The replacement is the upstream file on
 * GitHub, verbatim from the pinned revision, so a reader can still follow the reference
 * the sentence was making.
 */
export const RETARGETED_LINKS: Readonly<Record<string, string>> = {
  "../../README.md": "https://github.com/cursor/plugins/blob/main/pstack/README.md",
  "../../docs/harness/claude-code.md":
    "https://github.com/cursor/plugins/blob/main/pstack/docs/harness/claude-code.md",
  "../harness/claude-code.md":
    "https://github.com/cursor/plugins/blob/main/pstack/docs/harness/claude-code.md",
  "../make-bot-ui/SKILL.md": "https://github.com/cursor/plugins/blob/main/pstack/skills/make-bot-ui/SKILL.md",
  "../../skills/make-bot-ui/SKILL.md":
    "https://github.com/cursor/plugins/blob/main/pstack/skills/make-bot-ui/SKILL.md",
  "../../automations/benny/README.md":
    "https://github.com/cursor/plugins/blob/main/pstack/automations/benny/README.md",
  "../../automations/benny/FOR_AGENTS.md":
    "https://github.com/cursor/plugins/blob/main/pstack/automations/benny/FOR_AGENTS.md",
};

export function buildAssets(): readonly Asset[] {
  const excluded = new Set(EXCLUDED_SKILLS);
  const assets: Asset[] = [];

  for (const skill of skillDirectories()) {
    if (excluded.has(skill)) continue;
    const files = walkUpstream(`${SKILLS_PREFIX}${skill}`);
    if (!files.includes(`${SKILLS_PREFIX}${skill}/SKILL.md`)) {
      throw new Error(`skills/${skill}: missing SKILL.md`);
    }
    for (const file of files) {
      // A script directory ships as built Node artifacts, never as its upstream shell
      // or Bun sources.
      if (isReplacedUpstreamScript(file)) continue;
      assets.push(buildAsset(file));
    }
  }
  for (const file of walkUpstream("agents")) assets.push(buildAsset(file));
  for (const file of walkUpstream("docs/guide")) assets.push(buildAsset(file));
  assets.push(...builtRuntimeAssets());

  assets.push({
    path: ADAPTER_ASSET,
    bytes: readFileSync(join(ROOT, ADAPTER_SOURCE)),
    executable: false,
    origin: "generated",
  });
  assets.push({
    path: PSTACK_MODELS_EXAMPLE_PATH,
    bytes: Buffer.from(renderPstackModelsExample(), "utf8"),
    executable: false,
    origin: "generated",
  });

  const sorted = assets.sort((left, right) => compareStrings(left.path, right.path));
  assertRuntimeAssets(sorted);
  assertLinksResolve(sorted);
  return sorted;
}

/**
 * Fail when a shipped link points at something the shipped tree does not contain.
 *
 * This is what makes `RETARGETED_LINKS` complete rather than merely plausible: a new
 * upstream link out of the tree fails the build until it is either retargeted or added
 * to the tree. Silent dangling links are the failure mode, and an installed package is
 * where a reader would meet them.
 */
/**
 * Link targets that are template placeholders rather than files.
 *
 * `[PR #123](url)` appears inside a copy-paste prompt template, where `url` is a slot a
 * reader fills in. The list is an allowlist rather than a guess about the target shape:
 * "no slash and no dot means it is a placeholder" also classifies a real shipped file
 * such as LICENSE as a placeholder, so a typo there would never have failed.
 */
export const TEMPLATE_LINK_TARGETS: readonly string[] = ["url", "link", "pr-url", "<url>", "#"];

export function danglingLinks(assets: readonly Asset[]): readonly string[] {
  const present = new Set(assets.map((asset) => asset.path));
  const directories = new Set<string>();
  for (const path of present) {
    const parts = posix.dirname(path).split("/");
    while (parts.length > 0 && parts[0] !== "" && parts[0] !== ".") {
      directories.add(parts.join("/"));
      parts.pop();
    }
  }

  const dangling: string[] = [];
  for (const asset of assets) {
    if (!asset.path.endsWith(".md")) continue;
    for (const [, href] of asset.bytes.toString("utf8").matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = (href as string).replace(/[#?].*/, "");
      if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      if (TEMPLATE_LINK_TARGETS.includes(target.toLowerCase())) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(asset.path), target)).replace(/\/$/, "");
      if (present.has(resolved) || directories.has(resolved)) continue;
      dangling.push(`${asset.path}: link ${href} resolves to ${resolved}, which the package does not ship`);
    }
  }
  return dangling;
}

function assertLinksResolve(assets: readonly Asset[]): void {
  const dangling = danglingLinks(assets);
  if (dangling.length === 0) return;
  throw new Error(
    `shipped links leave the tree, so add the target to RETARGETED_LINKS:\n${dangling
      .map((problem) => `  ${problem}`)
      .join("\n")}`,
  );
}

/**
 * Read the built runtime as assets.
 *
 * `runtime/` is gitignored build output; `assets/` is the committed tree. This is the one
 * place the two meet, so a build that forgot to run the bundler fails here with a
 * path-qualified message instead of shipping a stale tree.
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
        `assets/${entry.assetPath}: missing built runtime; run \`pnpm run build:assets\` first, which rebuilds runtime/ and then regenerates assets/`,
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
 * Every replaced script directory must contribute the artifacts the manifest names, and
 * no upstream script source may survive into the tree. Without this, a wrong prefix would
 * quietly ship both forms and the executable count would still pass.
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
  const skills = new Set<string>();
  let agents = 0;
  let guideMarkdown = 0;
  let guideImages = 0;
  let executables = 0;
  let generated = 0;

  for (const asset of assets) {
    if (asset.executable) executables += 1;
    if (asset.origin === "generated") generated += 1;
    const [top, second] = asset.path.split("/");
    if (top === "skills" && second !== undefined) skills.add(second);
    else if (top === "agents" && asset.path.endsWith(".md")) agents += 1;
    else if (top === "docs" && second === "guide") {
      if (asset.path.endsWith(".md")) guideMarkdown += 1;
      else guideImages += 1;
    }
  }

  return {
    files: assets.length,
    skills: skills.size,
    agents,
    guideMarkdown,
    guideImages,
    executables,
    generated,
  };
}

/** Upstream skill directories, in name order. */
export function skillDirectories(): readonly string[] {
  return readdirSync(UPSTREAM_SKILLS)
    .filter((name) => statSync(join(UPSTREAM_SKILLS, name)).isDirectory())
    .sort(compareStrings);
}

/** Classify every upstream skill, for the report and the tests. */
export function classifySkills(): readonly SkillClassification[] {
  return skillDirectories()
    .filter((skill) => !EXCLUDED_SKILLS.includes(skill))
    .map((skill) => ({ skill, category: classifySkill(skill) }));
}

/**
 * Which mechanical transform a skill's `SKILL.md` needs.
 *
 * `stripped` means frontmatter lost a field, `pointer` means the adapter line was
 * inserted, and `copy` means the body ships byte-for-byte. A skill in both of the first
 * two categories is `stripped`, because that is the transform that changes what the
 * frontmatter means to a loader.
 */
export function classifySkill(skill: string): SkillCategory {
  const source = readFileSync(join(UPSTREAM_SKILLS, skill, "SKILL.md"), "utf8");
  const { body } = parseFrontmatter(source);
  if (termsUsedIn(body).length > 0) return "pointer";
  return classifiedByFrontmatter(skill, source);
}

function classifiedByFrontmatter(skill: string, source: string): SkillCategory {
  const rendered = renderSkill(source, `skills/${skill}/SKILL.md`);
  const { data } = parseFrontmatter(source);
  const original = Object.keys(data).sort();
  const shipped = Object.keys(parseFrontmatter(rendered).data).sort();
  return original.length === shipped.length ? "copy" : "stripped";
}

/**
 * Insert the adapter pointer under a body's H1.
 *
 * Upstream's generator does exactly this, and it fails the same way: a skill that needs
 * the pointer and has no H1 is a build error rather than a skill shipped without it,
 * because the pointer is what tells a reader that the wording is upstream's and the
 * translation exists.
 */
export function insertAdapterPointer(body: string, file: string): string {
  if (body.includes(ADAPTER_POINTER)) {
    throw new Error(`${file}: body already carries the adapter pointer`);
  }
  const heading = /^# .+$/m.exec(body);
  if (heading === null) {
    throw new Error(`${file}: uses a Cursor name but has no H1 for the adapter pointer`);
  }
  const headingEnd = heading.index + heading[0].length;
  const rest = body.slice(headingEnd);
  const tail = rest === "" || rest.startsWith("\n\n") ? rest : rest.startsWith("\n") ? `\n${rest.slice(1)}` : `\n\n${rest}`;
  return `${body.slice(0, headingEnd)}\n\n${ADAPTER_POINTER}${tail}`;
}

export function renderSkill(text: string, file: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = eol === "\r\n" ? text.replaceAll("\r\n", "\n") : text;
  const { data, body } = parseFrontmatter(normalized);
  const frontmatter = validateSkillFrontmatter(data, file);
  const renderedBody = termsUsedIn(body).length > 0 ? insertAdapterPointer(body, file) : body;
  const rendered = `${serializeSkillFrontmatter(frontmatter)}${retargetLinks(renderedBody)}`;
  return eol === "\r\n" ? rendered.replaceAll("\n", "\r\n") : rendered;
}

export function renderAgent(text: string, file: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = eol === "\r\n" ? text.replaceAll("\r\n", "\n") : text;
  const { data, body } = parseFrontmatter(normalized);
  const frontmatter = validateAgentFrontmatter(data, file);
  const rendered = `${serializeAgentFrontmatter(frontmatter)}${retargetLinks(body)}`;
  return eol === "\r\n" ? rendered.replaceAll("\n", "\r\n") : rendered;
}

/** Repoint every link listed in `RETARGETED_LINKS`, leaving the anchor alone. */
export function retargetLinks(text: string): string {
  return text.replace(/\]\(([^)\s]+)\)/g, (whole, href: string) => {
    const replacement = RETARGETED_LINKS[href];
    return replacement === undefined ? whole : `](${replacement})`;
  });
}

export function decodeUtf8(bytes: Buffer, file: string): string {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    throw new Error(`${file}: not valid UTF-8, so text rules do not apply`);
  }
  return text;
}

function buildAsset(upstreamRelativePath: string): Asset {
  const absolutePath = join(UPSTREAM_ROOT, upstreamRelativePath);
  const source = readFileSync(absolutePath);
  const executable = (statSync(absolutePath).mode & 0o111) !== 0;
  const format = assetFormat(upstreamRelativePath);
  const path = upstreamRelativePath;

  if (format === "plain" && !hasRetargetedLink(source)) {
    return { path, bytes: source, executable, origin: "copy" };
  }

  const text = decodeUtf8(source, upstreamRelativePath);
  const output =
    format === "skill"
      ? renderSkill(text, upstreamRelativePath)
      : format === "agent"
        ? renderAgent(text, upstreamRelativePath)
        : retargetLinks(text);

  const bytes = Buffer.from(output, "utf8");
  return {
    path,
    bytes,
    executable,
    origin: bytes.equals(source) ? "copy" : "generated",
  };
}

function hasRetargetedLink(source: Buffer): boolean {
  const text = source.toString("utf8");
  return Object.keys(RETARGETED_LINKS).some((href) => text.includes(`](${href})`));
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

function walkUpstream(relative: string): readonly string[] {
  const absolute = join(UPSTREAM_ROOT, relative);
  const files: string[] = [];
  const visit = (path: string): void => {
    const details = statSync(path);
    if (details.isDirectory()) {
      for (const name of readdirSync(path).sort(compareStrings)) {
        if (name === ".DS_Store") continue;
        visit(join(path, name));
      }
      return;
    }
    files.push(`${relative}/${path.slice(absolute.length + 1).split("\\").join("/")}`);
  };
  visit(absolute);
  return files;
}

export { walkUpstream };
