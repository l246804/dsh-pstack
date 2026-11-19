#!/usr/bin/env node
// Keep the grouped bilingual compatibility tables in step with package.json before a release commit.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README_HEADING = "## 📦 Compatibility";
const README_HEADING_ZH = "## 📦 兼容性";
const HISTORY_HEADING = "## 📦 Compatibility history";
const HISTORY_HEADING_ZH = "## 📦 兼容历史";
const README_KEEP = 3;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const GROUP_HEADING = /^\*\*DSH (.+)\*\*$/;
const TABLE_SEPARATOR = "|---|---|";

interface ReleaseMetadata {
  version: string;
  dshRange: string;
  pstackVersion: string;
}

interface Manifest {
  version?: string;
  engines?: { dsh?: string };
}

interface Baseline {
  pstackVersion?: string;
}

interface ReleaseRow {
  release: string;
  pstack: string;
}

interface Group {
  dshRange: string;
  rows: ReleaseRow[];
}

interface ParsedSection {
  header: string[];
  groups: Group[];
  trailing: string[];
}

interface SectionSpec {
  file: string;
  heading: string;
  header: string;
}

interface Language {
  readme: SectionSpec;
  history: SectionSpec;
}

const LANGUAGES: readonly Language[] = [
  {
    readme: {
      file: "README.md",
      heading: README_HEADING,
      header: "| dsh-pstack release | pstack version |",
    },
    history: {
      file: "docs/compatibility-history.md",
      heading: HISTORY_HEADING,
      header: "| dsh-pstack release | pstack version |",
    },
  },
  {
    readme: {
      file: "README.zh.md",
      heading: README_HEADING_ZH,
      header: "| dsh-pstack 发布版本 | pstack 版本 |",
    },
    history: {
      file: "docs/compatibility-history.zh.md",
      heading: HISTORY_HEADING_ZH,
      header: "| dsh-pstack 发布版本 | pstack 版本 |",
    },
  },
];

/** Every file `syncCompatibility` rewrites; the release commit must include all of them. */
export const COMPATIBILITY_FILES: readonly string[] = LANGUAGES.flatMap((language) => [
  language.readme.file,
  language.history.file,
]);

function readJson(path: string, root = ROOT): unknown {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

export function releaseMetadata(read = readJson): ReleaseMetadata {
  const manifest = read("package.json") as Manifest;
  const baseline = read("native/upstream.lock.json") as Baseline;
  const version = manifest.version;
  const dshRange = manifest.engines?.dsh;
  const pstackVersion = baseline.pstackVersion;
  if (typeof version !== "string" || !VERSION.test(version)) {
    throw new Error(`package.json has an invalid release version: ${version}`);
  }
  if (typeof dshRange !== "string" || dshRange.trim() === "") {
    throw new Error("package.json must declare engines.dsh");
  }
  if (typeof pstackVersion !== "string" || !VERSION.test(pstackVersion)) {
    throw new Error(`native/upstream.lock.json has an invalid pstackVersion: ${pstackVersion}`);
  }
  return { version, dshRange, pstackVersion };
}

function compareVersions(left: string, right: string): number {
  const parse = (version: string) => {
    const [core, prerelease] = version.split("-");
    return { core: core!.split(".").map(Number), prerelease: prerelease?.split(".") ?? [] };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index++) {
    if (a.core[index] !== b.core[index]) return a.core[index]! - b.core[index]!;
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

function stripCell(cell: string): string {
  return cell.trim().replace(/^`+/, "").replace(/`+$/, "").trim();
}

function wrap(value: string): string {
  return `\`${value}\``;
}

function locate(text: string, heading: string): { start: number; end: number; section: string } {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`file lacks ${heading}`);
  const next = text.indexOf("\n## ", start + heading.length);
  const end = next < 0 ? text.length : next;
  return { start, end, section: text.slice(start, end) };
}

function parseSection(section: string): ParsedSection {
  const lines = section.split("\n");
  const first = lines.findIndex((line) => GROUP_HEADING.test(line.trim()));
  if (first < 0) return { header: lines, groups: [], trailing: [] };
  const header = lines.slice(0, first);
  const groups: Group[] = [];
  let trailing: string[] = [];
  let i = first;
  while (i < lines.length) {
    const match = GROUP_HEADING.exec(lines[i]!.trim());
    if (match === null) break;
    const dshRange = stripCell(match[1]!);
    i += 1;
    while (i < lines.length && lines[i]!.trim() === "") i += 1;
    if (!(lines[i] ?? "").trim().startsWith("|")) {
      throw new Error(`compatibility group ${dshRange} lacks a table header`);
    }
    i += 1;
    if (!/^\|[-| :]+\|$/.test((lines[i] ?? "").trim())) {
      throw new Error(`compatibility group ${dshRange} lacks a table separator`);
    }
    i += 1;
    const rows: ReleaseRow[] = [];
    while (i < lines.length && lines[i]!.trim().startsWith("|")) {
      const cells = lines[i]!.split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (cells.length !== 2)
        throw new Error(`compatibility group ${dshRange} has a malformed row`);
      rows.push({ release: stripCell(cells[0]!), pstack: stripCell(cells[1]!) });
      i += 1;
    }
    groups.push({ dshRange, rows });
    let j = i;
    while (j < lines.length && lines[j]!.trim() === "") j += 1;
    if (j < lines.length && GROUP_HEADING.test(lines[j]!.trim())) {
      i = j;
      continue;
    }
    trailing = lines.slice(i);
    break;
  }
  return { header, groups, trailing };
}

function renderGroup(group: Group, tableHeader: string): string {
  return [
    `**DSH ${wrap(group.dshRange)}**`,
    "",
    tableHeader,
    TABLE_SEPARATOR,
    ...group.rows.map((row) => `| ${wrap(row.release)} | ${wrap(row.pstack)} |`),
  ].join("\n");
}

function serializeSection(parsed: ParsedSection, tableHeader: string): string {
  const head = parsed.header.join("\n").replace(/\n+$/, "");
  let out = head;
  for (const group of parsed.groups) out += `\n\n${renderGroup(group, tableHeader)}`;
  const tail = parsed.trailing.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
  if (tail !== "") out += `\n\n${tail}`;
  return `${out}\n`;
}

function sortRowsDesc(rows: ReleaseRow[]): ReleaseRow[] {
  return [...rows].sort((a, b) => compareVersions(b.release, a.release));
}

function applyRelease(rows: ReleaseRow[], metadata: ReleaseMetadata): ReleaseRow[] {
  const minor = metadata.version.split(".").slice(0, 2).join(".");
  const kept = rows.filter((row) => row.release.split(".").slice(0, 2).join(".") !== minor);
  return sortRowsDesc([...kept, { release: metadata.version, pstack: metadata.pstackVersion }]);
}

function sameRows(left: readonly ReleaseRow[], right: readonly ReleaseRow[]): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (row, index) => row.release === right[index]!.release && row.pstack === right[index]!.pstack,
  );
}

function sameGroups(left: readonly Group[], right: readonly Group[]): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (group, index) =>
      group.dshRange === right[index]!.dshRange && sameRows(group.rows, right[index]!.rows),
  );
}

function readSection(spec: SectionSpec, root: string) {
  const text = readFileSync(join(root, spec.file), "utf8");
  const { start, end, section } = locate(text, spec.heading);
  return { text, start, end, parsed: parseSection(section) };
}

export function syncCompatibility(metadata = releaseMetadata(), write = true, root = ROOT) {
  const perLanguage: Group[][] = [];
  const writes: Array<{ file: string; text: string }> = [];
  let addedRow: boolean | undefined;
  for (const language of LANGUAGES) {
    const readme = readSection(language.readme, root);
    const history = readSection(language.history, root);
    const combined = [...readme.parsed.groups, ...history.parsed.groups];
    const index = combined.findIndex((group) => group.dshRange === metadata.dshRange);
    const added = index < 0;
    const groups = added
      ? [
          {
            dshRange: metadata.dshRange,
            rows: [{ release: metadata.version, pstack: metadata.pstackVersion }],
          },
          ...combined,
        ]
      : combined.map((group, position) =>
          position === index ? { ...group, rows: applyRelease(group.rows, metadata) } : group,
        );
    if (addedRow !== undefined && addedRow !== added) {
      throw new Error("Bilingual compatibility rows are inconsistent");
    }
    addedRow = added;
    perLanguage.push(groups);
    const readmeSection = serializeSection(
      {
        header: readme.parsed.header,
        groups: groups.slice(0, README_KEEP),
        trailing: readme.parsed.trailing,
      },
      language.readme.header,
    );
    const historySection = serializeSection(
      {
        header: history.parsed.header,
        groups: groups.slice(README_KEEP),
        trailing: history.parsed.trailing,
      },
      language.history.header,
    );
    writes.push({
      file: language.readme.file,
      text: `${readme.text.slice(0, readme.start)}${readmeSection}${readme.text.slice(readme.end)}`,
    });
    writes.push({
      file: language.history.file,
      text: `${history.text.slice(0, history.start)}${historySection}${history.text.slice(history.end)}`,
    });
  }
  if (!sameGroups(perLanguage[0]!, perLanguage[1]!)) {
    throw new Error("Bilingual compatibility tables differ");
  }
  const target = perLanguage[0]!.find((group) => group.dshRange === metadata.dshRange);
  const releases = (target?.rows ?? []).map((row) => wrap(row.release));
  if (write) {
    for (const result of writes) writeFileSync(join(root, result.file), result.text);
  }
  return { addedRow: addedRow ?? false, releases };
}

export function verifyCompatibility(metadata = releaseMetadata(), root = ROOT) {
  const perLanguage: Group[][] = [];
  for (const language of LANGUAGES) {
    const readmeGroups = readSection(language.readme, root).parsed.groups;
    const historyGroups = readSection(language.history, root).parsed.groups;
    const all = [...readmeGroups, ...historyGroups];
    if (readmeGroups.length !== Math.min(README_KEEP, all.length)) {
      throw new Error("Compatibility tables are stale; run vpx scripts/release-compatibility.ts");
    }
    perLanguage.push(all);
  }
  if (!sameGroups(perLanguage[0]!, perLanguage[1]!)) {
    throw new Error("Bilingual compatibility tables differ");
  }
  const all = perLanguage[0]!;
  const index = all.findIndex((group) => group.dshRange === metadata.dshRange);
  if (index < 0) return { pending: true, releases: [] };
  const expected = applyRelease(all[index]!.rows, metadata);
  if (!sameRows(expected, all[index]!.rows)) {
    throw new Error("Compatibility tables are stale; run vpx scripts/release-compatibility.ts");
  }
  return { pending: false, releases: expected.map((row) => wrap(row.release)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const metadata = releaseMetadata();
  if (process.argv.includes("--check")) {
    const result = verifyCompatibility(metadata);
    console.log(
      result.pending
        ? `No compatibility group for DSH ${metadata.dshRange} yet; it will be added on release.`
        : `Compatibility tables current for ${result.releases.join("、")}.`,
    );
  } else {
    const result = syncCompatibility(metadata);
    console.log(
      `${result.addedRow ? "Added" : "Updated"} compatibility group for DSH ${metadata.dshRange}: ${result.releases.join("、")}.`,
    );
  }
}
