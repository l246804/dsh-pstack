import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentMatrix, RunEnvironment, TestTarget } from "../playground/types.ts";
import { pluginUiScenarios } from "../playground/scenarios/plugin-ui.ts";
import {
  UI_ACTION_VERBS,
  buildUiRunRecord,
  expectedRoleLine,
  fileAssertionFailure,
  parseUiAction,
  resolveExpected,
  routeValue,
  uiSemanticReview,
  uiVerdict,
} from "../playground/scripts/lib/ui-execution.ts";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const plan: TestTarget = {
  provider: "magpie",
  model: "workbuddy/deepseek-v4.1-flash",
  effort: "low",
};

const matrix: EnvironmentMatrix = { id: "base", enabledPluginPackages: ["dsh-pstack"] };
const environment: RunEnvironment = {
  worker: 0,
  dshVersion: "test-dsh",
  adaptedVersion: "test-adapted",
  matrix,
  upstreamRevision: "test-upstream",
  configHash: "test-hash",
};

describe("UI step parsing", () => {
  it("reads a bare verb", () => {
    expect(parseUiAction("open-plugins-detail")).toEqual({
      verb: "open-plugins-detail",
      params: {},
    });
  });

  it("reads key=value parameters", () => {
    expect(parseUiAction("select-role role=bug-fix")).toEqual({
      verb: "select-role",
      params: { role: "bug-fix" },
    });
    expect(
      parseUiAction("assert-plugin-listed name=@deepseek-ai/dsh-experimental-session-search"),
    ).toEqual({
      verb: "assert-plugin-listed",
      params: { name: "@deepseek-ai/dsh-experimental-session-search" },
    });
  });

  it("rejects an empty action and a malformed parameter", () => {
    expect(() => parseUiAction("   ")).toThrow(/empty/);
    expect(() => parseUiAction("select-role bug-fix")).toThrow(/key=value/);
    expect(() => parseUiAction("select-role role=")).toThrow(/key=value/);
  });
});

describe("expected-value templating", () => {
  it("spells a route the way the role file does", () => {
    expect(routeValue(plan)).toBe("magpie/workbuddy/deepseek-v4.1-flash [low]");
    expect(expectedRoleLine("bug-fix", plan)).toBe(
      "bug-fix: magpie/workbuddy/deepseek-v4.1-flash [low]",
    );
    expect(routeValue({ ...plan, effort: "" })).toBe("magpie/workbuddy/deepseek-v4.1-flash");
  });

  it("fills model, provider, route, and roleLine from the worker plan and role", () => {
    const context = { plan, role: "bug-fix" } as const;
    expect(resolveExpected("{{provider}}", context)).toBe("magpie");
    expect(resolveExpected("{{model}}", context)).toBe("workbuddy/deepseek-v4.1-flash");
    expect(resolveExpected("{{route}}", context)).toBe(
      "magpie/workbuddy/deepseek-v4.1-flash [low]",
    );
    expect(resolveExpected("{{roleLine}}", context)).toBe(expectedRoleLine("bug-fix", plan));
  });

  it("leaves an unknown placeholder literal so a typo fails the assertion", () => {
    expect(resolveExpected("value={{unknown}}", { plan })).toBe("value={{unknown}}");
  });

  it("leaves roleLine literal when no role is in scope", () => {
    expect(resolveExpected("{{roleLine}}", { plan })).toBe("{{roleLine}}");
  });
});

describe("role-file assertions", () => {
  const line = expectedRoleLine("bug-fix", plan);

  it("assert-file-contains passes only when the role line is present", () => {
    expect(
      fileAssertionFailure({
        verb: "assert-file-contains",
        fileText: `# budget\n${line}\n`,
        expectedLine: line,
        role: "bug-fix",
      }),
    ).toBeNull();
    expect(
      fileAssertionFailure({
        verb: "assert-file-contains",
        fileText: "# empty\n",
        expectedLine: line,
        role: "bug-fix",
      }),
    ).toBe(`role file lacks ${JSON.stringify(line)} for role "bug-fix"`);
  });

  it("assert-file-not-contains passes only when the role line is gone", () => {
    expect(
      fileAssertionFailure({
        verb: "assert-file-not-contains",
        fileText: "# empty\n",
        expectedLine: line,
        role: "bug-fix",
      }),
    ).toBeNull();
    expect(
      fileAssertionFailure({
        verb: "assert-file-not-contains",
        fileText: `${line}\n`,
        expectedLine: line,
        role: "bug-fix",
      }),
    ).toBe(`role file still contains ${JSON.stringify(line)} for role "bug-fix"`);
  });
});

describe("UI verdict and record construction", () => {
  it("keeps a clean run inconclusive until the human screenshot review", () => {
    const review = uiSemanticReview();
    expect(review.status).toBe("pending");
    expect(review.reason).toContain("人工目测");
    expect(uiVerdict({ failures: [], semanticReview: review })).toEqual({
      phase: "adapted",
      status: "inconclusive",
      reason: review.reason,
    });
  });

  it("turns any failed step into not-verified", () => {
    expect(
      uiVerdict({ failures: ["step 3 set-route: boom"], semanticReview: uiSemanticReview() }),
    ).toEqual({
      phase: "adapted",
      status: "not-verified",
      failures: ["step 3 set-route: boom"],
    });
  });

  it("turns an infrastructure gap into inconclusive", () => {
    expect(
      uiVerdict({ failures: [], semanticReview: uiSemanticReview(), blockedReason: "no web url" }),
    ).toEqual({ phase: "adapted", status: "inconclusive", reason: "no web url" });
  });

  it("builds an adapted record with no session and a pending review", () => {
    const record = buildUiRunRecord({
      scenarioId: "plugin-ui-role-config",
      environment,
      target: plan,
      recordFile: "evidence/plugin-ui-role-config-adapted-base-stamp.json",
      screenshotFile: "evidence/plugin-ui-role-config-adapted-base-stamp.png",
      observed: ["screenshot=final.png"],
      failures: [],
      capturedAt: "2026-11-11T00:00:00.000Z",
    });
    expect(record.phase).toBe("adapted");
    expect(record.session).toBeNull();
    expect(record.target).toEqual(plan);
    expect(record.artifacts.screenshotFile).toBe(
      "evidence/plugin-ui-role-config-adapted-base-stamp.png",
    );
    expect(record.semanticReview.status).toBe("pending");
    expect(record.mechanicalFailures).toEqual([]);
    expect(record.verdict.status).toBe("inconclusive");
  });

  it("records step failures in both mechanicalFailures and the not-verified verdict", () => {
    const failures = ["step 2 open-role-tab: DOM did not show role models"];
    const record = buildUiRunRecord({
      scenarioId: "plugin-ui-role-config",
      environment,
      target: plan,
      recordFile: "evidence/fail.json",
      observed: [],
      failures,
      capturedAt: "2026-11-11T00:00:00.000Z",
    });
    expect(record.mechanicalFailures).toEqual(failures);
    expect(record.verdict).toEqual({
      phase: "adapted",
      status: "not-verified",
      failures,
    });
  });
});

describe("plugin UI scenario registry", () => {
  it("declares the two required scenarios and only known action verbs", () => {
    expect(pluginUiScenarios.map((scenario) => scenario.id)).toEqual([
      "plugin-ui-role-config",
      "plugin-ui-recommended-plugins",
    ]);
    const known = new Set<string>(UI_ACTION_VERBS);
    for (const scenario of pluginUiScenarios) {
      expect(scenario.steps.length).toBeGreaterThan(0);
      for (const step of scenario.steps) {
        expect(known.has(parseUiAction(step.action).verb)).toBe(true);
      }
    }
  });

  it("covers the save/delete file assertions and the plugin state assertion", () => {
    const role = pluginUiScenarios.find((scenario) => scenario.id === "plugin-ui-role-config");
    const plugins = pluginUiScenarios.find(
      (scenario) => scenario.id === "plugin-ui-recommended-plugins",
    );
    const verbs = (scenario: typeof role) =>
      (scenario?.steps ?? []).map((step) => parseUiAction(step.action).verb);
    expect(verbs(role)).toEqual(
      expect.arrayContaining([
        "assert-file-contains",
        "assert-file-not-contains",
        "set-route",
        "save",
        "screenshot",
      ]),
    );
    expect(verbs(plugins)).toEqual(
      expect.arrayContaining(["assert-plugin-listed", "toggle-plugin", "assert-plugin-state"]),
    );
  });

  it("marks every observation as a human screenshot check", () => {
    for (const scenario of pluginUiScenarios) {
      expect(scenario.observations.length).toBeGreaterThan(0);
      for (const observation of scenario.observations) {
        expect(observation.description).toContain("人工目测");
      }
    }
  });

  it("keeps the scenario free of literal provider and model routes", () => {
    const source = readFileSync(join(repository, "playground/scenarios/plugin-ui.ts"), "utf8");
    expect(source).toContain("{{model}}");
    expect(source).not.toMatch(/["'][a-z0-9-]+\/[a-z0-9.-]+["']/);
  });
});
