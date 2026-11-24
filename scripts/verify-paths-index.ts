#!/usr/bin/env node
// Verify that a built package produces a complete absolute path index.
//
// Run `vp pack` first. This reads `dist/index.mjs`, scans the three skill roots,
// validates every generated path, and checks that a second write is identical.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { resolvePackagePaths } from "../src/lib/paths.ts";
import { buildPstackPathsDocument, writePstackPathsIndex } from "../src/pstack/paths-index.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ENTRY = join(ROOT, "dist", "index.mjs");
const problems: string[] = [];

const { values } = parseArgs({
  options: {
    entry: { type: "string", default: DEFAULT_ENTRY },
    json: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const entry = resolve(values.entry);
if (!existsSync(entry)) {
  console.error(`missing ${entry}; run vp pack first`);
  process.exit(1);
}

const paths = resolvePackagePaths(pathToFileURL(entry).href);
const document = buildPstackPathsDocument(paths);

for (const [name, directory] of Object.entries(document.skills)) {
  if (!isAbsolute(directory)) problems.push(`${name}: not absolute`);
  if (directory.split(/[\\/]/).includes("..")) problems.push(`${name}: contains ".."`);
  if (!existsSync(join(directory, "SKILL.md"))) problems.push(`${name}: missing SKILL.md`);
}

const target = join(tmpdir(), `pstack-paths-${process.pid}.json`);
try {
  writePstackPathsIndex(target, paths);
  const first = readFileSync(target, "utf8");
  writePstackPathsIndex(target, paths);
  if (readFileSync(target, "utf8") !== first) problems.push("second write changed the file");
  if (values.json) console.log(first.trimEnd());
} finally {
  rmSync(target, { force: true });
}

if (!values.json) {
  const sample = Object.entries(document.skills).slice(0, 5);
  console.log(
    JSON.stringify(
      {
        packageRoot: document.packageRoot,
        pstackRoot: document.pstackRoot,
        dshAdapter: document.dshAdapter,
        skills: Object.keys(document.skills).length,
        sample: Object.fromEntries(sample),
      },
      null,
      2,
    ),
  );
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
