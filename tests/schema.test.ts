import { describe, expect, it } from "vite-plus/test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseModelConfig, resolvePanel, resolveRole } from "../src/roles.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "assets");

/**
 * Agent kinds `pstack_subagent` accepts. Kept as literals rather than imported
 * from `subagent.ts`: that module pulls in the DSH runtime, and this test should
 * fail on a skill/tool mismatch without booting the harness.
 */
const AGENT_KINDS = ["poteto-agent", "comment-sicko", "general"] as const;

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(full)));
    else if (entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

/**
 * The role table `/setup-pstack` writes. Every role a skill names must be in
 * this set, or the delegation silently falls back to the parent route.
 */
const SHIPPED_ROLES = parseModelConfig(
  await readFile(join(ASSETS, "docs/pstack-models.example.md"), "utf8"),
);

/**
 * Schema-level check on the generated tree: every `agent` and `role` value a
 * skill tells a delegate to pass must be one the tool accepts. A skill and the
 * tool disagreeing here is invisible until a real delegation fails.
 */
describe("generated skill arguments", () => {
  it("names only agent kinds the tool accepts", async () => {
    const problems: string[] = [];
    for (const file of await markdownFiles(ASSETS)) {
      const text = await readFile(file, "utf8");
      for (const match of text.matchAll(/`agent: "([^"]+)"`/g)) {
        const kind = match[1]!;
        if (!(AGENT_KINDS as readonly string[]).includes(kind)) {
          problems.push(`${relative(ROOT, file)}: unknown agent "${kind}"`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("names only roles present in the shipped role file", async () => {
    const problems: string[] = [];
    for (const file of await markdownFiles(ASSETS)) {
      const text = await readFile(file, "utf8");
      for (const match of text.matchAll(/`role: "([^"]+)"`/g)) {
        const role = match[1]!;
        // A placeholder in the adapter doc is not a call to the tool.
        if (role === "<role line>") continue;
        if (resolvePanel(SHIPPED_ROLES, role).length === 0 && !resolveRole(SHIPPED_ROLES, role)) {
          problems.push(`${relative(ROOT, file)}: unknown role "${role}"`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("documents every role the setup skill writes", async () => {
    const [setup, example] = await Promise.all([
      readFile(join(ASSETS, "skills/setup-pstack/SKILL.md"), "utf8"),
      readFile(join(ASSETS, "docs/pstack-models.example.md"), "utf8"),
    ]);

    // The role lines inside the file skeleton the skill tells the agent to
    // write. A role present in one tree and missing from the other means setup
    // and the skills that read the file disagree about what exists. Only the
    // fenced `text` block counts, so frontmatter keys never leak in.
    const rolesIn = (text: string): string[] => {
      // The setup skill embeds the file shape in a `text` fence; the example
      // file is the shape itself. Accept both by preferring a fence and
      // falling back to the whole document.
      const block = /```text\n([\s\S]*?)```/.exec(text)?.[1] ?? text;
      return [...block.matchAll(/^([a-z][^:\n#]*):/gm)]
        .map((match) => match[1]!.trim())
        .filter((role) => role !== "budget");
    };
    const written = rolesIn(setup);
    const shipped = rolesIn(example);
    expect(written.sort()).toEqual(shipped.sort());
    expect(written.length).toBeGreaterThan(10);
  });
});
