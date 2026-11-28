#!/usr/bin/env node
// Generate the native pstack tree: native/upstream (the pinned released tree)
// + native/dsh.md (the DSH standard-mode answers) -> native/pstack.
// Run scripts/fetch-upstream.ts first when the pin moves.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const {
  values: { check: checkMode },
} = parseArgs({
  // `vp run native:generate:check -- --check` forwards a bare `--`; drop it first.
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { check: { type: "boolean", default: false } },
  allowPositionals: false,
});

import { renderPstack, type TreeFile } from "./lib/generate.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = join(ROOT, "native/upstream");
const ADAPTER_SOURCE = "native/dsh.md";
const OUT = join(ROOT, "native/pstack");
const LOCK = join(ROOT, "native/upstream.lock.json");
const COMMAND = "vpx native/scripts/generate-pstack.ts";
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function file(path: string): TreeFile {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

if (!existsSync(join(SOURCE, "plugin.json"))) {
  throw new Error("native/upstream is missing; run scripts/fetch-upstream.ts first");
}
const pinned = JSON.parse(readFileSync(join(SOURCE, "plugin.json"), "utf8")).version;
const lock = JSON.parse(readFileSync(LOCK, "utf8"));
if (lock.pstackVersion !== pinned) {
  throw new Error(
    `native/upstream carries ${pinned} but native/upstream.lock.json pins ${lock.pstackVersion}; rerun scripts/fetch-upstream.ts`,
  );
}

const source = new Map(
  walk(SOURCE).map((path) => [relative(SOURCE, path).split("\\").join("/"), file(path)]),
);
const {
  files: rendered,
  skillCount,
  wrappedCount,
} = renderPstack(source, readFileSync(join(ROOT, ADAPTER_SOURCE), "utf8"));

if (checkMode) {
  const onDisk = new Map(
    existsSync(OUT) ? walk(OUT).map((path) => [relative(OUT, path), file(path)]) : [],
  );
  const drifted = [...new Set([...rendered.keys(), ...onDisk.keys()])]
    .sort((left, right) => left.localeCompare(right))
    .filter((path) => {
      const [want, have] = [rendered.get(path), onDisk.get(path)];
      return (
        !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable
      );
    });
  for (const path of drifted.slice(0, 20)) console.log(`pstack/${path}`);
  if (drifted.length > 0) {
    console.log(`pstack is out of date. Run \`${COMMAND}\` and commit the result.`);
    process.exit(1);
  }
  console.log("pstack is up to date.");
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [path, { bytes, executable }] of rendered) {
    mkdirSync(dirname(join(OUT, path)), { recursive: true });
    writeFileSync(join(OUT, path), bytes);
    chmodSync(join(OUT, path), executable ? 0o755 : 0o644);
  }
  console.log(`${skillCount} skills, ${wrappedCount} SKILL.md files with the adapter line`);
}
