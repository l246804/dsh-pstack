import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import type { Assertion, BehaviorScenario, RunRecord, SessionFacts } from "../runner/types.ts";
import {
  mountNativeTree,
  registerWorkspaces,
  resetHome,
  writeHomePatch,
} from "../runner/worker/home.ts";
import type { ProviderPlan } from "../runner/config/provider.ts";
import {
  assertSafeRecord,
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
} from "../runner/evidence/evidence.ts";
import {
  adaptedVersion,
  WORKERS_ROOT,
  WORKSPACE_ROOT,
  isolatedRootDirectory,
  publicConfigHash,
  REPOSITORY_ROOT,
} from "../runner/worker/run-metadata.ts";
import { setRuntimeSettings } from "../runner/config/runtime.ts";
import {
  workerPaths,
  variantWorkersDirectory,
  resetVariant,
  type WorkerPaths,
} from "../runner/worker/worker.ts";

const temporary = mkdtempSync(join(tmpdir(), "pstack-execution-test-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

const defaultRuntimeSettings = {
  scenarioTimeoutMs: 600_000,
  networkMode: "host" as const,
  workerPortBase: 8080,
  workerCapacity: {
    maxWorkers: 12,
    coreHeadroom: 2,
    memoryFraction: 0.7,
    memoryPerWorkerGB: 1,
  },
  workspaceRoot: WORKSPACE_ROOT,
  workersDir: WORKERS_ROOT,
  dockerBin: "docker",
  dshBin: "dsh",
};
setRuntimeSettings(defaultRuntimeSettings);

const testScenario: BehaviorScenario = {
  id: "capability-test",
  capability: "capability-test",
  kind: "regression",
  turns: [{ prompt: "/poteto-help 检查当前工作区。" }],
  workspace: { files: {} },
  assertions: [{ kind: "turn-completed" }, { kind: "skill-loaded", skill: "poteto-help" }],
  rubric: { prompt: "测试宿主。" },
  uiObservations: [],
};

function record(variant: "native" | "adapted", environmentId: string): RunRecord {
  const scenario = testScenario;
  const target = { provider: "provider-a", model: "model-a", effort: "low" };
  const config = {
    testModel: target,
    runtime: {
      scenarioTimeoutMs: 600000,
      networkMode: "host" as const,
      workerPortBase: 8080,
      workerCapacity: {
        maxWorkers: 12,
        coreHeadroom: 2,
        memoryFraction: 0.7,
        memoryPerWorkerGB: 1,
      },
      workspaceRoot: "playground/.workspace",
      workersDir: "playground/.workers",
      dockerBin: "docker",
      dshBin: "dsh",
    },
    providers: {
      "provider-a": {
        kind: "pi-ai" as const,
        apiKey: "secret-value",
        apiKeyEnv: "PROVIDER_A_KEY",
        reasoning: "low",
        models: [{ id: "model-a", reasoningEfforts: { low: "low" } }],
      },
    },
  };
  const matrix = {
    id: environmentId,
    description: "测试环境",
    kind: "base" as const,
    enabledPluginPackages: [],
  };
  return {
    scenarioId: scenario.id,
    variant,
    environment: {
      worker: 0,
      dshVersion: "test-dsh",
      pstackVersion: "test-pstack",
      adaptedVersion: variant === "native" ? null : "test-adapted",
      matrix,
      upstreamRevision: "test-upstream",
      configHash: publicConfigHash(config, matrix),
    },
    target,
    session: {
      sessionId: "session",
      sessionFile: "session-file",
      workspacePath: null,
      agentPreset: variant === "native" ? "standard" : "poteto-mode",
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
    verdict: verdictFor({ variant, failures: [], semanticReview: pendingSemanticReview() }),
    capturedAt: "2026-11-11T00:00:00.000Z",
  };
}

describe("execution contracts", () => {
  it("keys latest evidence by scenario, variant, and environment", () => {
    const native = record("native", "base");
    const adapted = record("adapted", "base");
    const otherEnvironment = record("native", "other");
    expect(latestRecords([native, adapted, otherEnvironment])).toHaveLength(3);
    expect(workerPaths(0, "base", "adapted").home).not.toBe(
      workerPaths(0, "other", "adapted").home,
    );
    expect(workerPaths(0, "base", "adapted").browserDir).not.toBe(
      workerPaths(0, "other", "adapted").browserDir,
    );
    // Variant isolates the same environment and worker index into its own evidence tree.
    expect(workerPaths(0, "base", "native").home).not.toBe(workerPaths(0, "base", "adapted").home);
  });

  it("skips worker state JSON that sits beside evidence instead of treating it as a RunRecord", () => {
    const valid = record("native", "base");
    expect(isRunRecord(valid)).toBe(true);
    const workspaceStore = { unit: { name: "workspace", version: 2 }, global: {}, tables: {} };
    const profileManifestFile = {
      name: "dsh-playground-native",
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } },
    };
    expect(isRunRecord(workspaceStore)).toBe(false);
    expect(isRunRecord(profileManifestFile)).toBe(false);
  });

  it("does not pass an unreviewed semantic effect in either variant", () => {
    expect(record("native", "base").verdict.status).toBe("unobserved");
    expect(record("adapted", "base").verdict.status).toBe("inconclusive");
  });

  it("rejects a record that carries an api key", () => {
    const raw = record("native", "base");
    expect(JSON.stringify(raw)).not.toContain("secret-value");
    expect(() =>
      assertSafeRecord({ ...raw, artifacts: { recordFile: "secret-value", observed: [] } }, [
        "secret-value",
      ]),
    ).toThrow(/apiKey/);
  });

  it("contains no probe timeout or automatic stop in the execution scripts", () => {
    const root = resolve(__dirname, "../runner/cli");
    for (const file of ["run-scenario.ts", "run-batch.ts", "prepare.ts", "collect.ts"]) {
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

  it("records a user-explicit skill gesture from the injected skill_content", () => {
    const digest = digestEvents(
      [userMessage('<skill_content name="poteto-mode">\nskill body\n</skill_content>')],
      "session-gesture",
    );
    expect(digest.skillLoads).toEqual(["poteto-mode#user-gesture"]);
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
const absentAssertion: Assertion = { kind: "artifact-absent", path: "protected/child-write.txt" };

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
    expect(() => summarizeToolArguments("read", "not-json")).toThrow("invalid tool arguments");
  });

  it("surfaces out-of-workspace reads in the digest for auditing", () => {
    const digest = digestEvents(
      [
        {
          type: "tool/call",
          data: {
            name: "read",
            callId: "c1",
            arguments: { file_path: "../../playground/scenarios/probes/tdd.ts" },
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
      "read file_path=../../playground/scenarios/probes/tdd.ts",
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

  it("fails when an artifact that the scenario forbids was created", () => {
    const workspace = workspaceWith({ "protected/child-write.txt": "written" });
    expect(evaluateAssertions([absentAssertion], emptySession, workspace)).toEqual([
      "unexpected artifact: protected/child-write.txt",
    ]);
    expect(evaluateAssertions([absentAssertion], emptySession, workspaceWith({}))).toEqual([]);
  });
});

describe("mechanical failures", () => {
  it("lists every mechanical failure independent of the semantic verdict", () => {
    const scenario = testScenario;
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
      verdictFor({ variant: "native", failures, semanticReview: pendingSemanticReview() }).status,
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
    variant: "adapted",
    root,
    isolatedRoot,
    home: join(root, "home"),
    browserDir: join(root, "browser"),
    workspaceRoot: join(isolatedRoot, "workspace"),
    nativeMount: join(isolatedRoot, "native"),
    evidenceDir: join(root, "evidence"),
    urlFile: join(root, "web-url.txt"),
    logFile: join(root, "web.log"),
    variantFile: join(root, "variant.txt"),
    containerName: `dsh-playground-adapted-base-w0`,
    containerHome: "/dsh/home",
    containerWorkspace: "/dsh/workspace",
    containerNative: "/dsh/native",
    containerTmp: "/dsh/tmp",
    containerRuntime: "/dsh/runtime",
  };
}

const isolationPlan: ProviderPlan = {
  routes: [],
  providers: {},
  apiKeyEnv: "TEST_PROVIDER_KEY",
  apiKey: "test-key-value",
  secrets: ["test-key-value"],
  main: { provider: "provider-a", model: "model-a", effort: "low", name: "model-a" },
};

function writeFakeNativeTree(root: string): void {
  mkdirSync(join(root, "pstack/skills/poteto-mode"), { recursive: true });
  writeFileSync(join(root, "dsh.md"), "# native harness adapter\n");
  writeFileSync(
    join(root, "pstack/skills/poteto-mode/SKILL.md"),
    "---\nname: poteto-mode\n---\n\n# Native poteto mode body\n",
  );
}

describe("workspace isolation", () => {
  it("keeps worker state under ignored paths and exposes only /dsh paths to the session", () => {
    const paths = workerPaths(1, "base", "adapted");
    expect(paths.workspaceRoot).toBe(join(WORKSPACE_ROOT, "adapted", "base", "w1", "workspace"));
    expect(paths.nativeMount).toBe(join(WORKSPACE_ROOT, "adapted", "base", "w1", "native"));
    expect(paths.containerWorkspace).toBe("/dsh/workspace");
    expect(paths.containerNative).toBe("/dsh/native");
    // Audited state stays under .workers; the session workspace stays under .workspace.
    for (const dir of [paths.home, paths.browserDir, paths.evidenceDir]) {
      expect(dir.startsWith(`${REPOSITORY_ROOT}/playground/.workers/`)).toBe(true);
    }
    expect(paths.workspaceRoot.startsWith(`${REPOSITORY_ROOT}/playground/.workspace/`)).toBe(true);
    expect(workerPaths(1, "other", "adapted").workspaceRoot).not.toBe(paths.workspaceRoot);
    expect(workerPaths(1, "base", "native").workspaceRoot).not.toBe(paths.workspaceRoot);
    expect(workerPaths(2, "base", "adapted").isolatedRoot).not.toBe(paths.isolatedRoot);
  });

  it("reads workspace and workers roots from runtime settings", () => {
    const override = join(temporary, "workspace-override");
    const workersRoot = join(temporary, "workers-override");
    setRuntimeSettings({
      ...defaultRuntimeSettings,
      workspaceRoot: override,
      workersDir: workersRoot,
    });
    try {
      expect(isolatedRootDirectory()).toBe(resolve(override));
      expect(workerPaths(0, "base", "adapted").workspaceRoot).toBe(
        join(resolve(override), "adapted", "base", "w0", "workspace"),
      );
      expect(workerPaths(0, "base", "adapted").home).toBe(
        join(resolve(workersRoot), "adapted", "base", "w0", "home"),
      );
    } finally {
      setRuntimeSettings(defaultRuntimeSettings);
    }
    expect(isolatedRootDirectory()).toBe(WORKSPACE_ROOT);
  });

  it("mounts a native copy so no worker profile path exposes the repository root", () => {
    const paths = tempWorkerPaths(10);
    const source = join(temporary, "native-source");
    writeFakeNativeTree(source);
    expect(mountNativeTree(paths, source)).toBe(paths.nativeMount);
    expect(existsSync(join(paths.nativeMount, "dsh.md"))).toBe(true);
    expect(existsSync(join(paths.nativeMount, "pstack/skills/poteto-mode/SKILL.md"))).toBe(true);
    expect(() => mountNativeTree(paths, join(temporary, "absent"))).toThrow(
      /native tree is missing/,
    );

    writeHomePatch(paths, isolationPlan, "native", false, "host");
    const patch = readFileSync(join(paths.home, "cordis.patch.yml"), "utf8");
    expect(patch).not.toContain("system-prompt");
    expect(patch).toContain(join(paths.containerNative, "pstack/skills"));
    expect(patch).not.toContain(join(paths.nativeMount, "dsh.md"));
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
    expect(store).toContain(paths.containerWorkspace);
    expect(store).not.toContain(REPOSITORY_ROOT);
  });

  it("clears the isolated root when the worker home resets", () => {
    const paths = tempWorkerPaths(12);
    mkdirSync(paths.workspaceRoot, { recursive: true });
    writeFileSync(join(paths.workspaceRoot, "leftover.txt"), "x");
    mountNativeTree(paths, join(temporary, "native-source"));
    resetHome(paths);
    expect(existsSync(paths.home)).toBe(true);
    expect(existsSync(paths.workspaceRoot)).toBe(false);
    expect(existsSync(paths.nativeMount)).toBe(false);
  });
});

describe("variant isolation of worker evidence", () => {
  it("separates one environment and worker index by variant", () => {
    const native = workerPaths(0, "base", "native");
    const adapted = workerPaths(0, "base", "adapted");
    expect(native.root).not.toBe(adapted.root);
    expect(native.evidenceDir).not.toBe(adapted.evidenceDir);
    expect(native.isolatedRoot).not.toBe(adapted.isolatedRoot);
    expect(native.root.endsWith(join("native", "base", "w0"))).toBe(true);
    expect(adapted.root.endsWith(join("adapted", "base", "w0"))).toBe(true);
    expect(native.variant).toBe("native");
    expect(adapted.variant).toBe("adapted");
  });

  it("reads adapted version from the stock web profile, not a legacy profile name", () => {
    const home = join(temporary, "profile-home");
    mkdirSync(join(home, "profiles/web/node_modules/dsh-pstack"), { recursive: true });
    writeFileSync(
      join(home, "profiles/web/node_modules/dsh-pstack/package.json"),
      '{"version":"1.2.3"}',
    );
    expect(adaptedVersion({ home }, "adapted")).toBe("1.2.3");
    expect(adaptedVersion({ home }, "native")).toBeNull();
  });

  it("resets only one variant and leaves the other variant's evidence on disk", () => {
    const workersRoot = join(temporary, "variant-workers");
    const isolatedRoot = join(temporary, "variant-isolated");
    setRuntimeSettings({
      ...defaultRuntimeSettings,
      workersDir: workersRoot,
      workspaceRoot: isolatedRoot,
    });
    try {
      const native = workerPaths(0, "base", "native");
      const adapted = workerPaths(0, "base", "adapted");
      const nativeRecord = join(native.evidenceDir, "native-record.json");
      mkdirSync(native.evidenceDir, { recursive: true });
      writeFileSync(nativeRecord, "{}");
      mkdirSync(adapted.evidenceDir, { recursive: true });
      writeFileSync(join(adapted.evidenceDir, "adapted-record.json"), "{}");

      resetVariant("base", "adapted");

      expect(existsSync(nativeRecord)).toBe(true);
      expect(existsSync(adapted.evidenceDir)).toBe(false);
      expect(existsSync(variantWorkersDirectory("base", "native"))).toBe(true);
    } finally {
      setRuntimeSettings(defaultRuntimeSettings);
    }
  });
});
