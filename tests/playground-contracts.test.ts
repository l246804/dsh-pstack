import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { parseConfig } from "../playground/scripts/lib/config.ts";
import {
  behaviorScenario,
  behaviorScenarios,
  environments,
  exclusions,
} from "../playground/scenarios/index.ts";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function config(provider = "provider-a", model = "model-a", effort = "low") {
  return {
    testModel: { provider, model, effort },
    providers: {
      "provider-a": { apiKey: "secret-a", models: { "model-a": ["low", "high"] } },
      "provider-b": { apiKey: "secret-b", models: { "model-b": ["medium"] } },
    },
  };
}

describe("playground configuration", () => {
  it.each([
    ["provider-a", "model-a", "high"],
    ["provider-b", "model-b", "medium"],
  ])("selects an allowed target %s/%s[%s]", (provider, model, effort) => {
    expect(parseConfig(config(provider, model, effort)).testModel).toEqual({
      provider,
      model,
      effort,
    });
  });

  it.each([
    ["unknown-provider", "model-a", "low"],
    ["provider-a", "unknown-model", "low"],
    ["provider-b", "model-b", "low"],
  ])("rejects a target outside the allowance %s/%s[%s]", (provider, model, effort) => {
    expect(() => parseConfig(config(provider, model, effort))).toThrow(/testModel/);
  });

  it("uses the existing bare model ids in the provider allowlist", () => {
    expect(parseConfig(config()).providers["provider-a"]?.models).toHaveProperty("model-a");
  });
});

describe("scenario registry", () => {
  it("reuses one natural-language scenario across both phases", () => {
    const scenario = behaviorScenario("poteto-help-smoke");
    expect(behaviorScenario(scenario.id)).toBe(scenario);
    expect(scenario.turns[0]?.prompt).not.toMatch(/poteto-help|skill|工具/);
    expect(scenario.assertions.some((assertion) => assertion.kind === "turn-completed")).toBe(true);
    expect(scenario.rubric.prompt).toContain("技能加载是过程证据，不等于建议有效");
  });

  it("declares complete plugin environments instead of host inheritance", () => {
    for (const environment of environments) {
      expect(environment.id).not.toBe("");
      expect(new Set(environment.enabledPluginPackages).size).toBe(
        environment.enabledPluginPackages.length,
      );
    }
  });

  it("only excludes capabilities that require Cursor services or bots", () => {
    expect(exclusions.map((entry) => entry.id)).toEqual(["make-bot-ui", "automations-benny"]);
  });

  it("covers every upstream skill with a scenario or an explicit exclusion", () => {
    const skillsDir = join(repository, "upstream/cursor-plugins/pstack/skills");
    const upstream = readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const covered = new Set(behaviorScenarios.map((scenario) => scenario.skill));
    const excluded = new Set(exclusions.map((entry) => entry.skill));
    const uncovered = upstream.filter((skill) => !covered.has(skill) && !excluded.has(skill));
    expect(uncovered).toEqual([]);
    const stale = [...covered].filter((skill) => !upstream.includes(skill));
    expect(stale).toEqual([]);
  });
});
