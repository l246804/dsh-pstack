import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import type { RunRecord } from "../playground/types.ts";
import { profileManifest } from "../playground/scripts/lib/env.ts";
import {
  assertSafeRecord,
  assertSameEntry,
  latestRecords,
  pendingSemanticReview,
  verdictFor,
} from "../playground/scripts/lib/evidence.ts";
import { publicConfigHash } from "../playground/scripts/lib/run-metadata.ts";
import { behaviorScenario } from "../playground/scenarios/index.ts";
import { workerPaths } from "../playground/scripts/lib/worker.ts";

const temporary = mkdtempSync(join(tmpdir(), "pstack-execution-test-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

function record(phase: "raw" | "adapted", environmentId: string): RunRecord {
  const scenario = behaviorScenario("poteto-help-smoke");
  const target = { provider: "provider-a", model: "model-a", effort: "low" };
  const config = {
    testModel: target,
    providers: { "provider-a": { apiKey: "secret-value", models: { "model-a": ["low"] } } },
  };
  const matrix = { id: environmentId, enabledPluginPackages: [] };
  return {
    scenarioId: scenario.id,
    phase,
    environment: {
      worker: 0,
      dshVersion: "test-dsh",
      adaptedVersion: phase === "raw" ? null : "test-adapted",
      matrix,
      upstreamRevision: "test-upstream",
      configHash: publicConfigHash(config, matrix),
    },
    target,
    session: {
      sessionId: "session",
      sessionFile: "session-file",
      workspacePath: null,
      agentPreset: phase === "raw" ? "standard" : "poteto-mode",
      skillLoads: ["poteto-help"],
      toolCalls: [],
      turnEndReason: "completed",
      assistantText: "A useful response",
      userText: scenario.turns[0]?.prompt ?? "",
      autoAnswers: [],
    },
    artifacts: { recordFile: "record.json", observed: [] },
    semanticReview: pendingSemanticReview(),
    verdict: verdictFor({ phase, failures: [], semanticReview: pendingSemanticReview() }),
    capturedAt: "2026-11-11T00:00:00.000Z",
  };
}

describe("execution contracts", () => {
  it("keeps raw free of every plugin package and makes adapted additions explicit", () => {
    const raw = profileManifest("raw", []);
    expect(raw.dependencies).toEqual({});
    expect(raw.dsh).toEqual({
      profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] },
    });
    expect(JSON.stringify(raw)).not.toContain("dsh-pstack");
    expect(() => profileManifest("raw", ["dsh-pstack"])).toThrow(/must not install/);
    const adapted = profileManifest("adapted", ["dsh-pstack", "@deepseek-ai/official-plugin"]);
    expect(adapted.dsh).toEqual({
      profile: {
        bundles: [
          "@deepseek-ai/dsh-base",
          "@deepseek-ai/dsh-web-app",
          "dsh-pstack",
          "@deepseek-ai/official-plugin",
        ],
      },
    });
  });

  it("keys latest evidence by scenario, phase, and environment", () => {
    const raw = record("raw", "base");
    const adapted = record("adapted", "base");
    const otherEnvironment = record("raw", "other");
    expect(latestRecords([raw, adapted, otherEnvironment])).toHaveLength(3);
    expect(workerPaths(0, "base").home).not.toBe(workerPaths(0, "other").home);
    expect(workerPaths(0, "base").browserDir).not.toBe(workerPaths(0, "other").browserDir);
  });

  it("does not pass an unreviewed semantic effect in either phase", () => {
    expect(record("raw", "base").verdict.status).toBe("unobserved");
    expect(record("adapted", "base").verdict.status).toBe("inconclusive");
  });

  it("compares actual routes, natural language, upstream and public config hashes", () => {
    const raw = record("raw", "base");
    const adapted = record("adapted", "base");
    expect(assertSameEntry(raw, adapted, behaviorScenario(raw.scenarioId))).toEqual([]);
    expect(JSON.stringify(raw)).not.toContain("secret-value");
    expect(() =>
      assertSafeRecord({ ...raw, artifacts: { recordFile: "secret-value", observed: [] } }, [
        "secret-value",
      ]),
    ).toThrow(/apiKey/);
    const wrongRoute = {
      ...adapted,
      target: { ...adapted.target, effort: "high" } as RunRecord["target"],
    };
    expect(assertSameEntry(raw, wrongRoute, behaviorScenario(raw.scenarioId))).toContain(
      "raw and adapted actual model routes differ",
    );
  });

  it("contains no probe timeout or automatic stop in the execution scripts", () => {
    const root = resolve(__dirname, "../playground/scripts");
    for (const file of ["run-case.ts", "run-batch.ts", "prepare.ts", "collect.ts"]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).not.toMatch(
        /probeSeconds|DEFAULT_PROBE_SECONDS|truncated|stopInFlightTurn|--probe|--timeout/,
      );
    }
  });

  it("leaves temporary test directories under the system temp root", () => {
    expect(existsSync(temporary)).toBe(true);
  });
});
