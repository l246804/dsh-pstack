/**
 * Generate `pstack/pstack/` from the pinned upstream tree, or prove it is current.
 *
 * The tree holds three directories and nothing else: `skills/`, `agents/`, and `docs/`.
 * Every file in it is produced here. A file this module does not produce is refused
 * rather than deleted, because the one accident this shape has already had was a
 * generator quietly removing content it did not know about.
 *
 * Three sources feed the output, and each answers a different question.
 *
 * | Source | Question it answers | Editable by hand |
 * | --- | --- | --- |
 * | `upstream/cursor-plugins/pstack/` | What upstream pstack says | No, pinned submodule |
 * | `pstack/docs/` | What this host says instead | Yes |
 * | `pstack/runtime/` | What the scripts are here | Yes |
 *
 * **The overlay replaces whole files.** A file in `pstack/docs/` wins over the upstream
 * file at the same relative path inside the generated `docs/`. That is deliberately
 * coarse. A sentence-level patch table would fail when upstream re-wraps a paragraph and
 * silently succeed when upstream changes the meaning while keeping the anchor, and this
 * repository has already paid for that lesson twice.
 *
 * The cost of whole-file replacement is drift: an overlay file keeps saying what it said
 * the day it was written, however much upstream moves. So every overlay file names the
 * upstream revision it was written against, and the generator refuses to build when the
 * pinned upstream text no longer matches that hash. Maintaining an overlay is then a
 * deliberate act with a failure that points at the file.
 *
 * **Links that leave the tree are repointed, not dropped.** `README.md`, the Claude Code
 * adapter, and `automations/` are not in the tree, so a relative link to one would dangle
 * in an install. Each is pointed at the upstream file on GitHub instead, which keeps the
 * reference the sentence was making.
 *
 * **The adapter pointer is injected.** Upstream's own Claude Code tree inserts one line
 * under the H1 of every skill whose prose uses a Cursor name, and this does the same with
 * this host's line. It is the whole mechanism by which a reader learns the wording is
 * upstream's and the translation exists elsewhere.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ROOT, UPSTREAM_PREFIX, PORT_DIRECTORY, OVERLAY_DIRECTORY } from "./root.ts";
import { RUNTIME_ROOT } from "./build-runtime.ts";
import { RUNTIME_ENTRIES } from "../../src/runtime-manifest.ts";
import {
  renderAgent,
  renderSkill,
  retargetLinks,
} from "./frontmatter-render.ts";
import { PSTACK_MODELS_EXAMPLE_PATH, renderPstackModelsExample } from "../../src/role-manifest.ts";
import {
  ADAPTER_ASSET_FILENAME,
  overlayEntryProblem,
  readOverlayManifest,
  type OverlayEntry,
} from "./overlay.ts";

/** Absolute path of the pinned upstream pstack tree. */
export const UPSTREAM_ROOT = join(ROOT, UPSTREAM_PREFIX);

/** Absolute path of the generated tree root. */
export const PORT_ROOT = join(ROOT, PORT_DIRECTORY);

/** Absolute path of the hand-written overlay. */
export const OVERLAY_ROOT = join(ROOT, OVERLAY_DIRECTORY);

/** The three directories the tree holds. Nothing else may appear. */
export const PORT_DIRECTORIES: readonly string[] = ["agents", "docs", "skills"];

/**
 * Where the rendered role-file example lands, relative to the tree root.
 *
 * Re-exported from `src/role-manifest.ts` rather than restated. That module renders the
 * file's contents, so it is the module that knows what the file is called; a second copy
 * here could drift from the renderer without any check noticing.
 */
export { PSTACK_MODELS_EXAMPLE_PATH };

/** Where the harness mapping document lands, relative to the tree root. */
export const ADAPTER_ASSET = `docs/harness/${ADAPTER_ASSET_FILENAME}`;

/**
 * Upstream skills this package does not carry.
 *
 * A skill is excluded only when it is about a host feature with no equivalent here,
 * never because porting it is inconvenient. `make-bot-ui` builds a page that wakes a
 * Cursor Grok Bot over a webhook and requests a sender key; there is no ingress, no
 * routine, and no wake call on this host, so the body could only be a stub describing
 * something a reader cannot do.
 */
export const EXCLUDED_SKILLS: readonly string[] = ["make-bot-ui"];

/**
 * Links that would leave the tree, and where each is repointed.
 *
 * Every entry is a link that works in an upstream checkout and breaks in an install,
 * because the target is not carried. The replacement is the upstream file on GitHub,
 * verbatim from the pinned revision, so a reader can still follow the reference.
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

/** One file in the generated tree. */
export interface PortFile {
  /** POSIX path relative to the tree root. */
  readonly path: string;
  readonly bytes: Buffer;
  readonly executable: boolean;
  /** Where the bytes came from, for the report and for the tests. */
  readonly origin: "upstream" | "overlay" | "runtime" | "generated";
}

/** Link targets that are template placeholders rather than files. */
export const TEMPLATE_LINK_TARGETS: readonly string[] = ["url", "link", "pr-url", "<url>", "#"];

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Walk one directory, returning repository-relative POSIX paths below `base`. */
function walkAbsolute(absoluteRoot: string, base = ""): readonly string[] {
  const directory = base === "" ? absoluteRoot : join(absoluteRoot, base);
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const name of readdirSync(directory).sort(compare)) {
    if (name === ".DS_Store") continue;
    const relativePath = base === "" ? name : `${base}/${name}`;
    if (statSync(join(directory, name)).isDirectory()) {
      files.push(...walkAbsolute(absoluteRoot, relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

/** Upstream skill directories, in name order. */
export function upstreamSkillDirectories(): readonly string[] {
  const root = join(UPSTREAM_ROOT, "skills");
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort(compare);
}

/** The upstream skills this package ships: every directory minus the exclusions. */
export function shippedSkillNames(): readonly string[] {
  return upstreamSkillDirectories().filter((skill) => !EXCLUDED_SKILLS.includes(skill));
}

/** How many upstream skills ship. Derived, never written down. */
export function shippedSkillCount(): number {
  return shippedSkillNames().length;
}

/** True when an upstream-relative path is replaced by a built artifact directory. */
function isReplacedScript(path: string): boolean {
  return (
    path.startsWith("skills/poteto-mode/scripts/") ||
    path.startsWith("skills/show-me-your-work/scripts/")
  );
}

/** Read one overlay file, refusing to build when its upstream text has moved on. */
function readOverlay(entry: OverlayEntry): Buffer {
  const problem = overlayEntryProblem(UPSTREAM_ROOT, entry);
  if (problem !== undefined) throw new Error(problem);
  return readFileSync(join(OVERLAY_ROOT, ...entry.path.split("/")));
}

/**
 * Build the whole tree in memory.
 *
 * Nothing is written here. `writePort` is the only writer, and a failure in this
 * function leaves the previous tree exactly as it was.
 */
export function buildPort(): readonly PortFile[] {
  const files: PortFile[] = [];
  const overlayEntries = readOverlayManifest(OVERLAY_ROOT);
  const overlay = new Map(overlayEntries.map((entry) => [entry.tree, entry]));

  // Skills: every shipped directory, minus the script directories the runtime replaces.
  for (const skill of shippedSkillNames()) {
    for (const path of walkAbsolute(UPSTREAM_ROOT, `skills/${skill}`)) {
      if (isReplacedScript(path)) continue;
      files.push(fromUpstreamOrOverlay(path, overlay));
    }
    if (!files.some((file) => file.path === `skills/${skill}/SKILL.md`)) {
      throw new Error(`skills/${skill}: missing SKILL.md`);
    }
  }

  for (const path of walkAbsolute(UPSTREAM_ROOT, "agents")) {
    files.push(fromUpstreamOrOverlay(path, overlay));
  }
  for (const path of walkAbsolute(UPSTREAM_ROOT, "docs/guide")) {
    files.push(fromUpstreamOrOverlay(path, overlay));
  }

  // Every overlay entry the tree has not produced yet, which is the adapter and the
  // README. Both are this host's own prose with nothing upstream to replace.
  const produced = new Set(files.map((file) => file.path));
  for (const entry of overlayEntries) {
    if (produced.has(entry.tree)) continue;
    files.push({
      path: entry.tree,
      bytes: Buffer.from(retargetLinks(readOverlay(entry).toString("utf8")), "utf8"),
      executable: false,
      origin: "overlay",
    });
    produced.add(entry.tree);
  }

  files.push(...builtRuntimeAssets());
  files.push({
    path: PSTACK_MODELS_EXAMPLE_PATH,
    bytes: Buffer.from(renderPstackModelsExample(), "utf8"),
    executable: false,
    origin: "generated",
  });

  const sorted = files.sort((left, right) => compare(left.path, right.path));
  assertRuntimeAssets(sorted);
  assertLinksResolve(sorted);
  return sorted;
}

/**
 * One path in the tree: rendered from its upstream file, or replaced by its overlay.
 *
 * Source and transform are separate questions, and an overlay changes only the first.
 * An overlaid `SKILL.md` still needs the narrowed frontmatter and the adapter pointer,
 * because the loader reads the same fields and the reader needs the same translation;
 * what the overlay replaces is the prose. Replacing a file with text that skips those
 * transforms would ship a skill the loader cannot read and a reader cannot place.
 */
function fromUpstreamOrOverlay(path: string, overlay: ReadonlyMap<string, OverlayEntry>): PortFile {
  const entry = overlay.get(path);
  const source = entry === undefined ? readFileSync(join(UPSTREAM_ROOT, ...path.split("/"))) : readOverlay(entry);
  const executable =
    entry === undefined && (statSync(join(UPSTREAM_ROOT, ...path.split("/"))).mode & 0o111) !== 0;
  const origin = entry === undefined ? "upstream" : "overlay";

  if (/^skills\/[^/]+\/SKILL\.md$/.test(path)) {
    const rendered = Buffer.from(renderSkill(source.toString("utf8"), path), "utf8");
    return { path, bytes: rendered, executable, origin: rendered.equals(source) ? origin : "generated" };
  }
  if (/^agents\/[^/]+\.md$/.test(path)) {
    const rendered = Buffer.from(renderAgent(source.toString("utf8"), path), "utf8");
    return { path, bytes: rendered, executable, origin: rendered.equals(source) ? origin : "generated" };
  }
  const rendered = Buffer.from(retargetLinks(source.toString("utf8")), "utf8");
  return { path, bytes: rendered, executable, origin: rendered.equals(source) ? origin : "generated" };
}

/** Read the built runtime as files of the tree. */
function builtRuntimeAssets(): readonly PortFile[] {
  const files: PortFile[] = [];
  for (const entry of RUNTIME_ENTRIES) {
    const path = join(RUNTIME_ROOT, ...entry.out.split("/"));
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      throw new Error(
        `${entry.assetPath}: missing built runtime; run \`vp run build:runtime\` first, which rebuilds .build/runtime/ and then regenerates the tree`,
      );
    }
    files.push({ path: entry.assetPath, bytes, executable: entry.executable, origin: "runtime" });
  }
  return files;
}

/**
 * Fail when a built script is not exactly the manifest.
 *
 * Every replaced script directory must contribute the artifacts the manifest names, and
 * no upstream script source may survive into the tree. Without this, a wrong prefix would
 * quietly ship both forms and the executable count would still pass.
 */
function assertRuntimeAssets(files: readonly PortFile[]): void {
  const present = new Set(files.map((file) => file.path));
  for (const entry of RUNTIME_ENTRIES) {
    if (!present.has(entry.assetPath)) {
      throw new Error(`${entry.assetPath}: the runtime manifest names it, the tree lacks it`);
    }
  }
  for (const path of present) {
    if (!isReplacedScript(path)) continue;
    if (/\.(?:sh|ts|mjs)$/.test(path) && !path.endsWith(".mjs")) {
      throw new Error(`${path}: upstream script source survived; only built .mjs artifacts ship there`);
    }
  }
}

/**
 * Fail when a link points at something the tree does not contain.
 *
 * This is what makes `RETARGETED_LINKS` complete rather than merely plausible: a new
 * upstream link out of the tree fails the build until it is either retargeted or carried.
 * Silent dangling links are the failure mode, and an install is where a reader meets them.
 */
export function danglingLinks(files: readonly PortFile[]): readonly string[] {
  const present = new Set(files.map((file) => file.path));
  const directories = new Set<string>();
  for (const path of present) {
    const parts = posix.dirname(path).split("/");
    while (parts.length > 0 && parts[0] !== "" && parts[0] !== ".") {
      directories.add(parts.join("/"));
      parts.pop();
    }
  }

  const dangling: string[] = [];
  for (const file of files) {
    if (!file.path.endsWith(".md")) continue;
    for (const [, href] of file.bytes.toString("utf8").matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = (href as string).replace(/[#?].*/, "");
      if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      if (TEMPLATE_LINK_TARGETS.includes(target.toLowerCase())) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(file.path), target)).replace(/\/$/, "");
      if (present.has(resolved) || directories.has(resolved)) continue;
      dangling.push(`${file.path}: link ${href} resolves to ${resolved}, which the tree does not carry`);
    }
  }
  return dangling;
}

function assertLinksResolve(files: readonly PortFile[]): void {
  const dangling = danglingLinks(files);
  if (dangling.length === 0) return;
  throw new Error(
    `links leave the tree, so add the target to RETARGETED_LINKS:\n${dangling
      .map((problem) => `  ${problem}`)
      .join("\n")}`,
  );
}

/**
 * Refuse to regenerate the tree while it holds a file this generator did not make.
 *
 * The write replaces the whole directory, which is the correct behaviour for a tree
 * whose promise is "a fresh build reproduces these bytes". That same behaviour turns a
 * hand-placed file into silent data loss, and it has happened here before. So this is a
 * precondition, not a repair: it names the offending path at the one moment a maintainer
 * can still act on it.
 */
export function foreignFiles(files: readonly PortFile[]): readonly string[] {
  if (!existsSync(PORT_ROOT)) return [];
  const expected = new Set(files.map((file) => file.path));
  return walkAbsolute(PORT_ROOT)
    .map((path) => path)
    .filter((path) => !expected.has(path));
}

/** A one-line summary of a built tree. */
export interface PortSummary {
  readonly files: number;
  readonly skills: number;
  readonly agents: number;
  readonly guideMarkdown: number;
  readonly guideImages: number;
  readonly executables: number;
  readonly overlay: number;
  readonly runtime: number;
}

export function summarizePort(files: readonly PortFile[]): PortSummary {
  const skills = new Set<string>();
  let agents = 0;
  let guideMarkdown = 0;
  let guideImages = 0;
  let executables = 0;
  let overlay = 0;
  let runtime = 0;

  for (const file of files) {
    if (file.executable) executables += 1;
    if (file.origin === "overlay") overlay += 1;
    if (file.origin === "runtime") runtime += 1;
    const [top, second] = file.path.split("/");
    if (top === "skills" && second !== undefined) skills.add(second);
    else if (top === "agents" && file.path.endsWith(".md")) agents += 1;
    else if (top === "docs" && second === "guide") {
      if (file.path.endsWith(".md")) guideMarkdown += 1;
      else guideImages += 1;
    }
  }

  return {
    files: files.length,
    skills: skills.size,
    agents,
    guideMarkdown,
    guideImages,
    executables,
    overlay,
    runtime,
  };
}

/** Write the tree, replacing `pstack/pstack/`. */
export async function writePort(files: readonly PortFile[]): Promise<void> {
  const foreign = foreignFiles(files);
  if (foreign.length > 0) {
    throw new Error(
      `refusing to regenerate ${PORT_DIRECTORY}/: it holds files this generator does not produce, and ` +
        `the replacement would delete them:\n${foreign.map((path) => `  ${PORT_DIRECTORY}/${path}`).join("\n")}\n` +
        `Move them outside the tree; a file that must survive regeneration belongs in pstack/docs/.`,
    );
  }

  if (dirname(PORT_ROOT) !== resolve(ROOT, "pstack")) {
    throw new Error(`refusing to modify ${PORT_ROOT}; it must sit under pstack/`);
  }

  await rmSync(PORT_ROOT, { recursive: true, force: true });
  for (const file of files) {
    const target = join(PORT_ROOT, ...file.path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
    await chmod(target, file.executable ? 0o755 : 0o644);
  }
}

/** Read the tree as it is on disk, for a comparison. */
export function readPort(): readonly PortFile[] {
  if (!existsSync(PORT_ROOT)) return [];
  return walkAbsolute(PORT_ROOT).map((path) => ({
    path,
    bytes: readFileSync(join(PORT_ROOT, ...path.split("/"))),
    executable: (statSync(join(PORT_ROOT, ...path.split("/"))).mode & 0o111) !== 0,
    origin: "upstream" as const,
  }));
}

/** Compare a fresh build with what is on disk. */
export function comparePort(
  expected: readonly PortFile[],
  actual: readonly PortFile[],
): readonly string[] {
  const problems: string[] = [];
  const actualByPath = new Map(actual.map((file) => [file.path, file]));
  const expectedPaths = new Set<string>();

  for (const file of expected) {
    expectedPaths.add(file.path);
    const found = actualByPath.get(file.path);
    if (found === undefined) {
      problems.push(`missing: ${PORT_DIRECTORY}/${file.path}`);
      continue;
    }
    if (!found.bytes.equals(file.bytes)) problems.push(`bytes differ: ${PORT_DIRECTORY}/${file.path}`);
    if (found.executable !== file.executable) {
      problems.push(
        `mode differs: ${PORT_DIRECTORY}/${file.path} (expected ${file.executable ? "0o755" : "0o644"}, found ${found.executable ? "0o755" : "0o644"})`,
      );
    }
  }
  for (const file of actual) {
    if (!expectedPaths.has(file.path)) problems.push(`unexpected: ${PORT_DIRECTORY}/${file.path}`);
  }
  return problems;
}

/** The SHA-256 of one file, used by the overlay base check and the tests. */
export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Run the generator. Returns the process exit code. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const check = argv.includes("--check");

  let files: readonly PortFile[];
  let summary: PortSummary;
  try {
    files = buildPort();
    summary = summarizePort(files);
  } catch (error) {
    console.error(`the tree cannot be built: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (!check) {
    await writePort(files);
    console.log(`wrote ${PORT_DIRECTORY}/: ${describe(summary)}`);
    return 0;
  }

  const problems = comparePort(files, readPort());
  if (problems.length === 0) {
    console.log(`${PORT_DIRECTORY}/ matches a fresh build: ${describe(summary)}`);
    return 0;
  }
  console.error(`${PORT_DIRECTORY}/ differs from a fresh build (${problems.length} difference(s)):`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("Run `vp run build:port` to regenerate it. Edit the sources, never the tree.");
  return 1;
}

function describe(summary: PortSummary): string {
  return [
    `${summary.skills} skills`,
    `${summary.agents} agents`,
    `${summary.guideMarkdown} guide markdown`,
    `${summary.guideImages} images`,
    `${summary.executables} executables`,
    `${summary.overlay} overlay`,
    `${summary.runtime} runtime`,
    `${summary.files} files`,
  ].join(", ");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
