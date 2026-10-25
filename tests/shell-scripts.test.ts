import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ROOT } from "../scripts/build-assets.ts";

const script = join(ROOT, "assets", "skills", "show-me-your-work", "scripts", "log.sh");
const temporaryDirectories: string[] = [];

function withLog(run: (logfile: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "dsh-pstack-log-"));
  temporaryDirectories.push(directory);
  run(join(directory, "nested", "decisions.tsv"));
}

function append(logfile: string, cells: readonly string[]) {
  return spawnSync("bash", [script, logfile, ...cells], { encoding: "utf8" });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("show-me-your-work log.sh", () => {
  it("writes one header and appends complete six-cell rows without replacing earlier rows", () => {
    withLog((logfile) => {
      for (const phase of ["first", "second"]) {
        const result = append(logfile, [phase, "decision", "why", "artifact.txt", "kept"]);
        expect(result.status).toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe("");
      }

      const text = readFileSync(logfile, "utf8");
      expect(text.startsWith("ts\tphase\tdecision\twhy\tevidence\tresult\n")).toBe(true);
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
      expect(cells).toEqual([
        "'=1+1",
        "'+SUM(A1:A2)",
        "'-2+3",
        "'@command",
        "plain",
      ]);
    });
  });
});
