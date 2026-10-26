/**
 * The one support module the ported upstream tests import.
 *
 * The five upstream test files were written for `bun:test` and use exactly two
 * Bun facilities: its `expect`, and `Bun.spawnSync` / `Bun.spawn` for running git
 * and short-lived processes. Rather than rewrite every call site, this module
 * supplies those two shapes and the test patch only replaces the import line. The
 * bodies below stay byte-for-byte the upstream text, so a future upstream change
 * is still readable against this tree.
 *
 * `Bun.spawnSync` returns `{ exitCode, stdout, stderr, success }` with Buffer
 * output and never throws on a nonzero exit; `node:child_process.spawnSync`
 * returns `{ status, stdout, stderr }`. The adapter is the mapping between them,
 * not a second implementation.
 *
 * `Bun.spawn` returns `{ pid, exited: Promise<number> }`. The adapter runs the
 * child to completion and resolves `exited` with the exit status, which is what
 * the one call site awaits.
 */

import { spawn as nodeSpawn, spawnSync as nodeSpawnSync, type ChildProcess } from "node:child_process";

export { expect } from "./expect.ts";

export interface SpawnSyncResult {
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly success: boolean;
}

export interface SpawnResult {
  readonly pid: number;
  readonly exited: Promise<number>;
}

interface SpawnSyncOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stdin?: "inherit" | "ignore";
  readonly stdout?: "inherit" | "ignore";
  readonly stderr?: "inherit" | "ignore";
}

/**
 * Run a command to completion, Bun-shaped.
 *
 * A signal-terminated child reports `exitCode: 1` rather than `null`, so a test
 * that formats the code never prints `undefined` for a killed process.
 */
export function spawnSync(argv: readonly string[], options: SpawnSyncOptions = {}): SpawnSyncResult {
  const [command, ...args] = argv;
  if (command === undefined) throw new TypeError("spawnSync needs a command");

  const result = nodeSpawnSync(command, args, {
    cwd: options.cwd,
    env: options.env as NodeJS.ProcessEnv | undefined,
    stdio: [
      options.stdin === "inherit" ? "inherit" : "pipe",
      options.stdout === "inherit" ? "inherit" : "pipe",
      options.stderr === "inherit" ? "inherit" : "pipe",
    ],
    encoding: "buffer",
  });
  const exitCode = result.status ?? 1;
  return {
    exitCode,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0),
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0),
    success: exitCode === 0,
  };
}

/**
 * A child that exits immediately, as a real process.
 *
 * The current interpreter running an empty program is a process like any other: its
 * `pid` is real and its exit status is 0.
 */
function immediateExit(): ChildProcess {
  return nodeSpawn(process.execPath, ["-e", ""], { stdio: "ignore" });
}

/** Whether `command` starts at all, checked without a shell. */
function resolves(command: string): boolean {
  // `spawnSync` reports ENOENT synchronously, unlike `spawn`.
  return nodeSpawnSync(command, ["--version"], { stdio: "ignore" }).error === undefined;
}

/**
 * Start a command and expose Bun's `{ pid, exited }` shape.
 *
 * The one upstream call is `spawn(["true"])`, used to obtain a pid that has already
 * exited so the test can plant a stale lock. It reads `pid` *before* awaiting
 * `exited`, so the pid must be real and already dead when this returns.
 *
 * That rules out "spawn it and fall back on failure": the failure is asynchronous, so
 * the caller would read `-1`. The probe is synchronous instead, which lets this
 * function choose the right child before returning. `true` is used when it exists and
 * the current interpreter otherwise — a `PATH` without the usual Unix utilities is
 * exactly the environment this release has to work in.
 */
export function spawn(argv: readonly string[]): SpawnResult {
  const [command, ...args] = argv;
  if (command === undefined) throw new TypeError("spawn needs a command");

  const child = resolves(command) ? nodeSpawn(command, args, { stdio: "ignore" }) : immediateExit();
  return {
    pid: child.pid ?? -1,
    exited: new Promise<number>((resolve) => {
      child.once("close", (code) => resolve(code ?? 1));
      child.once("error", () => resolve(1));
    }),
  };
}

/** The `Bun` global the upstream tests reference, limited to what they call. */
export const Bun = { spawnSync, spawn };
