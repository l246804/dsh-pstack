import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import type { RunRecord, SessionFacts } from "../playground/types.ts";
import {
  mountRawTree,
  profileManifest,
  rawProfileEntries,
  registerWorkspaces,
  resetHome,
  writeHomePatch,
  type ProviderPlan,
} from "../playground/scripts/lib/env.ts";
import {
  assertSafeRecord,
  assertSameEntry,
  digestEvents,
  firstUserText,
  isRunRecord,
  latestRecords,
  mechanicalFailures,
  pendingSemanticReview,
  sessionMatchesPrompt,
  type SessionEvent,
  verdictFor,
} from "../playground/scripts/lib/evidence.ts";
import {
  ISOLATED_ROOT,
  isolatedRootDirectory,
  publicConfigHash,
  REPOSITORY_ROOT,
} from "../playground/scripts/lib/run-metadata.ts";
import { behaviorScenario } from "../playground/scenarios/index.ts";
import { workerPaths, type WorkerPaths } from "../playground/scripts/lib/worker.ts";

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
      userTexts: [scenario.turns[0]?.prompt ?? ""],
      autoAnswers: [],
    },
    artifacts: { recordFile: "record.json", observed: [] },
    semanticReview: pendingSemanticReview(),
    mechanicalFailures: [],
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

  it("skips worker state JSON that sits beside evidence instead of treating it as a RunRecord", () => {
    const valid = record("raw", "base");
    expect(isRunRecord(valid)).toBe(true);
    const workspaceStore = { unit: { name: "workspace", version: 2 }, global: {}, tables: {} };
    const profileManifestFile = {
      name: "dsh-playground-raw",
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } },
    };
    expect(isRunRecord(workspaceStore)).toBe(false);
    expect(isRunRecord(profileManifestFile)).toBe(false);
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

function userMessage(text: string): SessionEvent {
  return {
    type: "user/message",
    data: { source: { kind: "user" }, content: [{ type: "text", text }] },
  };
}

function turnEnd(): SessionEvent {
  return { type: "turn/end", data: { reason: { kind: "completed" } } };
}

function assistantMessage(text: string): SessionEvent {
  return {
    type: "assistant/message",
    data: { message: { content: [{ type: "text", text }] } },
  };
}

describe("digest granularity", () => {
  it("separates assistant text per turn and records every user turn", () => {
    const digest = digestEvents(
      [
        userMessage("first prompt"),
        assistantMessage("answer part a"),
        assistantMessage("answer part b"),
        turnEnd(),
        userMessage("second prompt"),
        assistantMessage("second answer"),
        turnEnd(),
      ],
      "session-9",
      2,
    );
    expect(digest.assistantText).toBe(
      "answer part a\nanswer part b\n\n--- turn 2 ---\n\nsecond answer",
    );
    expect(digest.userText).toBe("first prompt");
    expect(digest.userTexts).toEqual(["first prompt", "second prompt"]);
    expect(digest.turnEndReason).toBe("completed");
    expect(digest.worker).toBe(2);
  });

  it("keeps a single-turn reply without a separator", () => {
    const digest = digestEvents(
      [userMessage("only prompt"), assistantMessage("x"), assistantMessage("y")],
      "session-1",
    );
    expect(digest.assistantText).toBe("x\ny");
    expect(digest.userTexts).toEqual(["only prompt"]);
  });

  it("labels a later turn even when an earlier turn had no assistant text", () => {
    const digest = digestEvents(
      [
        userMessage("first prompt"),
        turnEnd(),
        userMessage("second prompt"),
        assistantMessage("late answer"),
        turnEnd(),
      ],
      "session-2",
    );
    expect(digest.assistantText).toBe("--- turn 2 ---\n\nlate answer");
    expect(digest.userTexts).toEqual(["first prompt", "second prompt"]);
  });

  it("keeps non-user messages out of userTexts", () => {
    const digest = digestEvents(
      [
        userMessage("real prompt"),
        {
          type: "user/message",
          data: { source: { kind: "tool" }, content: [{ type: "text", text: "tool noise" }] },
        },
        turnEnd(),
      ],
      "session-3",
    );
    expect(digest.userTexts).toEqual(["real prompt"]);
    expect(digest.userText).toBe("real prompt");
  });
});

describe("mechanical failures", () => {
  it("lists every mechanical failure independent of the semantic verdict", () => {
    const scenario = behaviorScenario("poteto-help-smoke");
    const target = { provider: "provider-a", model: "model-a", effort: "low" };
    const session: SessionFacts = {
      sessionId: "session",
      sessionFile: "session-file",
      workspacePath: temporary,
      agentPreset: "standard",
      skillLoads: [],
      toolCalls: [],
      turnEndReason: "completed",
      assistantText: "验证建议",
      userText: scenario.turns[0]?.prompt ?? "",
      userTexts: [scenario.turns[0]?.prompt ?? ""],
      autoAnswers: [],
    };
    const input = {
      scenario,
      session,
      workspace: temporary,
      expectedTarget: target,
      expectedPreset: "standard",
    };
    const failures = mechanicalFailures({ ...input, route: target });
    expect(failures).toEqual(["process evidence: poteto-help was not loaded"]);
    expect(mechanicalFailures({ ...input, route: null })).toContain(
      "actual model route differs from testModel",
    );
    // The pending verdict stays unobserved while the list is already on the record.
    expect(
      verdictFor({ phase: "raw", failures, semanticReview: pendingSemanticReview() }).status,
    ).toBe("unobserved");
  });
});

describe("multi-turn session matching", () => {
  // Two turns in one session log: the first user message stays fixed while the second
  // turn's prompt only exists in the second user message.
  const events: SessionEvent[] = [
    userMessage("first prompt"),
    turnEnd(),
    userMessage("second prompt"),
    turnEnd(),
  ];

  it("matches the opening prompt through the first user message", () => {
    expect(firstUserText(events)).toBe("first prompt");
    expect(sessionMatchesPrompt(events, "first prompt", true)).toBe(true);
  });

  it("lets a later turn match its own prompt without the first user message", () => {
    expect(firstUserText(events)).toBe("first prompt");
    expect(firstUserText(events).includes("second prompt")).toBe(false);
    // First-turn semantics (the old matching path) can never see the second prompt.
    expect(sessionMatchesPrompt(events, "second prompt", true)).toBe(false);
    // The later-turn path matches the second user message, so the second turn advances.
    expect(sessionMatchesPrompt(events, "second prompt", false)).toBe(true);
  });

  it("rejects a prompt the session never carried", () => {
    expect(sessionMatchesPrompt(events, "third prompt", false)).toBe(false);
  });
});

function tempWorkerPaths(index: number): WorkerPaths {
  const root = join(temporary, `worker-${index}`);
  const isolatedRoot = join(temporary, `isolated-${index}`);
  return {
    index,
    environmentId: "base",
    root,
    isolatedRoot,
    home: join(root, "home"),
    browserDir: join(root, "browser"),
    workspaceRoot: join(isolatedRoot, "workspace"),
    rawMount: join(isolatedRoot, "raw"),
    evidenceDir: join(root, "evidence"),
    urlFile: join(root, "web-url.txt"),
    pidFile: join(root, "web.pid"),
    logFile: join(root, "web.log"),
    phaseFile: join(root, "phase.txt"),
  };
}

const isolationPlan: ProviderPlan = {
  routes: [],
  providers: {},
  apiKeyEnv: "TEST_PROVIDER_KEY",
  apiKey: "test-key-value",
  main: { provider: "provider-a", model: "model-a", effort: "low", name: "model-a" },
};

function writeFakeRawTree(root: string): void {
  mkdirSync(join(root, "tree/skills/poteto-mode"), { recursive: true });
  writeFileSync(join(root, "dsh.md"), "# raw harness adapter\n");
  writeFileSync(
    join(root, "tree/skills/poteto-mode/SKILL.md"),
    "---\nname: poteto-mode\n---\n\n# Raw poteto mode body\n",
  );
}

describe("read isolation from the repository tree", () => {
  it("keeps the session workspace and raw mount outside the repository", () => {
    const paths = workerPaths(1, "base");
    expect(paths.workspaceRoot.startsWith(`${REPOSITORY_ROOT}/`)).toBe(false);
    expect(paths.rawMount.startsWith(`${REPOSITORY_ROOT}/`)).toBe(false);
    expect(paths.workspaceRoot).toBe(join(ISOLATED_ROOT, "base", "w1", "workspace"));
    expect(paths.rawMount).toBe(join(ISOLATED_ROOT, "base", "w1", "raw"));
    // Audited state stays inside the repository.
    for (const dir of [paths.home, paths.browserDir, paths.evidenceDir]) {
      expect(dir.startsWith(`${REPOSITORY_ROOT}/playground/.workers/`)).toBe(true);
    }
    // The isolated root layers per environment and per worker.
    expect(workerPaths(1, "other").workspaceRoot).not.toBe(paths.workspaceRoot);
    expect(workerPaths(2, "base").isolatedRoot).not.toBe(paths.isolatedRoot);
  });

  it("honors the PLAYGROUND_WORKSPACE_ROOT override", () => {
    const override = join(temporary, "workspace-override");
    process.env.PLAYGROUND_WORKSPACE_ROOT = override;
    try {
      expect(isolatedRootDirectory()).toBe(resolve(override));
      expect(workerPaths(0, "base").workspaceRoot).toBe(
        join(resolve(override), "base", "w0", "workspace"),
      );
    } finally {
      delete process.env.PLAYGROUND_WORKSPACE_ROOT;
    }
    expect(isolatedRootDirectory()).toBe(ISOLATED_ROOT);
    expect(ISOLATED_ROOT.startsWith(`${REPOSITORY_ROOT}/`)).toBe(false);
  });

  it("mounts a raw copy so no worker profile path exposes the repository root", () => {
    const paths = tempWorkerPaths(10);
    const source = join(temporary, "raw-source");
    writeFakeRawTree(source);
    expect(mountRawTree(paths, source)).toBe(paths.rawMount);
    expect(existsSync(join(paths.rawMount, "dsh.md"))).toBe(true);
    expect(existsSync(join(paths.rawMount, "tree/skills/poteto-mode/SKILL.md"))).toBe(true);
    expect(() => mountRawTree(paths, join(temporary, "absent"))).toThrow(/raw tree is missing/);

    const entries = rawProfileEntries([], paths.rawMount);
    expect(JSON.stringify(entries)).toContain(join(paths.rawMount, "tree/skills"));
    expect(JSON.stringify(entries)).not.toContain(REPOSITORY_ROOT);
    expect(() => rawProfileEntries([], join(temporary, "absent"))).toThrow(/raw mount is missing/);

    writeHomePatch(paths, isolationPlan, "raw");
    const patch = readFileSync(join(paths.home, "cordis.patch.yml"), "utf8");
    expect(patch).toContain(join(paths.rawMount, "tree/skills/poteto-mode/SKILL.md"));
    expect(patch).toContain(join(paths.rawMount, "dsh.md"));
    expect(patch).not.toContain(REPOSITORY_ROOT);
  });

  it("keeps registerWorkspaces on absolute paths under the isolated workspace root", () => {
    const paths = tempWorkerPaths(11);
    const registration = registerWorkspaces(paths, ["scenario-b", "scenario-a"]);
    expect(Object.keys(registration.dirs)).toEqual(["scenario-a", "scenario-b"]);
    for (const dir of Object.values(registration.dirs)) {
      expect(isAbsolute(dir)).toBe(true);
      expect(dir.startsWith(`${paths.workspaceRoot}/`)).toBe(true);
    }
    const store = readFileSync(join(paths.home, "storages/workspace.json"), "utf8");
    expect(store).toContain(paths.workspaceRoot);
    expect(store).not.toContain(REPOSITORY_ROOT);
  });

  it("clears the isolated root when the worker home resets", () => {
    const paths = tempWorkerPaths(12);
    mkdirSync(paths.workspaceRoot, { recursive: true });
    writeFileSync(join(paths.workspaceRoot, "leftover.txt"), "x");
    mountRawTree(paths, join(temporary, "raw-source"));
    resetHome(paths);
    expect(existsSync(paths.home)).toBe(true);
    expect(existsSync(paths.workspaceRoot)).toBe(false);
    expect(existsSync(paths.rawMount)).toBe(false);
  });
});
