/**
 * Guards the README "Common commands" tables. The list is curated by hand, so a
 * renamed or removed bundled skill must fail here instead of leaving a dead
 * command in both language variants.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

const ROOT = process.cwd();

/** Where the bundle gets skills from: the generated tree, authored, and vendored. */
const SKILL_ROOTS = ["native/pstack/skills", "skills/authored", "skills/.agents/skills"];

const DOCUMENTS = [
  { file: "README.md", heading: "## ⌨️ Common commands" },
  { file: "README.zh.md", heading: "## ⌨️ 常用命令" },
] as const;

interface Row {
  label: string;
  commands: string[];
}

/** The Markdown between one `##` heading and the next. */
function section(file: string, heading: string): string {
  const text = readFileSync(join(ROOT, file), "utf8");
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`${file} is missing ${JSON.stringify(heading)}`);
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** One table row: the task label and its backticked `/command` names. */
function rows(file: string, heading: string): Row[] {
  return section(file, heading)
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .filter((line) => !/^\|\s*-+\s*\|/.test(line))
    .slice(1)
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      const commands = [...cells[1]!.matchAll(/`\/([a-z0-9-]+)`/g)].map((match) => match[1]!);
      return { label: cells[0]!, commands };
    });
}

function resolves(command: string): boolean {
  return SKILL_ROOTS.some((root) => existsSync(join(ROOT, root, command, "SKILL.md")));
}

describe("README common commands", () => {
  const [en, zh] = DOCUMENTS;
  const enRows = rows(en.file, en.heading);
  const all = enRows.flatMap((row) => row.commands);

  it("keeps both languages on the same rows and commands", () => {
    expect(enRows.map((row) => row.commands)).toEqual(
      rows(zh.file, zh.heading).map((row) => row.commands),
    );
  });

  it("gives every row at least one command", () => {
    expect(enRows.filter((row) => row.commands.length === 0).map((row) => row.label)).toEqual([]);
  });

  it("lists each command once", () => {
    expect(all.length).toBe(new Set(all).size);
  });

  it("resolves every command to a bundled skill", () => {
    const missing = all.filter((command) => !resolves(command));
    expect(missing, `no SKILL.md under ${SKILL_ROOTS.join(", ")}`).toEqual([]);
  });
});
