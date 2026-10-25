import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ROOT } from "../scripts/build-assets.ts";

/**
 * The shipped `log` CLI.
 *
 * This file used to drive a bash script through `spawnSync("bash", …)`. The script
 * is a Node artifact now, so the same behaviours are asserted by running that
 * artifact with the current interpreter: no `bash`, no `date`, no `tr`.
 *
 * The expectations are byte-for-byte the shell script's, because
 * `skills/show-me-your-work/SKILL.md` tells the model to open this TSV in a
 * spreadsheet, and a changed row shape would silently corrupt that artifact.
 */
const script = join(ROOT, "assets", "skills", "show-me-your-work", "scripts", "log.mjs");
const temporaryDirectories: string[] = [];

const HEADER = "ts\tphase\tdecision\twhy\tevidence\tresult\n";

function withLog(run: (logfile: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "dsh-pstack-log-"));
  temporaryDirectories.push(directory);
  run(join(directory, "nested", "decisions.tsv"));
}

/** Append one row, the way the skill tells the model to. */
function append(logfile: string, cells: readonly string[]) {
  return spawnSync(process.execPath, [script, logfile, ...cells], { encoding: "utf8" });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("show-me-your-work log CLI", () => {
  it("writes one header and appends complete six-cell rows without replacing earlier rows", () => {
    withLog((logfile) => {
      for (const phase of ["first", "second"]) {
        const result = append(logfile, [phase, "decision", "why", "artifact.txt", "kept"]);
        expect(result.status).toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe("");
      }

      const text = readFileSync(logfile, "utf8");
      expect(text.startsWith(HEADER)).toBe(true);
      expect(text.endsWith("\n")).toBe(true);
      const lines = text.trimEnd().split("\n");
      expect(lines).toHaveLength(3);
      expect(lines.filter((line) => line.startsWith("ts\t"))).toHaveLength(1);
      expect(lines[1]?.split("\t").slice(1)).toEqual([
        "first",
        "decision",
        "why",
        "artifact.txt",
        "kept",
      ]);
      expect(lines[2]?.split("\t").slice(1)).toEqual([
        "second",
        "decision",
        "why",
        "artifact.txt",
        "kept",
      ]);
      for (const line of lines.slice(1)) expect(line.split("\t")).toHaveLength(6);
      expect(lines[1]?.split("\t")[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  });

  it("replaces embedded tabs, CR, and LF with spaces so every value stays in one cell", () => {
    withLog((logfile) => {
      const result = append(logfile, [
        "phase\twith tab",
        "first line\nsecond line",
        "why\rwith CR",
        "mixed\t\r\ncell",
        "safe",
      ]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const lines = readFileSync(logfile, "utf8").trimEnd().split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[1]?.split("\t").slice(1)).toEqual([
        "phase with tab",
        "first line second line",
        "why with CR",
        "mixed   cell",
        "safe",
      ]);
    });
  });

  it("prefixes all four formula-leading characters and leaves ordinary cells untouched", () => {
    withLog((logfile) => {
      const result = append(logfile, ["=1+1", "+SUM(A1:A2)", "-2+3", "@command", "plain"]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const cells = readFileSync(logfile, "utf8").trimEnd().split("\n")[1]?.split("\t").slice(1);
      expect(cells).toEqual(["'=1+1", "'+SUM(A1:A2)", "'-2+3", "'@command", "plain"]);
    });
  });

  it("uses the exit code and usage line the shell script used for a wrong cell count", () => {
    withLog((logfile) => {
      const result = append(logfile, ["only-two", "cells"]);
      expect(result.status).toBe(1);
      expect(result.stderr.startsWith("usage: log.mjs ")).toBe(true);
      expect(result.stderr).toContain("<logfile>");
    });
  });

  it("creates a missing parent directory instead of failing", () => {
    withLog((logfile) => {
      const result = append(logfile, ["p", "d", "w", "e", "r"]);
      expect(result.status).toBe(0);
      expect(readFileSync(logfile, "utf8").startsWith(HEADER)).toBe(true);
    });
  });

  it("appends to an existing log without adding a second header", () => {
    withLog((logfile) => {
      append(logfile, ["one", "d", "w", "e", "r"]);
      append(logfile, ["two", "d", "w", "e", "r"]);
      const text = readFileSync(logfile, "utf8");
      expect(text.split(HEADER).length - 1).toBe(1);
      expect(text.trimEnd().split("\n")).toHaveLength(3);
    });
  });
});
