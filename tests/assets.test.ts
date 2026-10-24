import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { GENERATED_HARNESS_DOC, UPSTREAM_ROOT } from "../scripts/asset-paths.ts";
import {
  buildAssets,
  DSH_INTRO,
  renderAgent,
  renderSkill,
  skillDirectories,
  summarizeAssets,
  walkUpstream,
} from "../scripts/build-assets.ts";
import { checkAssets } from "../scripts/check-assets.ts";
import { checkPatches } from "../scripts/check-patches.ts";
import { EXCLUDED_SKILLS, FILE_PATCHES, patchesForFile } from "../scripts/patches/index.ts";
import { applyFilePatches } from "../scripts/patches/apply.ts";
import { compareAssets } from "../scripts/sync-upstream.ts";
import {
  parseFrontmatter,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} from "../src/frontmatter.ts";

const assets = buildAssets();
const byPath = new Map(assets.map((asset) => [asset.path, asset]));
const excluded = new Set(EXCLUDED_SKILLS.map((exclusion) => exclusion.skill));
const expectedSkills = skillDirectories().filter((skill) => !excluded.has(skill));
const patchedFiles = new Set(FILE_PATCHES.map((patch) => patch.file));
const goldenHashes: Readonly<Record<string, string>> = {
  "skills/poteto-help/SKILL.md": "d8e3f6127517e638c2ff5e8ed3019f548811e5afa2403090295c8fd52b039e8f",
  "docs/guide/01-setup.md": "c07c714ce54adbad9d2438178a8af1dfd28a113d0937ec653bbccc82209bfbf2",
  "docs/guide/07-overnight.md": "2ee3cfe5e028b7132046136df7b229c1f48721bc0518de639a601762ade05924",
  "docs/guide/09-make-it-yours.md":
    "8be3178785d0fa38bf6f75e13d4a65fb6dbcad176beec3cedba0ac7c3cdfc91d",
  "docs/harness/dsh.md": "70b3c691b3be451f14f291a274e1b084a628645acd243b6f118d12038b26dd12",
};

function withoutIntro(body: string): string {
  return normalizeEol(body).replace(`\n\n${DSH_INTRO}\n`, "\n").replace(`\n${DSH_INTRO}\n\n`, "\n");
}

function normalizeEol(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function upstream(path: string): Buffer {
  return readFileSync(join(UPSTREAM_ROOT, path));
}

describe("generated asset set", () => {
  it("contains 55 skills, both agents, the guide, and the harness mapping", () => {
    expect(summarizeAssets(assets)).toEqual({
      files: 153,
      skills: 55,
      agents: 2,
      guideMarkdown: 11,
      guideImages: 6,
      executables: 5,
      generated: 60,
    });
    expect(byPath.has(GENERATED_HARNESS_DOC)).toBe(true);
    expect(expectedSkills).toHaveLength(55);
    expect(expectedSkills.filter((skill) => skill.startsWith("principle-"))).toHaveLength(24);
    expect(
      walkUpstream("skills/poteto-mode/playbooks").filter((path) => path.endsWith(".md")),
    ).toHaveLength(23);
    expect(excluded.has("make-bot-ui")).toBe(true);
    expect(skillDirectories()).toContain("make-bot-ui");
  });

  it("does not ship the excluded skill", () => {
    expect([...byPath.keys()].filter((path) => path.includes("make-bot-ui"))).toEqual([]);
  });

  it("keeps each skill's file set and executable bit aligned with upstream", () => {
    for (const skill of expectedSkills) {
      const expected = [...walkUpstream(`skills/${skill}`)].sort();
      const actual = [...byPath.keys()]
        .filter((path) => path.startsWith(`skills/${skill}/`))
        .sort();

      expect(actual, skill).toEqual(expected);
      for (const path of expected) {
        const source = upstream(path);
        const asset = byPath.get(path);
        expect(asset, path).toBeDefined();
        expect(asset?.executable, path).toBe(
          (statSync(join(UPSTREAM_ROOT, path)).mode & 0o111) !== 0,
        );
        if (!path.endsWith("/SKILL.md")) {
          expect(asset?.bytes.equals(source), path).toBe(true);
        }
      }
    }
  });

  it("preserves five executable scripts", () => {
    expect(assets.filter((asset) => asset.executable).map((asset) => asset.path)).toEqual([
      "skills/poteto-mode/scripts/check-plan.mjs",
      "skills/poteto-mode/scripts/orch/orch.ts",
      "skills/poteto-mode/scripts/watch-pr/watch-pr",
      "skills/poteto-mode/scripts/worktree-audit.sh",
      "skills/show-me-your-work/scripts/log.sh",
    ]);
  });

  it("keeps CRLF through frontmatter and the DSH intro", () => {
    const rendered = renderSkill(
      "---\r\nname: demo\r\ndescription: Demo.\r\ndisable-model-invocation: true\r\n---\r\n\r\n# Demo\r\n\r\nBody.\r\n",
      "skills/demo/SKILL.md",
    );

    expect(rendered.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
    expect(parseFrontmatter(rendered).body).toContain(`\r\n${DSH_INTRO}\r\n`);
    expect(
      renderAgent(
        "---\r\nname: demo\r\ndescription: Demo.\r\n---\r\n\r\n# Agent\r\n",
        "agents/demo.md",
      ).replaceAll("\r\n", ""),
    ).not.toMatch(/[\r\n]/);
  });

  it("is deterministic", () => {
    const again = buildAssets();

    expect(again.map((asset) => [asset.path, asset.executable])).toEqual(
      assets.map((asset) => [asset.path, asset.executable]),
    );
    for (const asset of assets) {
      const second = again.find((candidate) => candidate.path === asset.path);
      expect(second?.bytes.equals(asset.bytes), asset.path).toBe(true);
    }
  });
});

describe("skill frontmatter and bodies", () => {
  it("uses the shared frontmatter implementation for all 55 skills", () => {
    for (const skill of expectedSkills) {
      const path = `skills/${skill}/SKILL.md`;
      const source = upstream(path).toString("utf8");
      const asset = byPath.get(path)?.bytes.toString("utf8");
      expect(asset, path).toBeDefined();

      const sourceData = parseFrontmatter(source);
      const assetData = parseFrontmatter(asset as string);
      const sourceFrontmatter = validateSkillFrontmatter(sourceData.data, path);
      const assetFrontmatter = validateSkillFrontmatter(assetData.data, path);

      expect(assetFrontmatter.name, path).toBe(skill);
      expect(assetFrontmatter.description, path).toBe(sourceFrontmatter.description);
      expect(assetFrontmatter.disableModelInvocation, path).toBe(
        sourceFrontmatter.disableModelInvocation,
      );
      expect(assetFrontmatter.userInvocable, path).toBe(sourceFrontmatter.userInvocable);
      expect(Object.hasOwn(assetData.data, "icon"), path).toBe(false);
      expect(Object.hasOwn(assetData.data, "color"), path).toBe(false);
      expect(Object.hasOwn(assetData.data, "paths"), path).toBe(false);
    }
  });

  it("puts the DSH pointer after an H1", () => {
    const body = parseFrontmatter(
      byPath.get("skills/how/SKILL.md")?.bytes.toString("utf8") as string,
    ).body;

    expect(normalizeEol(body).startsWith(`\n# How\n\n${DSH_INTRO}\n`)).toBe(true);
  });

  it("puts the DSH pointer at the top for skills without an H1", () => {
    for (const skill of ["bro", "in-your-own-words", "sharpen"]) {
      const body = parseFrontmatter(
        byPath.get(`skills/${skill}/SKILL.md`)?.bytes.toString("utf8") as string,
      ).body;
      expect(normalizeEol(body).startsWith(`\n${DSH_INTRO}\n\n`), skill).toBe(true);
    }
  });

  it("adds exactly one DSH pointer to every skill", () => {
    for (const skill of expectedSkills) {
      const body = parseFrontmatter(
        byPath.get(`skills/${skill}/SKILL.md`)?.bytes.toString("utf8") as string,
      ).body;
      expect(body.split(DSH_INTRO).length - 1, skill).toBe(1);
    }
  });

  it("pins every patched or generated document to golden bytes", () => {
    for (const [path, expected] of Object.entries(goldenHashes)) {
      const asset = byPath.get(path);
      expect(asset, path).toBeDefined();
      expect(
        createHash("sha256")
          .update(asset?.bytes as Buffer)
          .digest("hex"),
        path,
      ).toBe(expected);
    }
  });

  it("changes no body text outside declared patches and the DSH pointer", () => {
    for (const skill of expectedSkills) {
      const file = `skills/${skill}/SKILL.md`;
      const source = upstream(file).toString("utf8");
      const expected = patchedFiles.has(file)
        ? applyFilePatches(file, source, patchesForFile(file))
        : source;
      const expectedBody = parseFrontmatter(expected).body;
      const actualBody = parseFrontmatter(byPath.get(file)?.bytes.toString("utf8") as string).body;

      expect(withoutIntro(actualBody), file).toBe(normalizeEol(expectedBody));
    }
  });
});

describe("agents and guide", () => {
  it("normalizes agent frontmatter and preserves the body", () => {
    for (const path of walkUpstream("agents")) {
      const source = parseFrontmatter(upstream(path).toString("utf8"));
      const asset = parseFrontmatter(byPath.get(path)?.bytes.toString("utf8") as string);
      const frontmatter = validateAgentFrontmatter(asset.data, path);

      expect(frontmatter.name, path).toBe(path.replace(/^agents\//, "").replace(/\.md$/, ""));
      expect(asset.body, path).toBe(source.body);
      expect(Object.hasOwn(asset.data, "is_background"), path).toBe(false);
    }
  });

  it("copies guide files and applies only the declared guide patches", () => {
    const expected = [...walkUpstream("docs/guide")].sort();
    const actual = [...byPath.keys()].filter((path) => path.startsWith("docs/guide/")).sort();

    expect(actual).toEqual(expected);
    for (const path of expected) {
      const source = upstream(path);
      const asset = byPath.get(path);
      const expectedBytes = patchedFiles.has(path)
        ? Buffer.from(applyFilePatches(path, source.toString("utf8"), patchesForFile(path)), "utf8")
        : source;
      expect(asset?.bytes.equals(expectedBytes), path).toBe(true);
    }
  });
});

describe("disk checks", () => {
  it("passes the patch and asset audits against the committed tree", () => {
    expect(checkPatches().problems).toEqual([]);
    expect(checkAssets().problems).toEqual([]);
  });

  it("detects missing, extra, byte, and mode differences", () => {
    const actual = new Map(
      assets.map((asset) => [asset.path, { bytes: asset.bytes, executable: asset.executable }]),
    );
    expect(compareAssets(assets, actual)).toEqual([]);

    const missing = new Map(actual);
    missing.delete("skills/how/SKILL.md");
    expect(compareAssets(assets, missing).join("\n")).toContain(
      "missing: assets/skills/how/SKILL.md",
    );

    const extra = new Map(actual);
    extra.set("extra.md", { bytes: Buffer.from("x"), executable: false });
    expect(compareAssets(assets, extra).join("\n")).toContain("unexpected: assets/extra.md");

    const changed = new Map(actual);
    changed.set("skills/how/SKILL.md", { bytes: Buffer.from("changed"), executable: false });
    expect(compareAssets(assets, changed).join("\n")).toContain(
      "bytes differ: assets/skills/how/SKILL.md",
    );

    const mode = new Map(actual);
    mode.set("skills/how/SKILL.md", {
      bytes: assets.find((asset) => asset.path === "skills/how/SKILL.md")?.bytes as Buffer,
      executable: true,
    });
    expect(compareAssets(assets, mode).join("\n")).toContain(
      "mode differs: assets/skills/how/SKILL.md",
    );
  });
});
