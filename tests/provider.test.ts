import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { EXCLUDED_SKILLS } from "../scripts/patches.ts";
import { parseFrontmatter, validateSkillFrontmatter } from "../src/frontmatter.ts";
import {
  BUNDLED_SKILL_RANK,
  BundledSkillError,
  createPstackSkillProvider,
  createPstackSkillProviderFromRoot,
  loadBundledSkillIndex,
} from "../src/provider.ts";
import type { SkillCandidate, SkillProvider, SkillProviderControl } from "../src/provider.ts";
import { apply, name as pluginName, inject, Config, SKILLS_ROOT } from "../src/index.ts";
import type { PstackSkillHost } from "../src/index.ts";

const root = SKILLS_ROOT;
const index = loadBundledSkillIndex(root);
const provider = createPstackSkillProvider(index);

const tempRoots: string[] = [];

afterAll(() => {
  for (const directory of tempRoots) rmSync(directory, { recursive: true, force: true });
});

async function candidates(): Promise<readonly SkillCandidate[]> {
  return provider.list({});
}

function candidateNamed(list: readonly SkillCandidate[], skill: string): SkillCandidate {
  const candidate = list.find((entry) => entry.name === skill);
  if (candidate === undefined) throw new Error(`no candidate for "${skill}"`);
  return candidate;
}

/** Build a throwaway skills root from `{ "<dir>": "SKILL.md body" }`. */
function temporarySkillsRoot(files: Readonly<Record<string, string>>): string {
  const base = mkdtempSync(join(tmpdir(), "dsh-pstack-provider-"));
  tempRoots.push(base);
  for (const [skill, content] of Object.entries(files)) {
    mkdirSync(join(base, skill), { recursive: true });
    if (content !== "") writeFileSync(join(base, skill, "SKILL.md"), content);
  }
  return base;
}

function skillFile(frontmatter: readonly string[], body = "\n# Demo\n\nBody.\n"): string {
  return ["---", ...frontmatter, "---", body].join("\n");
}

/** Every regular file below a directory, depth-first. */
function listFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => (left.name < right.name ? -1 : 1))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    });
}

describe("bundled skill index", () => {
  it("loads 55 skills, one for every declared upstream skill", () => {
    const excluded = new Set(EXCLUDED_SKILLS.map((exclusion) => exclusion.skill));
    const directories = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((skill) => !excluded.has(skill));

    expect(index.size).toBe(55);
    expect([...index.values()].map((skill) => skill.name).sort()).toEqual(directories.sort());
    expect(pluginName).toBe("pstack");
    expect(inject).toEqual(["skills"]);
  });

  it("resolves every skill directory inside the package assets", () => {
    for (const skill of index.values()) {
      expect(isAbsolute(skill.directory), skill.name).toBe(true);
      expect(skill.directory, skill.name).toBe(join(root, skill.name));
      expect(skill.instructionFile, skill.name).toBe(join(skill.directory, "SKILL.md"));
    }
  });
});

describe("provider catalog", () => {
  it("lists all 55 candidates with the rc.3 candidate fields", async () => {
    const list = await candidates();
    expect(list).toHaveLength(55);

    for (const candidate of list) {
      expect(candidate.name, candidate.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(candidate.description.trim(), candidate.name).not.toBe("");
      expect(candidate.source, candidate.name).toBe("bundled");
      expect(candidate.provider, candidate.name).toBe("pstack");
      expect(candidate.rank, candidate.name).toBe(BUNDLED_SKILL_RANK);
      expect(BUNDLED_SKILL_RANK, candidate.name).toBe(600);
      expect(candidate.invocation.modelInvocable, candidate.name).toBeTypeOf("boolean");
      expect(candidate.invocation.userInvocable, candidate.name).toBeTypeOf("boolean");
      expect(candidate.locator, candidate.name).toMatchObject({ kind: "bundled-skill" });
      expect(isAbsolute(candidate.path as string), candidate.name).toBe(true);
      expect(candidate.path, candidate.name).toBe(join(root, candidate.name, "SKILL.md"));
      expect(candidate.resourceBase, candidate.name).toEqual({
        kind: "directory",
        path: join(root, candidate.name),
      });
      expect(readFileSync(candidate.path as string, "utf8"), candidate.name).toContain("---");
    }
  });

  it("sorts candidates by name and returns a fresh array each call", async () => {
    const first = await candidates();
    const second = await candidates();
    const names = first.map((candidate) => candidate.name);

    expect(names).toEqual([...names].sort());
    expect(second).not.toBe(first);
    expect(second.map((candidate) => candidate.name)).toEqual(names);
  });

  it("keeps upstream disable-model-invocation and user-invocable flags", async () => {
    const list = await candidates();
    const modelInvocable = list.filter((candidate) => candidate.invocation.modelInvocable);

    expect(modelInvocable.map((candidate) => candidate.name)).toEqual(["setup-pstack"]);
    expect(list.filter((candidate) => candidate.invocation.userInvocable)).toHaveLength(55);

    const setup = candidateNamed(list, "setup-pstack");
    expect(setup.invocation).toEqual({ modelInvocable: true, userInvocable: true });

    for (const skill of ["poteto-mode", "how", "why", "principle-prove-it-works"]) {
      expect(candidateNamed(list, skill).invocation, skill).toEqual({
        modelInvocable: false,
        userInvocable: true,
      });
    }

    // Every candidate must mirror the frontmatter of the asset it was built from.
    for (const candidate of list) {
      const { data } = parseFrontmatter(readFileSync(candidate.path as string, "utf8"));
      const frontmatter = validateSkillFrontmatter(data, candidate.path as string);
      expect(candidate.invocation, candidate.name).toEqual({
        modelInvocable: !frontmatter.disableModelInvocation,
        userInvocable: frontmatter.userInvocable,
      });
      expect(candidate.description, candidate.name).toBe(frontmatter.description);
    }
  });

  it("carries whenToUse only when the asset declares it", async () => {
    for (const candidate of await candidates()) {
      const { data } = parseFrontmatter(readFileSync(candidate.path as string, "utf8"));

      if (data["whenToUse"] === undefined) {
        expect(Object.hasOwn(candidate, "whenToUse"), candidate.name).toBe(false);
      } else {
        expect(candidate.whenToUse, candidate.name).toBe(data["whenToUse"]);
      }
    }
  });
});

describe("provider loading", () => {
  it("returns the body without frontmatter for the four unit-2 samples", async () => {
    const list = await candidates();

    for (const skill of ["poteto-mode", "how", "setup-pstack", "principle-prove-it-works"]) {
      const candidate = candidateNamed(list, skill);
      const definition = await provider.get(candidate, {});

      expect(definition, skill).toBeDefined();
      const source = readFileSync(candidate.path as string, "utf8");
      const expected = parseFrontmatter(source).body;

      expect(definition?.content, skill).toBe(expected);
      expect(definition?.content.startsWith("---"), skill).toBe(false);
      expect(definition?.content, skill).toContain("# ");
      expect(definition?.name, skill).toBe(skill);
      expect(definition?.provider, skill).toBe("pstack");
      expect(definition?.source, skill).toBe("bundled");
      expect(definition?.path, skill).toBe(candidate.path);
      expect(definition?.resourceBase, skill).toEqual(candidate.resourceBase);
      expect(definition?.invocation, skill).toEqual(candidate.invocation);
    }
  });

  it("strips frontmatter from every bundled skill", async () => {
    for (const candidate of await candidates()) {
      const definition = await provider.get(candidate, {});
      const expected = parseFrontmatter(readFileSync(candidate.path as string, "utf8")).body;

      expect(definition?.content, candidate.name).toBe(expected);
      expect(definition?.content.startsWith("---"), candidate.name).toBe(false);
    }
  });

  it("keeps references readable through the candidate resource base", async () => {
    const list = await candidates();
    const withReferences = list.filter((candidate) => {
      const base = candidate.resourceBase;
      return (
        base !== undefined &&
        base.kind === "directory" &&
        readdirSync(base.path, { withFileTypes: true }).some(
          (entry) => entry.isDirectory() && entry.name === "references",
        )
      );
    });

    expect(withReferences.length).toBeGreaterThan(0);
    expect(withReferences.map((candidate) => candidate.name)).toContain("how");

    for (const candidate of withReferences) {
      const base = candidate.resourceBase as { kind: "directory"; path: string };
      const files = listFiles(join(base.path, "references"));
      expect(files.length, candidate.name).toBeGreaterThan(0);
      for (const file of files) {
        expect(readFileSync(file, "utf8").length, file).toBeGreaterThan(0);
      }
    }

    const how = candidateNamed(list, "how");
    const base = how.resourceBase as { kind: "directory"; path: string };
    expect(readFileSync(join(base.path, "references", "explorer-prompt.md"), "utf8")).toContain(
      "#",
    );
  });

  it("rejects a locator this provider did not produce", async () => {
    const how = candidateNamed(await candidates(), "how");

    expect(
      await provider.get({ ...how, locator: { kind: "bundled-skill", directory: "/etc" } }, {}),
    ).toBeUndefined();
    expect(await provider.get({ ...how, locator: undefined }, {})).toBeUndefined();
    expect(await provider.get({ ...how, locator: "../how/SKILL.md" }, {})).toBeUndefined();
    expect(
      await provider.get(
        {
          ...how,
          locator: {
            kind: "bundled-skill",
            directory: join(root, "how"),
            instructionFile: join(root, "how", "other.md"),
          },
        },
        {},
      ),
    ).toBeUndefined();
  });

  it("rejects a candidate whose name disagrees with its locator", async () => {
    const how = candidateNamed(await candidates(), "how");
    expect(await provider.get({ ...how, name: "why" }, {})).toBeUndefined();
  });

  it("honours an aborted lookup signal", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const how = candidateNamed(await candidates(), "how");

    await expect(provider.list({ signal: controller.signal })).rejects.toThrow("cancelled");
    await expect(provider.get(how, { signal: controller.signal })).rejects.toThrow("cancelled");
  });

  it("returns undefined when the instruction file disappeared after startup", async () => {
    const skillsRoot = temporarySkillsRoot({
      demo: skillFile(["name: demo", "description: Demo skill."]),
    });
    const provider = createPstackSkillProviderFromRoot(skillsRoot);
    const [demo] = await provider.list({});
    rmSync(join(skillsRoot, "demo", "SKILL.md"));

    expect(await provider.get(demo as SkillCandidate, {})).toBeUndefined();
  });
});

describe("malformed bundled skills", () => {
  it("fails instead of dropping a skill with invalid frontmatter", () => {
    const skillsRoot = temporarySkillsRoot({
      good: skillFile(["name: good", "description: Fine."]),
      broken: "---\nname: broken\n---\n\n# Broken\n",
    });

    expect(() => loadBundledSkillIndex(skillsRoot)).toThrow(BundledSkillError);
    expect(() => loadBundledSkillIndex(skillsRoot)).toThrow(/broken\/SKILL\.md.*description/);
  });

  it("fails on a missing SKILL.md, a non-directory entry, and an empty tree", () => {
    const missing = temporarySkillsRoot({ empty: "" });
    expect(() => loadBundledSkillIndex(missing)).toThrow(/SKILL\.md/);

    const base = mkdtempSync(join(tmpdir(), "dsh-pstack-provider-"));
    tempRoots.push(base);
    writeFileSync(join(base, "stray.md"), "not a skill");
    expect(() => loadBundledSkillIndex(base)).toThrow(/not a skill directory/);

    const empty = mkdtempSync(join(tmpdir(), "dsh-pstack-provider-"));
    tempRoots.push(empty);
    expect(() => loadBundledSkillIndex(empty)).toThrow(/no skill directories/);
  });

  it("fails when a skill name disagrees with its directory", () => {
    const skillsRoot = temporarySkillsRoot({
      demo: skillFile(["name: other", "description: Mismatched name."]),
    });

    expect(() => loadBundledSkillIndex(skillsRoot)).toThrow(/does not match its directory/);
  });

  it("fails on an unreadable root", () => {
    expect(() => loadBundledSkillIndex(join(tmpdir(), "dsh-pstack-does-not-exist"))).toThrow(
      /cannot read/,
    );
  });

  it("makes the same failure block provider construction", () => {
    const skillsRoot = temporarySkillsRoot({ broken: "no frontmatter here" });

    expect(() => createPstackSkillProviderFromRoot(skillsRoot)).toThrow(BundledSkillError);
  });
});

describe("host entry", () => {
  const control: SkillProviderControl = {
    signal: new AbortController().signal,
    invalidate: () => {},
  };

  function fakeHost(registered: SkillProvider[]): PstackSkillHost {
    return {
      skills: {
        registerProvider(create) {
          registered.push(create(control));
          return () => {};
        },
      },
    };
  }

  it("registers exactly one provider on the skill registry", async () => {
    const registered: SkillProvider[] = [];

    apply(fakeHost(registered), {});

    expect(registered).toHaveLength(1);
    const list = await (registered[0] as SkillProvider).list({});
    expect(list).toHaveLength(55);
    expect(registered[0]?.name).toBe("pstack");
  });

  it("uses a configured provider name without changing the catalog", async () => {
    const registered: SkillProvider[] = [];

    apply(fakeHost(registered), { providerName: "pstack-secondary" });

    const list = await (registered[0] as SkillProvider).list({});
    expect(registered[0]?.name).toBe("pstack-secondary");
    expect(list).toHaveLength(55);
    expect(list[0]?.provider).toBe("pstack-secondary");
  });
});

describe("row config schema", () => {
  const validate = (value: unknown): unknown => Config["~standard"].validate(value);

  it("accepts an omitted config and fills the documented default", () => {
    expect(validate(undefined)).toEqual({ value: { providerName: "pstack" } });
    expect(validate(null)).toEqual({ value: { providerName: "pstack" } });
    expect(validate({})).toEqual({ value: { providerName: "pstack" } });
    expect(validate({ providerName: "alt" })).toEqual({ value: { providerName: "alt" } });
  });

  it("reports issues for unknown fields and invalid values", () => {
    expect(validate({ nope: 1 })).toMatchObject({ issues: [{ path: ["nope"] }] });
    expect(validate({ providerName: "" })).toMatchObject({
      issues: [{ path: ["providerName"] }],
    });
    expect(validate({ providerName: 7 })).toMatchObject({
      issues: [{ path: ["providerName"] }],
    });
    expect(validate("pstack")).toMatchObject({ issues: [{ message: "config must be a mapping" }] });
  });
});
