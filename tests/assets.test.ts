import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { applyFilePatches } from "../scripts/apply-patches.ts";
import {
  DSH_INTRO,
  UPSTREAM_ROOT,
  buildAssets,
  classifySkills,
  hasHostTerms,
  insertIntro,
  introRequirement,
  renderAgent,
  renderSkill,
  skillDirectories,
  summarizeAssets,
  walkUpstream,
} from "../scripts/build-assets.ts";
import {
  CAPABILITIES,
  HARNESS_DOC_PATH,
  HARNESS_DOC_SCOPE_LINE,
  detectableCapabilities,
  renderHarnessDoc,
} from "../scripts/capabilities.ts";
import { checkAssets, checkLinks, scanMarkdownLinks } from "../scripts/check-assets.ts";
import { EXCLUDED_SKILLS, INTRO_SKILLS, patchesForFile } from "../scripts/patches.ts";
import { RUNTIME_ENTRIES, isReplacedUpstreamScript } from "../scripts/runtime-manifest.ts";
import {
  PSTACK_MODELS_EXAMPLE_PATH,
  ROLE_KEYS,
  renderPstackModelsExample,
} from "../scripts/role-manifest.ts";
import { compareAssets } from "../scripts/sync-upstream.ts";
import { parseRoleFile } from "../src/models.ts";
import {
  parseFrontmatter,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} from "../src/frontmatter.ts";

const assets = buildAssets();
const byPath = new Map(assets.map((asset) => [asset.path, asset]));
const excluded = new Set(EXCLUDED_SKILLS.map((exclusion) => exclusion.skill));
const expectedSkills = skillDirectories().filter((skill) => !excluded.has(skill));
const classifications = new Map(classifySkills().map((item) => [item.skill, item.category]));

function upstream(path: string): Buffer {
  return readFileSync(join(UPSTREAM_ROOT, path));
}

describe("generated asset set", () => {
  it("contains the unit 1 inventory", () => {
    const summary = summarizeAssets(assets);
    // 12 fewer files than the source-tree count: the two script directories ship as
    // ten built `.mjs` artifacts instead of the upstream `.sh`, `.ts`, `.mjs`,
    // `package.json`, and `bun.lock` sources they replaced.
    expect(summary.files).toBe(142);
    expect(summary.skills).toBe(55);
    expect(summary.agents).toBe(2);
    expect(summary.guideMarkdown).toBe(11);
    expect(summary.guideImages).toBe(6);
    expect(summary.executables).toBe(5);
    expect(summary.generated).toBeGreaterThan(0);
    expect(byPath.has(HARNESS_DOC_PATH)).toBe(true);
    expect(byPath.has(PSTACK_MODELS_EXAMPLE_PATH)).toBe(true);
    expect(expectedSkills).toHaveLength(55);
    expect(expectedSkills.filter((skill) => skill.startsWith("principle-"))).toHaveLength(24);
    expect(
      walkUpstream("skills/poteto-mode/playbooks").filter((path) => path.endsWith(".md")),
    ).toHaveLength(23);
    expect(excluded.has("make-bot-ui")).toBe(true);
  });

  it("keeps the five executable scripts, all Node .mjs", () => {
    expect(assets.filter((asset) => asset.executable).map((asset) => asset.path)).toEqual([
      "skills/poteto-mode/scripts/check-plan.mjs",
      "skills/poteto-mode/scripts/orch/orch.mjs",
      "skills/poteto-mode/scripts/watch-pr/watch-pr.mjs",
      "skills/poteto-mode/scripts/worktree-audit.mjs",
      "skills/show-me-your-work/scripts/log.mjs",
    ]);
  });

  it("classifies every skill as copy, intro-only, or patched", () => {
    expect(INTRO_SKILLS).toHaveProperty("how");
    expect(INTRO_SKILLS).toHaveProperty("blast-radius");
    expect(INTRO_SKILLS).toHaveProperty("typescript-best-practices");
    expect(INTRO_SKILLS).not.toHaveProperty("bro");
    expect(INTRO_SKILLS).not.toHaveProperty("tdd");
    expect(Object.keys(INTRO_SKILLS)).toHaveLength(24);

    const counts = { copy: 0, "intro-only": 0, patched: 0 };
    for (const skill of expectedSkills) {
      const category = classifications.get(skill);
      expect(category, skill).toMatch(/^(copy|intro-only|patched)$/);
      counts[category as keyof typeof counts] += 1;
    }
    expect(counts).toEqual({ copy: 30, "intro-only": 5, patched: 20 });
    expect(classifications.get("poteto-help")).toBe("patched");
    expect(classifications.get("blast-radius")).toBe("patched");
    expect(classifications.get("setup-pstack")).toBe("patched");
    for (const skill of [
      "how",
      "why",
      "architect",
      "arena",
      "swarm",
      "interrogate",
      "no-comments",
      "figure-it-out",
      "recall",
      "reflect",
      "automate-me",
      "show-me-your-work",
      "typescript-best-practices",
      "create-verification-skill",
      "maintain-verification-skill",
    ]) {
      expect(classifications.get(skill), skill).toBe("patched");
    }
    expect(classifications.get("tdd")).toBe("copy");
    // Unit 6 rewrote poteto-mode's own body, so it carries the vocabulary and
    // no longer needs the shared pointer in front of it.
    expect(classifications.get("poteto-mode")).toBe("patched");
    expect(INTRO_SKILLS).not.toHaveProperty("poteto-mode");
  });

  it("requires an intro everywhere the upstream text uses host vocabulary", () => {
    for (const skill of introRequirement()) {
      expect(Object.hasOwn(INTRO_SKILLS, skill), skill).toBe(true);
    }
    // A skill this tree rewrote is exempt: its DSH text can still match the
    // host-term scan through this host's own values, such as `poteto-agent` and
    // `inherit-parent`, which are not Cursor words a reader has to unlearn.
    expect(introRequirement().has("poteto-mode")).toBe(false);
    expect(hasHostTerms("Use the Task tool with readonly: true.")).toBe(true);
    expect(hasHostTerms("Read the local markdown file.")).toBe(false);
  });

  it("preserves each skill's file set and executable bit", () => {
    for (const skill of expectedSkills) {
      const upstreamFiles = [...walkUpstream(`skills/${skill}`)].sort();
      // A script directory is the one place the tree replaces upstream files with
      // build artifacts. Every other skill file is expected one-for-one.
      const expected = upstreamFiles.filter((path) => !isReplacedUpstreamScript(path));
      const actual = [...byPath.keys()]
        .filter((path) => path.startsWith(`skills/${skill}/`))
        .sort();

      // Upstream files that survive appear unchanged; the replaced directories are
      // represented by exactly the artifacts the manifest declares for this skill.
      for (const path of expected) expect(actual, `${skill}: ${path}`).toContain(path);
      const declared = RUNTIME_ENTRIES.filter((entry) =>
        entry.assetPath.startsWith(`skills/${skill}/`),
      ).map((entry) => entry.assetPath);
      for (const path of declared) expect(actual, `${skill}: ${path}`).toContain(path);

      const accounted = new Set([...expected, ...declared]);
      for (const path of actual) {
        expect(accounted.has(path), `${skill}: ${path} is neither upstream nor a declared artifact`);
      }

      for (const path of actual) {
        const asset = byPath.get(path);
        expect(asset, path).toBeDefined();
        const built = RUNTIME_ENTRIES.find((entry) => entry.assetPath === path);
        if (built !== undefined) {
          expect(asset?.executable, path).toBe(built.executable);
          continue;
        }
        expect(asset?.executable, path).toBe(
          (statSync(join(UPSTREAM_ROOT, path)).mode & 0o111) !== 0,
        );
        if (!path.endsWith("/SKILL.md") && patchesForFile(path).length === 0) {
          expect(asset?.bytes.equals(upstream(path)), path).toBe(true);
        }
      }
    }
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

describe("skill bodies", () => {
  it("uses the shared frontmatter implementation for all 55 skills", () => {
    for (const skill of expectedSkills) {
      const path = `skills/${skill}/SKILL.md`;
      const declared = patchesForFile(path);
      const sourceText = upstream(path).toString("utf8");
      const source = parseFrontmatter(
        declared.length === 0 ? sourceText : applyFilePatches(path, sourceText, declared),
      );
      const asset = parseFrontmatter(byPath.get(path)?.bytes.toString("utf8") as string);
      const sourceFrontmatter = validateSkillFrontmatter(source.data, path);
      const assetFrontmatter = validateSkillFrontmatter(asset.data, path);

      expect(assetFrontmatter.name, path).toBe(skill);
      expect(assetFrontmatter.description, path).toBe(sourceFrontmatter.description);
      expect(assetFrontmatter.disableModelInvocation, path).toBe(
        sourceFrontmatter.disableModelInvocation,
      );
      expect(assetFrontmatter.userInvocable, path).toBe(sourceFrontmatter.userInvocable);
      for (const field of ["icon", "color", "paths"]) {
        expect(Object.hasOwn(asset.data, field), `${path}:${field}`).toBe(false);
      }
    }
  });

  it("matches the declared category and intro count", () => {
    for (const skill of expectedSkills) {
      const path = `skills/${skill}/SKILL.md`;
      const category = classifications.get(skill);
      const sourceText = upstream(path).toString("utf8");
      const sourceBody = parseFrontmatter(sourceText).body;
      const assetBody = parseFrontmatter(byPath.get(path)?.bytes.toString("utf8") as string).body;

      if (category === "copy") {
        expect(assetBody, path).toBe(sourceBody);
        expect(assetBody.includes(DSH_INTRO), path).toBe(false);
      } else if (category === "intro-only") {
        expect(assetBody, path).toBe(insertIntro(sourceBody, path));
        expect(assetBody.split(DSH_INTRO).length - 1, path).toBe(1);
      } else {
        const patched = applyFilePatches(path, sourceText, patchesForFile(path));
        const patchedBody = parseFrontmatter(patched).body;
        expect(assetBody, path).toBe(
          Object.hasOwn(INTRO_SKILLS, skill) ? insertIntro(patchedBody, path) : patchedBody,
        );
        expect(assetBody.split(DSH_INTRO).length - 1, path).toBe(
          Object.hasOwn(INTRO_SKILLS, skill) ? 1 : 0,
        );
      }
    }
  });

  it("keeps the DSH pointer after an H1", () => {
    const body = parseFrontmatter(
      byPath.get("skills/how/SKILL.md")?.bytes.toString("utf8") as string,
    ).body;
    expect(body.startsWith(`\n# How\n\n${DSH_INTRO}\n`)).toBe(true);
  });

  it("keeps a CRLF source in CRLF through rendering", () => {
    const rendered = renderSkill(
      "---\r\nname: demo\r\ndescription: Demo.\r\ndisable-model-invocation: true\r\n---\r\n\r\n# Demo\r\n\r\nBody.\r\n",
      "skills/demo/SKILL.md",
      true,
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
});

describe("agents, guides, and harness doc", () => {
  it("normalizes agent frontmatter and keeps the patched body", () => {
    for (const path of walkUpstream("agents")) {
      const declared = patchesForFile(path);
      const sourceText = upstream(path).toString("utf8");
      const source = parseFrontmatter(
        declared.length === 0 ? sourceText : applyFilePatches(path, sourceText, declared),
      );
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
      const expectedBytes =
        patchesForFile(path).length === 0
          ? source
          : Buffer.from(
              applyFilePatches(path, source.toString("utf8"), patchesForFile(path)),
              "utf8",
            );
      expect(asset?.bytes.equals(expectedBytes), path).toBe(true);
    }
  });

  it("generates a target-contract harness doc that names what this tree ships", () => {
    const doc = byPath.get(HARNESS_DOC_PATH)?.bytes.toString("utf8") as string;

    expect(doc).toContain("# DSH harness mapping");
    expect(doc).toContain(HARNESS_DOC_SCOPE_LINE);
    expect(doc).toContain("the `pstack_subagent` delegation tool");
    expect(doc).not.toContain("ships static assets only");
    expect(doc).toContain("target contract");
    expect(doc).toContain("`pstack_subagent`");
  });
});

describe("capability table", () => {
  it("has unique rows and reasons for every non-mapped capability", () => {
    const ids = CAPABILITIES.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(17);

    for (const capability of CAPABILITIES) {
      if (capability.coverage === "mapped") continue;
      expect(capability.reason.trim().length, capability.id).toBeGreaterThan(0);
      expect(capability.unit.trim().length, capability.id).toBeGreaterThan(0);
    }
  });

  it("marks the delegation rows delivered and keeps excluded rows excluded", () => {
    const byId = new Map(CAPABILITIES.map((capability) => [capability.id, capability]));

    for (const id of [
      "task-spawn",
      "subagent-general",
      "subagent-poteto",
      "background-field",
      "resume",
      "attachments",
      "model-route",
      "models-rule",
    ]) {
      expect(byId.get(id)?.coverage, id).toBe("mapped");
    }
    for (const id of ["subagent-comment-sicko", "readonly-field", "cloud-agent"]) {
      expect(byId.get(id)?.coverage, id).toBe("degraded");
    }
    for (const id of ["transcripts", "loop"]) {
      expect(byId.has(id), id).toBe(true);
    }
    expect(byId.get("transcripts")?.coverage).toBe("degraded");
    expect(byId.get("loop")?.coverage).toBe("degraded");
    expect(byId.get("automations")?.coverage).toBe("excluded");
    for (const id of ["skill-by-name", "project-skills", "plugin-location"]) {
      expect(byId.get(id)?.coverage, id).toBe("mapped");
    }
  });

  it("moves the unit 4 rows to their shipped state", () => {
    const byId = new Map(CAPABILITIES.map((capability) => [capability.id, capability]));

    expect(byId.get("worktree")?.coverage).toBe("mapped");
    expect(byId.get("bugbot")?.coverage).toBe("preserved");
    for (const id of [
      "custom-mode",
      "create-skill",
      "deslop",
      "control-ui",
      "pr-tool",
      "image-generation",
    ]) {
      expect(byId.get(id)?.coverage, id).toBe("degraded");
    }
    // No row may still be filed as a promise for a later unit: every unit shipped.
    expect(CAPABILITIES.filter((capability) => capability.coverage === "deferred")).toEqual([]);
    expect(byId.get("transcripts")?.coverage).toBe("degraded");
    expect(byId.get("loop")?.coverage).toBe("degraded");
    expect(byId.get("automations")?.coverage).toBe("excluded");
    expect(byId.get("skill-paths-field")?.coverage).toBe("degraded");
  });

  it("states the long-running boundaries in the loop row", () => {
    const loop = CAPABILITIES.find((capability) => capability.id === "loop");
    expect(loop).toBeDefined();
    if (loop === undefined || loop.coverage === "mapped") throw new Error("loop must be degraded");

    expect(loop.unit).toBe("6");
    expect(loop.dsh).toContain("`create_goal`");
    expect(loop.dsh).toContain("`schedule_create` only as a timed heartbeat");
    // The three boundaries the design text did not have to state.
    expect(loop.reason).toContain("refuses a delegated caller");
    expect(loop.reason).toContain("cannot watch a PR or CI");
    expect(loop.reason).toContain("Nothing here has been exercised on a real profile");
    // A reminder may never be described as an event subscription.
    expect(loop.reason).not.toContain("subscribes");

    // The two rows this unit must not promote.
    const automations = CAPABILITIES.find((capability) => capability.id === "automations");
    const cloud = CAPABILITIES.find((capability) => capability.id === "cloud-agent");
    expect(automations?.coverage).toBe("excluded");
    expect(cloud?.coverage).toBe("degraded");
  });

  it("keeps table cells single-line and pipe-free", () => {
    for (const capability of CAPABILITIES) {
      for (const value of [capability.cursor, capability.dsh, capability.note ?? ""]) {
        expect(value, capability.id).not.toContain("\n");
        expect(value, capability.id).not.toContain("|");
      }
    }
    expect(renderHarnessDoc()).toContain("not planned");
    expect(detectableCapabilities().length).toBeGreaterThan(0);
  });
});

describe("link scanning", () => {
  const exists = (path: string): boolean =>
    new Set(["assets/README.md", "assets/docs/guide/01-setup.md", "assets/docs/guide/images"]).has(
      path.replace(/\/$/, ""),
    );

  it("finds links and images outside fenced code", () => {
    const links = scanMarkdownLinks(
      "See [the guide](../guide/01-setup.md) and ![diagram](./images/a.png).",
    );
    expect(links).toEqual([
      { line: 1, target: "../guide/01-setup.md" },
      { line: 1, target: "./images/a.png" },
    ]);
    expect(
      scanMarkdownLinks(
        ["```md", "[not a link](./missing.md)", "```", "[real](./README.md)"].join("\n"),
      ),
    ).toEqual([{ line: 4, target: "./README.md" }]);
  });

  it("resolves files, directories, and skips external links", () => {
    const report = checkLinks(
      [
        {
          file: "assets/skills/demo/SKILL.md",
          text: [
            "[guide](../../docs/guide/01-setup.md)",
            "[images](../../docs/guide/images/)",
            "[readme](../../README.md)",
            "[external](https://example.com/x)",
            "[anchor](#section)",
          ].join("\n"),
        },
      ],
      exists,
    );

    expect(report.problems).toEqual([]);
    expect(report.checked).toBe(3);
    expect(report.skipped).toBe(2);
  });

  it("reports missing and escaping links, and keeps template placeholders", () => {
    const report = checkLinks(
      [
        {
          file: "assets/docs/example.md",
          text: "[missing](./missing.md)\n[outside](../../../../outside.md)\n[placeholder](url)",
        },
      ],
      exists,
    );

    expect(report.problems).toEqual([
      {
        file: "assets/docs/example.md",
        line: 1,
        target: "./missing.md",
        resolved: "assets/docs/missing.md",
        reason: "missing",
      },
      {
        file: "assets/docs/example.md",
        line: 2,
        target: "../../../../outside.md",
        resolved: "../../outside.md",
        reason: "outside-repository",
      },
    ]);
    expect(report.placeholders).toEqual([
      { file: "assets/docs/example.md", line: 3, target: "url" },
    ]);
  });
});

describe("disk checks", () => {
  it("passes the asset audit against the committed tree", () => {
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

describe("role file example", () => {
  const example = byPath.get(PSTACK_MODELS_EXAMPLE_PATH)?.bytes.toString("utf8") as string;

  it("is generated from the manifest and lists all 17 roles once", () => {
    expect(example).toBe(renderPstackModelsExample());
    expect(ROLE_KEYS).toHaveLength(17);
    for (const key of ROLE_KEYS) {
      expect(example.split(`\n${key}: `).length - 1, key).toBe(1);
    }
    expect(example).toContain("# budget:");
  });

  it("never hardcodes a model id or asks for a credential", () => {
    for (const banned of ["claude-", "grok-", "gpt-", "api_key", "API key"]) {
      expect(example).not.toContain(banned);
    }
    for (const key of ROLE_KEYS) {
      expect(example).toContain(`${key}: inherit-parent`);
    }
  });

  it("parses as a working role file, so copying it converges instead of erroring", () => {
    const parsed = parseRoleFile(example, "assets/docs/pstack-models.example.md");
    expect(parsed.status).toBe("loaded");
    if (parsed.status !== "loaded") return;

    expect(parsed.issues).toEqual([]);
    expect(parsed.roles.size).toBe(17);
    expect(parsed.budget).toBe("none (unset)");
    for (const key of ROLE_KEYS) {
      expect(parsed.roles.get(key)?.routes, key).toEqual([{ kind: "inherit" }]);
    }
  });

  it("points setup-pstack at the example instead of restating the roles", () => {
    const skill = byPath.get("skills/setup-pstack/SKILL.md")?.bytes.toString("utf8") as string;

    expect(skill).toContain("../../docs/pstack-models.example.md");
    expect(skill).toContain("$DSH_HOME/pstack-models.md");
    expect(skill).toContain("list_subagent_models");
    expect(skill).not.toContain("disable-model-invocation");
    expect(skill).not.toContain("AskQuestion");
    expect(skill).not.toContain("pstack-models.mdc");
    expect(skill).not.toContain("alwaysApply");
    expect(skill).toContain("A child that already started keeps the route it started with.");
    for (const key of ROLE_KEYS) {
      expect(skill.includes(`${key}:`), key).toBe(false);
    }
  });
});
