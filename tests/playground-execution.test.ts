import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import type { Assertion, RunRecord, SessionFacts } from "../playground/types.ts";
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
  evaluateAssertions,
  firstUserText,
  isRunRecord,
  latestRecords,
  mechanicalFailures,
  pendingSemanticReview,
  sessionMatchesPrompt,
  summarizeToolArguments,
  type SessionEvent,
  verdictFor,
} from "../playground/scripts/lib/evidence.ts";
import {
  ISOLATED_ROOT,
  isolatedRootDirectory,
  publicConfigHash,
  REPOSITORY_ROOT,
} from "../playground/scripts/lib/run-metadata.ts";
import { behaviorScenario, exclusions } from "../playground/scenarios/index.ts";
import { listScenarioIds } from "../playground/scripts/lib/scenarios.ts";
import { reportFor } from "../playground/scripts/collect.ts";
import {
  workerPaths,
  phaseWorkersDirectory,
  resetPhase,
  type WorkerPaths,
} from "../playground/scripts/lib/worker.ts";

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
    expect(workerPaths(0, "base", "adapted").home).not.toBe(
      workerPaths(0, "other", "adapted").home,
    );
    expect(workerPaths(0, "base", "adapted").browserDir).not.toBe(
      workerPaths(0, "other", "adapted").browserDir,
    );
    // Phase isolates the same environment and worker index into its own evidence tree.
    expect(workerPaths(0, "base", "raw").home).not.toBe(workerPaths(0, "base", "adapted").home);
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

const dirAssertion: Assertion = { kind: "artifact-dir-nonempty", path: "verify/features" };

describe("tool call argument summaries", () => {
  it("records the path for write tools and drops unlisted parameters", () => {
    expect(
      summarizeToolArguments("write", {
        file_path: "notes/todo.md",
        content: "apiKey: sk-secret-value",
      }),
    ).toBe("write file_path=notes/todo.md");
    expect(
      summarizeToolArguments("edit", {
        file_path: "src/main.ts",
        old_string: "a",
        new_string: "b",
      }),
    ).toBe("edit file_path=src/main.ts");
  });

  it("never copies secret-carrying parameters into the summary", () => {
    const summary = summarizeToolArguments(
      "bash",
      JSON.stringify({ command: "git status", apiKey: "sk-secret-value", token: "abc123secret" }),
    );
    expect(summary).toBe("bash command=git status");
    expect(summary).not.toContain("sk-secret-value");
    expect(summary).not.toContain("abc123secret");
  });

  it("truncates the summary at 200 characters", () => {
    const summary = summarizeToolArguments("bash", { command: "x".repeat(500) });
    expect(summary.length).toBe(200);
    expect(summary.startsWith("bash command=")).toBe(true);
  });

  it("keeps the bare tool name when no listed argument is present", () => {
    expect(summarizeToolArguments("job_list", {})).toBe("job_list");
    expect(summarizeToolArguments("read", "not-json")).toBe("read");
  });

  it("surfaces out-of-workspace reads in the digest for auditing", () => {
    const digest = digestEvents(
      [
        {
          type: "tool/call",
          data: {
            name: "read",
            callId: "c1",
            arguments: { file_path: "../../playground/scenarios/tdd.ts" },
          },
        },
        {
          type: "tool/result",
          data: { toolCallId: "c1", message: { isError: false, content: [] } },
        },
      ],
      "session-4",
    );
    expect(digest.toolCalls[0]?.argsSummary).toBe(
      "read file_path=../../playground/scenarios/tdd.ts",
    );
    expect(digest.toolCalls[0]?.status).toBe("ok");
  });
});

const emptySession: SessionFacts = {
  sessionId: "session",
  sessionFile: "session-file",
  workspacePath: null,
  agentPreset: "standard",
  skillLoads: [],
  toolCalls: [],
  turnEndReason: "completed",
  assistantText: "",
  userText: "",
  userTexts: [],
  autoAnswers: [],
};

let workspaceCount = 0;

function workspaceWith(entries: Record<string, string>): string {
  const workspace = join(temporary, `artifact-ws-${workspaceCount++}`);
  mkdirSync(workspace, { recursive: true });
  for (const [relative, content] of Object.entries(entries)) {
    const target = join(workspace, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return workspace;
}

describe("artifact-dir-nonempty assertion", () => {
  it("passes only when the directory exists and holds at least one file", () => {
    expect(evaluateAssertions([dirAssertion], emptySession, workspaceWith({}))).toEqual([
      "missing artifact directory: verify/features",
    ]);

    const emptyDir = workspaceWith({});
    mkdirSync(join(emptyDir, "verify/features"), { recursive: true });
    expect(evaluateAssertions([dirAssertion], emptySession, emptyDir)).toEqual([
      "artifact directory has no files: verify/features",
    ]);

    const readmeIndex = workspaceWith({ "verify/features/README.md": "# Index" });
    expect(evaluateAssertions([dirAssertion], emptySession, readmeIndex)).toEqual([]);

    const indexVariant = workspaceWith({ "verify/features/index.md": "# Index" });
    expect(evaluateAssertions([dirAssertion], emptySession, indexVariant)).toEqual([]);

    const nestedPage = workspaceWith({ "verify/features/notes/page.md": "# Feature" });
    expect(evaluateAssertions([dirAssertion], emptySession, nestedPage)).toEqual([]);
  });

  it("rejects a file standing in for the directory and a path escaping the workspace", () => {
    const workspace = workspaceWith({ "verify/features": "not a directory" });
    expect(evaluateAssertions([dirAssertion], emptySession, workspace)).toEqual([
      "missing artifact directory: verify/features",
    ]);
    expect(
      evaluateAssertions(
        [{ kind: "artifact-dir-nonempty", path: "../escape" }],
        emptySession,
        workspace,
      ),
    ).toEqual(["artifact escapes workspace: ../escape"]);
  });

  it("keeps the artifact-contains escape check after the shared resolver refactor", () => {
    const workspace = workspaceWith({ "verify/SKILL.md": "---\nname: verify-notes\n---\n" });
    expect(
      evaluateAssertions(
        [{ kind: "artifact-contains", path: "verify/SKILL.md", text: "name: verify" }],
        emptySession,
        workspace,
      ),
    ).toEqual([]);
    expect(
      evaluateAssertions(
        [{ kind: "artifact-contains", path: "../../etc/passwd", text: "root" }],
        emptySession,
        workspace,
      ),
    ).toEqual(["artifact escapes workspace: ../../etc/passwd"]);
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
    phase: "adapted",
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
    const paths = workerPaths(1, "base", "adapted");
    expect(paths.workspaceRoot.startsWith(`${REPOSITORY_ROOT}/`)).toBe(false);
    expect(paths.rawMount.startsWith(`${REPOSITORY_ROOT}/`)).toBe(false);
    expect(paths.workspaceRoot).toBe(join(ISOLATED_ROOT, "adapted", "base", "w1", "workspace"));
    expect(paths.rawMount).toBe(join(ISOLATED_ROOT, "adapted", "base", "w1", "raw"));
    // Audited state stays inside the repository.
    for (const dir of [paths.home, paths.browserDir, paths.evidenceDir]) {
      expect(dir.startsWith(`${REPOSITORY_ROOT}/playground/.workers/`)).toBe(true);
    }
    // The isolated root layers per phase, per environment, and per worker.
    expect(workerPaths(1, "other", "adapted").workspaceRoot).not.toBe(paths.workspaceRoot);
    expect(workerPaths(1, "base", "raw").workspaceRoot).not.toBe(paths.workspaceRoot);
    expect(workerPaths(2, "base", "adapted").isolatedRoot).not.toBe(paths.isolatedRoot);
  });

  it("honors the PLAYGROUND_WORKSPACE_ROOT override", () => {
    const override = join(temporary, "workspace-override");
    process.env.PLAYGROUND_WORKSPACE_ROOT = override;
    try {
      expect(isolatedRootDirectory()).toBe(resolve(override));
      expect(workerPaths(0, "base", "adapted").workspaceRoot).toBe(
        join(resolve(override), "adapted", "base", "w0", "workspace"),
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

describe("phase isolation of worker evidence", () => {
  it("separates one environment and worker index by phase", () => {
    const raw = workerPaths(0, "base", "raw");
    const adapted = workerPaths(0, "base", "adapted");
    expect(raw.root).not.toBe(adapted.root);
    expect(raw.evidenceDir).not.toBe(adapted.evidenceDir);
    expect(raw.isolatedRoot).not.toBe(adapted.isolatedRoot);
    expect(raw.root.endsWith(join("raw", "base", "w0"))).toBe(true);
    expect(adapted.root.endsWith(join("adapted", "base", "w0"))).toBe(true);
    expect(raw.phase).toBe("raw");
    expect(adapted.phase).toBe("adapted");
  });

  it("resets only one phase and leaves the other phase's evidence on disk", () => {
    const workersRoot = join(temporary, "phase-workers");
    const isolatedRoot = join(temporary, "phase-isolated");
    process.env.PLAYGROUND_WORKERS_DIR = workersRoot;
    process.env.PLAYGROUND_WORKSPACE_ROOT = isolatedRoot;
    try {
      const raw = workerPaths(0, "base", "raw");
      const adapted = workerPaths(0, "base", "adapted");
      const rawRecord = join(raw.evidenceDir, "raw-record.json");
      mkdirSync(raw.evidenceDir, { recursive: true });
      writeFileSync(rawRecord, "{}");
      mkdirSync(adapted.evidenceDir, { recursive: true });
      writeFileSync(join(adapted.evidenceDir, "adapted-record.json"), "{}");

      resetPhase("base", "adapted");

      expect(existsSync(rawRecord)).toBe(true);
      expect(existsSync(adapted.evidenceDir)).toBe(false);
      expect(existsSync(phaseWorkersDirectory("base", "raw"))).toBe(true);
    } finally {
      delete process.env.PLAYGROUND_WORKERS_DIR;
      delete process.env.PLAYGROUND_WORKSPACE_ROOT;
    }
  });
});

function verifiedAdapted(environmentId: string): RunRecord {
  return {
    ...record("adapted", environmentId),
    verdict: { phase: "adapted", status: "verified" },
  };
}

function summaryCounts(markdown: string): Record<string, number> {
  const match = markdown.match(/```json\n([\s\S]*?)\n```/);
  if (!match) throw new Error("report is missing its summary json block");
  return JSON.parse(match[1] ?? "") as Record<string, number>;
}

function rowVerdict(markdown: string, scenarioId: string): string {
  const line = markdown.split("\n").find((entry) => entry.startsWith(`| ${scenarioId} |`));
  if (!line) throw new Error(`report has no row for ${scenarioId}`);
  return (line.split("|")[4] ?? "").trim();
}

describe("collect report verdict counting", () => {
  it("counts an adapted row without a raw comparison as inconclusive, not verified", () => {
    const adapted = verifiedAdapted("base");
    const { markdown } = reportFor("adapted", "base", [adapted]);
    const counts = summaryCounts(markdown);
    expect(counts.inconclusive).toBe(1);
    expect(counts.verified).toBe(0);
    expect(rowVerdict(markdown, adapted.scenarioId)).toBe("inconclusive");
  });

  it("counts a matched raw comparison as verified", () => {
    const raw = record("raw", "base");
    const adapted = verifiedAdapted("base");
    const { markdown } = reportFor("adapted", "base", [raw, adapted]);
    const counts = summaryCounts(markdown);
    expect(counts.verified).toBe(1);
    expect(counts.inconclusive).toBe(0);
    expect(rowVerdict(markdown, adapted.scenarioId)).toBe("verified");
  });

  it("keeps status counts plus unrun and excluded equal to registered plus exclusions", () => {
    const raw = record("raw", "base");
    const adapted = verifiedAdapted("base");
    const counts = summaryCounts(reportFor("adapted", "base", [raw, adapted]).markdown);
    const { unrun = 0, excluded = 0, ...statuses } = counts;
    const counted = Object.values(statuses).reduce((total, value) => total + value, 0);
    expect(counted + unrun + excluded).toBe(listScenarioIds().length + exclusions.length);
  });
});
