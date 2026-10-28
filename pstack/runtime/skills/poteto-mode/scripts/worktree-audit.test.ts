import { test } from "node:test";

import { ageColumn, bucketFor, dirtyColumn, formatSize, mergedColumn, prColumn, remoteColumn, renderTable, sortRows, type AuditRow } from "./worktree-audit.ts";
import { expect } from "./support.ts";

const now = Date.UTC(2026, 9, 28, 12, 0, 0) / 1000;

test("renders the documented worktree columns", () => {
  const rows: AuditRow[] = [
    {
      size: "2.0G",
      age: "1d",
      merged: "YES",
      dirty: "clean",
      remote: "pushed",
      pr: "#12/OPEN",
      lastChat: "2026-10-28T10:00:00Z",
      pinned: "unknown",
      bucket: "hold-open-pr",
      worktree: "/repo/wt-a",
    },
    {
      size: "10.0M",
      age: "10d",
      merged: "NO",
      dirty: "wip:2",
      remote: "ahead1",
      pr: "-",
      lastChat: "-",
      pinned: "unknown",
      bucket: "hold-wip",
      worktree: "/repo/wt-b",
    },
  ];
  const table = renderTable(sortRows(rows), "origin/main");
  expect(table.split("\n")[0]).toBe("# base: origin/main");
  expect(table).toContain("SIZE\tAGE\tMERGED\tDIRTY\tREMOTE\tPR\tLAST_CHAT\tPINNED\tBUCKET\tWORKTREE");
  expect(table).toContain("/repo/wt-a");
  expect(table).toContain("/repo/wt-b");
});

test("classifies the individual columns", () => {
  expect(formatSize(2 * 1024 ** 3)).toBe("2.0G");
  expect(ageColumn(now - 86400, now)).toBe("1d");
  expect(dirtyColumn("")).toBe("clean");
  expect(dirtyColumn(" M a\n?? b\n")).toBe("wip:1");
  expect(dirtyColumn("?? b\n")).toBe("scratch:1");
  expect(mergedColumn(true)).toBe("YES");
  expect(mergedColumn(false)).toBe("no");
  expect(remoteColumn({ branch: "feature/x", hasRemote: true, remoteSha: "abc", head: "abc", aheadCount: 0 })).toBe("pushed");
  expect(remoteColumn({ branch: "feature/x", hasRemote: true, remoteSha: "abc", head: "def", aheadCount: 2 })).toBe("ahead2");
  expect(remoteColumn({ branch: "feature/x", hasRemote: false, remoteSha: undefined, head: "def", aheadCount: 2 })).toBe("no-remote");
  expect(remoteColumn({ branch: undefined, hasRemote: true, remoteSha: "abc", head: "abc", aheadCount: 0 })).toBe("detached");
  expect(prColumn("feature/x", [{ number: 12, head: "feature/x", state: "OPEN" }])).toBe("#12/OPEN");
});

test("never marks an unknown usage signal safe", () => {
  expect(
    bucketFor({
      merged: "YES",
      dirty: "clean",
      pr: "-",
      usageKnown: false,
      usedRecently: false,
    }),
  ).toBe("unknown-usage");
  expect(
    bucketFor({
      merged: "YES",
      dirty: "clean",
      pr: "-",
      usageKnown: true,
      usedRecently: true,
    }),
  ).toBe("verify-recent-chat");
});
