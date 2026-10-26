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

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  AuditError,
  HEADER,
  PINNED,
  UNKNOWN_USAGE_BUCKET,
  bucketFor,
  formatSize,
  isRecent,
  lastChatColumn,
  lastSession,
  parseArgs,
  readSessionsFile,
  renderTable,
  sortRows,
} from "../scripts/runtime/worktree-audit.ts";
import type { AuditRow, SessionInput } from "../scripts/runtime/worktree-audit.ts";

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
