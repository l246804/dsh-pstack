import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ROOT } from "../scripts/build-assets.ts";
import { parseBunTestSummary } from "../scripts/check-scripts.ts";

const entryPoint = join(ROOT, "scripts", "check-scripts.ts");
const sourceScripts = join(ROOT, "assets", "skills", "poteto-mode", "scripts");
const fixtures: string[] = [];

interface Fixture {
  readonly root: string;
  readonly log: string;
  readonly bashLog: string;
  readonly environment: NodeJS.ProcessEnv;
}

interface Invocation {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "dsh-pstack-check-scripts-test-"));
  fixtures.push(root);
  const bin = join(root, "bin");
  const log = join(root, "invocations.jsonl");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "bun"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const names = ["HOME", "TMPDIR", "XDG_CACHE_HOME", "BUN_INSTALL", "BUN_TMPDIR", "BUN_INSTALL_CACHE_DIR"];
const environment = Object.fromEntries(names.map((name) => [name, process.env[name]]));
fs.appendFileSync(process.env.CHECK_SCRIPTS_TEST_LOG, JSON.stringify({ args, cwd: process.cwd(), environment }) + "\\n");
if (args[0] === "--version") console.log("fake-bun-version");
if (args[0] === "install") {
  if (args[1] !== "--frozen-lockfile") process.exit(8);
  const commander = path.join(process.cwd(), "node_modules", "commander");
  fs.mkdirSync(commander, { recursive: true });
  fs.writeFileSync(path.join(commander, "package.json"), "{}\\n");
}
if (args[0] === "test") {
  if (!fs.existsSync(path.join(process.cwd(), "node_modules", "commander", "package.json"))) {
    console.error("test ran before install");
    process.exit(9);
  }
  const failed = process.env.CHECK_SCRIPTS_TEST_FAIL === "test";
  console.log("1 tests failed:");
  console.log(\` \${failed ? 67 : 68} pass\`);
  console.log(\` \${failed ? 1 : 0} fail\`);
  console.log(" 0 skip");
  console.log(" 0 todo");
  console.log("Ran 68 tests across 5 files. [10.00ms]");
}
if (process.env.CHECK_SCRIPTS_TEST_FAIL === args[0] && process.env.CHECK_SCRIPTS_TEST_STATUS !== "0") process.exit(7);
`,
    { mode: 0o755 },
  );
  const bashLog = join(root, "bash-invocations.jsonl");
  writeFileSync(
    join(bin, "bash"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const child = require("node:child_process");
fs.appendFileSync(process.env.CHECK_SCRIPTS_TEST_BASH_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), tmpdir: process.env.TMPDIR }) + "\\n");
const result = child.spawnSync("/usr/bin/bash", process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);
`,
    { mode: 0o755 },
  );
  return {
    root,
    log,
    bashLog,
    environment: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      TMPDIR: root,
      CHECK_SCRIPTS_TEST_LOG: log,
      CHECK_SCRIPTS_TEST_BASH_LOG: bashLog,
    },
  };
}

function run(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [entryPoint], {
    env: environment,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function invocations(log: string): Invocation[] {
  return readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Invocation);
}

function temporaryRoot(stdout: string): string {
  const root = /^\[check-scripts\] temporary root: (.+)$/m.exec(stdout)?.[1];
  expect(root).toBeDefined();
  return root as string;
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("check-scripts", () => {
  it("parses Bun counts and rejects an inconsistent suite", () => {
    expect(parseBunTestSummary(" 68 pass\n 0 fail\nRan 68 tests across 5 files.")).toEqual({
      tests: 68,
      files: 5,
      passed: 68,
      failed: 0,
      skipped: 0,
      todo: 0,
    });
    expect(parseBunTestSummary(" 59 pass\nRan 60 tests across 5 files.")).toBeNull();
    expect(parseBunTestSummary("No tests found")).toBeNull();
  });

  it("installs before testing in one isolated copy and cleans it up", () => {
    const controlled = fixture();
    const result = run(controlled.environment);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[check-scripts] Bun version: fake-bun-version");
    expect(result.stdout).toContain(
      "[check-scripts] test count: 68 tests across 5 files; 68 pass, 0 fail, 0 skip, 0 todo",
    );

    const commands = invocations(controlled.log);
    expect(commands.map((command) => command.args)).toEqual([
      ["--version"],
      ["install", "--frozen-lockfile"],
      ["test", "orch", "watch-pr", "check-plan.test.ts"],
      ["run", "typecheck"],
    ]);

    const root = temporaryRoot(result.stdout);
    const bashCommands = invocations(controlled.bashLog);
    expect(bashCommands).toEqual([
      {
        args: ["-n", join(sourceScripts, "worktree-audit.sh")],
        cwd: join(root, "scripts"),
        tmpdir: join(root, "tmp"),
      },
    ]);
    expect(result.stdout).toContain(
      `[check-scripts] bash -n assets/skills/poteto-mode/scripts/worktree-audit.sh: exit code 0`,
    );
    expect(root.startsWith(`${controlled.root}/`)).toBe(true);
    for (const command of commands) {
      expect(command.cwd).toBe(join(root, "scripts"));
      expect(command.environment).toEqual({
        HOME: join(root, "home"),
        TMPDIR: join(root, "tmp"),
        XDG_CACHE_HOME: join(root, "cache"),
        BUN_INSTALL: join(root, "bun"),
        BUN_TMPDIR: join(root, "bun", "tmp"),
        BUN_INSTALL_CACHE_DIR: join(root, "bun", "cache"),
      });
    }
    expect(existsSync(root)).toBe(false);
    expect(result.stdout).toContain(`[check-scripts] cleanup: removed ${root}`);
    expect(existsSync(join(sourceScripts, "node_modules"))).toBe(false);
  });

  it("returns nonzero on a command failure and still cleans the copy", () => {
    const controlled = fixture();
    const result = run({ ...controlled.environment, CHECK_SCRIPTS_TEST_FAIL: "install" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("bun install --frozen-lockfile: exit code 7");
    const root = temporaryRoot(result.stdout);
    expect(existsSync(root)).toBe(false);
    expect(result.stdout).toContain(`[check-scripts] cleanup: removed ${root}`);
    expect(invocations(controlled.log).map((command) => command.args)).toEqual([
      ["--version"],
      ["install", "--frozen-lockfile"],
    ]);
    expect(existsSync(join(sourceScripts, "node_modules"))).toBe(false);
    expect(existsSync(controlled.bashLog)).toBe(false);
  });

  for (const testStatus of [7, 0] as const) {
    it(`rejects failed tests with child status ${testStatus} and cleans up without later commands`, () => {
      const controlled = fixture();
      const result = run({
        ...controlled.environment,
        CHECK_SCRIPTS_TEST_FAIL: "test",
        CHECK_SCRIPTS_TEST_STATUS: String(testStatus),
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        `bun test orch watch-pr check-plan.test.ts: exit code ${testStatus}`,
      );
      expect(result.stdout).toContain(
        "test count: 68 tests across 5 files; 67 pass, 1 fail, 0 skip, 0 todo",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain("[check-scripts] 1 test(s) failed");

      const root = temporaryRoot(result.stdout);
      expect(existsSync(root)).toBe(false);
      expect(result.stdout).toContain(`[check-scripts] cleanup: removed ${root}`);
      expect(invocations(controlled.log).map((command) => command.args)).toEqual([
        ["--version"],
        ["install", "--frozen-lockfile"],
        ["test", "orch", "watch-pr", "check-plan.test.ts"],
      ]);
      expect(existsSync(controlled.bashLog)).toBe(false);
      expect(existsSync(join(sourceScripts, "node_modules"))).toBe(false);
    });
  }
});
