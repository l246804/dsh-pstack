import { describe, expect, it } from "vite-plus/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProvider,
  listBundledSkillDirectories,
  toCandidate,
  toEntry,
} from "../src/provider.ts";

const SKILLS = new Map([
  [
    "poteto-mode",
    '---\nname: poteto-mode\ndescription: "Main mode"\ndisable-model-invocation: true\n---\n\n# Poteto mode\n\nBody.',
  ],
  [
    "setup-pstack",
    '---\nname: setup-pstack\ndescription: "Configure models"\n---\n\n# Setup\n\nBody.',
  ],
]);

const read = (directory: string): string => {
  const source = SKILLS.get(directory);
  if (!source) throw new Error(`missing fixture ${directory}`);
  return source;
};

describe("pstack skill provider", () => {
  it("parses invocation flags from frontmatter", () => {
    const entry = toEntry("poteto-mode", read("poteto-mode"));
    expect(entry.name).toBe("poteto-mode");
    expect(entry.modelInvocable).toBe(false);
    expect(entry.userInvocable).toBe(true);
  });

  it("catalogs skills with the bundled rank and a directory resource base", () => {
    const entry = toEntry("setup-pstack", read("setup-pstack"));
    const candidate = toCandidate(entry);
    expect(candidate.rank).toBe(600);
    expect(candidate.provider).toBe("pstack");
    expect(candidate.resourceBase?.kind).toBe("directory");
    expect(candidate.invocation).toEqual({ modelInvocable: true, userInvocable: true });
  });

  it("lists entries and loads bodies without frontmatter", async () => {
    const provider = createProvider({ directories: ["poteto-mode", "setup-pstack"], read });
    // This provider always returns the complete-array shorthand.
    const listed = (await provider.list({})) as ReadonlyArray<{ name: string }>;
    expect(listed.map((candidate) => candidate.name)).toEqual(["poteto-mode", "setup-pstack"]);

    const winner = listed[0]!;
    const definition = await provider.get(winner as never, {});
    expect(definition?.content.trim()).toBe("# Poteto mode\n\nBody.");
  });

  it("returns undefined for an unknown name", async () => {
    const provider = createProvider({ directories: ["setup-pstack"], read });
    expect(await provider.get({} as never, {})).toBeUndefined();
  });

  it("keeps valid skills available when another directory is invalid", async () => {
    const errors: string[] = [];
    const provider = createProvider({
      directories: ["setup-pstack", "/missing/pstack-skill"],
      read,
      onError: (directory) => errors.push(directory),
    });
    const listed = (await provider.list({})) as ReadonlyArray<{ name: string }>;
    expect(listed.map((candidate) => candidate.name)).toEqual(["setup-pstack"]);
    expect(errors).toEqual(["/missing/pstack-skill"]);
  });

  it("fails loudly for a malformed bundled directory", () => {
    expect(() =>
      createProvider({
        directories: ["/missing/pstack-skill"],
        read,
        strictDirectories: ["/missing/pstack-skill"],
      }),
    ).toThrow("missing fixture");
  });

  it("loads extra skills from absolute directories without prefixing the bundled root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pstack-skill-"));
    try {
      await writeFile(
        join(directory, "SKILL.md"),
        "---\nname: extra-skill\ndescription: Extra\n---\n\n# Extra\n",
      );
      const provider = createProvider({ directories: [directory] });
      const [candidate] = (await provider.list({})) as ReadonlyArray<{
        name: string;
        path: string;
      }>;
      expect(candidate?.name).toBe("extra-skill");
      expect(candidate?.path).toBe(join(directory, "SKILL.md"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("ships every upstream skill except make-bot-ui", () => {
    const directories = listBundledSkillDirectories();
    expect(directories).toContain("poteto-mode");
    expect(directories).toContain("principle-prove-it-works");
    expect(directories).toHaveLength(55);
    expect(directories).not.toContain("make-bot-ui");
  });
});
