/**
 * `pstack_script`: run a bundled pstack script through the Host's own runtime.
 *
 * Every shipped CLI is a Node artefact inside this package. A model could always
 * write `node <path> …` into a shell, and that is exactly what breaks in the
 * Desktop build: Electron runs the same CLI, so `node` is not on `PATH` there.
 *
 * So the entry point is a tool, not a command. The tool spawns the artefact with
 * `process.execPath` — whichever binary is already running this Host, Node or
 * Electron — and passes `ELECTRON_RUN_AS_NODE=1` only when it is Electron. That is
 * what makes the npm CLI and the Desktop build behave the same without depending on
 * anything in `PATH`.
 *
 * The tool never accepts a path or a command string. `id` is a closed enum over the
 * shipped artefacts, resolved from this package, so a call cannot reach a script the
 * package does not contain. It is not a general shell: there is no `sh -c`, no glob
 * expansion by a shell, and no way to name another executable.
 */

import { spawn as spawnChild, type ChildProcess } from "node:child_process";

import type {
  JobId,
  JobsHost,
  JsonSchemaNode,
  SessionId,
  ToolDefinition,
  ToolRunContext,
  ToolsHost,
  WorkingDirectoryHost,
} from "./host-contract.ts";
import { RUNTIME_CLIS } from "./runtime-manifest.ts";
import { PSTACK_ROOT } from "./paths.ts";
import { isAbsolute, join, resolve } from "node:path";

/** Model-facing tool name. */
export const TOOL_NAME = "pstack_script";

/** The shipped scripts this tool may run, in display order. */
export const SCRIPT_IDS = RUNTIME_CLIS.map((entry) => entry.id);

export type ScriptId = (typeof SCRIPT_IDS)[number];

/** Default wall-clock limit for a foreground run. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Bounds a caller may set for one foreground run. */
export const MAX_TIMEOUT_MS = 600_000;

/** Default cap on captured bytes per stream. */
export const DEFAULT_OUTPUT_LIMIT_BYTES = 64 * 1024;

/** Raised for an argument problem, before anything is spawned. */
export class ScriptInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptInputError";
  }
}

/** Raised when a shipped artefact is missing from this install. */
export class ScriptMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptMissingError";
  }
}

/** One parsed call. */
export interface ScriptArgs {
  readonly id: ScriptId;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly background: boolean;
  readonly timeoutMs?: number;
  readonly outputLimitBytes?: number;
}

/** What a foreground run produced. */
export interface ScriptResult {
  readonly kind: "foreground";
  readonly id: ScriptId;
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  /** True when a stream was cut off at the limit. */
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly durationMs: number;
}

/** What a background run produced. */
export interface ScriptJobResult {
  readonly kind: "background";
  readonly id: ScriptId;
  readonly jobId: JobId;
  readonly status: string;
}

/** Either outcome, as the model sees it. */
export type ScriptOutcome = ScriptResult | ScriptJobResult;

/** Absolute path of one shipped artefact. */
export function scriptPath(id: ScriptId): string {
  const entry = RUNTIME_CLIS.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new ScriptInputError(`unknown script id "${String(id)}"`);
  // `assetPath` is relative to the generated tree, e.g.
  // `skills/poteto-mode/scripts/orch/orch.mjs`, which is exactly what `PSTACK_ROOT`
  // is the parent of.
  return join(PSTACK_ROOT, ...entry.assetPath.split("/"));
}

/**
 * The environment a child gets.
 *
 * The one rule is the Electron selector. Under Electron, `process.execPath` is the
 * Desktop binary, which starts a browser window unless `ELECTRON_RUN_AS_NODE=1` tells
 * it to behave as Node. Under plain Node the variable is inert — Node ignores it —
 * so setting it unconditionally would also work; it is conditional here so the
 * environment of a normal run stays exactly the caller's, and the one code path that
 * needs it is visible.
 */
export function scriptEnvironment(
  base: NodeJS.ProcessEnv = process.env,
  // Only the field this decision reads is named, so a test can pass the two shapes
  // that matter without fabricating a full `process.versions`. The cast is because
  // `ProcessVersions` types `electron` as an optional literal this file does not own.
  versions: { readonly electron?: string } = process.versions as { readonly electron?: string },
): NodeJS.ProcessEnv {
  if (versions.electron === undefined) return { ...base };
  return { ...base, ELECTRON_RUN_AS_NODE: "1" };
}

/** Validate the raw tool arguments. */
export function parseScriptArgs(raw: unknown): ScriptArgs {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ScriptInputError("arguments must be an object");
  }
  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!["id", "args", "cwd", "background", "timeoutMs", "outputLimitBytes"].includes(key)) {
      throw new ScriptInputError(`unknown argument "${key}"`);
    }
  }

  const id = record["id"];
  if (typeof id !== "string") throw new ScriptInputError('"id" must be a string');
  if (!(SCRIPT_IDS as readonly string[]).includes(id)) {
    throw new ScriptInputError(
      `"id" must be one of ${SCRIPT_IDS.join(", ")}; this tool runs bundled scripts only`,
    );
  }

  const rawArgs = record["args"];
  if (rawArgs !== undefined && !Array.isArray(rawArgs)) {
    throw new ScriptInputError('"args" must be an array of strings');
  }
  const args: string[] = [];
  for (const value of (rawArgs ?? []) as readonly unknown[]) {
    if (typeof value !== "string") throw new ScriptInputError('"args" must contain only strings');
    args.push(value);
  }

  const cwd = record["cwd"];
  if (cwd !== undefined && (typeof cwd !== "string" || cwd.trim() === "")) {
    throw new ScriptInputError('"cwd" must be a non-empty string when present');
  }

  const background = record["background"] ?? false;
  if (typeof background !== "boolean") throw new ScriptInputError('"background" must be a boolean');

  const timeoutMs = record["timeoutMs"];
  if (timeoutMs !== undefined) {
    if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new ScriptInputError('"timeoutMs" must be a positive integer');
    }
    if (timeoutMs > MAX_TIMEOUT_MS) {
      throw new ScriptInputError(`"timeoutMs" must be at most ${MAX_TIMEOUT_MS}`);
    }
  }

  const outputLimitBytes = record["outputLimitBytes"];
  if (outputLimitBytes !== undefined) {
    if (
      typeof outputLimitBytes !== "number" ||
      !Number.isInteger(outputLimitBytes) ||
      outputLimitBytes <= 0
    ) {
      throw new ScriptInputError('"outputLimitBytes" must be a positive integer');
    }
  }

  return {
    id: id as ScriptId,
    args,
    ...(cwd === undefined ? {} : { cwd: cwd as string }),
    background,
    ...(timeoutMs === undefined ? {} : { timeoutMs: timeoutMs as number }),
    ...(outputLimitBytes === undefined
      ? {}
      : { outputLimitBytes: outputLimitBytes as number }),
  };
}

/**
 * Resolve the directory the child runs in.
 *
 * The tool's `cwd` argument is documented as resolving against "this session's
 * directory", so `sessionCwd` — the value `ctx.workingDirectory.ensure()` returns —
 * is the base, not the Host process's working directory.
 *
 * - omitted           -> the session directory
 * - relative          -> joined onto the session directory
 * - absolute          -> used as-is
 *
 * With no Session (a call outside an Agent) there is no session directory to
 * anchor to; the argument is then passed through and `resolve` normalises it
 * against the Host process, which is the only directory that exists.
 */
export function resolveWorkingDirectory(
  requested: string | undefined,
  sessionCwd: string | undefined,
): string | undefined {
  if (requested === undefined) return sessionCwd;
  if (isAbsolute(requested)) return resolve(requested);
  return sessionCwd === undefined ? resolve(requested) : resolve(join(sessionCwd, requested));
}

/**
 * Run one script in the foreground.
 *
 * A nonzero exit, a signal, a timeout, and truncated output are all returned rather
 * than raised: the caller needs to see what the script said before it failed, and an
 * exception would discard the captured output.
 */
export async function runForeground(
  args: ScriptArgs,
  options: {
    readonly execPath?: string;
    readonly environment?: NodeJS.ProcessEnv;
    /** Already resolved by the caller; see `resolveWorkingDirectory`. */
    readonly cwd?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<ScriptResult> {
  const path = scriptPath(args.id);
  const started = Date.now();
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const limit = args.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES;

  return await new Promise<ScriptResult>((resolve, reject) => {
    const child = spawnChild(options.execPath ?? process.execPath, [path, ...args.args], {
      cwd: args.cwd ?? options.cwd,
      env: options.environment ?? scriptEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      signal: options.signal,
    });

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;

    const collect = (chunk: Buffer, to: "out" | "err"): void => {
      const text = chunk.toString("utf8");
      if (to === "out") {
        if (stdout.length >= limit) {
          stdoutTruncated = true;
          return;
        }
        stdout += text.slice(0, limit - stdout.length);
        if (stdout.length >= limit) stdoutTruncated = true;
        return;
      }
      if (stderr.length >= limit) {
        stderrTruncated = true;
        return;
      }
      stderr += text.slice(0, limit - stderr.length);
      if (stderr.length >= limit) stderrTruncated = true;
    };

    child.stdout?.on("data", (chunk: Buffer) => collect(chunk, "out"));
    child.stderr?.on("data", (chunk: Buffer) => collect(chunk, "err"));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        kind: "foreground",
        id: args.id,
        exitCode: code ?? (signal === null ? 1 : 1),
        signal,
        timedOut,
        stdout,
        stderr,
        stdoutTruncated,
        stderrTruncated,
        durationMs: Date.now() - started,
      });
    });
  });
}

/**
 * Start a script as a background job.
 *
 * `jobs` is required and passing nothing is a refusal with a reason. A job whose
 * output nobody can read would be worse than a failed call: the model would report a
 * task as started and no notice would ever arrive.
 */
export async function runBackground(
  args: ScriptArgs,
  options: {
    readonly jobs?: JobsHost | undefined;
    readonly caller?: SessionId;
    readonly execPath?: string;
    readonly environment?: NodeJS.ProcessEnv;
    readonly cwd?: string;
  },
): Promise<ScriptJobResult> {
  const jobs = options.jobs;
  if (jobs === undefined) {
    throw new ScriptInputError(
      "background: true needs the Host jobs service, and this composition has none. " +
        "Run the call in the foreground (omit background), or ask the operator to mount a job controller.",
    );
  }

  const path = scriptPath(args.id);
  const execPath = options.execPath ?? process.execPath;
  const environment = options.environment ?? scriptEnvironment();
  // Already resolved by the caller; see `resolveWorkingDirectory`.
  const cwd = options.cwd;

  /**
   * Settles when the child either started or failed to start, or when the registry
   * never invoked the producer at all.
   *
   * `run` fills this in, so the caller can await the real startup outcome instead of
   * guessing at one with a timer. `child_process` emits exactly one of `spawn` or
   * `error`:
   *
   * - `spawn` fires once the child has been created, before any stdio or exit event.
   * - `error` fires instead when creation failed (ENOENT, EACCES, EMFILE), and no
   *   `spawn` ever follows.
   *
   * So these two events are mutually exclusive and jointly exhaustive for "did it
   * start", which is exactly the question the tool has to answer. Measured on this
   * Node: a missing binary reports ENOENT through `error`, while a real binary —
   * including one that exits immediately or runs slowly — reports `spawn` with no
   * error.
   *
   * `state` exists because the promise must never be able to hang. Two cases would
   * otherwise leave it pending forever:
   *
   * - a registry that registers a job without calling `run` (a stub, or a future
   *   controller with a different contract). `dsh-jobs-local` does call it
   *   synchronously (`hooks = spec.run(handle)`), but the tool cannot assume which
   *   implementation it is talking to — and hanging is far worse than reporting
   *   "started", because the model never gets an answer at all.
   * - `run` throwing synchronously, which would skip both event handlers.
   *
   * Both are treated as "started" only in the sense of "do not claim a failure we did
   * not observe": a genuinely failed job still settles as `failed` through `done`, and
   * the Host's job tools report that.
   */
  let reportStarted: ((failure: string | null) => void) | undefined;
  const state: { settled: boolean; ran: boolean } = { settled: false, ran: false };
  const started = new Promise<string | null>((settle) => {
    reportStarted = (failure) => {
      if (state.settled) return;
      state.settled = true;
      settle(failure);
    };
  });

  const jobId = jobs.start({
    kind: "bash",
    label: `pstack_script ${args.id}`,
    ...(options.caller === undefined ? {} : { owner: options.caller }),
    outputLimitBytes: args.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES,
    run: (job) => {
      state.ran = true;
      const settleStarted = reportStarted as (failure: string | null) => void;
      let child: ChildProcess;
      try {
        child = spawnChild(execPath, [path, ...args.args], {
          cwd,
          env: environment,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
      } catch (error) {
        // A synchronous throw from `spawn` (an invalid argument, or a platform
        // failure that does not become an event) would otherwise leave the caller
        // waiting forever, because no listener was ever attached.
        settleStarted((error as NodeJS.ErrnoException).code ?? "spawn-threw");
        throw error;
      }

      child.stdout?.on("data", (chunk: Buffer) => job.append(chunk.toString("utf8"), { channel: "stdout" }));
      child.stderr?.on("data", (chunk: Buffer) => job.append(chunk.toString("utf8"), { channel: "stderr" }));

      // Report the startup outcome to the caller waiting above. `once` on both, and
      // the promise settles on whichever arrives first, so a late `error` after a
      // successful `spawn` cannot overwrite the answer.
      child.once("spawn", () => settleStarted(null));
      child.once("error", (error) => {
        // Only the error code. `child_process`'s `error.message` embeds the host's
        // absolute path to the artefact, and the model has no business seeing the
        // host layout.
        settleStarted((error as NodeJS.ErrnoException).code ?? "spawn-failed");
      });

      const done = new Promise<{ status: "completed" | "killed" | "failed"; detail?: string }>(
        (settle) => {
          child.once("error", (error) => {
            settle({
              status: "failed",
              detail: (error as NodeJS.ErrnoException).code ?? "spawn-failed",
            });
          });
          child.once("close", (code, signal) => {
            if (signal !== null) settle({ status: "killed", detail: `signal ${signal}` });
            else if (code === 0) settle({ status: "completed" });
            else settle({ status: "failed", detail: `exit code ${code ?? "unknown"}` });
          });
        },
      );

      return {
        cancel: (reason?: string) => {
          child.kill("SIGTERM");
          if (reason !== undefined) job.updateProgress(`cancelling: ${reason}`);
        },
        done,
      };
    },
  });

  // Wait for the real startup outcome, not a guess.
  //
  // Three attempts preceded this, and each failed differently:
  //
  // 1. A fixed 250 ms wait. Failures before it were caught, failures after it were
  //    reported to the model as "started" and never corrected.
  // 2. One microtask (`await Promise.resolve()`). `spawn` reports ENOENT
  //    asynchronously, so this caught nothing at all — measured: after one microtask
  //    the error had not fired yet, and it appeared ~100 ms later. That made the tool
  //    report `running` for a job that never started, which is worse than the timer.
  // 3. This: race `spawn` against `error`, which are mutually exclusive and jointly
  //    exhaustive for "did the child start". No duration is involved, so no
  //    latency assumption can be wrong.
  //
  // If the registry never invoked the producer, the promise would never settle, so
  // that case is answered up front rather than awaited. `dsh-jobs-local` calls
  // `spec.run` synchronously, but a stub registry need not, and hanging is the one
  // outcome the model can do nothing with.
  /**
   * Turn a reported start failure into the tool error.
   *
   * The code only. A foreground run is how the caller sees the actual error, and
   * naming the code keeps host paths out of the model's context.
   */
  const failStart = (reason: string): never => {
    throw new ScriptMissingError(
      `background job ${jobId} failed to start (${reason}). ` +
        "Run the same script in the foreground to see its error.",
    );
  };

  if (!state.ran) {
    // The registry registered a job without invoking the producer, so there is no
    // child to observe. Report what the registry itself says, and refuse to present a
    // terminal failure as a started job.
    const view = jobs.get(jobId, options.caller);
    if (view.status === "failed") failStart("the job controller reported a failed start");
    return { kind: "background", id: args.id, jobId, status: view.status };
  }

  const startFailure = await started;
  if (startFailure !== null) failStart(startFailure);

  // A controller may also settle the job as failed after `spawn` but before this
  // call returns. That is still a start failure from the model's point of view: it
  // has been told nothing it could act on yet.
  const view = jobs.get(jobId, options.caller);
  if (view.status === "failed") failStart("the job controller reported a failed start");
  return { kind: "background", id: args.id, jobId, status: view.status };
}

/**
 * Render one captured stream as a fenced block, byte for byte.
 *
 * `trimEnd` used to run here, which is wrong for two reasons:
 *
 * - A stream of only whitespace passed the `!== ""` test and then rendered as an
 *   empty-looking `stdout:` line, so a reader concluded the script printed nothing.
 * - `check-plan`'s contract includes exact line counts and blank-line separators, so
 *   a trimmed block is a different document — and the model reads this text as the
 *   script's output.
 *
 * A fence keeps every byte visible, including trailing blank lines. The fence is
 * lengthened past the longest backtick run in the content so it can never be closed
 * early by the content itself. Nothing inside is escaped or reinterpreted.
 */
export function renderCapturedStream(text: string): readonly string[] {
  if (text === "") return [];
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  // Strip exactly one final newline: `join("\n")` puts it back, and keeping it would
  // add a visible blank line that the script did not print.
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return [fence, body, fence];
}

/** Render one outcome for the model. */
export function renderScriptOutcome(outcome: ScriptOutcome): string {
  if (outcome.kind === "background") {
    return [
      `started ${outcome.id} as background job ${outcome.jobId} (status: ${outcome.status}).`,
      "Read or stop it through the Host's job tools; this tool does not poll.",
    ].join("\n");
  }

  const lines = [
    `${outcome.id} exited with code ${outcome.exitCode}` +
      `${outcome.signal === null ? "" : ` (signal ${outcome.signal})`}` +
      `${outcome.timedOut ? ` after the timeout` : ""} in ${outcome.durationMs}ms`,
  ];
  // Omitted only when the stream is genuinely empty; a stream of blank lines is
  // shown, so "printed nothing" and "printed newlines" stay distinguishable.
  if (outcome.stdout !== "") lines.push("", "stdout (exact bytes):", ...renderCapturedStream(outcome.stdout));
  if (outcome.stderr !== "") lines.push("", "stderr (exact bytes):", ...renderCapturedStream(outcome.stderr));
  if (outcome.stdoutTruncated) lines.push("", "stdout was truncated at the output limit.");
  if (outcome.stderrTruncated) lines.push("", "stderr was truncated at the output limit.");
  if (outcome.exitCode !== 0 || outcome.signal !== null || outcome.timedOut) {
    lines.push("", "This run failed. Read the output above; do not report success.");
  }
  return lines.join("\n");
}

const TOOL_DESCRIPTION = [
  "Run one of the scripts bundled with pstack, using the Host's own Node runtime.",
  "",
  "Use this instead of a shell for the pstack scripts. It works in both deployments: the npm CLI and",
  "the Desktop app, where `node` is not on PATH because the Desktop process is Electron.",
  "",
  "`id` selects a bundled script by name; only those names are accepted, so this is not a general",
  "shell and takes no path or command string. `args` are passed to the script verbatim.",
  "",
  "The run starts in this session's directory, so a relative path in `args` lands inside the",
  "workspace or worktree the session is using.",
  "",
  "**This tool does not go through command approval, and the Host's sandbox policy does not apply**",
  "to it. It spawns a Node process directly instead of asking `ctx.shell` to run a command, which is",
  "what keeps it working where no `node` is on PATH. The scripts are this package's own audited",
  "artefacts and `id` cannot name anything else, but the consequence is real: unlike a bash call, no",
  "approval prompt is shown and no filesystem policy is enforced on what the script writes. Say so",
  "when a task depends on that difference.",
  "",
  "A nonzero exit, a signal, a timeout, and truncated output all come back in the result with the",
  "captured output, so a failed run is visible rather than silent.",
  "",
  "Set `background: true` for a long run. That needs the Host jobs service; without it the call is",
  "refused with a reason instead of hanging. Background runs return a job id and a settlement notice",
  "arrives later — do not poll.",
].join("\n");

/** The model-facing JSON Schema for `parameters`. */
export function buildScriptParameters(): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    id: {
      type: "string",
      enum: [...SCRIPT_IDS],
      description: "Which bundled pstack script to run. Not a path: only these names are accepted.",
    },
    args: {
      type: "array",
      items: { type: "string" },
      description: "Arguments passed to the script verbatim, one array entry per argument.",
    },
    cwd: {
      type: "string",
      description:
        "Working directory for the script. Relative paths resolve against this session's directory; an absolute path is used as-is. Omitted runs in this session's directory.",
    },
    background: {
      type: "boolean",
      description:
        "Run as a Host background job and return its id. Requires the jobs service; a composition without it refuses the call.",
    },
    timeoutMs: {
      type: "integer",
      description: `Foreground wall-clock limit; 1 or greater, and values below 1 are rejected. Defaults to ${DEFAULT_TIMEOUT_MS}; values above ${MAX_TIMEOUT_MS} are rejected.`,
    },
    outputLimitBytes: {
      type: "integer",
      description: `Per-stream capture limit; 1 or greater, and values below 1 are rejected. Defaults to ${DEFAULT_OUTPUT_LIMIT_BYTES}.`,
    },
  };

  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: ["id"],
  };
}

/**
 * The declared shape of one outcome, exported so tests can validate real results.
 *
 * Split by `kind` instead of one flat object. The flat form could only require
 * `kind` and `id`, so a foreground result that omitted `exitCode` was still
 * "valid" and the schema proved nothing about the fields the model reads.
 *
 * `signal` is nullable because `child_process` reports `null` whenever the child
 * exited on its own — that is every successful run. Declaring it `string` made
 * the registry reject the tool's own normal output: `createSuccessResult()`
 * validates before rendering, so **every** clean exit surfaced to the model as
 * `tool "pstack_script" returned invalid output`.
 */
export const OUTPUT_SCHEMA: JsonSchemaNode = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", const: "foreground" },
        id: { type: "string", description: "Which bundled script ran." },
        exitCode: { type: "integer", description: "The child's exit code." },
        signal: {
          oneOf: [{ type: "string" }, { type: "null" }],
          description: "Terminating signal, or null when the script exited on its own.",
        },
        timedOut: {
          type: "boolean",
          description: "True when this tool's own timeout killed the run.",
        },
        stdout: { type: "string" },
        stderr: { type: "string" },
        stdoutTruncated: { type: "boolean" },
        stderrTruncated: { type: "boolean" },
        durationMs: { type: "integer" },
      },
      required: [
        "kind",
        "id",
        "exitCode",
        "signal",
        "timedOut",
        "stdout",
        "stderr",
        "stdoutTruncated",
        "stderrTruncated",
        "durationMs",
      ],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", const: "background" },
        id: { type: "string", description: "Which bundled script started." },
        jobId: { type: "string", description: "The Host job id to read or stop." },
        status: { type: "string", description: "Job status when the call returned." },
      },
      required: ["kind", "id", "jobId", "status"],
    },
  ],
};

/** The slices of the Cordis context this tool needs. */
export interface PstackScriptHost {
  readonly tools: ToolsHost;
  /** Resolves the Session's current directory; see `WorkingDirectoryHost`. */
  readonly workingDirectory: WorkingDirectoryHost;
  /**
   * Optional, and read per call rather than snapshotted.
   *
   * A profile may mount a job controller after this row, so a value read once in
   * `apply` would stay `undefined` forever. `ctx.get("jobs")` is rc.3's
   * optional-service read: it returns `undefined` instead of throwing when the
   * service is absent, which is why `jobs` is not declared in `inject`.
   */
  readonly getJobs?: () => JobsHost | undefined;
}

/** Build the tool for one row. */
export function createPstackScriptTool(host: PstackScriptHost): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: buildScriptParameters(),
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: "text", text: renderScriptOutcome(value as ScriptOutcome) }],
    },
    // Two runs of the same script may write the same store, so this is not marked
    // concurrency-safe; the Host then serializes them the way it serializes any tool.
    isConcurrencySafe: () => false,
    /**
     * The Host's last-resort budget for one call.
     *
     * `DEFAULT_TIMEOUT_MS` is the tool's own timer for a foreground run, and it fires
     * first in every normal case: it kills the child and returns a `timedOut` result the
     * model can read. This budget is larger on purpose, so it only ever wins when the
     * tool's own machinery failed to return at all — a hung `await`, a timer that never
     * ran — and the alternative would be a session blocked with no answer.
     *
     * `MAX_TIMEOUT_MS` rather than a new number: it is already the ceiling the tool
     * accepts for a caller-supplied `timeoutMs`, so the Host budget can never be the
     * thing that cuts short a run the caller was allowed to request.
     *
     * It does not bound a background job. The wrapper disposes its timer when `execute`
     * settles, which is milliseconds after `jobs.start` returns.
     */
    timeoutMs: MAX_TIMEOUT_MS,
    async execute(rawArgs, exec: ToolRunContext) {
      const args = parseScriptArgs(rawArgs);
      // Ask the Host where this Session currently is, rather than inheriting the
      // Host process's directory. `ensure` is the same seam `dsh-tool-bash` uses.
      const sessionCwd =
        exec.agent === undefined
          ? undefined
          : await host.workingDirectory.ensure(exec.agent, exec.signal);
      const cwd = resolveWorkingDirectory(args.cwd, sessionCwd);
      if (args.background) {
        return await runBackground(args, {
          jobs: host.getJobs?.(),
          ...(cwd === undefined ? {} : { cwd }),
          ...(exec.agent === undefined ? {} : { caller: exec.agent.id }),
        });
      }
      return await runForeground(args, {
        signal: exec.signal,
        ...(cwd === undefined ? {} : { cwd }),
      });
    },
  };
}

/** Cordis row name, used by Loader diagnostics. */
export const name = "pstack-script";

/**
 * The hard dependencies.
 *
 * `tools` is the registry this row registers into; `workingDirectory` is what
 * turns the tool's `cwd` argument and its omitted case into the Session's
 * directory. Both are always present in a profile that has an Agent at all.
 *
 * `jobs` is deliberately absent: a composition without a job controller still
 * registers the tool, and only `background: true` is refused. Declaring `jobs`
 * here would keep the whole fiber inactive in every profile that has no job
 * controller, which is most of them.
 */
export const inject = ["tools", "workingDirectory"];

/**
 * Register `pstack_script` for this row.
 *
 * `inject` is what makes `ctx.tools` readable at all: without it Cordis runs
 * `apply` immediately and the service proxy throws
 * `cannot get property "tools" without inject`, so the row would register nothing
 * in any profile.
 */
export function apply(ctx: PstackScriptHost & { get?: (name: string) => JobsHost | undefined }): void {
  ctx.tools.register(
    createPstackScriptTool({
      tools: ctx.tools,
      workingDirectory: ctx.workingDirectory,
      // Optional-service read, so a controller mounted later is still seen.
      getJobs: () => ctx.get?.("jobs"),
    }),
  );
}
