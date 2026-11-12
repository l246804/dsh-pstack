#!/usr/bin/env node
// Keep bilingual compatibility tables in step with package.json before a release commit.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TABLE_HEADING = "## 📦 Compatibility";
const TABLE_HEADING_ZH = "## 📦 兼容性";
const KEYS = /^<!-- compatibility-keys: (\[.*\]) -->$/;
const RELEASES = /`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`/g;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const KEY = /^[a-z0-9][a-z0-9.-]*\+(?:port|legacy)-v\d+$/;

interface ReleaseMetadata {
  version: string;
  dshRange: string;
  compatibilityKey: string;
  pstackVersion: string;
}

interface Manifest {
  version?: string;
  engines?: { dsh?: string };
}

interface Baseline {
  compatibilityKey?: string;
  dshVersion?: string;
  pstackCommit?: string;
}

interface UpstreamManifest {
  version?: string;
}

interface CompatibilityRow {
  dshRange: string;
  releases: string[];
  pstackVersion: string;
}

interface CompatibilityTable {
  keys: string[];
  rows: CompatibilityRow[];
}

function readJson(path: string, root = ROOT): unknown {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

export function releaseMetadata(read = readJson): ReleaseMetadata {
  const manifest = read("package.json") as Manifest;
  const baseline = read("playground/baseline.json") as Baseline;
  const upstream = read("upstream/cursor-plugins/pstack/plugin.json") as UpstreamManifest;
  const version = manifest.version;
  const dshRange = manifest.engines?.dsh;
  const compatibilityKey = baseline.compatibilityKey;
  const pstackVersion = upstream.version;
  if (typeof version !== "string" || !VERSION.test(version)) {
    throw new Error(`package.json has an invalid release version: ${version}`);
  }
  if (typeof dshRange !== "string" || dshRange.trim() === "") {
    throw new Error("package.json must declare engines.dsh");
  }
  if (typeof compatibilityKey !== "string" || !KEY.test(compatibilityKey)) {
    throw new Error(`Invalid baseline.compatibilityKey: ${compatibilityKey}`);
  }
  if (typeof pstackVersion !== "string" || !VERSION.test(pstackVersion)) {
    throw new Error(`Invalid bundled pstack version: ${pstackVersion}`);
  }
  return { version, dshRange, compatibilityKey, pstackVersion };
}

function compareVersions(left: string, right: string): number {
  const parse = (version: string) => {
    const [core, prerelease] = version.split("-");
    return { core: core.split(".").map(Number), prerelease: prerelease?.split(".") ?? [] };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index++) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart);
    const rightNumber = /^\d+$/.test(rightPart);
    if (leftNumber && rightNumber) return Number(leftPart) - Number(rightPart);
    if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function compatibilityBlock(metadata: ReleaseMetadata, table: CompatibilityTable) {
  if (table.keys.length !== table.rows.length) {
    throw new Error("Compatibility keys and rows differ in length");
  }
  if (new Set(table.keys).size !== table.keys.length) {
    throw new Error("Compatibility keys contain duplicates");
  }
  const targetIndex = table.keys.indexOf(metadata.compatibilityKey);
  if (targetIndex >= 0 && table.rows[targetIndex].dshRange !== `\`${metadata.dshRange}\``) {
    throw new Error(`DSH range differs for ${metadata.compatibilityKey}`);
  }
  const releases = [...(targetIndex >= 0 ? table.rows[targetIndex].releases : [])];
  const release = `\`${metadata.version}\``;
  const minor = metadata.version.split(".").slice(0, 2).join(".");
  const sameMinor = releases.filter((item) => item.slice(1, -1).startsWith(`${minor}.`));
  if (sameMinor.length > 1) throw new Error(`Duplicate ${minor} compatibility releases`);
  if (sameMinor.length === 1 && compareVersions(metadata.version, sameMinor[0].slice(1, -1)) < 0) {
    throw new Error(`Release ${metadata.version} is older than ${sameMinor[0]}`);
  }
  if (sameMinor.length === 1) releases.splice(releases.indexOf(sameMinor[0]), 1, release);
  else releases.push(release);
  releases.sort((left, right) => {
    const a = left.slice(1, -1).split(".").slice(0, 2).map(Number);
    const b = right.slice(1, -1).split(".").slice(0, 2).map(Number);
    return a[0] - b[0] || a[1] - b[1];
  });
  const row: CompatibilityRow = {
    dshRange: `\`${metadata.dshRange}\``,
    releases,
    pstackVersion: `\`${metadata.pstackVersion}\``,
  };
  if (targetIndex >= 0) {
    const rows = [...table.rows];
    rows[targetIndex] = row;
    return { keys: [...table.keys], rows, appendedRow: false };
  }
  return {
    keys: [metadata.compatibilityKey, ...table.keys],
    rows: [row, ...table.rows],
    appendedRow: true,
  };
}

function serializeKeys(keys: string[]): string {
  return `<!-- compatibility-keys: ${JSON.stringify(keys)} -->`;
}

function serializeRow(row: CompatibilityRow): string {
  return `| ${row.dshRange} | ${row.releases.join("、")} | ${row.pstackVersion} |`;
}

function parseTable(
  path: string,
  lines: string[],
  headerIndex: number,
  dataEnd: number,
): CompatibilityTable {
  const keysLine = lines[headerIndex - 1]?.trim();
  const match = keysLine?.match(KEYS);
  if (match === null || match === undefined) {
    throw new Error(`${path} lacks compatibility-keys metadata`);
  }
  const keys = JSON.parse(match[1]) as unknown;
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string" || !KEY.test(key))) {
    throw new Error(`${path} has invalid compatibility keys`);
  }
  const rows = lines.slice(headerIndex + 2, dataEnd).map((line) => {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 3) throw new Error(`${path} has a malformed compatibility row`);
    const releases = cells[1].match(RELEASES) ?? [];
    if (releases.length === 0) throw new Error(`${path} has a row without releases`);
    return { dshRange: cells[0], releases, pstackVersion: cells[2] };
  });
  if (keys.length !== rows.length) throw new Error(`${path} compatibility key count differs`);
  return { keys, rows };
}

function updateReadme(path: string, heading: string, metadata: ReleaseMetadata, root = ROOT) {
  const text = readFileSync(join(root, path), "utf8");
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`${path} lacks ${heading}`);
  const sectionEnd = text.indexOf("\n## ", start + heading.length);
  const end = sectionEnd < 0 ? text.length : sectionEnd;
  const section = text.slice(start, end);
  const lines = section.split("\n");
  const headerIndex = lines.findIndex((line) => line.startsWith("| DSH"));
  if (headerIndex < 0 || !/^\|[-| :]+\|$/.test(lines[headerIndex + 1]?.trim() ?? "")) {
    throw new Error(`${path} lacks a compatibility table header`);
  }
  let dataEnd = headerIndex + 2;
  while (lines[dataEnd]?.startsWith("|")) dataEnd += 1;
  const table = parseTable(path, lines, headerIndex, dataEnd);
  const updated = compatibilityBlock(metadata, table);
  const replacement = [
    serializeKeys(updated.keys),
    lines[headerIndex],
    lines[headerIndex + 1],
    ...updated.rows.map(serializeRow),
  ];
  const before = lines.slice(0, headerIndex - 1).join("\n");
  const after = lines.slice(dataEnd).join("\n").replace(/^\n*/, "\n\n");
  return {
    text: `${text.slice(0, start)}${before}\n${replacement.join("\n")}${after}${text.slice(end)}`,
    appendedRow: updated.appendedRow,
    releases: updated.rows[updated.keys.indexOf(metadata.compatibilityKey)].releases,
  };
}

export function renderCompatibility(metadata: ReleaseMetadata, root = ROOT) {
  return [
    updateReadme("README.md", TABLE_HEADING, metadata, root),
    updateReadme("README.zh.md", TABLE_HEADING_ZH, metadata, root),
  ];
}

export function syncCompatibility(metadata = releaseMetadata(), write = true, root = ROOT) {
  const results = renderCompatibility(metadata, root);
  if (results.some((result) => result.appendedRow !== results[0].appendedRow)) {
    throw new Error("Bilingual compatibility rows are inconsistent");
  }
  if (results.some((result) => result.releases.join() !== results[0].releases.join())) {
    throw new Error("Bilingual compatibility releases are inconsistent");
  }
  if (write) {
    writeFileSync(join(root, "README.md"), results[0].text);
    writeFileSync(join(root, "README.zh.md"), results[1].text);
  }
  return { addedRow: results[0].appendedRow, releases: results[0].releases };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const metadata = releaseMetadata();
  if (process.argv.includes("--check")) {
    const current = [
      readFileSync(join(ROOT, "README.md"), "utf8"),
      readFileSync(join(ROOT, "README.zh.md"), "utf8"),
    ];
    const once = renderCompatibility(metadata).map((result) => result.text);
    if (current.some((text, index) => text !== once[index])) {
      throw new Error("Compatibility tables are stale; run vpx port/release-compatibility.ts");
    }
    console.log(
      `Compatibility tables current for ${syncCompatibility(metadata, false).releases.join("、")}.`,
    );
  } else {
    const result = syncCompatibility(metadata);
    console.log(
      `${result.addedRow ? "Added" : "Updated"} compatibility row for ${metadata.compatibilityKey}: ${result.releases.join("、")}.`,
    );
  }
}
