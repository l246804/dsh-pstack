/**
 * Regenerate `assets/` from the pinned upstream tree, or prove it is current.
 *
 * The tree is built in memory first, written to a staging directory, verified
 * against the expected bytes and modes, and only then swapped into place. A
 * failure leaves no half-written tree behind. `--check` compares a fresh build
 * with what is on disk and never writes.
 */
import { Buffer } from "node:buffer";
import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ASSETS_ROOT,
  BACKUP_ROOT,
  buildAssets,
  ROOT,
  STAGING_ROOT,
  summarizeAssets,
} from "./build-assets.ts";
import type { Asset, AssetSummary } from "./build-assets.ts";

export interface DiskAsset {
  readonly bytes: Buffer;
  readonly executable: boolean;
}

export async function readAssets(root: string): Promise<Map<string, DiskAsset>> {
  const assets = new Map<string, DiskAsset>();
  for (const absolutePath of await walk(root)) {
    const relativePath = relative(root, absolutePath).split("\\").join("/");
    const [bytes, details] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
    assets.set(relativePath, { bytes, executable: (details.mode & 0o111) !== 0 });
  }
  return assets;
}

export function compareAssets(
  expected: readonly Asset[],
  actual: ReadonlyMap<string, DiskAsset>,
): readonly string[] {
  const problems: string[] = [];
  const expectedPaths = new Set<string>();

  for (const asset of expected) {
    expectedPaths.add(asset.path);
    const found = actual.get(asset.path);
    if (found === undefined) {
      problems.push(`missing: assets/${asset.path}`);
      continue;
    }
    if (!found.bytes.equals(asset.bytes)) problems.push(`bytes differ: assets/${asset.path}`);
    if (found.executable !== asset.executable) {
      problems.push(
        `mode differs: assets/${asset.path} (expected ${asset.executable ? "0o755" : "0o644"}, found ${found.executable ? "0o755" : "0o644"})`,
      );
    }
  }

  for (const path of [...actual.keys()].sort()) {
    if (expectedPaths.has(path)) continue;
    // The vendored third-party tree is not generated from the pstack submodule, so
    // this comparison cannot speak for it. `scripts/sync-skills-ext.ts` owns those
    // files and checks them against their own pinned revision instead. Reporting them
    // here as "unexpected" would be the true statement that the generator did not
    // produce them, which is not a problem a reader could act on.
    if (path.startsWith("skills-ext/")) continue;
    problems.push(`unexpected: assets/${path}`);
  }

  return problems;
}

export async function writeAssets(assets: readonly Asset[]): Promise<void> {
  assertGeneratedDirectory(STAGING_ROOT);
  assertGeneratedDirectory(BACKUP_ROOT);
  assertGeneratedDirectory(ASSETS_ROOT);

  await rm(STAGING_ROOT, { recursive: true, force: true });
  await mkdir(STAGING_ROOT, { recursive: true });
  for (const asset of assets) {
    const target = join(STAGING_ROOT, ...asset.path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, asset.bytes);
    await chmod(target, asset.executable ? 0o755 : 0o644);
  }

  const staged = await readAssets(STAGING_ROOT);
  const problems = compareAssets(assets, staged);
  if (problems.length > 0) {
    throw new Error(
      `staged tree failed verification:\n${problems.map((problem) => `  ${problem}`).join("\n")}`,
    );
  }

  await rm(BACKUP_ROOT, { recursive: true, force: true });
  const hadAssets = await exists(ASSETS_ROOT);
  if (hadAssets) await rename(ASSETS_ROOT, BACKUP_ROOT);
  try {
    await rename(STAGING_ROOT, ASSETS_ROOT);
  } catch (error) {
    if (hadAssets) await rename(BACKUP_ROOT, ASSETS_ROOT);
    throw error;
  }
  await rm(BACKUP_ROOT, { recursive: true, force: true });
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const check = argv.includes("--check");

  let assets;
  try {
    assets = buildAssets();
  } catch (error) {
    // `buildAssets` reads the built `runtime/`, so a fresh clone fails here before
    // it can even compare. An uncaught throw printed a stack trace above a message
    // that already said what to run, which reads as a crash rather than a
    // precondition. The stub `pnpm run build:assets` chains the two steps, so the
    // fix is one command and the message can name it.
    console.error(`assets cannot be built: ${messageOf(error)}`);
    return 1;
  }
  const summary = summarizeAssets(assets);

  if (!check) {
    await writeAssets(assets);
    console.log(`wrote assets/: ${describeSummary(summary)}`);
    return 0;
  }

  const problems = compareAssets(assets, await readAssets(ASSETS_ROOT));
  if (problems.length === 0) {
    console.log(`assets/ matches a fresh build: ${describeSummary(summary)}`);
    return 0;
  }

  console.error(`assets/ differs from a fresh build (${problems.length} difference(s)):`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    "Run `pnpm run build:assets` to regenerate the tree. Edit the rules, never assets/.",
  );
  return 1;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeSummary(summary: AssetSummary): string {
  return [
    `${summary.skills} skills`,
    `${summary.agents} agents`,
    `${summary.guideMarkdown} guide markdown`,
    `${summary.guideImages} images`,
    `${summary.executables} executables`,
    `${summary.generated} generated`,
    `${summary.files} files`,
  ].join(", ");
}

function assertGeneratedDirectory(directory: string): void {
  if (dirname(directory) !== ROOT) {
    throw new Error(`refusing to modify ${directory}; it must be a direct child of ${ROOT}`);
  }
}

async function walk(directory: string): Promise<readonly string[]> {
  const present = await exists(directory);
  if (!present) return [];

  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    if (entry.name === ".DS_Store") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
