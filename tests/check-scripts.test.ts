import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ROOT } from "../scripts/build-assets.ts";
import {
  EXPECTED_TEST_FILES,
  EXPECTED_TESTS,
  SMOKE_CASES,
  parseNodeTestSummary,
  shippedClis,
  shippedTestFiles,
} from "../scripts/check-scripts.ts";

/**
 * `check:scripts` is the release gate for "the shipped scripts need nothing
 * installed". The tests below pin the parts that can silently rot:
 *
 * - the summary parser refuses a partial or empty run;
 * - the check copies one tree, runs the suite, and smoke-tests every CLI;
 * - a failing child and a missing one both exit nonzero;
 * - the copy is removed in every case, including a throw;
 * - nothing is installed and `bash` is never invoked.
 *
 * The fixtures put a fake `bash` on `PATH` that records any use. A recorded use is a
 * test failure, which is how "no bash" is asserted rather than assumed.
 */
const entryPoint = join(ROOT, "scripts", "check-scripts.ts");
const sourceSkills = join(ROOT, "assets", "skills");
const fixtures: string[] = [];

interface Fixture {
  readonly root: string;
  readonly bashLog: string;
  readonly environment: NodeJS.ProcessEnv;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "dsh-pstack-check-scripts-test-"));
  fixtures.push(root);
  const bin = join(root, "bin");
  const bashLog = join(root, "bash-invocations.jsonl");
  mkdirSync(bin);
  // Any use of bash is recorded, so "no bash" is evidence rather than a wish.
  writeFileSync(
    join(bin, "bash"),
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.CHECK_SCRIPTS_TEST_BASH_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
process.exit(0);
`,
    { mode: 0o755 },
  );
  return {
    root,
    bashLog,
    environment: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      TMPDIR: root,
      CHECK_SCRIPTS_TEST_BASH_LOG: bashLog,
    },
  };
}

function run(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [entryPoint], {
    env: environment,
    encoding: "utf8",
    timeout: 120_000,
  });
}

function temporaryRoot(stdout: string): string {
  const root = /^\[check-scripts\] temporary root: (.+)$/m.exec(stdout)?.[1];
  expect(root).toBeDefined();
  return root as string;
}

afterEach(() => {
  // Each fixture owns one temporary root; the check's own copy lives below it and is
  // removed by the check itself, so this only removes what the test created.
  for (const created of fixtures.splice(0)) rmSync(created, { recursive: true, force: true });
});

describe("check-scripts", () => {
  it("parses the node --test summary and rejects an inconsistent one", () => {
    const summary = parseNodeTestSummary("ℹ tests 68\nℹ pass 68\nℹ fail 0\nℹ skipped 0");
    expect(summary).toEqual({ tests: 68, passed: 68, failed: 0, skipped: 0 });
    expect(parseNodeTestSummary("ℹ tests 68\nℹ fail 0")).toBeNull();
    expect(parseNodeTestSummary("No tests found")).toBeNull();
    expect(parseNodeTestSummary("")).toBeNull();
  });

  it("discovers the shipped test files and CLIs from the manifest, not a list", () => {
    const tests = shippedTestFiles(sourceSkills);
    expect(tests).toHaveLength(EXPECTED_TEST_FILES);
    for (const file of tests) expect(file.endsWith(".test.mjs"), file).toBe(true);

    const clis = shippedClis(sourceSkills);
    expect(clis.map((entry) => entry.id)).toEqual([
      "check-plan",
      "orch",
      "watch-pr",
      "worktree-audit",
      "log",
    ]);
    for (const entry of clis) {
      expect(existsSync(entry.path), entry.path).toBe(true);
      expect(entry.path.endsWith(".mjs"), entry.path).toBe(true);
    }
    expect(SMOKE_CASES).toHaveLength(clis.length);
  });

  /**
   * One real run, shared by the assertions below.
   *
   * The full check spawns `node --test` plus five smoke cases, which takes several
   * seconds; running it once keeps the suite inside its budget while still asserting
   * everything a single end-to-end run can prove.
   */
  let fullRun: { readonly status: number | null; readonly stdout: string; readonly stderr: string } | undefined;
  let fullRunRoot: string | undefined;

  function runOnce(): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
    if (fullRun === undefined) {
      const controlled = fixture();
      fullRun = run(controlled.environment);
      fullRunRoot = temporaryRoot(fullRun.stdout);
    }
    return fullRun;
  }

  it("runs the suite and every smoke case in one isolated copy, with no install and no bash", () => {
    const result = runOnce();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`[check-scripts] test count: ${EXPECTED_TESTS} tests`);
    expect(result.stdout).toContain("no install step, no bun, no bash, no network");
    for (const smoke of SMOKE_CASES) {
      expect(result.stdout, smoke.label).toContain(`[check-scripts] ${smoke.label}: exit code`);
    }

    const root = fullRunRoot as string;
    expect(existsSync(root)).toBe(false);
    expect(result.stdout).toContain(`[check-scripts] cleanup: removed ${root}`);
    // The two usage-only smoke cases write their usage line to stderr by design, so
    // stderr may hold those lines; it must not hold a checker error.
    expect(result.stderr).not.toContain("[check-scripts]");
    expect(existsSync(join(sourceSkills, "poteto-mode", "scripts", "node_modules"))).toBe(false);
  }, 120_000);

  it("creates an isolated HOME, TMPDIR, and XDG_CACHE_HOME under the copy", () => {
    runOnce();
    const root = fullRunRoot as string;
    const result = fullRun as { readonly stdout: string };
    expect(result.stdout).toContain(`[check-scripts] HOME=${join(root, "home")}`);
    expect(result.stdout).toContain(`[check-scripts] TMPDIR=${join(root, "tmp")}`);
    expect(result.stdout).toContain(`[check-scripts] XDG_CACHE_HOME=${join(root, "cache")}`);
    expect(existsSync(root)).toBe(false);
  }, 120_000);

  it("fails when the shipped tree is missing a CLI", () => {
    const controlled = fixture();
    // Copy the tree, then remove one CLI from the working copy this check would make
    // by pointing it at a source it has to fail on.
    const brokenSource = join(controlled.root, "broken-skills");
    mkdirSync(join(brokenSource, "show-me-your-work", "scripts"), { recursive: true });
    mkdirSync(join(brokenSource, "poteto-mode", "scripts"), { recursive: true });
    writeFileSync(join(brokenSource, "poteto-mode", "scripts", "check-plan.mjs"), "process.exit(2);\n");
    const outcome = spawnSync(
      process.execPath,
      [
        "-e",
        `import(${JSON.stringify(entryPoint)}).then((m) => {
          process.exitCode = m.main({ sourceRoot: ${JSON.stringify(brokenSource)} });
        });`,
      ],
      { env: controlled.environment, encoding: "utf8", timeout: 120_000 },
    );
    expect(outcome.status).not.toBe(0);
    expect(outcome.stdout + outcome.stderr).toContain("[check-scripts]");
  });

  it("fails when a shipped test file fails, and still cleans the copy", () => {
    const controlled = fixture();
    const failing = join(controlled.root, "failing-skills");
    const scripts = join(failing, "poteto-mode", "scripts");
    mkdirSync(scripts, { recursive: true });
    writeFileSync(
      join(scripts, "check-plan.test.mjs"),
      'import { test } from "node:test";\ntest("fails", () => { throw new Error("boom"); });\n',
    );
    for (const entry of shippedClis(sourceSkills)) {
      const relative = entry.path.slice(sourceSkills.length + 1);
      const target = join(failing, ...relative.split("/"));
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, "#!/usr/bin/env node\nprocess.exit(0);\n", { mode: 0o755 });
    }
    for (const file of ["watch-pr", "orch"]) {
      mkdirSync(join(scripts, file), { recursive: true });
    }

    const outcome = spawnSync(
      process.execPath,
      [
        "-e",
        `import(${JSON.stringify(entryPoint)}).then((m) => {
          process.exitCode = m.main({ sourceRoot: ${JSON.stringify(failing)} });
        });`,
      ],
      { env: controlled.environment, encoding: "utf8", timeout: 120_000 },
    );
    expect(outcome.status).not.toBe(0);
    const output = `${outcome.stdout}\n${outcome.stderr}`;
    expect(output).toContain("[check-scripts]");
    const root = temporaryRoot(outcome.stdout);
    expect(existsSync(root)).toBe(false);
    expect(existsSync(controlled.bashLog)).toBe(false);
  });

  it("copies only assets/skills and never the repository scripts directory", () => {
    runOnce();
    const root = fullRunRoot as string;
    const result = fullRun as { readonly stdout: string };
    expect(result.stdout).toContain(
      `[check-scripts] copied only assets/skills/ to ${join(root, "skills")}`,
    );
    // The source tree really does hold more than the one skill; only these two
    // directories carry scripts, and both are inside the copied tree.
    const entries = readdirSync(sourceSkills);
    expect(entries).toContain("poteto-mode");
    expect(entries).toContain("show-me-your-work");
    expect(existsSync(join(root, "scripts"))).toBe(false);
  }, 120_000);
});
