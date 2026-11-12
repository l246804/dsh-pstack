import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

// Structural guard for the committed DSH adapter (playground/raw/dsh.md).
// Verification only: it never generates. The rules the adapter follows live in
// playground/raw/AGENTS.md.

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = join(repository, "upstream/cursor-plugins");
const upstreamAdapter = join(upstream, "pstack/docs/harness/claude-code.md");
const upstreamGenerator = join(upstream, "scripts/generate-pstack-harness-trees.mjs");
const skillsRoot = join(upstream, "pstack/skills");
const dshAdapter = join(repository, "playground/raw/dsh.md");

// Copied from the upstream generator's TERMS list; the drift assertions below
// fail when upstream changes it, so this copy cannot silently diverge.
const TERMS: { key: string; re: RegExp }[] = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: '`environment: "cloud"`', re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "claude-", re: /\bclaude-[a-z]+-\d/ },
  { key: "grok-", re: /\bgrok-\d/ },
  { key: "gpt-", re: /\bgpt-\d/ },
  { key: "inherit-parent", re: /inherit-parent/ },
  { key: "pstack-models.mdc", re: /pstack-models\.mdc/ },
  { key: ".cursor/skills/", re: /\.cursor\/skills/ },
  { key: "~/.cursor/plugins/", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: ".cursor/rules/", re: /\.cursor\/rules|always-applied rule/ },
  { key: "agent-transcripts", re: /agent-transcripts|\.cursor\/projects/ },
  {
    key: "Cursor-only features",
    re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent|built-in PR tool/,
  },
];
const ROUTE_KEY = "Run another pstack skill";

function walkMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

// The Cursor terms the upstream skill corpus actually uses, following the
// upstream generator's classification (TERMS regexes plus bare-skill routes).
function usedCursorTerms(): Set<string> {
  const skills = readdirSync(skillsRoot).filter((name) =>
    existsSync(join(skillsRoot, name, "SKILL.md")),
  );
  const used = new Set<string>();
  for (const skill of skills) {
    const others = skills.filter((name) => name !== skill).join("|");
    const route = new RegExp(
      `the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``,
      "g",
    );
    for (const path of walkMarkdown(join(skillsRoot, skill))) {
      const text = readFileSync(path, "utf8");
      for (const term of TERMS) if (term.re.test(text)) used.add(term.key);
      for (const line of text.split("\n")) {
        for (const match of line.matchAll(route)) {
          const name = match.groups?.bold ?? match.groups?.command;
          if (name !== undefined && !line.includes(`(../${name}/`)) used.add(ROUTE_KEY);
        }
      }
    }
  }
  return used;
}

interface Section {
  heading: string;
  rows: string[][];
}

// Parse the two-column tables of an adapter document, keeping data rows only.
function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of text.split("\n")) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      current = { heading: heading[1], rows: [] };
      sections.push(current);
      continue;
    }
    if (!current || !line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 2) continue;
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    if (cells[0] === "Cursor") continue;
    current.rows.push(cells);
  }
  return sections;
}

describe("committed DSH adapter guard", () => {
  const dsh = readFileSync(dshAdapter, "utf8");
  const source = readFileSync(upstreamAdapter, "utf8");

  it("stays bound to the upstream TERMS vocabulary", () => {
    const generator = readFileSync(upstreamGenerator, "utf8");
    for (const term of TERMS) {
      expect(
        generator,
        `upstream TERMS changed; re-judge dsh.md and this list (key ${term.key})`,
      ).toContain(`key: ${JSON.stringify(term.key)}`);
      expect(generator).toContain(term.re.toString());
    }
    expect(generator).toContain(`const ROUTE_KEY = ${JSON.stringify(ROUTE_KEY)}`);
  });

  it("has a row for every Cursor term the upstream skill corpus uses", () => {
    const used = usedCursorTerms();
    expect(used.size).toBeGreaterThan(0);
    for (const key of used) {
      expect(dsh, `dsh.md has no row for ${key}`).toContain(key);
    }
  });

  it("keeps every upstream section, table row, and Cursor cell", () => {
    const upstreamSections = parseSections(source);
    const dshSections = parseSections(dsh);
    expect(dshSections.map((section) => section.heading)).toEqual(
      upstreamSections.map((section) => section.heading),
    );
    expect(upstreamSections.length).toBe(6);
    for (const [index, upstreamSection] of upstreamSections.entries()) {
      const dshSection = dshSections[index];
      expect(dshSection.rows.length, `row count in ${upstreamSection.heading}`).toBe(
        upstreamSection.rows.length,
      );
      for (const [row, upstreamRow] of upstreamSection.rows.entries()) {
        expect(dshSection.rows[row][0], `Cursor cell ${row} in ${upstreamSection.heading}`).toBe(
          upstreamRow[0],
        );
      }
    }
  });

  it("targets DSH, never Claude Code or this plugin's artifacts", () => {
    expect(dsh).toContain("# pstack in DSH");
    expect(dsh).toContain("| Cursor | DSH |");
    expect(dsh).not.toContain("Claude Code");
    expect(dsh).not.toContain("claude-code.md");
    expect(dsh).not.toContain("~/.claude");
    expect(dsh).not.toMatch(/pstack_(subagent|skill|models|roles)\b/);
    expect(dsh).not.toContain("unmapped upstream");
  });
});
