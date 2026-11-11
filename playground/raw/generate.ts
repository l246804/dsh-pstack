import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ADAPTER_PATH = "docs/harness/claude-code.md";
const TARGET_ADAPTER_PATH = "docs/harness/dsh.md";
// The committed DSH adapter, authored per playground/raw/AGENTS.md. The
// generator copies it verbatim; no adaptation logic lives here.
const ADAPTER_SOURCE = join(dirname(fileURLToPath(import.meta.url)), "dsh.md");
const INJECTION =
  "In Claude Code, read [the Claude Code adapter](../../docs/harness/claude-code.md) once per session before you follow this skill. It maps the Cursor names in pstack skills to Claude Code.";
const DSH_INJECTION = INJECTION.replaceAll("Claude Code", "DSH").replace(
  "claude-code.md",
  "dsh.md",
);

function walk(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? walk(root, path) : [relative(root, path)];
  });
}

function translateGeneratedReferences(text: string): string {
  return text
    .replaceAll(INJECTION, DSH_INJECTION)
    .replaceAll("harness/claude-code.md", "harness/dsh.md")
    .replaceAll("the Claude Code adapter", "the DSH adapter")
    .replaceAll("Claude Code adapter", "DSH adapter");
}

function assertSafeDestination(root: string, path: string): void {
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new Error(`generated path escapes its destination: ${path}`);
  }
}

function copyFile(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

export function treeDigest(root: string): string {
  const hash = createHash("sha256");
  for (const path of walk(root).sort()) {
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(join(root, path)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export interface GenerateRawOptions {
  upstreamRoot: string;
  outputRoot: string;
}

export interface RawTreeResult {
  outputRoot: string;
  skillCount: number;
  treeDigest: string;
  skillsDigest: string;
}

export function generateRawTree({ upstreamRoot, outputRoot }: GenerateRawOptions): RawTreeResult {
  const source = resolve(upstreamRoot);
  const output = resolve(outputRoot);
  const script = join(source, "scripts/generate-pstack-harness-trees.mjs");
  if (!existsSync(script)) throw new Error(`upstream generator is missing: ${script}`);
  if (output === source || output.startsWith(`${source}/`)) {
    throw new Error("raw output must be outside the upstream source");
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), "pstack-raw-"));
  mkdirSync(dirname(output), { recursive: true });
  const publishRoot = mkdtempSync(join(dirname(output), ".raw-publish-"));
  const isolatedRoot = join(temporaryRoot, "input");
  const staging = join(publishRoot, "staging");
  try {
    mkdirSync(isolatedRoot, { recursive: true });
    cpSync(join(source, "pstack"), join(isolatedRoot, "pstack"), { recursive: true });
    cpSync(script, join(isolatedRoot, "scripts/generate-pstack-harness-trees.mjs"));
    const result = spawnSync(process.execPath, ["scripts/generate-pstack-harness-trees.mjs"], {
      cwd: isolatedRoot,
      encoding: "utf8",
      env: { ...process.env },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`upstream generator exited ${String(result.status)}: ${result.stderr}`);
    }
    const tree = join(isolatedRoot, "harness/pstack/claude-code");
    if (!existsSync(ADAPTER_SOURCE)) {
      throw new Error(`committed DSH adapter is missing: ${ADAPTER_SOURCE}`);
    }
    rmSync(join(tree, ADAPTER_PATH));
    writeFileSync(join(tree, TARGET_ADAPTER_PATH), readFileSync(ADAPTER_SOURCE, "utf8"));

    for (const path of walk(tree)) {
      if (!path.endsWith(".md")) continue;
      const file = join(tree, path);
      const translated = translateGeneratedReferences(readFileSync(file, "utf8"));
      if (
        translated.includes("harness/claude-code.md") ||
        /In Claude Code, read/.test(translated)
      ) {
        throw new Error(`incomplete DSH adapter reference in ${path}`);
      }
      writeFileSync(file, translated);
    }

    for (const entry of readdirSync(join(source, "pstack"), { withFileTypes: true })) {
      if (entry.name === "automations" || entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      const destination = join(staging, "upstream", entry.name);
      copyFile(join(source, "pstack", entry.name), destination);
    }
    const scripts = ["scripts/generate-pstack-harness-trees.mjs"];
    for (const path of scripts) {
      assertSafeDestination(staging, path);
      copyFile(join(source, path), join(staging, path));
    }
    copyFile(join(tree, TARGET_ADAPTER_PATH), join(staging, "dsh.md"));
    copyFile(join(tree, "LICENSE"), join(staging, "LICENSE"));
    for (const path of walk(tree)) {
      assertSafeDestination(staging, join("tree", path));
      copyFile(join(tree, path), join(staging, "tree", path));
    }
    const manifest = {
      source: "scripts/generate-pstack-harness-trees.mjs",
      excluded: ["pstack/automations"],
      digest: treeDigest(join(staging, "tree")),
    };
    writeFileSync(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const previous = join(publishRoot, "previous");
    if (existsSync(output)) renameSync(output, previous);
    renameSync(staging, output);
    rmSync(previous, { recursive: true, force: true });
    return {
      outputRoot: output,
      skillCount: readdirSync(join(tree, "skills")).filter((name) =>
        existsSync(join(tree, "skills", name, "SKILL.md")),
      ).length,
      treeDigest: manifest.digest,
      skillsDigest: treeDigest(join(tree, "skills")),
    };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
    rmSync(publishRoot, { recursive: true, force: true });
  }
}
