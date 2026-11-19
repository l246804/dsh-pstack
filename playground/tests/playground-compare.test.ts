import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { compareOne, compareSnapshot, scenarioContentHash } from "../scripts/compare.ts";
import type { BehaviorScenario, RunRecord, SessionFacts, Treatment } from "../runner/types.ts";

const temporary = mkdtempSync(join(tmpdir(), "pstack-compare-test-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

const scenario: BehaviorScenario = {
  id: "cap-1",
  capability: "x",
  turns: [{ prompt: "do the thing" }],
  workspace: { files: {} },
  assertions: [],
  rubric: { prompt: "" },
  uiObservations: [],
};

function session(userText: string): SessionFacts {
  return {
    sessionId: "session",
    sessionFile: "session-file",
    workspacePath: null,
    agentPreset: "standard",
    skillLoads: [],
    toolCalls: [],
    turnEndReason: "completed",
    assistantText: "",
    userText,
    userTexts: [userText],
    autoAnswers: [],
  };
}

function record(treatment: Treatment, scenarioId = scenario.id): RunRecord {
  return {
    scenarioId,
    treatment,
    environment: {
      worker: 0,
      dshVersion: "test-dsh",
      pstackVersion: "test-pstack",
      adaptedVersion: treatment === "native" ? null : "test-adapted",
      matrix: { id: "base", description: "test", kind: "base", enabledPluginPackages: [] },
      upstreamRevision: "rev-1",
      configHash: "hash-1",
    },
    target: { provider: "provider-a", model: "model-a", effort: "low" },
    session: session(scenario.turns[0]!.prompt),
    artifacts: { recordFile: "record.json", observed: [] },
    semanticReview: { status: "pending", reason: "pending" },
    mechanicalFailures: [],
    verdict:
      treatment === "native"
        ? { treatment: "native", status: "unobserved", reason: "pending" }
        : { treatment: "adapted", status: "inconclusive", reason: "pending" },
    capturedAt: "2026-11-11T00:00:00.000Z",
  };
}

function writeRecord(
  root: string,
  treatment: Treatment,
  environment: string,
  entry: RunRecord,
): void {
  const dir = join(
    root,
    `${treatment}-${environment}`,
    "scenarios",
    entry.scenarioId,
    `${treatment}-${environment}`,
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "record.json"), `${JSON.stringify(entry, null, 2)}\n`);
}

describe("scenarioContentHash", () => {
  it("is stable for the same content and ignores key order", () => {
    const reordered: BehaviorScenario = {
      uiObservations: [],
      rubric: { prompt: "" },
      assertions: [],
      workspace: { files: {} },
      turns: [{ prompt: "do the thing" }],
      capability: "x",
      id: "cap-1",
    };
    expect(scenarioContentHash(scenario)).toBe(scenarioContentHash(reordered));
    expect(scenarioContentHash(scenario)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the probe content changes", () => {
    expect(scenarioContentHash(scenario)).not.toBe(
      scenarioContentHash({ ...scenario, turns: [{ prompt: "do a different thing" }] }),
    );
    expect(scenarioContentHash(scenario)).not.toBe(
      scenarioContentHash({ ...scenario, treatments: ["native"] }),
    );
    expect(scenarioContentHash(scenario)).not.toBe(
      scenarioContentHash({ ...scenario, environments: ["base", "render"] }),
    );
  });
});

describe("compareOne", () => {
  it("returns no problems when native and adapted share one run-identity tuple", () => {
    expect(compareOne(record("native"), record("adapted"), scenario)).toEqual([]);
  });

  it("flags a DSH version mismatch", () => {
    const adapted = record("adapted");
    adapted.environment = { ...adapted.environment, dshVersion: "other-dsh" };
    expect(compareOne(record("native"), adapted, scenario)).toContain(
      "native and adapted DSH versions differ",
    );
  });

  it("does not compare pstack versions while still flagging a DSH version mismatch", () => {
    const adapted = record("adapted");
    adapted.environment = { ...adapted.environment, pstackVersion: "other-pstack" };
    expect(compareOne(record("native"), adapted, scenario)).toEqual([]);
    adapted.environment = { ...adapted.environment, dshVersion: "other-dsh" };
    expect(compareOne(record("native"), adapted, scenario)).toContain(
      "native and adapted DSH versions differ",
    );
  });

  it("flags an environment matrix mismatch", () => {
    const adapted = record("adapted");
    adapted.environment = {
      ...adapted.environment,
      matrix: { ...adapted.environment.matrix, id: "other" },
    };
    expect(compareOne(record("native"), adapted, scenario)).toContain(
      "native and adapted environment matrices differ",
    );
  });

  it("flags a model route mismatch", () => {
    const adapted = record("adapted");
    adapted.target = { provider: "provider-a", model: "model-b", effort: "low" };
    expect(compareOne(record("native"), adapted, scenario)).toContain(
      "native and adapted actual model routes differ",
    );
  });

  it("flags a record whose scenario content hash drifted from the definition", () => {
    const adapted = record("adapted");
    adapted.scenarioHash = "deadbeef";
    expect(compareOne(record("native"), adapted, scenario)).toContain(
      "adapted record scenario content differs from the current definition",
    );
  });
});

describe("compareSnapshot", () => {
  it("compares a scenario present on both sides", () => {
    const root = mkdtempSync(join(temporary, "both-"));
    writeRecord(root, "native", "base", record("native"));
    writeRecord(root, "adapted", "base", record("adapted"));

    const result = compareSnapshot({ environment: "base", root, loadScenario: () => scenario });
    expect(result.compared).toEqual(["cap-1"]);
    expect(result.failures).toEqual([]);
  });

  it("reports a scenario missing on native when only adapted exists", () => {
    const root = mkdtempSync(join(temporary, "missing-native-"));
    writeRecord(root, "adapted", "base", record("adapted", "cap-adapted-only"));

    const result = compareSnapshot({ environment: "base", root, loadScenario: () => scenario });
    expect(result.compared).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.scenarioId).toBe("cap-adapted-only");
    expect(result.failures[0]!.problems.join(" ")).toContain("missing on native");
  });

  it("reports a scenario missing on adapted when only native exists", () => {
    const root = mkdtempSync(join(temporary, "missing-adapted-"));
    writeRecord(root, "native", "base", record("native", "cap-native-only"));

    const result = compareSnapshot({ environment: "base", root, loadScenario: () => scenario });
    expect(result.compared).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.scenarioId).toBe("cap-native-only");
    expect(result.failures[0]!.problems.join(" ")).toContain("missing on adapted");
  });
});
