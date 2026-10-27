/**
 * `check:scripts`: prove the bundled scripts run with nothing installed.
 *
 * The shipped tree may not need Bun, `bash`, an install step, or a `node_modules`
 * directory beside it. This check is the release gate for that promise, and it is
 * deliberately narrow:
 *
 * 1. Copy `assets/skills/` to a temporary directory. Nothing writes to the committed
 *    tree, and nothing is installed: no `bun install`, no `pnpm`, no network.
 * 2. Isolate `HOME`, `TMPDIR`, and `XDG_CACHE_HOME` into that copy, so a tool that
 *    reaches for a cache or a config file reaches an empty one.
 * 3. Run every shipped `*.test.mjs` through `node --test`. A suite that silently
 *    skips is a failure, so the file and test counts are asserted against the
 *    runtime manifest.
 * 4. Smoke every shipped CLI. `--help` is not enough for `check-plan`, which has no
 *    help flag and exits 2 with a usage line, so each CLI is invoked the way its own
 *    usage line documents.
 *
 * A child that cannot start at all and a child that exits an unexpected code are both
 * failures. `finally` removes the copy.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ROOT } from "./build-assets.ts";
import { RUNTIME_CLIS, RUNTIME_TESTS } from "./runtime-manifest.ts";

/** The one asset tree copied for the check. */
export const SOURCE_RELATIVE = "pstack/skills";

/** How many shipped test files must run. */
export const EXPECTED_TEST_FILES = RUNTIME_TESTS.length;

/** How many test cases the suite must report. */
export const EXPECTED_TESTS = 68;

/**
 * One smoke command: a CLI and the arguments its usage line documents.
 *
 * `id` is the pairing key, and it must equal `RUNTIME_CLIS[].id`. Pairing by array
 * index was the defect: the two lists are maintained for different reasons
 * (`RUNTIME_CLIS` is in "the order the reviews and the prose name them"), so a
 * reordering silently pointed `orch --help` at `check-plan` and the smoke proved
 * nothing — or failed for the wrong reason.
 */
export interface SmokeCase {
  /** Matches a `RUNTIME_CLIS[].id`. */
  readonly id: string;
  readonly label: string;
  readonly args: readonly string[];
  /** Exit codes that count as a pass for this case. */
  readonly accept: readonly number[];
}

/**
 * The smoke cases, one per shipped CLI.
 *
 * `--help` is the natural invocation for four of them. `check-plan` has no help flag
 * and exits 2 with a usage line, and `log` exits 1 with one, so their cases assert
 * that documented behaviour instead of pretending a help path exists.
 */
export const SMOKE_CASES: readonly SmokeCase[] = [
  { id: "check-plan", label: "check-plan (no args: usage, exit 2)", args: [], accept: [2] },
  { id: "orch", label: "orch --help", args: ["--help"], accept: [0] },
  { id: "watch-pr", label: "watch-pr --help", args: ["--help"], accept: [0] },
  { id: "worktree-audit", label: "worktree-audit --help", args: ["--help"], accept: [0] },
  { id: "log", label: "log (no args: usage, exit 1)", args: [], accept: [1] },
];

/** What one child process produced. */
export interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

/** Options for one run, so a test can drive the same code with a fake runner. */
export interface CheckOptions {
  /** Root of the copy. Defaults to a fresh `mkdtemp`. */
  readonly temporaryRoot?: string;
  /** Run one process. Injected by tests; defaults to `spawnSync`. */
  readonly run?: (
    executable: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv,
    cwd: string,
  ) => CommandResult;
  /** Override the copy source, so a test does not need the built tree. */
  readonly sourceRoot?: string;
}

/** Node test-runner counts, parsed from its summary. */
export interface NodeTestSummary {
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

/**
 * Parse `node --test`'s summary lines.
 *
 * The reporter prints `ℹ tests 68`, `ℹ pass 68`, `ℹ fail 0`, `ℹ skipped 0`. A run
 * with no summary is not a pass: it may have crashed before reporting.
 */
export function parseNodeTestSummary(output: string): NodeTestSummary | null {
  const read = (label: string): number | null => {
    const match = new RegExp(`^[^\\n]*\\b${label}\\s+(\\d+)\\s*$`, "m").exec(output);
    return match === null ? null : Number(match[1]);
  };
  const tests = read("tests");
  const passed = read("pass");
  const failed = read("fail");
  const skipped = read("skipped");
  if (tests === null || passed === null || failed === null) return null;
  return { tests, passed, failed, skipped: skipped ?? 0 };
}

function write(stream: NodeJS.WritableStream, text: string): void {
  if (text === "") return;
  stream.write(text);
  if (!text.endsWith("\n")) stream.write("\n");
}

/** Every shipped test file below a tree, discovered rather than listed. */
export function shippedTestFiles(root: string): readonly string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".test.mjs")) found.push(path);
    }
  };
  walk(root);
  return found.sort();
}

/** Every shipped CLI, as an absolute path inside the copy. */
export function shippedClis(root: string): readonly { readonly id: string; readonly path: string }[] {
  return RUNTIME_CLIS.map((entry) => ({
    id: entry.id,
    // `assetPath` is relative to `assets/`; the copy contains `skills/` as its root.
    path: join(root, ...entry.assetPath.replace(/^skills\//, "").split("/")),
  }));
}

/** The default runner: one `spawnSync` call, never a shell. */
function spawnRunner(
  executable: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): CommandResult {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error === undefined ? {} : { error: result.error }),
  };
}

/** Run the whole check against one temporary root. Returns the exit code. */
export function checkInCopy(temporaryRoot: string, options: CheckOptions = {}): number {
  const run = options.run ?? spawnRunner;
  const copy = join(temporaryRoot, "skills");
  const directories = {
    home: join(temporaryRoot, "home"),
    tmp: join(temporaryRoot, "tmp"),
    cache: join(temporaryRoot, "cache"),
  };
  for (const directory of Object.values(directories)) mkdirSync(directory, { recursive: true });

  const source = options.sourceRoot ?? join(ROOT, ...SOURCE_RELATIVE.split("/"));
  cpSync(source, copy, { recursive: true, errorOnExist: true });

  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: directories.home,
    TMPDIR: directories.tmp,
    XDG_CACHE_HOME: directories.cache,
  };

  console.log(`[check-scripts] temporary root: ${temporaryRoot}`);
  console.log(`[check-scripts] copied only ${SOURCE_RELATIVE}/ to ${copy}`);
  console.log(`[check-scripts] HOME=${environment["HOME"]}`);
  console.log(`[check-scripts] TMPDIR=${environment["TMPDIR"]}`);
  console.log(`[check-scripts] XDG_CACHE_HOME=${environment["XDG_CACHE_HOME"]}`);
  console.log("[check-scripts] no install step, no bun, no bash, no network");

  const tests = shippedTestFiles(copy);
  console.log(`\n[check-scripts] $ node --test (${tests.length} shipped test files)`);
  const testsResult = run(process.execPath, ["--test", ...tests], environment, copy);
  write(process.stdout, testsResult.stdout);
  write(process.stderr, testsResult.stderr);
  console.log(`[check-scripts] node --test: exit code ${testsResult.status ?? "unavailable"}`);
  if (testsResult.error !== undefined) {
    console.error(`[check-scripts] ${testsResult.error.message}`);
    return 1;
  }

  const summary = parseNodeTestSummary(`${testsResult.stdout}\n${testsResult.stderr}`);
  if (summary === null) {
    console.error("[check-scripts] test count: unavailable");
    return 1;
  }
  console.log(
    `[check-scripts] test count: ${summary.tests} tests across ${tests.length} files; ` +
      `${summary.passed} pass, ${summary.failed} fail, ${summary.skipped} skip`,
  );
  if (summary.failed !== 0) {
    console.error(`[check-scripts] ${summary.failed} test(s) failed`);
    return 1;
  }
  if (summary.tests !== EXPECTED_TESTS) {
    console.error(
      `[check-scripts] expected ${EXPECTED_TESTS} tests, the suite reported ${summary.tests}`,
    );
    return 1;
  }
  if (tests.length !== EXPECTED_TEST_FILES) {
    console.error(
      `[check-scripts] expected ${EXPECTED_TEST_FILES} test files, found ${tests.length}`,
    );
    return 1;
  }
  if (testsResult.status !== 0) return 1;

  const clis = shippedClis(copy);

  // The id sets must match exactly. Equal lengths are not enough: a missing case for
  // one CLI and a duplicate for another would leave the lengths equal and one CLI
  // unsmoked. This is what makes "forgot a smoke case" a failure rather than a
  // silently smaller check.
  const shippedIds = new Set(clis.map((entry) => entry.id));
  const smokedIds = new Set(SMOKE_CASES.map((smoke) => smoke.id));
  for (const id of shippedIds) {
    if (!smokedIds.has(id)) {
      console.error(`[check-scripts] no smoke case for the shipped CLI "${id}"`);
      return 1;
    }
  }
  for (const id of smokedIds) {
    if (!shippedIds.has(id)) {
      console.error(`[check-scripts] smoke case "${id}" names a CLI that does not ship`);
      return 1;
    }
  }

  for (const smoke of SMOKE_CASES) {
    // Looked up by id, never by position: `RUNTIME_CLIS` order is editorial.
    const entry = clis.find((candidate) => candidate.id === smoke.id);
    if (entry === undefined) {
      console.error(`[check-scripts] no shipped CLI with id "${smoke.id}"`);
      return 1;
    }
    console.log(`\n[check-scripts] $ ${basename(entry.path)} ${smoke.args.join(" ")}`.trimEnd());
    const result = run(process.execPath, [entry.path, ...smoke.args], environment, copy);
    write(process.stdout, result.stdout);
    write(process.stderr, result.stderr);
    console.log(`[check-scripts] ${smoke.label}: exit code ${result.status ?? "unavailable"}`);
    if (result.error !== undefined) {
      console.error(`[check-scripts] ${result.error.message}`);
      return 1;
    }
    if (result.status === null || !smoke.accept.includes(result.status)) {
      console.error(
        `[check-scripts] ${smoke.label}: expected exit ${smoke.accept.join(" or ")}, found ${result.status}`,
      );
      return 1;
    }
  }

  return 0;
}

/** Run the check. Returns the process exit code. */
export function main(options: CheckOptions = {}): number {
  console.log(`[check-scripts] Node version: ${process.version}`);
  let temporaryRoot: string;
  try {
    temporaryRoot =
      options.temporaryRoot ?? mkdtempSync(join(tmpdir(), "dsh-pstack-check-scripts-"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[check-scripts] cannot create temporary directory: ${message}`);
    return 1;
  }

  let exitCode = 1;
  try {
    exitCode = checkInCopy(temporaryRoot, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[check-scripts] ${message}`);
    exitCode = 1;
  } finally {
    try {
      rmSync(temporaryRoot, { recursive: true, force: true });
      if (existsSync(temporaryRoot)) {
        console.error(`[check-scripts] cleanup failed: still exists: ${temporaryRoot}`);
        exitCode = 1;
      } else {
        console.log(`\n[check-scripts] cleanup: removed ${temporaryRoot}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[check-scripts] cleanup failed: ${message}`);
      exitCode = 1;
    }
  }
  console.log(`[check-scripts] result: exit code ${exitCode}`);
  return exitCode;
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
