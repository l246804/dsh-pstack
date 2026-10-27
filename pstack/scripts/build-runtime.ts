/**
 * Build the shipped script runtime.
 *
 * Every CLI and test bundle in `src/runtime-manifest.ts` is compiled here into one
 * self-contained ES module per artifact. The output is written into the gitignored
 * `.build/runtime/` tree, and the generator copies it into `pstack/pstack/` from there,
 * so the generated tree stays the only thing that ships.
 *
 * Four properties are load-bearing, and each is asserted before anything is written:
 *
 * 1. **In memory, then verified.** `write: false` means a build either produces a
 *    complete artifact set or leaves the previous tree untouched. Nothing is
 *    half-written.
 * 2. **One file, no resolution.** A single chunk per artifact and no `node_modules` or
 *    `require()` of a bare specifier, so an installed package needs no dependency tree
 *    beside it. `commander` is a `devDependency`, resolved from `node_modules` at build
 *    time and inlined, which is where every other build dependency comes from too.
 * 3. **Node, not Bun.** No `bun:` specifier and no `Bun.` global survives.
 * 4. **Deterministic.** The same sources produce the same bytes, so a check can compare
 *    a fresh build with the committed tree.
 *
 * There is no staging step and no source rewriting. The sources are checked in under
 * `pstack/runtime/`, already in the form the bundler consumes, so this module reads the
 * repository directly. Nothing here knows about the upstream submodule.
 */

import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite-plus/pack";

import { ROOT } from "./root.ts";
import {
  RUNTIME_ENTRIES,
  SHEBANG,
  type RuntimeEntry,
} from "../../src/runtime-manifest.ts";

/** Gitignored build output; the generator copies it into `pstack/pstack/`. */
export const RUNTIME_ROOT = join(ROOT, ".build", "runtime");

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
function sourcePath(source: string): string {
  const absolute = resolve(ROOT, source);
  if (!absolute.startsWith(`${ROOT}/`)) {
    throw new RuntimeBuildError(`${source}: source is outside the repository`);
  }
  return absolute;
}

/**
 * Compile one artifact to text.
 *
 * `codeSplitting: false` keeps a dynamic `import()` in the same file instead of
 * emitting a sibling chunk, which is what makes the "one file" promise hold for the
 * watcher entry's lazy `import("commander")`.
 */
async function buildArtifact(entry: RuntimeEntry): Promise<BuiltArtifact> {
  const input = sourcePath(entry.entry);
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

  // Some sources already begin with a shebang. The bundler keeps it, so it is removed
  // before the one shipped shebang goes on: two consecutive `#!` lines are a syntax
  // error in Node.
  const text = `${SHEBANG}${stripShebang(stabilizeRegions(code))}`;
  assertArtifact(entry, text);
  return { entry, text };
}

/**
 * Make bundler region labels independent of where a dependency was installed.
 *
 * The bundler writes `//#region <path>` comments naming each module's source. Those
 * paths are resolved, so the same source built against `./node_modules` and against a
 * hoisted copy produce different bytes. That breaks the one property the tree needs:
 * the committed artifacts must be reproducible from the sources alone, so a check can
 * compare a fresh build with the commit.
 *
 * Only labels change, and only the directory part. Every module that ships from a
 * `node_modules` tree is labelled `node_modules/<package>/<file>`, which is what a
 * fresh install of this package resolves too.
 */
function stabilizeRegions(code: string): string {
  return code.replace(/^\/\/#region (.*)$/gm, (_match, region: string) => {
    const marker = "node_modules/";
    const at = region.lastIndexOf(marker);
    if (at === -1) return `//#region ${region}`;
    return `//#region ${region.slice(at)}`;
  });
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
 * The support module explains Bun in its own doc comments, and those sentences must not
 * count as a Bun dependency. This is not a parser: it removes block comments and
 * everything after `//` or a line-leading `*`. The bundler emits JSDoc re-indented with
 * a `*` column, and it prefixes a doc comment with `//#region`, so both forms have to go.
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
  // A shebang anywhere except the first line is the real hazard: Node parses `#!` as a
  // hashbang only at offset zero. A test fixture that writes a shell script may
  // legitimately contain one inside a template literal, so only a line-initial hashbang
  // counts.
  const strayShebang = /^#!/m.exec(body);
  if (strayShebang !== null) problems.push("contains a second line-initial shebang");
  if (text.includes("\r")) problems.push("contains a carriage return");
  if (!text.endsWith("\n")) problems.push("does not end with a newline");

  const bunSpecifier = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']bun:[^"']*["']/.exec(code);
  if (bunSpecifier !== null) problems.push(`imports ${bunSpecifier[0]}`);
  // A Bun global nothing provided would be a ReferenceError under Node. The ported tests
  // reach a shimmed `Bun` through their own binding, so a call only counts when the
  // artifact never declares or imports one.
  const declaresBun = /\b(?:const|let|var|function|class)\s+Bun\b/.test(code);
  const importsBun = /\bimport\s*\{[^}]*\bBun\b[^}]*\}\s*from/.test(code);
  if (/\bBun\.[A-Za-z]/.test(code) && !declaresBun && !importsBun) {
    problems.push("calls a Bun.* global without importing the shim");
  }
  if (/import\.meta\.(?:dir|file)\b(?!name)/.test(code)) {
    problems.push("uses Bun's import.meta.dir, which Node does not define");
  }
  if (/["']node_modules\//.test(code)) problems.push("resolves a path inside node_modules");

  // A bare specifier the bundler left alone would fail at runtime, because nothing is
  // installed beside the artifact. Only statement-position syntax counts: `x.from("y")`
  // is a method call, not a module specifier.
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
 * Returns an empty map when the tree does not exist, so a first check run reports every
 * artifact as missing instead of throwing.
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

/** Compare a fresh build with `.build/runtime/`. */
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
      problems.push(`missing: .build/runtime/${entry.out}`);
    } else if (!found.equals(Buffer.from(text, "utf8"))) {
      problems.push(`bytes differ: .build/runtime/${entry.out}`);
    }
  }
  for (const path of [...actual.keys()].sort()) {
    if (!expected.has(path)) problems.push(`unexpected: .build/runtime/${path}`);
  }
  return problems;
}

/** Run the build. Returns the process exit code. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const check = argv.includes("--check");
  const artifacts = await buildRuntime();

  if (!check) {
    await writeRuntime(artifacts);
    for (const { entry, text } of artifacts) {
      const mode = entry.executable ? "0o755" : "0o644";
      console.log(`built ${entry.out} (${text.length} bytes, ${mode}) - ${entry.summary}`);
    }
    console.log(`built ${artifacts.length} artifacts into .build/runtime/`);
    return 0;
  }

  const problems = compareRuntime(artifacts, await readRuntime());
  if (problems.length === 0) {
    console.log(`.build/runtime/ matches a fresh build: ${artifacts.length} artifacts`);
    return 0;
  }
  console.error(`.build/runtime/ differs from a fresh build (${problems.length} difference(s)):`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("Run `vp run build:runtime` to rebuild it.");
  return 1;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
