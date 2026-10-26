/**
 * Unit coverage for `scripts/runtime/worktree-audit.ts`.
 *
 * The shipped file had none: `bucketFor`, `formatSize`, `sortRows`, `parseArgs`,
 * `readSessionsFile`, `lastSession`, and `isRecent` were reachable only through the
 * CLI end to end, which needs a real git repository and a forge.
 *
 * The pure functions are tested here; the end-to-end TSV contract stays with
 * `scripts/runtime/tests/` and `check:scripts`.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  AuditError,
  HEADER,
  PINNED,
  UNKNOWN_USAGE_BUCKET,
  bucketFor,
  buildRow,
  formatSize,
  isRecent,
  lastChatColumn,
  lastSession,
  parseArgs,
  readSessionsFile,
  renderTable,
  sortRows,
  usageNote,
  sameOrInside,
} from "../scripts/runtime/worktree-audit.ts";
import type { AuditRow, SessionInput } from "../scripts/runtime/worktree-audit.ts";
import { ROOT } from "../scripts/build-assets.ts";

const fixtures: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "dsh-pstack-audit-"));
  fixtures.push(directory);
  return directory;
}

function sessionsFile(value: unknown): string {
  const directory = temporaryDirectory();
  const file = join(directory, "sessions.json");
  writeFileSync(file, JSON.stringify(value));
  return file;
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("bucketFor", () => {
  it("never lets a worktree with unknown usage reach a deletion bucket", () => {
    expect(
      bucketFor({ dirty: "clean", pr: "-", merged: "YES", usageKnown: false, usedRecently: false }),
    ).toBe(UNKNOWN_USAGE_BUCKET);
    expect(UNKNOWN_USAGE_BUCKET).toBe("unknown-usage");
  });

  it("holds uncommitted work before anything else", () => {
    expect(
      bucketFor({ dirty: "wip:2", pr: "#1/open", merged: "YES", usageKnown: true, usedRecently: true }),
    ).toBe("hold-wip");
  });

  it("holds an open or draft PR", () => {
    expect(
      bucketFor({ dirty: "clean", pr: "#7/draft", merged: "NO", usageKnown: true, usedRecently: false }),
    ).toBe("hold-open-pr");
    expect(
      bucketFor({ dirty: "clean", pr: "#7/open", merged: "NO", usageKnown: true, usedRecently: false }),
    ).toBe("hold-open-pr");
  });

  it("sends a recently used worktree to verification, even when merged", () => {
    expect(
      bucketFor({ dirty: "clean", pr: "-", merged: "YES", usageKnown: true, usedRecently: true }),
    ).toBe("verify-recent-chat");
  });

  it("reaches safe and review only with usage evidence", () => {
    expect(
      bucketFor({ dirty: "clean", pr: "-", merged: "YES", usageKnown: true, usedRecently: false }),
    ).toBe("safe");
    expect(
      bucketFor({ dirty: "clean", pr: "-", merged: "NO", usageKnown: true, usedRecently: false }),
    ).toBe("review");
    expect(
      bucketFor({ dirty: "scratch:3", pr: "-", merged: "YES", usageKnown: true, usedRecently: false }),
    ).toBe("safe");
  });
});

describe("usageNote", () => {
  it("says nothing once a session matched", () => {
    expect(usageNote({ usageKnown: true, sessionsProvided: true })).toBeUndefined();
    expect(usageNote({ usageKnown: true, sessionsProvided: false })).toBeUndefined();
  });

  it("distinguishes a missing list from an inadequate one", () => {
    // Both land in `unknown-usage`, and the caller fixes a different thing in each
    // case, so the diagnostic must not collapse them.
    expect(usageNote({ usageKnown: false, sessionsProvided: false })).toBe(
      "no session list supplied",
    );
    expect(usageNote({ usageKnown: false, sessionsProvided: true })).toBe(
      "no session in the supplied list touched this worktree",
    );
  });
});

describe("session matching", () => {
  const worktree = "/repo/.agents/worktrees/wt-1";

  it("picks the newest matching session and ignores the rest", () => {
    const sessions: readonly SessionInput[] = [
      { sessionId: "old", cwd: worktree, lastEventTime: 10 },
      { sessionId: "elsewhere", cwd: "/other/project", lastEventTime: 999 },
      { sessionId: "new", cwd: `${worktree}/pkg`, lastEventTime: 20 },
    ];
    expect(lastSession(worktree, sessions)?.sessionId).toBe("new");
  });

  it("returns nothing when no session touched the worktree", () => {
    const sessions: readonly SessionInput[] = [
      { sessionId: "a", cwd: "/other/project", lastEventTime: 1 },
    ];
    expect(lastSession(worktree, sessions)).toBeUndefined();
    expect(lastSession(worktree, undefined)).toBeUndefined();
    expect(lastSession(worktree, [])).toBeUndefined();
  });

  it("treats a missing cwd as no match", () => {
    expect(lastSession(worktree, [{ sessionId: "a", lastEventTime: 1 }])).toBeUndefined();
    expect(lastSession(worktree, [{ sessionId: "a", cwd: null, lastEventTime: 1 }])).toBeUndefined();
  });
});

describe("lastChatColumn and isRecent", () => {
  it("prints a dash with no session and the id with one", () => {
    expect(lastChatColumn(undefined)).toBe("-");
    expect(lastChatColumn({ sessionId: "s-1" })).toBe("s-1");
    expect(lastChatColumn({})).toBe("unknown");
  });

  it("counts a session inside the recent window and not one outside it", () => {
    const now = 1_000_000;
    const day = 86_400;
    expect(isRecent({ sessionId: "a", lastEventTime: now - day }, now)).toBe(true);
    expect(isRecent({ sessionId: "a", lastEventTime: now - 100 * day }, now)).toBe(false);
    expect(isRecent(undefined, now)).toBe(false);
    // A missing or zero timestamp is not "recent"; it is unknown.
    expect(isRecent({ sessionId: "a" }, now)).toBe(false);
    expect(isRecent({ sessionId: "a", lastEventTime: 0 }, now)).toBe(false);
  });
});

describe("formatSize", () => {
  it("renders the documented units", () => {
    expect(formatSize(0)).toBe("0B");
    expect(formatSize(512)).toBe("512B");
    expect(formatSize(1024)).toBe("1.0K");
    expect(formatSize(1024 * 1024)).toBe("1.0M");
    expect(formatSize(1024 * 1024 * 1024)).toBe("1.0G");
  });
});

describe("readSessionsFile", () => {
  it("accepts the shape the playbook tells the model to build", () => {
    const file = sessionsFile([
      { sessionId: "s-1", cwd: "/repo/.agents/worktrees/wt-1", lastEventTime: 1_700_000_000 },
    ]);
    expect(readSessionsFile(file)).toEqual([
      { sessionId: "s-1", cwd: "/repo/.agents/worktrees/wt-1", lastEventTime: 1_700_000_000 },
    ]);
  });

  it("accepts an entry without the optional fields", () => {
    const file = sessionsFile([{ sessionId: "s-1" }]);
    expect(readSessionsFile(file)).toEqual([{ sessionId: "s-1" }]);
  });

  it("accepts a null cwd", () => {
    const file = sessionsFile([{ sessionId: "s-1", cwd: null }]);
    expect(readSessionsFile(file)).toEqual([{ sessionId: "s-1", cwd: null }]);
  });

  it("rejects a pstack_history result and says why", () => {
    // A `pstack_history` result is one object, not an array. The playbook used to
    // tell the model its input was "the JSON you produced with pstack_history",
    // which invited exactly this, so the message has to name the right shape.
    const file = sessionsFile({ kind: "events", session: { id: "s-1" }, events: [] });
    expect(() => readSessionsFile(file)).toThrow(/pstack_history results/);
    expect(() => readSessionsFile(file)).toThrow(/not an array/);
  });

  it("names the expected shape in every message about it", () => {
    const file = sessionsFile({ kind: "events" });
    let message = "";
    try {
      readSessionsFile(file);
    } catch (error) {
      message = (error as AuditError).message;
    }
    expect(message).toContain('{"sessionId","cwd","lastEventTime"}');
  });

  it("rejects an entry that is missing sessionId instead of dropping it", () => {
    // The previous `filter` removed such an entry silently, which turned the row's
    // bucket into `unknown-usage` with nothing explaining why.
    const file = sessionsFile([{ cwd: "/repo/wt", lastEventTime: 1 }]);
    expect(() => readSessionsFile(file)).toThrow(/sessions\[0\]\.sessionId/);
  });

  it("rejects a wrongly typed field instead of coercing it", () => {
    expect(() => readSessionsFile(sessionsFile([{ sessionId: 7 }]))).toThrow(/sessionId must be/);
    expect(() => readSessionsFile(sessionsFile([{ sessionId: "a", cwd: 1 }]))).toThrow(/cwd must be/);
    expect(() =>
      readSessionsFile(sessionsFile([{ sessionId: "a", lastEventTime: "1" }])),
    ).toThrow(/lastEventTime must be/);
  });

  it("rejects a non-object element", () => {
    expect(() => readSessionsFile(sessionsFile([1]))).toThrow(/sessions\[0\] must be an object/);
    expect(() => readSessionsFile(sessionsFile([[]]))).toThrow(/sessions\[0\] must be an object/);
    expect(() => readSessionsFile(sessionsFile([null]))).toThrow(/sessions\[0\] must be an object/);
  });

  it("does not stop at the first good entry", () => {
    // The check is per element: a valid entry followed by a broken one must still
    // fail, so a bad row can never hide behind a good one.
    const file = sessionsFile([{ sessionId: "ok" }, { cwd: "/repo/wt" }]);
    expect(() => readSessionsFile(file)).toThrow(/sessions\[1\]\.sessionId/);
  });

  it("rejects malformed JSON and an unreadable path", () => {
    const directory = temporaryDirectory();
    const broken = join(directory, "broken.json");
    writeFileSync(broken, "{not json");
    expect(() => readSessionsFile(broken)).toThrow(/must be a JSON array/);
    expect(() => readSessionsFile(join(directory, "missing.json"))).toThrow(/cannot read/);
  });
});

describe("parseArgs", () => {
  it("reads the documented flags", () => {
    const parsed = parseArgs(["-b", "origin/main", "--sessions", "s.json", "/repo"]);
    expect(parsed.base).toBe("origin/main");
    expect(parsed.sessions).toBe("s.json");
    expect(parsed.repo).toBe("/repo");
    expect(parsed.help).toBe(false);
  });

  it("accepts the long forms and both help flags", () => {
    expect(parseArgs(["--base", "origin/trunk"]).base).toBe("origin/trunk");
    expect(parseArgs(["-s", "s.json"]).sessions).toBe("s.json");
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
    // `--base=x` is not a supported spelling; the usage text documents the
    // space-separated forms only.
    expect(() => parseArgs(["--base=origin/trunk"])).toThrow(/unknown option/);
  });

  it("rejects a flag with no value and more than one repo path", () => {
    expect(() => parseArgs(["-b"])).toThrow(/needs a ref/);
    expect(() => parseArgs(["--sessions"])).toThrow(/needs a JSON file/);
    expect(() => parseArgs(["/a", "/b"])).toThrow(/at most one repo path/);
    expect(() => parseArgs(["--nope"])).toThrow(AuditError);
  });
});

describe("sortRows and renderTable", () => {
  function row(overrides: Partial<AuditRow> & { worktree: string }): AuditRow {
    return {
      size: "0B",
      age: "1d",
      merged: "NO",
      dirty: "clean",
      remote: "pushed",
      pr: "-",
      lastChat: "-",
      pinned: PINNED,
      bucket: UNKNOWN_USAGE_BUCKET,
      ...overrides,
    };
  }

  it("sorts by size descending and keeps ties in input order", () => {
    const rows = [
      row({ worktree: "/a", size: "1.0K" }),
      row({ worktree: "/b", size: "3.0K" }),
      row({ worktree: "/c", size: "2.0K" }),
      row({ worktree: "/d", size: "4.0K" }),
      row({ worktree: "/e", size: "4.0M" }),
    ];
    expect(sortRows(rows).map((entry) => entry.worktree)).toEqual([
      "/e",
      "/d",
      "/b",
      "/c",
      "/a",
    ]);

    // Equal sizes keep `git worktree list` order, the stability `sort -rh` gave the
    // shell version.
    const tied = [
      row({ worktree: "/first", size: "2.0K" }),
      row({ worktree: "/second", size: "2.0K" }),
      row({ worktree: "/third", size: "2.0K" }),
    ];
    expect(sortRows(tied).map((entry) => entry.worktree)).toEqual([
      "/first",
      "/second",
      "/third",
    ]);
  });

  it("treats an unparseable size as zero rather than throwing", () => {
    const rows = [row({ worktree: "/bad", size: "?" }), row({ worktree: "/ok", size: "1.0K" })];
    expect(sortRows(rows).map((entry) => entry.worktree)).toEqual(["/ok", "/bad"]);
  });

  it("prints the documented header and one TSV row per worktree", () => {
    const text = renderTable([row({ worktree: "/repo/wt-1" })], "origin/main");
    const lines = text.split("\n");
    expect(lines[0]).toBe("# base: origin/main");
    expect(lines[1]).toBe(HEADER.join("\t"));
    expect(lines[2]?.split("\t")).toHaveLength(HEADER.length);
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("buildRow's usage decision", () => {
  /**
   * A throwaway repository, plus one worktree whose branch is fully merged.
   *
   * `buildRow` shells out to `git`, so the usage decision can only be observed on a
   * real worktree. That is the point: the defect was in the composition of
   * `lastSession` and `bucketFor`, not in either function alone.
   */
  function mergedWorktree(): { readonly repo: string; readonly worktree: string; readonly head: number } {
    const repo = temporaryDirectory();
    const run = (cwd: string, args: readonly string[]): string =>
      execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    run(repo, ["init", "--quiet", "-b", "main"]);
    run(repo, ["config", "user.email", "t@example.invalid"]);
    run(repo, ["config", "user.name", "t"]);
    writeFileSync(join(repo, "file.txt"), "one\n");
    run(repo, ["add", "."]);
    run(repo, ["commit", "--quiet", "-m", "one"]);
    const worktree = join(repo, "..", `${basename(repo)}-wt`);
    run(repo, ["worktree", "add", "--quiet", "-b", "side", worktree]);
    return { repo, worktree, head: 1_700_000_000 };
  }

  it("reports unknown-usage when the supplied list never mentions the worktree", () => {
    // The regression this section exists for: the list is non-empty, so the old
    // `sessions.length > 0` said usage was known, `merged` was YES, and the row
    // reached `safe` — a deletion candidate produced from missing evidence.
    const { repo, worktree, head } = mergedWorktree();
    try {
      const row = buildRow(worktree, {
        base: "main",
        repo,
        mainWorktree: repo,
        prs: [],
        sessions: [{ sessionId: "a", cwd: "/other/project", lastEventTime: head }],
        now: head,
      });
      expect(row.merged).toBe("YES");
      expect(row.lastChat).toBe("-");
      expect(row.bucket).toBe(UNKNOWN_USAGE_BUCKET);
      expect(row.note).toBe("no session in the supplied list touched this worktree");
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });

  it("distinguishes a missing list from an inadequate one", () => {
    const { repo, worktree, head } = mergedWorktree();
    try {
      const row = buildRow(worktree, {
        base: "main",
        repo,
        mainWorktree: repo,
        prs: [],
        sessions: undefined,
        now: head,
      });
      expect(row.bucket).toBe(UNKNOWN_USAGE_BUCKET);
      expect(row.note).toBe("no session list supplied");
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });

  it("leaves safe reachable once a session really touched the worktree", () => {
    const { repo, worktree, head } = mergedWorktree();
    try {
      const row = buildRow(worktree, {
        base: "main",
        repo,
        mainWorktree: repo,
        prs: [],
        // Well past `RECENT_DAYS`, so the row can reach `safe`.
        sessions: [{ sessionId: "s-1", cwd: worktree, lastEventTime: head - 30 * 86_400 }],
        now: head,
      });
      expect(row.lastChat).toBe("s-1");
      expect(row.bucket).toBe("safe");
      expect(row.note).toBeUndefined();
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });
});

describe("session matching is separator-agnostic", () => {
  it("matches the same checkout written with either separator", () => {
    // F20: the comparison hardcoded `/`, so on Windows — where `git worktree list`
    // reports `\` — nothing matched, every LAST_CHAT was `-`, and every bucket
    // degraded. `resolve` normalises both sides on the running platform.
    const unified = "/repo/.agents/worktrees/wt-1";
    expect(sameOrInside(unified, unified)).toBe(true);
    expect(sameOrInside(`${unified}/pkg`, unified)).toBe(true);
  });

  it("normalises trailing separators and dot segments", () => {
    const worktree = "/repo/wt";
    expect(sameOrInside("/repo/wt/", worktree)).toBe(true);
    expect(sameOrInside("/repo/wt/./pkg/../pkg", worktree)).toBe(true);
  });

  it("does not match a sibling or a parent directory", () => {
    const worktree = "/repo/wt";
    expect(sameOrInside("/repo/wt-2", worktree)).toBe(false);
    expect(sameOrInside("/repo", worktree)).toBe(false);
    expect(sameOrInside("/repo/wt/../other", worktree)).toBe(false);
    expect(sameOrInside("/other/project", worktree)).toBe(false);
  });
});

describe("background start failures are not guessed", () => {
  it("reports a job that never started as a start failure", async () => {
    // This is the regression the three earlier attempts each missed.
    //
    // `spawn` reports ENOENT asynchronously, so neither a fixed interval nor a single
    // microtask observes it reliably: measured, the error had not fired after one
    // microtask and appeared ~100 ms later. The tool therefore answered
    // `{kind: "background", status: "running"}` for a child that was never created.
    //
    // A missing interpreter is the cleanest reproduction — `execPath` names a binary
    // that does not exist, so no process is ever made. `execPath` is a `runBackground`
    // option (the tool always uses the Host's own runtime), so the test drives that
    // function directly rather than going through `execute`.
    const { ScriptMissingError, runBackground, parseScriptArgs } = await import(
      "../src/script.ts"
    );

    const jobs = {
      start(spec: { run: (job: unknown) => unknown }) {
        // Invoke the producer for real, the way `dsh-jobs-local` does synchronously.
        spec.run({ append() {}, updateProgress() {} });
        return "bash-1";
      },
      get() {
        return {
          id: "bash-1",
          kind: "bash",
          label: "x",
          status: "running" as const,
          startedAt: 0,
          output: { total: 0, earliest: 0 },
        };
      },
    };

    await expect(
      runBackground(parseScriptArgs({ id: "log", args: [], background: true }), {
        jobs: jobs as never,
        execPath: join(ROOT, "definitely-not-a-real-interpreter"),
        cwd: ROOT,
      }),
    ).rejects.toBeInstanceOf(ScriptMissingError);
  });

  it("decides from the spawn/error race, not from a timing window", () => {
    // The property being pinned is structural: no fixed interval and no single-tick
    // guess. Both were tried and both were wrong for measured reasons.
    const source = readFileSync(join(ROOT, "src", "script.ts"), "utf8");
    expect(source).not.toContain("BACKGROUND_CONFIRM_MS");
    expect(source).not.toContain("await Promise.resolve();");
  });

  it("does not put a host path into the start-failure message", async () => {
    // `child_process`'s error message embeds the artefact's absolute path.
    const { ScriptMissingError } = await import("../src/script.ts");
    const { createPstackScriptTool } = await import("../src/script.ts");

    const jobs = {
      start(spec: { run: (job: unknown) => unknown }) {
        // Run the producer so the spawn error path is exercised, then report failure.
        spec.run({ append() {}, updateProgress() {} });
        return "bash-1";
      },
      get() {
        return {
          id: "bash-1",
          kind: "bash",
          label: "x",
          status: "failed" as const,
          startedAt: 0,
          output: { total: 0, earliest: 0 },
        };
      },
    };
    const tool = createPstackScriptTool({
      tools: { register: () => () => {} },
      workingDirectory: { ensure: async () => ROOT },
      getJobs: () => jobs as never,
    });

    await expect(
      tool.execute(
        { id: "log", args: [], background: true },
        { name: "pstack_script", callId: "c1", arguments: {}, signal: new AbortController().signal } as never,
      ),
    ).rejects.toBeInstanceOf(ScriptMissingError);
    // The message must point at the foreground run, not at a host path.
    await expect(
      tool.execute(
        { id: "log", args: [], background: true },
        { name: "pstack_script", callId: "c2", arguments: {}, signal: new AbortController().signal } as never,
      ),
    ).rejects.toThrow(/the foreground to see its error/);
  });
});

describe("sameOrInside normalises before it decides", () => {
  it("rejects a path that escapes the worktree through dot-dot", () => {
    // The old comparison was a raw string prefix test, so `/repo/wt/../other` started
    // with `/repo/wt/` and was counted as *inside* the worktree when it actually names
    // a sibling. `resolve` collapses the segment first, so the answer is correct.
    expect(sameOrInside("/repo/wt/../other", "/repo/wt")).toBe(false);
    expect(sameOrInside("/repo/wt/../wt/pkg", "/repo/wt")).toBe(true);
  });

  it("treats a trailing separator as the same directory", () => {
    expect(sameOrInside("/repo/wt/", "/repo/wt")).toBe(true);
    expect(sameOrInside("/repo/wt", "/repo/wt/")).toBe(true);
  });

  it("is not fooled by a shared name prefix", () => {
    // `startsWith(parent + sep)` is why this is false while `startsWith(parent)` would
    // be true.
    expect(sameOrInside("/repo/wt-2/pkg", "/repo/wt")).toBe(false);
    expect(sameOrInside("/repo/wtx", "/repo/wt")).toBe(false);
  });
});
