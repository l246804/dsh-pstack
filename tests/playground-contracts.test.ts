import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { parseConfig } from "../playground/runner/lib/config.ts";
import {
  coverageProblems,
  gapCoverageProblems,
  type CoverageExclusions,
  type CoverageGap,
  type CoverageInventoryEntry,
  type CoverageScenario,
  type GapCoverageScenario,
} from "../playground/runner/lib/coverage.ts";
import { environments, scenariosById } from "../playground/runner/scenario/index.ts";

function inventory(): CoverageInventoryEntry[] {
  const text = readFileSync(
    new URL("../playground/scenarios/inventory.json", import.meta.url),
    "utf8",
  );
  return (JSON.parse(text) as { capabilities: CoverageInventoryEntry[] }).capabilities;
}

function exclusions(): CoverageExclusions {
  const text = readFileSync(
    new URL("../playground/scenarios/exclusions.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(text) as CoverageExclusions;
}

function gaps(): CoverageGap[] {
  const text = readFileSync(
    new URL("../playground/scenarios/native-gaps.json", import.meta.url),
    "utf8",
  );
  return (JSON.parse(text) as { gaps: CoverageGap[] }).gaps;
}

function scenarios(): CoverageScenario[] {
  return [...scenariosById.values()].map((scenario) => ({
    id: scenario.id,
    capability: scenario.capability,
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

  it("reports no problems for the real gaps and gap scenarios", () => {
    expect(gapCoverageProblems(scenarios(), gaps())).toEqual([]);
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
