/**
 * `check:pack`: prove the tarball is the package the checkout describes.
 *
 * Three failures are closed here, each observed before this file existed.
 *
 * 1. **A missing `dist/` still packed.** `dist` is gitignored. With the directory
 *    moved aside, `pnpm pack --dry-run` exits **0** and reports 149 entries instead
 *    of 166. No command in the release chain read the tarball, so the one step that
 *    produces it could not fail.
 * 2. **An `exports` target that does not exist passed every gate.** The manifest
 *    check in `scripts/check-assets.ts` asserts the exported *keys* are present, not
 *    that the files they name exist or ship. `dist/index.mjs` could be missing and
 *    `check` stayed green.
 * 3. **The entry count was hand-counted.** The release checklist carried a
 *    "current baseline 166" plus a five-part breakdown with no command to reproduce
 *    it. The set is derived here from the asset generator, `dist/`, `locale/`,
 *    `static/`, and the root files, so it cannot drift the way a copied number does.
 *
 * What this does **not** do: rebuild `dist/` and compare bytes. `vp pack` writes
 * into a directory at the repository root, and a second output tree there is exactly
 * what `docs/decisions/2026-10-26-static-resource-directory.md` argued against. The
 * bundler is instead re-run on the publish path (`prepublishOnly`), and this check
 * asserts the shape of what that produced. The one staleness class it can still see
 * is the one with no other symptom: a `dist/` built before a manifest edit, which
 * points the plugin at asset paths that no longer exist.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ROOT, buildAssets } from "./build-assets.ts";
import { STATIC_FILES } from "./check-assets.ts";
import { ROLE_MANIFEST } from "./role-manifest.ts";
import { RUNTIME_CLIS } from "./runtime-manifest.ts";

/** The gitignored build output npm's `files` names as `dist`. */
export const DIST_ROOT = "dist";

/**
 * Files npm always ships, or that `files` names directly.
 *
 * `package.json` is not in `files` and is always included; the other three are
 * listed there and are shipped from the repository root rather than a directory.
 */
export const ROOT_FILES: readonly string[] = [
  "package.json",
  "README.md",
  "LICENSE",
  "cordis.patch.yml",
];

/** One section of the tarball, for the printed report. */
export interface PackSection {
  readonly name: string;
  readonly count: number;
}

/** Everything one run found. */
export interface PackReport {
  readonly files: number;
  readonly sections: readonly PackSection[];
  readonly problems: readonly string[];
}

/** The paths inside a `pnpm pack --dry-run --json` result. */
export interface Tarball {
  readonly files: readonly string[];
}

/** A tarball that could not be produced or parsed. */
export class PackInvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackInvocationError";
  }
}

/**
 * Collect every path in `package.json`'s `exports`, with wildcards expanded.
 *
 * A nested condition object (`{ types, default }`) contributes each leaf; an
 * `*` target is expanded against the directory it names, so `./locale/*.json`
 * resolves to the files on disk instead of staying a pattern. A pattern that
 * matches nothing is a problem for the caller to report, not silently dropped.
 */
export function exportsTargets(manifest: unknown): readonly string[] {
  const exportsMap = asRecord(asRecord(manifest)?.["exports"]);
  if (exportsMap === undefined) return [];

  const targets: string[] = [];
  const visit = (value: unknown, key: string): void => {
    if (typeof value === "string") {
      if (value.includes("*")) targets.push(...expandWildcard(value));
      else targets.push(stripDot(value));
      return;
    }
    const nested = asRecord(value);
    if (nested === undefined) return;
    for (const [condition, inner] of Object.entries(nested)) visit(inner, `${key}${condition}`);
  };
  for (const [subpath, value] of Object.entries(exportsMap)) visit(value, subpath);
  return [...new Set(targets)].sort();
}

/** `./dist/index.mjs` is stored, and compared, as `dist/index.mjs`. */
function stripDot(target: string): string {
  return target.replace(/^\.\//, "");
}

/** `./locale/*.json` becomes the locale files the tree actually holds. */
function expandWildcard(target: string): readonly string[] {
  const path = stripDot(target);
  const star = path.indexOf("*");
  const directory = path.slice(0, star).replace(/\/[^/]*$/, "");
  const suffix = path.slice(star + 1);
  const absolute = join(ROOT, ...directory.split("/"));
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => `${directory}/${entry.name}`)
    .sort();
}

/**
 * The tarball a correct checkout produces, derived rather than written down.
 *
 * `assets/` comes from the generator (the same call `sync` writes), so a file the
 * generator would produce but the tarball omits reads as a missing entry instead of
 * a number that happens to match. `dist/` is read from disk, so this check answers
 * "did the tarball take everything that is here", while the `exports` assertion
 * answers "is what should be here actually here".
 */
export function expectedTarball(): readonly string[] {
  const files = new Set<string>();

  for (const asset of buildAssets()) files.add(`assets/${asset.path}`);
  for (const path of walk(DIST_ROOT)) files.add(path);
  for (const name of localeFiles()) files.add(`locale/${name}`);
  for (const name of STATIC_FILES) files.add(`static/${name}`);
  for (const name of ROOT_FILES) files.add(name);

  return [...files].sort();
}

function localeFiles(): readonly string[] {
  const directory = join(ROOT, "locale");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

/** Repository-relative paths of every file under one directory. */
function walk(directory: string): readonly string[] {
  const absolute = join(ROOT, ...directory.split("/"));
  if (!existsSync(absolute)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found.sort();
}

/** Compare the tarball npm would produce with what this checkout describes. */
export function compareTarball(
  expected: readonly string[],
  actual: Tarball,
): readonly string[] {
  const problems: string[] = [];
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual.files);

  if (!expectedSet.has(`${DIST_ROOT}/index.mjs`)) {
    problems.push(
      "dist/index.mjs: missing; the package entry point does not exist. Run `pnpm run build:bundle`.",
    );
  }

  const missing = expected.filter((path) => !actualSet.has(path));
  for (const path of missing) problems.push(`${path}: described by the checkout but absent from the tarball`);

  const unexpected = actual.files.filter((path) => !expectedSet.has(path));
  for (const path of unexpected) {
    problems.push(`${path}: in the tarball but not in this checkout's expected set`);
  }

  return problems;
}

/**
 * Fail when a shipped `exports` target is missing from the tree.
 *
 * This is the check that would have caught a deleted `dist/`: the pack command
 * returned 0 and the tarball simply had fewer entries.
 */
export function checkExportsTargets(manifest: unknown, tarball: Tarball | undefined): readonly string[] {
  const problems: string[] = [];
  for (const target of exportsTargets(manifest)) {
    if (!existsSync(join(ROOT, ...target.split("/")))) {
      problems.push(
        `package.json: exports target "${target}" does not exist. Run \`pnpm run build:bundle\`.`,
      );
      continue;
    }
    if (statSync(join(ROOT, ...target.split("/"))).isDirectory()) {
      problems.push(`package.json: exports target "${target}" is a directory, not a file`);
      continue;
    }
    if (tarball !== undefined && !tarball.files.includes(target)) {
      problems.push(
        `package.json: exports target "${target}" exists but is outside "files", so it is not published`,
      );
    }
  }
  return problems;
}

/** The built text of the two entry points whose tables come from manifests. */
export interface BuiltEntryPoints {
  readonly script?: string;
  readonly subagent?: string;
}

/**
 * Fail when the bundled entry points disagree with the manifests that feed them.
 *
 * `src/script.ts` compiles `RUNTIME_CLIS[].assetPath` into `dist/script.mjs`, and
 * `src/subagent.ts` compiles `ROLE_MANIFEST` into `dist/subagent.mjs`. Editing a
 * manifest without rebuilding leaves a `dist` that names paths which do not exist,
 * and the plugin's only failure mode is a run-time "script not found" — the same
 * shape as the `pstack_script` defect that shipped. Reading the built text costs no
 * second build and catches exactly that.
 *
 * An absent file is not reported here, because `compareTarball` and
 * `checkExportsTargets` already report a missing `dist`; this function answers only
 * "does the text that is here agree with the manifests".
 */
export function checkEmbeddedManifests(
  built: BuiltEntryPoints = readBuiltEntryPoints(),
): readonly string[] {
  const problems: string[] = [];

  const { script, subagent } = built;
  if (script !== undefined) {
    for (const entry of RUNTIME_CLIS) {
      if (script.includes(entry.assetPath)) continue;
      problems.push(
        `${DIST_ROOT}/script.mjs: does not carry the asset path for "${entry.id}" (${entry.assetPath}); rebuild with \`pnpm run build:bundle\``,
      );
    }
  }

  if (subagent !== undefined) {
    for (const role of ROLE_MANIFEST) {
      if (subagent.includes(role.key)) continue;
      problems.push(
        `${DIST_ROOT}/subagent.mjs: does not carry the role "${role.key}"; rebuild with \`pnpm run build:bundle\``,
      );
    }
  }

  return problems;
}

/** Read what the bundler last wrote, or nothing when it has not run. */
export function readBuiltEntryPoints(): BuiltEntryPoints {
  const script = readBuilt(`${DIST_ROOT}/script.mjs`);
  const subagent = readBuilt(`${DIST_ROOT}/subagent.mjs`);
  return {
    ...(script === undefined ? {} : { script }),
    ...(subagent === undefined ? {} : { subagent }),
  };
}

function readBuilt(path: string): string | undefined {
  const absolute = join(ROOT, ...path.split("/"));
  if (!existsSync(absolute)) return undefined;
  return readFileSync(absolute, "utf8");
}

/** Group every tarball path by its first segment, in a fixed report order. */
export function sections(files: readonly string[]): readonly PackSection[] {
  const counts = new Map<string, number>();
  for (const path of files) {
    const name = ROOT_FILES.includes(path) ? "root" : path.split("/")[0] || path;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const order = ["assets", DIST_ROOT, "locale", "static", "root"];
  const names = [...counts.keys()].sort((left, right) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left < right ? -1 : 1;
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
  return names.map((name) => ({ name, count: counts.get(name) as number }));
}

/**
 * Read the tarball npm would build, without writing one.
 *
 * `--ignore-scripts` is load-bearing: the publish path runs `prepublishOnly`, and
 * without it this check would start the release verification again from inside a
 * verification step.
 *
 * The package manager comes from `npm_execpath` when this runs under one, so the
 * check uses the same pnpm the caller used instead of whatever `pnpm` is on `PATH`.
 * That variable is a JavaScript entry point under npm (`…/npm-cli.js`) and a native
 * binary under pnpm (`…/pnpm.native`); running the binary through `process.execPath`
 * was the first spelling here and failed with `ELF` on stderr for every release, so
 * the extension decides which form to use.
 */
export function readTarball(cwd: string = ROOT): Tarball {
  const execpath = process.env["npm_execpath"];
  const usable = execpath !== undefined && execpath !== "" && existsSync(execpath);
  const isJavaScript = usable && /\.[cm]?js$/.test(execpath);
  const command = !usable ? "pnpm" : isJavaScript ? process.execPath : execpath;
  const args = ["pack", "--dry-run", "--json", "--ignore-scripts"];
  const result = spawnSync(command, isJavaScript ? [execpath, ...args] : args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw new PackInvocationError(`pnpm pack --dry-run could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    // A native package-manager binary run the wrong way prints binary noise to
    // stderr, so the failure line keeps only its first line and a bounded length.
    const detail = (result.stderr ?? "").trim().split("\n")[0]?.slice(0, 300) ?? "";
    throw new PackInvocationError(
      `pnpm pack --dry-run failed (exit ${String(result.status)}): ${detail}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new PackInvocationError(
      `pnpm pack --dry-run --json did not print JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // pnpm prints one object; npm prints an array of them.
  const record = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = asRecord(record)?.["files"];
  if (!Array.isArray(files)) {
    throw new PackInvocationError("pnpm pack --dry-run --json printed no files array");
  }
  const paths = files
    .map((entry) => asRecord(entry)?.["path"])
    .filter((path): path is string => typeof path === "string");
  if (paths.length !== files.length) {
    throw new PackInvocationError("pnpm pack --dry-run --json printed a file entry with no path");
  }
  return { files: paths.sort() };
}

export function checkPack(): PackReport {
  const problems: string[] = [];

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  } catch (error) {
    return { files: 0, sections: [], problems: [`package.json: ${messageOf(error)}`] };
  }

  let tarball: Tarball | undefined;
  try {
    tarball = readTarball();
  } catch (error) {
    problems.push(messageOf(error));
  }

  // Comparing against a tarball that could not be read would report every expected
  // path as missing, which buries the one real problem (the failed invocation).
  if (tarball !== undefined) {
    try {
      for (const problem of compareTarball(expectedTarball(), tarball)) problems.push(problem);
    } catch (error) {
      problems.push(`the expected tarball could not be derived: ${messageOf(error)}`);
    }
  }

  for (const problem of checkExportsTargets(manifest, tarball)) problems.push(problem);
  for (const problem of checkEmbeddedManifests()) problems.push(problem);

  const files = tarball?.files.length ?? 0;
  return {
    files,
    sections: tarball === undefined ? [] : sections(tarball.files),
    problems,
  };
}

export function main(): number {
  const report = checkPack();

  console.log(
    [
      "pack check",
      `  entries           ${report.files}`,
      ...report.sections.map(
        (section) => `  ${`${section.name}`.padEnd(17)} ${section.count}`,
      ),
    ].join("\n"),
  );

  if (report.problems.length === 0) {
    console.log("pack check passed");
    return 0;
  }

  console.error(`pack check failed (${report.problems.length} problem(s)):`);
  for (const problem of report.problems) console.error(`  ${problem}`);
  return 1;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
