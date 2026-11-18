import { describe, expect, it } from "vite-plus/test";

import type { RunRecord } from "../playground/runner/types.ts";
import { residualKinds, sanitizeRecord } from "../playground/runner/lib/redaction.ts";

function record(): RunRecord {
  return {
    scenarioId: "redaction-test",
    treatment: "native",
    environment: {
      worker: 0,
      dshVersion: "test",
      pstackVersion: "test-pstack",
      adaptedVersion: null,
      matrix: { id: "base", description: "测试环境", kind: "base", enabledPluginPackages: [] },
      upstreamRevision: "upstream",
      configHash: "config",
    },
    target: null,
    session: {
      sessionId: "session-1",
      sessionFile: "/home/user/.dsh/sessions/x/session.v4.jsonl.zstd",
      workspacePath: "/tmp/dsh-pstack-playground/adapter/base/w0/workspace/x",
      agentPreset: "standard",
      skillLoads: [],
      toolCalls: [
        {
          name: "bash",
          status: "ok",
          argsSummary:
            "bash command=cat /home/user/.dsh/credentials.yaml api_key=sk-abcdefgh12345678",
        },
        {
          name: "bash",
          status: "ok",
          argsSummary:
            "bash command=ls ~/.dsh/sessions/--home-user-workspace-dsh-pstack-raw-base-w0--/ && curl 'http://127.0.0.1:1234/?token=faketoken0123456789abcdef'",
        },
      ],
      turnEndReason: "completed",
      assistantText:
        "token sk-abcdefgh12345678 at /home/user/private; see --home-user-workspace-proj and token=deadbeefcafe",
      userText: "read /tmp/other",
      userTexts: ["read /tmp/other"],
      autoAnswers: [],
    },
    artifacts: {
      recordFile: "/home/user/worker/record.json",
      screenshotFile: "/home/user/worker/shot.png",
      observed: ["path /tmp/other"],
    },
    semanticReview: { status: "pending", reason: "pending" },
    mechanicalFailures: [],
    verdict: { treatment: "native", status: "unobserved", reason: "test" },
    capturedAt: "2026-11-13T00:00:00.000Z",
  };
}

describe("record redaction", () => {
  it("removes secrets and host paths before a worker record is written", () => {
    const safe = sanitizeRecord(record());
    const text = JSON.stringify(safe);
    expect(residualKinds(text)).toEqual([]);
    expect(safe.session?.sessionFile).toBe("session.jsonl.zstd");
    expect(safe.session?.workspacePath).toBe("<WORKSPACE>");
    expect(safe.artifacts.recordFile).toBe("record.json");
  });

  it("redacts URL tokens and the login name hidden in encoded session keys", () => {
    const text = JSON.stringify(sanitizeRecord(record()));
    expect(text).not.toContain("faketoken0123456789");
    expect(text).not.toContain("deadbeefcafe");
    expect(text).not.toContain("--home-user");
    expect(text).toContain("token=<REDACTED_TOKEN>");
    expect(text).toContain("--home-<REDACTED_USER>");
  });
});
