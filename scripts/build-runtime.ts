/**
 * Build the shipped script runtime.
 *
 * Every CLI and test bundle in `scripts/runtime-manifest.ts` is compiled here into
 * one self-contained ES module per artifact. The output is written into the
 * gitignored `runtime/` tree; `scripts/build-assets.ts` copies it into `assets/`,
 * so the generated asset tree stays the only thing that ships.
 *
 * Four properties are load-bearing, and each is asserted before anything is
 * written:
 *
 * 1. **In memory, then verified.** `write: false` means a build either produces a
 *    complete artifact set or leaves the previous tree untouched. Nothing is
 *    half-written.
 * 2. **One file, no resolution.** A single chunk per artifact and no
 *    `node_modules` or `require()` of a bare specifier, so an installed package
 *    needs no dependency tree beside it. `commander` comes from `vendor/`.
 * 3. **Node, not Bun.** No `bun:` specifier and no `Bun.` global survives.
 * 4. **Deterministic.** The same sources produce the same bytes, so `--check`
 *    can compare a fresh build with the committed tree.
 */

import { Buffer } from "node:buffer";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite-plus/pack";

import { applyFilePatches, assertPatchOutput } from "./apply-patches.ts";
import { runtimePatchesForFile } from "./patches.ts";
import { ROOT, UPSTREAM_PREFIX } from "./root.ts";
import {
  RUNTIME_ENTRIES,
  SHEBANG,
  TEST_SUPPORT_STAGED_PREFIX,
  type RuntimeEntry,
  type RuntimeSource,
} from "./runtime-manifest.ts";

/** Gitignored build output; `assets/` is generated from it. */
export const RUNTIME_ROOT = join(ROOT, ".build", "runtime");

/**
 * Where upstream sources are copied, with `RUNTIME_SOURCE_PATCHES` applied.
 *
 * The upstream submodule is read-only by policy, and its `orch.ts` imports
 * `../bootstrap.ts` and calls it. Bundling has to see the patched text instead, so
 * every upstream source named by an entry is materialised here first. Authored
 * sources are bundled in place: they are this repository's own files.
 */
export const SOURCE_STAGE_ROOT = join(ROOT, ".runtime-sources");

/** The vendored Commander ESM entry. Pinned by `vendor/commander/package.json`. */
export const COMMANDER_ALIAS = join(ROOT, "vendor", "commander", "esm.mjs");

/** Node 22 is the floor `engines.node` promises, so the output must not exceed it. */
export const BUILD_TARGET = "node22";

/** One built artifact, ready to be written or compared. */
export interface BuiltArtifact {
  readonly entry: RuntimeEntry;
  /** Full file text, shebang first. */
  readonly text: string;
}

/** A build failure that names the offending artifact. */
export class RuntimeBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeBuildError";
  }
}

/** Absolute path of one source, refusing anything outside the repository. */
function sourcePath(source: RuntimeSource): string {
  // An upstream path is asset-relative, exactly like a `FILE_PATCHES` target, so
  // the submodule's own prefix is added here once instead of at every entry.
  const repositoryRelative =
    source.kind === "upstream" ? `${UPSTREAM_PREFIX}${source.path}` : source.path;
  const absolute = resolve(ROOT, repositoryRelative);
  if (!absolute.startsWith(`${ROOT}/`)) {
    throw new RuntimeBuildError(`${source.path}: source is outside the repository`);
  }
  return absolute;
}

/**
 * Copy every source a build needs into `SOURCE_STAGE_ROOT`, applying rewrites.
 *
 * Staging exists because the upstream submodule is read-only and its `orch.ts`
 * imports `../bootstrap.ts` and calls it. One directory tree is enough: the
 * entries only reference each other through relative `./` and `../` imports under
 * `skills/`, so staging them at the same relative paths keeps those imports
 * resolving.
 *
 * Authored test support is copied into `skills/poteto-mode/scripts/` so a staged
 * test reaches it through the same `../support.ts` the patch writes. The copy is
 * byte-identical: this repository's own files need no rewrite.
 */
export async function stageRuntimeSources(
  entries: readonly RuntimeEntry[] = RUNTIME_ENTRIES,
): Promise<void> {
  if (dirname(SOURCE_STAGE_ROOT) !== ROOT) {
    throw new RuntimeBuildError(`refusing to modify ${SOURCE_STAGE_ROOT}`);
  }
  await rm(SOURCE_STAGE_ROOT, { recursive: true, force: true });

  const sources = new Map<string, RuntimeSource>();
  for (const entry of entries) {
    for (const source of entry.sources) {
      const staged = stagedPath(source);
      const existing = sources.get(staged);
      if (existing !== undefined && existing.path !== source.path) {
        throw new RuntimeBuildError(
          `${staged}: two sources stage to the same path (${existing.path}, ${source.path})`,
        );
      }
      sources.set(staged, source);
    }
  }

  for (const staged of [...sources.keys()].sort()) {
    await copyStaged(sources.get(staged) as RuntimeSource, staged);
  }
}

/**
 * Where one source lands inside the stage.
 *
 * An upstream source keeps its repository-relative path so `./store.ts` and
 * `../support.ts` resolve exactly as they do in the real tree. An authored support
 * module is flattened into the one directory every staged test can reach.
 */
function stagedPath(source: RuntimeSource): string {
  return source.kind === "upstream"
    ? source.path
    : `${TEST_SUPPORT_STAGED_PREFIX}${source.path.slice(source.path.lastIndexOf("/") + 1)}`;
}

/**
 * Write one source into the stage.
 *
 * An upstream source is rewritten by `runtimePatchesForFile` first, and the
 * rewrite is asserted before it is staged: `applyFilePatches` throws when the anchor
 * no longer matches, and `assertPatchOutput` throws when the promised replacement
 * text is absent. Either failure stops the build instead of silently shipping an
 * unpatched or half-patched bundle.
 */
async function copyStaged(source: RuntimeSource, staged: string): Promise<void> {
  const original = await readFile(sourcePath(source), "utf8");
  const patches = source.kind === "upstream" ? runtimePatchesForFile(source.path) : [];
  const text = patches.length === 0 ? original : applyFilePatches(source.path, original, patches);
  if (patches.length > 0) assertPatchOutput(source.path, patches, text);

  const target = join(SOURCE_STAGE_ROOT, ...staged.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}

/** The path the bundler should read for one source. */
function entryPath(source: RuntimeSource): string {
  return join(SOURCE_STAGE_ROOT, ...stagedPath(source).split("/"));
}

/**
 * Compile one artifact to text.
 *
 * `codeSplitting: false` keeps a dynamic `import()` in the same file instead of
 * emitting a sibling chunk, which is what makes the "one file" promise hold for
 * `orch.ts`'s lazy `import("commander")`.
 */
async function buildArtifact(entry: RuntimeEntry): Promise<BuiltArtifact> {
  const input = entryPath(entry.entry);
  const scope = entry.kind === "cli" ? "cli" : "test";
  let code: string;
  try {
    const handle = await build({
      entry: { [entry.id]: input },
      write: false,
      dts: false,
      format: "esm",
      target: BUILD_TARGET,
      platform: "node",
      outDir: join(RUNTIME_ROOT, scope),
      alias: { commander: COMMANDER_ALIAS },
      // `codeSplitting` is an output option in this toolchain, and it is the
      // supported spelling of the deprecated `inlineDynamicImports`.
      outputOptions: { codeSplitting: false },
      clean: false,
      logLevel: "silent",
    });
    const chunks = handle.bundles.flatMap((bundle) => bundle.chunks);
    if (chunks.length !== 1) {
      const names = chunks.map((chunk) => chunk.fileName).join(", ");
      throw new RuntimeBuildError(
        `${entry.id}: expected one output file, the build produced ${chunks.length} (${names})`,
      );
    }
    const chunk = chunks[0];
    if (chunk === undefined || !("code" in chunk) || typeof chunk.code !== "string") {
      throw new RuntimeBuildError(`${entry.id}: the single output is not a JavaScript chunk`);
    }
    code = chunk.code;
  } catch (error) {
    if (error instanceof RuntimeBuildError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new RuntimeBuildError(`${entry.id}: ${message.split("\n")[0]}`);
  }

  // Some sources already begin with a shebang (`check-plan.mjs`, and the patched
  // `orch.ts`). The bundler keeps it, so it is removed before the one shipped
  // shebang goes on: two consecutive `#!` lines are a syntax error in Node.
  const text = `${SHEBANG}${stripShebang(code)}`;
  assertArtifact(entry, text);
  return { entry, text };
}

/** Remove every leading shebang line from a chunk. */
function stripShebang(code: string): string {
  let rest = code;
  while (rest.startsWith("#!")) {
    const newline = rest.indexOf("\n");
    if (newline === -1) return "";
    rest = rest.slice(newline + 1);
  }
  return rest;
}

/**
 * Strip comments so a check reads code, not prose.
 *
 * The ported support module explains Bun in its own doc comments, and those
 * sentences must not count as a Bun dependency. This is not a parser: it removes
 * block comments and everything after `//` or a line-leading `*`. The bundler
 * emits JSDoc re-indented with a `*` column, and it prefixes a doc comment with
 * `//#region`, so both forms have to go.
 */
function stripComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/^\s*\/\/#?[a-z]*.*$/gm, "")
    .replaceAll(/^\s*\*.*$/gm, "");
}

/**
 * Reject an artifact that would need anything the package cannot provide.
 *
 * These are byte-level checks on the output, not on the sources: the sources may
 * mention `node_modules` in a comment, but the artifact may never depend on one.
 */
export function assertArtifact(entry: RuntimeEntry, text: string): void {
  const body = text.startsWith(SHEBANG) ? text.slice(SHEBANG.length) : text;
  const code = stripComments(body);
  const problems: string[] = [];

  if (!text.startsWith(SHEBANG)) {
    problems.push(`must start with ${JSON.stringify(SHEBANG.trim())}`);
  }
  // A shebang anywhere except the first line is the real hazard: Node parses
  // `#!` as a hashbang only at offset zero. A test fixture that writes a shell
  // script may legitimately contain one inside a template literal, so only a
  // line-initial hashbang counts.
  const strayShebang = /^#!/m.exec(body);
  if (strayShebang !== null) problems.push("contains a second line-initial shebang");
  if (text.includes("\r")) problems.push("contains a carriage return");
  if (!text.endsWith("\n")) problems.push("does not end with a newline");

  const bunSpecifier = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']bun:[^"']*["']/.exec(code);
  if (bunSpecifier !== null) problems.push(`imports ${bunSpecifier[0]}`);
  // A Bun global nothing provided would be a ReferenceError under Node. The ported
  // tests reach a shimmed `Bun` through their own binding, so a call only counts
  // when the artifact never declares or imports one.
  const declaresBun = /\b(?:const|let|var|function|class)\s+Bun\b/.test(code);
  const importsBun = /\bimport\s*\{[^}]*\bBun\b[^}]*\}\s*from/.test(code);
  if (/\bBun\.[A-Za-z]/.test(code) && !declaresBun && !importsBun) {
    problems.push("calls a Bun.* global without importing the shim");
  }
  if (/import\.meta\.(?:dir|file)\b(?!name)/.test(code)) {
    problems.push("uses Bun's import.meta.dir, which Node does not define");
  }
  if (/["']node_modules\//.test(code)) problems.push("resolves a path inside node_modules");

  // A bare specifier the bundler left alone would fail at runtime, because nothing
  // is installed beside the artifact. Only statement-position syntax counts:
  // `x.from("y")` is a method call, not a module specifier.
  for (const match of code.matchAll(/(?:^|[;\n])\s*import\s*(?:[^(\n]*?\bfrom\s*)?(["'])([^"']+)\1/gm)) {
    const specifier = match[2] as string;
    if (!specifier.startsWith("node:")) {
      problems.push(`leaves a static import from "${specifier}"`);
    }
  }
  for (const match of code.matchAll(/(?:^|[;\n])\s*(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*(["'])([^"']+)\1\s*\)/gm)) {
    const specifier = match[2] as string;
    if (!specifier.startsWith("node:")) {
      problems.push(`leaves a runtime require("${specifier}")`);
    }
  }
  // A dynamic import with a bare specifier is the same failure, later.
  for (const match of code.matchAll(/\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g)) {
    const specifier = match[2] as string;
    if (!specifier.startsWith("node:") && !specifier.startsWith(".")) {
      problems.push(`leaves a dynamic import("${specifier}")`);
    }
  }

  if (problems.length > 0) {
    throw new RuntimeBuildError(`${entry.id}: ${problems.join("; ")}`);
  }
}

/** Build every artifact, in manifest order. */
export async function buildRuntime(): Promise<readonly BuiltArtifact[]> {
  await stageRuntimeSources();
  const artifacts: BuiltArtifact[] = [];
  for (const entry of RUNTIME_ENTRIES) artifacts.push(await buildArtifact(entry));
  return artifacts;
}

/** Write the built tree, replacing `.build/runtime/`. */
export async function writeRuntime(artifacts: readonly BuiltArtifact[]): Promise<void> {
  if (dirname(RUNTIME_ROOT) !== join(ROOT, ".build")) {
    throw new RuntimeBuildError(`refusing to modify ${RUNTIME_ROOT}; it must sit under .build/`);
  }
  await rm(RUNTIME_ROOT, { recursive: true, force: true });
  for (const { entry, text } of artifacts) {
    const target = join(RUNTIME_ROOT, ...entry.out.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
    await chmod(target, entry.executable ? 0o755 : 0o644);
  }
}

/**
 * Read what is on disk right now.
 *
 * Returns an empty map when `runtime/` does not exist, so a first `--check` run
 * reports every artifact as missing instead of throwing.
 */
export async function readRuntime(): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const relative of await walk(RUNTIME_ROOT)) {
    files.set(relative, await readFile(join(RUNTIME_ROOT, ...relative.split("/"))));
  }
  return files;
}

async function walk(directory: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const nested of await walk(relative)) files.push(`${entry.name}/${nested}`);
    } else {
      files.push(entry.name);
    }
  }
  return files;
}

/** Compare a fresh build with `runtime/`. */
export function compareRuntime(
  artifacts: readonly BuiltArtifact[],
  actual: ReadonlyMap<string, Buffer>,
): readonly string[] {
  const problems: string[] = [];
  const expected = new Set<string>();

  for (const { entry, text } of artifacts) {
    expected.add(entry.out);
    const found = actual.get(entry.out);
    if (found === undefined) {
      problems.push(`missing: runtime/${entry.out}`);
    } else if (!found.equals(Buffer.from(text, "utf8"))) {
      problems.push(`bytes differ: runtime/${entry.out}`);
    }
  }
  for (const path of [...actual.keys()].sort()) {
    if (!expected.has(path)) problems.push(`unexpected: runtime/${path}`);
  }
  return problems;
}

export interface RuntimeBuildOptions {
  /** Compare with `runtime/` instead of writing it. */
  readonly check?: boolean;
}

/** Run the build. Returns the process exit code. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const check = argv.includes("--check");
  const artifacts = await buildRuntime();

  if (!check) {
    await writeRuntime(artifacts);
    for (const { entry, text } of artifacts) {
      const mode = entry.executable ? "0o755" : "0o644";
      console.log(
        `built runtime/${entry.out} (${text.length} bytes, ${mode}) — ${entry.summary}`,
      );
    }
    console.log(`built ${artifacts.length} artifacts into runtime/`);
    return 0;
  }

  const problems = compareRuntime(artifacts, await readRuntime());
  if (problems.length === 0) {
    console.log(`runtime/ matches a fresh build: ${artifacts.length} artifacts`);
    return 0;
  }
  console.error(`runtime/ differs from a fresh build (${problems.length} difference(s)):`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("Run `node scripts/build-runtime.ts` to rebuild it.");
  return 1;
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
