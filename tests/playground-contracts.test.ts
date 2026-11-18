import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { parseConfig } from "../playground/scripts/lib/config.ts";
import {
  coverageProblems,
  type CoverageExclusions,
  type CoverageInventoryEntry,
  type CoverageScenario,
} from "../playground/scripts/lib/coverage.ts";
import { environments, scenariosById } from "../playground/scenario-system/index.ts";

function inventory(): CoverageInventoryEntry[] {
  const text = readFileSync(
    new URL("../playground/data/capability-inventory.json", import.meta.url),
    "utf8",
  );
  return (JSON.parse(text) as { capabilities: CoverageInventoryEntry[] }).capabilities;
}

function exclusions(): CoverageExclusions {
  const text = readFileSync(
    new URL("../playground/data/capability-exclusions.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(text) as CoverageExclusions;
}

function scenarios(): CoverageScenario[] {
  return [...scenariosById.values()].map((scenario) => ({
    id: scenario.id,
    capability: scenario.capability,
  }));
}

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

  it("accepts role model routes that resolve against the provider allowlist", () => {
    const parsed = parseConfig({
      ...config(),
      roleModels: {
        "bug-fix": { provider: "provider-a", model: "model-a", effort: "low" },
      },
    });
    expect(parsed.roleModels?.["bug-fix"]).toEqual({
      provider: "provider-a",
      model: "model-a",
      effort: "low",
    });
  });
});

describe("playground environments", () => {
  it("declares complete plugin environments instead of host inheritance", () => {
    for (const environment of environments) {
      expect(environment.id).not.toBe("");
      expect(new Set(environment.enabledPluginPackages).size).toBe(
        environment.enabledPluginPackages.length,
      );
    }
  });
});

describe("coverageProblems", () => {
  const scenario = (id: string, capability: string): CoverageScenario => ({ id, capability });
  const covered = (id: string, base?: string): CoverageInventoryEntry => ({
    id,
    status: "covered",
    probes: base === undefined ? {} : { base },
  });

  it("allows an empty registry and empty inventory", () => {
    expect(coverageProblems([], [], {})).toEqual([]);
  });

  it("reports scenarios without an inventory", () => {
    expect(coverageProblems([scenario("probe-a", "cap-a")], [], {})).toContain(
      "scenarios are registered but the capability inventory is empty",
    );
  });

  it("reports an inventory without scenarios", () => {
    expect(coverageProblems([], [covered("cap-a", "probe-a")], {})).toContain(
      "the capability inventory has entries but no scenarios are registered",
    );
  });

  it("reports a scenario whose capability is not in the inventory", () => {
    expect(
      coverageProblems([scenario("probe-a", "cap-x")], [covered("cap-a", "probe-a")], {}),
    ).toContain("scenario probe-a references unknown capability cap-x");
  });

  it("reports a covered capability whose base probe is not registered", () => {
    expect(
      coverageProblems([scenario("probe-a", "cap-a")], [covered("cap-a", "probe-b")], {}),
    ).toEqual(["covered capability cap-a points at unknown probe probe-b"]);
    expect(coverageProblems([scenario("probe-a", "cap-a")], [covered("cap-a")], {})).toEqual([
      "covered capability cap-a has no base probe",
    ]);
  });

  it("reports an excluded capability with no user exclusion", () => {
    const registered = [scenario("probe-a", "cap-a")];
    const entries = [covered("cap-a", "probe-a"), { id: "cap-x", status: "excluded" }];
    const problem = "excluded capability cap-x needs a user exclusion with a non-empty reason";
    expect(coverageProblems(registered, entries, {})).toContain(problem);
    expect(
      coverageProblems(registered, entries, { "cap-x": { reason: "", decidedBy: "user" } }),
    ).toContain(problem);
    expect(
      coverageProblems(registered, entries, {
        "cap-x": { reason: "not ours", decidedBy: "agent" },
      }),
    ).toContain(problem);
    expect(
      coverageProblems(registered, entries, { "cap-x": { reason: "not ours", decidedBy: "user" } }),
    ).toEqual([]);
  });
});

describe("playground capability coverage", () => {
  it("reports no problems for the real scenarios, inventory, and exclusions", () => {
    expect(coverageProblems(scenarios(), inventory(), exclusions())).toEqual([]);
  });
});
