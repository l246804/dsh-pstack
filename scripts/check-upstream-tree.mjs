import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const upstream = join(ROOT, "upstream/cursor-plugins");
const originalRoot = join(upstream, "pstack/skills");
const mirrorRoot = join(upstream, "harness/pstack/claude-code/skills");
const adapter = /^In Claude Code, read .*?It maps the Cursor names in pstack skills to Claude Code\.\n\n/ms;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".DS_Store") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const originalFiles = walk(originalRoot);
const mirrorFiles = walk(mirrorRoot);
const originalPaths = new Set(originalFiles.map((path) => relative(originalRoot, path)));
const mirrorPaths = new Set(mirrorFiles.map((path) => relative(mirrorRoot, path)));
const allPaths = [...new Set([...originalPaths, ...mirrorPaths])].sort();
const report = {
  originalFiles: originalFiles.length,
  mirrorFiles: mirrorFiles.length,
  byteIdentical: [],
  adapterOnly: [],
  otherChanges: [],
};

for (const path of allPaths) {
  if (!originalPaths.has(path) || !mirrorPaths.has(path)) {
    report.otherChanges.push(path);
    continue;
  }
  const source = readFileSync(join(originalRoot, path), "utf8");
  const mirror = readFileSync(join(mirrorRoot, path), "utf8");
  if (source === mirror) {
    report.byteIdentical.push(path);
    continue;
  }
  const withoutAdapter = mirror.replace(adapter, "");
  const restored = path.endsWith("SKILL.md")
    ? withoutAdapter.replace(/^(# .*\n)\n/, "$1")
    : withoutAdapter;
  if (restored === source) report.adapterOnly.push(path);
  else report.otherChanges.push(path);
}

console.log(JSON.stringify(report, null, 2));
if (
  report.originalFiles !== 134 ||
  report.mirrorFiles !== 134 ||
  report.byteIdentical.length !== 111 ||
  report.adapterOnly.length !== 23 ||
  report.otherChanges.length !== 0
) {
  process.exitCode = 1;
}
