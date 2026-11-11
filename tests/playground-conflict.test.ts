import { describe, expect, it } from "vite-plus/test";

import { AGENT_TEAMS_CONFLICT } from "../src/poteto-mode.ts";
import type { RunEnvironment } from "../playground/types.ts";
import {
  agentTeamConflict,
  conflictForEnvironment,
  conflicts,
} from "../playground/scenarios/conflicts.ts";
import { environments } from "../playground/scenarios/index.ts";
import {
  CONFLICT_KEYWORD_GROUPS,
  buildConflictRunRecord,
  conflictVerdict,
  matchConflictSymptom,
  type ConflictStartupOutcome,
} from "../playground/scripts/lib/conflict.ts";

describe("environment matrix", () => {
  it("declares unique ids with non-empty, deduplicated package lists", () => {
    const ids = environments.map((environment) => environment.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const environment of environments) {
      expect(environment.id.trim()).not.toBe("");
      expect(new Set(environment.enabledPluginPackages).size).toBe(
        environment.enabledPluginPackages.length,
      );
      for (const pkg of environment.enabledPluginPackages) expect(pkg.trim()).not.toBe("");
    }
  });

  it("ships the six sampled environments with their official packages", () => {
    const byId = new Map(environments.map((environment) => [environment.id, environment]));
    expect(byId.get("base")?.enabledPluginPackages).toEqual([]);
    expect(byId.get("session-search")?.enabledPluginPackages).toEqual([
      "@deepseek-ai/dsh-experimental-session-search",
    ]);
    expect(byId.get("browser-use")?.enabledPluginPackages).toEqual([
      "@deepseek-ai/dsh-browser-use",
    ]);
    expect(byId.get("terminal")?.enabledPluginPackages).toEqual([
      "@deepseek-ai/dsh-experimental-terminal-bundle",
    ]);
    expect(byId.get("forge")?.enabledPluginPackages).toEqual([
      "@deepseek-ai/dsh-experimental-forge-bundle",
    ]);
    expect(byId.get("agent-team-conflict")?.enabledPluginPackages).toEqual([
      "@deepseek-ai/dsh-experimental-agent-team-profile",
    ]);
  });
});

describe("agent-team conflict regression", () => {
  it("declares every expected conflict field", () => {
    expect(agentTeamConflict.type).toBe("conflict-regression");
    expect(agentTeamConflict.id).toBe("plugin-conflict-agent-team");
    expect(agentTeamConflict.environmentId).toBe("agent-team-conflict");
    const { packages, symptom, recovery } = agentTeamConflict.expectedConflict;
    expect(packages).toEqual(["@deepseek-ai/dsh-experimental-agent-team-profile"]);
    expect(symptom).toMatch(/cordis\.patch\.yml/);
    expect(symptom).toMatch(/preset/i);
    expect(symptom).toMatch(/agent teams/i);
    expect(recovery).toMatch(/禁用|standard|Creator/);
    expect(agentTeamConflict.turns.length).toBeGreaterThan(0);
    expect(agentTeamConflict.workspace).toEqual({ files: {} });
    expect(agentTeamConflict.observations.length).toBeGreaterThan(0);
    expect(agentTeamConflict.source.upstreamSkill).toBe("cordis.patch.yml");
  });

  it("binds the conflict environment to the package it forbids", () => {
    const scenario = conflictForEnvironment("agent-team-conflict");
    expect(scenario).toBe(agentTeamConflict);
    const environment = environments.find((entry) => entry.id === scenario.environmentId);
    expect(environment).toBeDefined();
    for (const pkg of scenario.expectedConflict.packages) {
      expect(environment?.enabledPluginPackages).toContain(pkg);
    }
  });

  it("rejects an environment with no conflict regression", () => {
    expect(() => conflictForEnvironment("base")).toThrow(/no conflict regression/);
  });

  it("registers exactly one conflict regression", () => {
    expect(conflicts.map((entry) => entry.id)).toEqual(["plugin-conflict-agent-team"]);
  });
});

describe("conflict keyword matching", () => {
  it("matches the real AGENT_TEAMS_CONFLICT startup text", () => {
    const match = matchConflictSymptom(AGENT_TEAMS_CONFLICT);
    expect(match.matched).toBe(true);
    expect(match.matchedIdentity.length).toBeGreaterThan(0);
    expect(match.matchedFailure.length).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    expect(matchConflictSymptom("STARTUP ERROR: AGENT TEAMS PRESET CONFLICT").matched).toBe(true);
  });

  it("rejects an unrelated startup failure", () => {
    expect(matchConflictSymptom("EADDRINUSE: port 3080 already in use").matched).toBe(false);
  });

  it("needs both an identity token and a failure token", () => {
    expect(matchConflictSymptom("Agent Teams loaded successfully").matched).toBe(false);
    expect(matchConflictSymptom("preset failed for another reason").matched).toBe(false);
  });

  it("honors custom keyword groups", () => {
    const match = matchConflictSymptom("boom: widget collision", {
      identity: ["widget"],
      failure: ["collision"],
    });
    expect(match.matched).toBe(true);
    expect(match.matchedIdentity).toEqual(["widget"]);
    expect(match.matchedFailure).toEqual(["collision"]);
  });

  it("exposes the default keyword groups", () => {
    expect(CONFLICT_KEYWORD_GROUPS.identity).toContain("agent-team");
    expect(CONFLICT_KEYWORD_GROUPS.failure).toContain("preset");
  });
});

describe("conflict verdict", () => {
  it("turns a matching startup exit into a blocked verdict", () => {
    const outcome: ConflictStartupOutcome = { kind: "exited", combinedText: AGENT_TEAMS_CONFLICT };
    const { verdict, match } = conflictVerdict({ scenario: agentTeamConflict, outcome });
    expect(match.matched).toBe(true);
    expect(verdict).toEqual({
      phase: "adapted",
      status: "blocked",
      reason: `expected conflict confirmed: ${agentTeamConflict.expectedConflict.symptom}`,
    });
  });

  it("turns a started host into not-verified", () => {
    const { verdict } = conflictVerdict({
      scenario: agentTeamConflict,
      outcome: { kind: "started", url: "http://127.0.0.1:4000" },
    });
    expect(verdict.status).toBe("not-verified");
  });

  it("turns a non-matching exit into not-verified with tokens and runner error", () => {
    const { verdict } = conflictVerdict({
      scenario: agentTeamConflict,
      outcome: { kind: "exited", combinedText: "segfault", runError: "web exited 1" },
    });
    expect(verdict.status).toBe("not-verified");
    if (verdict.status !== "not-verified") throw new Error("expected not-verified");
    const joined = verdict.failures.join("\n");
    expect(joined).toContain("without the expected conflict keywords");
    expect(joined).toContain("runner error: web exited 1");
  });
});

describe("conflict run record", () => {
  const environment: RunEnvironment = {
    worker: 0,
    dshVersion: "test-dsh",
    adaptedVersion: "test-adapted",
    matrix: {
      id: "agent-team-conflict",
      enabledPluginPackages: ["@deepseek-ai/dsh-experimental-agent-team-profile"],
    },
    upstreamRevision: "test-upstream",
    configHash: "test-hash",
  };

  it("records a blocked adapted record with no session and the match summary", () => {
    const record = buildConflictRunRecord({
      scenario: agentTeamConflict,
      environment,
      recordFile: "evidence/x.json",
      observed: ["install=ok"],
      outcome: { kind: "exited", combinedText: AGENT_TEAMS_CONFLICT },
      capturedAt: "2026-11-11T00:00:00.000Z",
    });
    expect(record.phase).toBe("adapted");
    expect(record.session).toBeNull();
    expect(record.target).toBeNull();
    expect(record.verdict.status).toBe("blocked");
    expect(record.mechanicalFailures).toEqual([]);
    expect(record.artifacts.observed).toContain("conflict.matched=true");
    expect(record.artifacts.observed).toContain("install=ok");
    expect(record.artifacts.recordFile).toBe("evidence/x.json");
  });

  it("records not-verified and mirrors failures when the conflict does not reproduce", () => {
    const record = buildConflictRunRecord({
      scenario: agentTeamConflict,
      environment,
      recordFile: "evidence/y.json",
      observed: [],
      outcome: { kind: "started", url: "http://127.0.0.1:1" },
      capturedAt: "2026-11-11T00:00:00.000Z",
    });
    expect(record.verdict.status).toBe("not-verified");
    expect(record.mechanicalFailures.length).toBeGreaterThan(0);
    expect(record.artifacts.observed).toContain("conflict.matched=false");
  });
});
