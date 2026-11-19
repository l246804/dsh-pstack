import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { parseConfig } from "../playground/runner/lib/config.ts";
import {
  gapCoverageProblems,
  type CoverageGap,
  type GapCoverageScenario,
} from "../playground/runner/lib/coverage.ts";
import { environments, scenariosById } from "../playground/runner/scenario/index.ts";

function gaps(): CoverageGap[] {
  const text = readFileSync(new URL("../native/gaps.json", import.meta.url), "utf8");
  return (JSON.parse(text) as { gaps: CoverageGap[] }).gaps;
}

function scenarios(): GapCoverageScenario[] {
  return [...scenariosById.values()].map((scenario) => ({
    id: scenario.id,
    kind: scenario.kind,
    gap: scenario.gap,
    treatments: scenario.treatments,
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

describe("gapCoverageProblems", () => {
  const scenario = (
    id: string,
    kind?: string,
    gap?: string,
    treatments?: readonly string[],
  ): GapCoverageScenario => ({ id, kind, gap, treatments });

  it("allows an empty gap list and empty scenarios", () => {
    expect(gapCoverageProblems([], [])).toEqual([]);
  });

  it("reports no problems for the real gaps and gap scenarios", () => {
    expect(gapCoverageProblems(scenarios(), gaps())).toEqual([]);
  });

  it("requires every confirmed gap to have a gap scenario", () => {
    expect(gapCoverageProblems([], [{ id: "gap-a", status: "confirmed" }])).toEqual([
      "confirmed gap gap-a has no gap scenario",
    ]);
  });

  it("reports gap scenarios without a gap or with an unknown gap", () => {
    expect(
      gapCoverageProblems([scenario("probe-a", "gap")], [{ id: "gap-a", status: "confirmed" }]),
    ).toEqual(expect.arrayContaining(["gap scenario probe-a has no gap id"]));
    expect(
      gapCoverageProblems(
        [scenario("probe-a", "gap", "gap-x", ["native", "adapted"])],
        [{ id: "gap-a", status: "confirmed" }],
      ),
    ).toEqual(
      expect.arrayContaining([
        "gap scenario probe-a references unknown gap gap-x",
        "confirmed gap gap-a has no gap scenario",
      ]),
    );
  });

  it("requires a gap scenario to run in both treatments and a regression to have no gap", () => {
    expect(
      gapCoverageProblems(
        [scenario("probe-a", "gap", "gap-a", ["adapted"])],
        [{ id: "gap-a", status: "confirmed" }],
      ),
    ).toContain("gap scenario probe-a must run in both native and adapted");
    expect(
      gapCoverageProblems(
        [scenario("probe-r", "regression", "gap-a")],
        [{ id: "gap-a", status: "confirmed" }],
      ),
    ).toContain("regression scenario probe-r must not declare a gap");
  });

  it("reports a scenario without a kind", () => {
    expect(gapCoverageProblems([scenario("probe-a")], [])).toContain(
      "scenario probe-a has no kind",
    );
  });
});
