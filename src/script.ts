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

import { spawn as spawnChild } from "node:child_process";

import type {
  JobId,
  JobsHost,
  JsonSchemaNode,
  SessionId,
  ToolDefinition,
  ToolRunContext,
  ToolsHost,
} from "./host-contract.ts";
import { RUNTIME_CLIS } from "../scripts/runtime-manifest.ts";
import { ASSETS_ROOT } from "./paths.ts";
import { join } from "node:path";

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

/** How long a background job waits for a spawn error before reporting started. */
const BACKGROUND_CONFIRM_MS = 250;

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
  // `skills/poteto-mode/scripts/orch/orch.mjs`, which is exactly what `ASSETS_ROOT`
  // is the parent of.
  return join(ASSETS_ROOT, ...entry.assetPath.split("/"));
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
  const cwd = args.cwd ?? options.cwd;

  const jobId = jobs.start({
    kind: "bash",
    label: `pstack_script ${args.id}`,
    ...(options.caller === undefined ? {} : { owner: options.caller }),
    outputLimitBytes: args.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES,
    run: (job) => {
      const child = spawnChild(execPath, [path, ...args.args], {
        cwd,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      child.stdout?.on("data", (chunk: Buffer) => job.append(chunk.toString("utf8"), { channel: "stdout" }));
      child.stderr?.on("data", (chunk: Buffer) => job.append(chunk.toString("utf8"), { channel: "stderr" }));

      const done = new Promise<{ status: "completed" | "killed" | "failed"; detail?: string }>(
        (resolve) => {
          child.once("error", (error) => resolve({ status: "failed", detail: error.message }));
          child.once("close", (code, signal) => {
            if (signal !== null) resolve({ status: "killed", detail: `signal ${signal}` });
            else if (code === 0) resolve({ status: "completed" });
            else resolve({ status: "failed", detail: `exit code ${code ?? "unknown"}` });
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

  // Give an immediate spawn failure a chance to surface. `jobs.start` cannot reject
  // after registering a job, so a missing artefact would otherwise look started.
  await new Promise<void>((resolve) => setTimeout(resolve, BACKGROUND_CONFIRM_MS));
  const view = jobs.get(jobId, options.caller);
  if (view.status === "failed") {
    throw new ScriptMissingError(
      `background job ${jobId} failed to start: ${view.detail ?? "no detail"}`,
    );
  }

  return { kind: "background", id: args.id, jobId, status: view.status };
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
  if (outcome.stdout !== "") lines.push("", "stdout:", outcome.stdout.trimEnd());
  if (outcome.stderr !== "") lines.push("", "stderr:", outcome.stderr.trimEnd());
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
        "Working directory for the script. Relative paths resolve against this session's directory. Omitted inherits it.",
    },
    background: {
      type: "boolean",
      description:
        "Run as a Host background job and return its id. Requires the jobs service; a composition without it refuses the call.",
    },
    timeoutMs: {
      type: "integer",
      minimum: 1,
      description: `Foreground wall-clock limit. Defaults to ${DEFAULT_TIMEOUT_MS}; values above ${MAX_TIMEOUT_MS} are rejected.`,
    },
    outputLimitBytes: {
      type: "integer",
      minimum: 1,
      description: `Per-stream capture limit. Defaults to ${DEFAULT_OUTPUT_LIMIT_BYTES}.`,
    },
  };

  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: ["id"],
  };
}

const OUTPUT_SCHEMA: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["foreground", "background"] },
    id: { type: "string", description: "Which bundled script ran." },
    exitCode: { type: "integer", description: "Foreground exit code. Omitted for a background run." },
    signal: { type: "string", description: "Terminating signal, when one killed the foreground run." },
    timedOut: { type: "boolean", description: "True when the foreground timeout fired." },
    stdout: { type: "string" },
    stderr: { type: "string" },
    stdoutTruncated: { type: "boolean" },
    stderrTruncated: { type: "boolean" },
    durationMs: { type: "integer" },
    jobId: { type: "string", description: "Background job id. Omitted for a foreground run." },
    status: { type: "string", description: "Background job status at start." },
  },
  required: ["kind", "id"],
};

/** The slices of the Cordis context this tool needs. */
export interface PstackScriptHost {
  readonly tools: ToolsHost;
  /** Optional: a composition without a job controller still gets the tool. */
  readonly jobs?: JobsHost;
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
    async execute(rawArgs, exec: ToolRunContext) {
      const args = parseScriptArgs(rawArgs);
      if (args.background) {
        return await runBackground(args, {
          jobs: host.jobs,
          ...(exec.agent === undefined ? {} : { caller: exec.agent.id }),
        });
      }
      return await runForeground(args, { signal: exec.signal });
    },
  };
}

/**
 * Register `pstack_script` for this row.
 *
 * `jobs` is read from the composed context rather than injected, so a profile without
 * a job controller still registers the tool and only the `background` path is refused.
 * The row declares the tool registry in `inject`; nothing else is required.
 */
export function apply(ctx: PstackScriptHost): void {
  ctx.tools.register(createPstackScriptTool(ctx));
}
