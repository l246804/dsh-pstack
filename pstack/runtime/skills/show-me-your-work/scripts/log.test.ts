import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { appendDecisionRow, cleanCell, HEADER, main, timestamp } from "./log.ts";
import { expect } from "../../poteto-mode/scripts/support.ts";

test("writes the header once and appends a clean row", () => {
  const directory = mkdtempSync(join(tmpdir(), "pstack-log-"));
  const file = join(directory, "nested", "decisions.tsv");
  try {
    appendDecisionRow(file, ["build", "=cmd", "why\there", "ev\nidence", "@result"], new Date("2026-10-28T10:00:00.123Z"));
    appendDecisionRow(file, ["build", "second", "why", "evidence", "result"], new Date("2026-10-28T10:00:01Z"));
    const lines = readFileSync(file, "utf8").split("\n");
    expect(lines[0]).toBe(HEADER.trimEnd());
    expect(lines[1]).toBe("2026-10-28T10:00:00Z\tbuild\t'=cmd\twhy here\tev idence\t'@result");
    expect(lines[2]).toBe("2026-10-28T10:00:01Z\tbuild\tsecond\twhy\tevidence\tresult");
    expect(lines.filter((line) => line === HEADER.trimEnd())).toHaveLength(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cleans spreadsheet-sensitive cells and stamps UTC", () => {
  expect(cleanCell("=SUM(A1)")).toBe("'=SUM(A1)");
  expect(cleanCell("+1")).toBe("'+1");
  expect(cleanCell("-1")).toBe("'-1");
  expect(cleanCell("@x")).toBe("'@x");
  expect(cleanCell("plain")).toBe("plain");
  expect(timestamp(new Date("2026-10-28T10:00:00.999Z"))).toBe("2026-10-28T10:00:00Z");
});

test("usage errors exit 1", () => {
  const errors: string[] = [];
  const code = main([], { stdout: () => {}, stderr: (value) => errors.push(value) });
  expect(code).toBe(1);
  expect(errors.join("")).toContain("usage: log.mjs");
});
