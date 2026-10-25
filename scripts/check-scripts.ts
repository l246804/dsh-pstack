import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ROOT } from "./build-assets.ts";

const SOURCE_RELATIVE = "assets/skills/poteto-mode/scripts";
const SCRIPT_SOURCE = join(ROOT, ...SOURCE_RELATIVE.split("/"));
const WORKTREE_AUDIT = join(SCRIPT_SOURCE, "worktree-audit.sh");
const EXPECTED_TEST_FILES = 5;

interface Command {
  readonly label: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly kind?: "bun-version" | "bun-tests";
}

export interface BunTestSummary {
  readonly tests: number;
  readonly files: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly todo: number;
}

/** Parse Bun's summary without treating a partial or empty suite as a pass. */
export function parseBunTestSummary(output: string): BunTestSummary | null {
  const ran = /^[ \t]*Ran (\d+) tests? across (\d+) files?\./m.exec(output);
  const passed = count(output, "pass");
  if (ran === null || passed === null) return null;

  const summary = {
    tests: Number(ran[1]),
    files: Number(ran[2]),
    passed,
    failed: count(output, "fail") ?? 0,
    skipped: count(output, "skip") ?? 0,
    todo: count(output, "todo") ?? 0,
  };
  return summary.passed + summary.failed + summary.skipped + summary.todo === summary.tests
    ? summary
    : null;
}

function count(output: string, label: "pass" | "fail" | "skip" | "todo"): number | null {
  const match = new RegExp(`^[ \\t]*(\\d+) ${label}[ \\t]*\\r?$`, "m").exec(output);
  return match === null ? null : Number(match[1]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeOutput(stream: NodeJS.WritableStream, output: string): void {
  if (output === "") return;
  stream.write(output);
  if (!output.endsWith("\n")) stream.write("\n");
}

function checkInCopy(temporaryRoot: string): number {
  const scripts = join(temporaryRoot, "scripts");
  const directories = {
    home: join(temporaryRoot, "home"),
    tmp: join(temporaryRoot, "tmp"),
    cache: join(temporaryRoot, "cache"),
    bunInstall: join(temporaryRoot, "bun"),
    bunTmp: join(temporaryRoot, "bun", "tmp"),
    bunCache: join(temporaryRoot, "bun", "cache"),
  };
  for (const directory of Object.values(directories)) mkdirSync(directory, { recursive: true });

  // This is the only asset tree copied. Installs and all test-side temporary
  // directories stay below temporaryRoot, never in the generated asset tree.
  cpSync(SCRIPT_SOURCE, scripts, { recursive: true, errorOnExist: true });

  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: directories.home,
    TMPDIR: directories.tmp,
    XDG_CACHE_HOME: directories.cache,
    BUN_INSTALL: directories.bunInstall,
    BUN_TMPDIR: directories.bunTmp,
    BUN_INSTALL_CACHE_DIR: directories.bunCache,
  };
  console.log(`[check-scripts] temporary root: ${temporaryRoot}`);
  console.log(`[check-scripts] copied only ${SOURCE_RELATIVE}/ to ${scripts}`);
  for (const name of [
    "HOME",
    "TMPDIR",
    "XDG_CACHE_HOME",
    "BUN_INSTALL",
    "BUN_TMPDIR",
    "BUN_INSTALL_CACHE_DIR",
  ] as const) {
    console.log(`[check-scripts] ${name}=${environment[name]}`);
  }

  const commands: readonly Command[] = [
    { label: "bun --version", executable: "bun", args: ["--version"], kind: "bun-version" },
    {
      label: "bun install --frozen-lockfile",
      executable: "bun",
      args: ["install", "--frozen-lockfile"],
    },
    {
      label: "bun test orch watch-pr check-plan.test.ts",
      executable: "bun",
      args: ["test", "orch", "watch-pr", "check-plan.test.ts"],
      kind: "bun-tests",
    },
    {
      label: "bun run typecheck",
      executable: "bun",
      args: ["run", "typecheck"],
    },
    {
      label: `bash -n ${SOURCE_RELATIVE}/worktree-audit.sh`,
      executable: "bash",
      args: ["-n", WORKTREE_AUDIT],
    },
  ];

  for (const command of commands) {
    console.log(`\n[check-scripts] $ ${command.label}`);
    const result = spawnSync(command.executable, command.args, {
      cwd: scripts,
      env: environment,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    writeOutput(process.stdout, result.stdout);
    writeOutput(process.stderr, result.stderr);
    const exitCode = result.status === null ? "unavailable" : String(result.status);
    console.log(`[check-scripts] ${command.label}: exit code ${exitCode}`);
    if (result.signal !== null) console.error(`[check-scripts] signal: ${result.signal}`);
    if (result.error !== undefined) console.error(`[check-scripts] ${result.error.message}`);

    const succeeded = result.error === undefined && result.status === 0;
    if (command.kind === "bun-version" && succeeded) {
      const version = result.stdout.trim();
      if (version === "") {
        console.error("[check-scripts] Bun version: unavailable");
        return 1;
      }
      console.log(`[check-scripts] Bun version: ${version}`);
    }
    if (command.kind === "bun-tests") {
      const summary = parseBunTestSummary(`${result.stdout}\n${result.stderr}`);
      if (summary === null) {
        console.error("[check-scripts] test count: unavailable or inconsistent");
        return 1;
      }
      console.log(
        `[check-scripts] test count: ${summary.tests} tests across ${summary.files} files; ` +
          `${summary.passed} pass, ${summary.failed} fail, ${summary.skipped} skip, ${summary.todo} todo`,
      );
      if (summary.failed !== 0) {
        console.error(`[check-scripts] ${summary.failed} test(s) failed`);
        return 1;
      }
      if (summary.tests === 0 || summary.files !== EXPECTED_TEST_FILES) {
        console.error(
          `[check-scripts] expected a non-empty suite across ${EXPECTED_TEST_FILES} files`,
        );
        return 1;
      }
    }
    if (!succeeded) return 1;
  }

  return 0;
}

export function main(): number {
  console.log(`[check-scripts] Node version: ${process.version}`);
  let temporaryRoot: string;
  try {
    temporaryRoot = mkdtempSync(join(tmpdir(), "dsh-pstack-check-scripts-"));
  } catch (error) {
    console.error(`[check-scripts] cannot create temporary directory: ${errorMessage(error)}`);
    return 1;
  }

  let exitCode = 1;
  try {
    exitCode = checkInCopy(temporaryRoot);
  } catch (error) {
    console.error(`[check-scripts] ${errorMessage(error)}`);
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
      console.error(`[check-scripts] cleanup failed: ${errorMessage(error)}`);
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
