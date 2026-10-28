/**
 * `pstack_script`: run a bundled pstack script through the Host's own runtime.
 *
 * The `id` is a closed enum over the shipped artefacts and resolves from this package,
 * so a call cannot reach a script the package does not contain. It is not a shell: no
 * `sh -c`, no glob expansion, no way to name another executable.
 *
 * The child is spawned with `process.execPath` — whichever binary runs this Host, Node or
 * Electron — and `ELECTRON_RUN_AS_NODE=1` only under Electron. That makes the npm CLI and
 * the Desktop build behave the same without `node` on `PATH`.
 */

import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";

import type {
  JobId,
  JobsHost,
  JsonSchemaNode,
  SessionId,
  ToolDefinition,
  ToolRunContext,
  ToolsHost,
  WorkingDirectoryHost,
} from "./internal/host-contract.ts";
import { PORT_ROOT } from "./internal/paths.ts";
import { SCRIPT_ENTRIES } from "./internal/script-registry.ts";

/** Model-facing tool name. */
export const TOOL_NAME = "pstack_script";

/** The shipped scripts this tool may run, in display order. */
export const SCRIPT_IDS = SCRIPT_ENTRIES.map((entry) => entry.id);

export type ScriptId = (typeof SCRIPT_IDS)[number];

export const DEFAULT_TIMEOUT_MS = 120_000;
export const MAX_TIMEOUT_MS = 600_000;
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

export interface ScriptArgs {
  readonly id: ScriptId;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly background: boolean;
  readonly timeoutMs?: number;
  readonly outputLimitBytes?: number;
}

export interface ScriptResult {
  readonly kind: "foreground";
  readonly id: ScriptId;
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly durationMs: number;
}

export interface ScriptJobResult {
  readonly kind: "background";
  readonly id: ScriptId;
  readonly jobId: JobId;
  readonly status: string;
}

export type ScriptOutcome = ScriptResult | ScriptJobResult;

/** Absolute path of one shipped artefact. */
export function scriptPath(id: ScriptId): string {
  const entry = SCRIPT_ENTRIES.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new ScriptInputError(`unknown script id "${String(id)}"`);
  return join(PORT_ROOT, ...entry.assetPath.split("/"));
}

/** The environment a child gets: the Electron selector, and otherwise the caller's. */
export function scriptEnvironment(
  base: NodeJS.ProcessEnv = process.env,
  versions: { readonly electron?: string } = process.versions as { readonly electron?: string },
): NodeJS.ProcessEnv {
  if (versions.electron === undefined) return { ...base };
  return { ...base, ELECTRON_RUN_AS_NODE: "1" };
}

/** Validate the raw tool arguments. */
export function parseScriptArgs(raw: unknown): ScriptArgs {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new ScriptInputError("arguments must be an object");
  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!["id", "args", "cwd", "background", "timeoutMs", "outputLimitBytes"].includes(key)) {
      throw new ScriptInputError(`unknown argument "${key}"`);
    }
  }

  const id = record["id"];
  if (typeof id !== "string") throw new ScriptInputError('"id" must be a string');
  if (!(SCRIPT_IDS as readonly string[]).includes(id)) {
    throw new ScriptInputError(`"id" must be one of ${SCRIPT_IDS.join(", ")}; this tool runs bundled scripts only`);
  }

  const rawArgs = record["args"];
  if (rawArgs !== undefined && !Array.isArray(rawArgs)) throw new ScriptInputError('"args" must be an array of strings');
  const args: string[] = [];
  for (const value of (rawArgs ?? []) as readonly unknown[]) {
    if (typeof value !== "string") throw new ScriptInputError('"args" must contain only strings');
    args.push(value);
  }

  const cwd = record["cwd"];
  if (cwd !== undefined && (typeof cwd !== "string" || cwd.trim() === "")) throw new ScriptInputError('"cwd" must be a non-empty string when present');

  const background = record["background"] ?? false;
  if (typeof background !== "boolean") throw new ScriptInputError('"background" must be a boolean');

  const timeoutMs = record["timeoutMs"];
  if (timeoutMs !== undefined) {
    if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new ScriptInputError('"timeoutMs" must be a positive integer');
    if (timeoutMs > MAX_TIMEOUT_MS) throw new ScriptInputError(`"timeoutMs" must be at most ${MAX_TIMEOUT_MS}`);
  }

  const outputLimitBytes = record["outputLimitBytes"];
  if (outputLimitBytes !== undefined) {
    if (typeof outputLimitBytes !== "number" || !Number.isInteger(outputLimitBytes) || outputLimitBytes <= 0) {
      throw new ScriptInputError('"outputLimitBytes" must be a positive integer');
    }
  }

  return {
    id: id as ScriptId,
    args,
    ...(cwd === undefined ? {} : { cwd: cwd as string }),
    background,
    ...(timeoutMs === undefined ? {} : { timeoutMs: timeoutMs as number }),
    ...(outputLimitBytes === undefined ? {} : { outputLimitBytes: outputLimitBytes as number }),
  };
}

/** Resolve the directory the child runs in, relative to the caller-established session directory. */
export function resolveWorkingDirectory(requested: string | undefined, sessionCwd: string | undefined): string | undefined {
  if (requested === undefined) return sessionCwd;
  if (isAbsolute(requested)) return resolve(requested);
  return sessionCwd === undefined ? resolve(requested) : resolve(join(sessionCwd, requested));
}

/** Run one script in the foreground. A nonzero exit, signal, timeout, and truncation are returned, not thrown. */
export async function runForeground(
  args: ScriptArgs,
  options: {
    readonly execPath?: string;
    readonly environment?: NodeJS.ProcessEnv;
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
        exitCode: code ?? 1,
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

/** Start a script as a background job. `jobs` absent is a refusal with a reason. */
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
      "background: true needs the Host jobs service, and this composition has none. Run the call in the foreground (omit background), or ask the operator to mount a job controller.",
    );
  }

  const path = scriptPath(args.id);
  const execPath = options.execPath ?? process.execPath;
  const environment = options.environment ?? scriptEnvironment();
  const cwd = options.cwd;

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
        settleStarted((error as NodeJS.ErrnoException).code ?? "spawn-threw");
        throw error;
      }

      child.stdout?.on("data", (chunk: Buffer) => job.append(chunk.toString("utf8"), { channel: "stdout" }));
      child.stderr?.on("data", (chunk: Buffer) => job.append(chunk.toString("utf8"), { channel: "stderr" }));

      child.once("spawn", () => settleStarted(null));
      child.once("error", (error) => settleStarted((error as NodeJS.ErrnoException).code ?? "spawn-failed"));

      const done = new Promise<{ status: "completed" | "killed" | "failed"; detail?: string }>((settle) => {
        child.once("error", (error) => settle({ status: "failed", detail: (error as NodeJS.ErrnoException).code ?? "spawn-failed" }));
        child.once("close", (code, signal) => {
          if (signal !== null) settle({ status: "killed", detail: `signal ${signal}` });
          else if (code === 0) settle({ status: "completed" });
          else settle({ status: "failed", detail: `exit code ${code ?? "unknown"}` });
        });
      });

      return {
        cancel: (reason?: string) => {
          child.kill("SIGTERM");
          if (reason !== undefined) job.updateProgress(`cancelling: ${reason}`);
        },
        done,
      };
    },
  });

  const failStart = (reason: string): never => {
    throw new ScriptMissingError(`background job ${jobId} failed to start (${reason}). Run the same script in the foreground to see its error.`);
  };

  if (!state.ran) {
    const view = jobs.get(jobId, options.caller);
    if (view.status === "failed") failStart("the job controller reported a failed start");
    return { kind: "background", id: args.id, jobId, status: view.status };
  }

  const startFailure = await started;
  if (startFailure !== null) failStart(startFailure);

  const view = jobs.get(jobId, options.caller);
  if (view.status === "failed") failStart("the job controller reported a failed start");
  return { kind: "background", id: args.id, jobId, status: view.status };
}

/** Render one captured stream as a fence that the content cannot close early. */
export function renderCapturedStream(text: string): readonly string[] {
  if (text === "") return [];
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
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
    `${outcome.id} exited with code ${outcome.exitCode}${outcome.signal === null ? "" : ` (signal ${outcome.signal})`}${outcome.timedOut ? ` after the timeout` : ""} in ${outcome.durationMs}ms`,
  ];
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

export function buildScriptParameters(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", enum: [...SCRIPT_IDS], description: "Which bundled pstack script to run. Not a path: only these names are accepted." },
      args: { type: "array", items: { type: "string" }, description: "Arguments passed to the script verbatim, one array entry per argument." },
      cwd: {
        type: "string",
        description: "Working directory for the script. Relative paths resolve against this session's directory; an absolute path is used as-is. Omitted runs in this session's directory.",
      },
      background: { type: "boolean", description: "Run as a Host background job and return its id. Requires the jobs service; a composition without it refuses the call." },
      timeoutMs: { type: "integer", description: `Foreground wall-clock limit; 1 or greater, and values below 1 are rejected. Defaults to ${DEFAULT_TIMEOUT_MS}; values above ${MAX_TIMEOUT_MS} are rejected.` },
      outputLimitBytes: { type: "integer", description: `Per-stream capture limit; 1 or greater, and values below 1 are rejected. Defaults to ${DEFAULT_OUTPUT_LIMIT_BYTES}.` },
    },
    required: ["id"],
  };
}

export const OUTPUT_SCHEMA: JsonSchemaNode = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", const: "foreground" },
        id: { type: "string", description: "Which bundled script ran." },
        exitCode: { type: "integer", description: "The child's exit code." },
        signal: { oneOf: [{ type: "string" }, { type: "null" }], description: "Terminating signal, or null when the script exited on its own." },
        timedOut: { type: "boolean", description: "True when this tool's own timeout killed the run." },
        stdout: { type: "string" },
        stderr: { type: "string" },
        stdoutTruncated: { type: "boolean" },
        stderrTruncated: { type: "boolean" },
        durationMs: { type: "integer" },
      },
      required: ["kind", "id", "exitCode", "signal", "timedOut", "stdout", "stderr", "stdoutTruncated", "stderrTruncated", "durationMs"],
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
  readonly workingDirectory: WorkingDirectoryHost;
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
      render: (_args, value) => [{ type: "text", text: renderScriptOutcome(value as unknown as ScriptOutcome) }],
    },
    isConcurrencySafe: () => false,
    timeoutMs: MAX_TIMEOUT_MS,
    async execute(rawArgs, exec: ToolRunContext) {
      const args = parseScriptArgs(rawArgs);
      const sessionCwd = exec.agent === undefined ? undefined : await host.workingDirectory.ensure(exec.agent, exec.signal);
      const cwd = resolveWorkingDirectory(args.cwd, sessionCwd);
      if (args.background) {
        return await runBackground(args, {
          jobs: host.getJobs?.(),
          ...(cwd === undefined ? {} : { cwd }),
          ...(exec.agent === undefined ? {} : { caller: exec.agent.id }),
        });
      }
      return await runForeground(args, { signal: exec.signal, ...(cwd === undefined ? {} : { cwd }) });
    },
  };
}

/** Cordis row name, used by Loader diagnostics. */
export const name = "pstack-script";

/** Hard dependencies: the tool registry and the session directory. `jobs` is optional and read per call. */
export const inject = ["tools", "workingDirectory"];

/** Register `pstack_script` for this row. */
export function apply(ctx: PstackScriptHost & { get?: (name: string) => JobsHost | undefined }): void {
  ctx.tools.register(
    createPstackScriptTool({
      tools: ctx.tools,
      workingDirectory: ctx.workingDirectory,
      getJobs: () => ctx.get?.("jobs"),
    }),
  );
}
