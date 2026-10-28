import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  createPstackSkillTool,
  readSkillResource,
  renderLoadedSkill,
  type SkillsHost,
} from "../src/skill.ts";
import type { SkillDefinition, ToolRunContext } from "../src/internal/host-contract.ts";

const directories: string[] = [];

function temporarySkill(): { directory: string; definition: SkillDefinition } {
  const directory = mkdtempSync(join(tmpdir(), "pstack-skill-"));
  directories.push(directory);
  mkdirSync(join(directory, "references"), { recursive: true });
  writeFileSync(join(directory, "references", "explorer-prompt.md"), "explore this\n");
  writeFileSync(
    join(directory, "SKILL.md"),
    "---\nname: how\ndescription: walk the code\n---\n\n# How\n",
  );
  const definition: SkillDefinition = {
    name: "how",
    description: "walk the code",
    provider: "pstack",
    resourceBase: { kind: "directory", path: directory },
    content: "# How\n",
    invocation: { modelInvocable: false, userInvocable: true },
    source: "bundled",
  };
  return { directory, definition };
}

const exec = { signal: new AbortController().signal } as unknown as ToolRunContext;

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("pstack_skill", () => {
  it("loads a hidden skill by name", async () => {
    const { definition } = temporarySkill();
    const skills: SkillsHost = { get: async (name) => (name === "how" ? definition : undefined) };
    const tool = createPstackSkillTool(skills);

    const result = await tool.execute({ name: "how" }, exec);

    expect(result).toMatchObject({ name: "how", provider: "pstack", content: "# How\n" });
    expect(renderLoadedSkill(result as never)).toContain('<skill_content name="how">');
    const base = definition.resourceBase;
    expect(base?.kind).toBe("directory");
    expect(renderLoadedSkill(result as never)).toContain(
      `Base directory for this skill: ${base?.kind === "directory" ? base.path : ""}`,
    );
  });

  it("reads a relative resource but refuses traversal", async () => {
    const { definition } = temporarySkill();
    const loaded = await readSkillResource(definition, "references/explorer-prompt.md");
    expect(loaded.content).toBe("explore this\n");
    await expect(readSkillResource(definition, "../secret.txt")).rejects.toThrow(
      /escapes the skill directory/,
    );
  });

  it("reports an unknown skill clearly", async () => {
    const tool = createPstackSkillTool({ get: async () => undefined });
    await expect(tool.execute({ name: "nope" }, exec)).rejects.toThrow(
      'skill "nope" is unknown or no longer available',
    );
  });

  it("rejects an invalid name before touching the registry", async () => {
    let called = 0;
    const tool = createPstackSkillTool({
      get: async () => {
        called += 1;
        return undefined;
      },
    });
    await expect(tool.execute({ name: "Not A Skill" }, exec)).rejects.toThrow(/invalid skill name/);
    expect(called).toBe(0);
  });
});
