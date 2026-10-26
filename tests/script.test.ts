import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_OUTPUT_LIMIT_BYTES,
  MAX_TIMEOUT_MS,
  SCRIPT_IDS,
  ScriptInputError,
  TOOL_NAME,
  OUTPUT_SCHEMA,
  buildScriptParameters,
  apply,
  createPstackScriptTool,
  inject,
  name as rowName,
  parseScriptArgs,
  renderScriptOutcome,
  resolveWorkingDirectory,
  runBackground,
  runForeground,
  scriptEnvironment,
  scriptPath,
} from "../src/script.ts";
import type { JobId, JobSpec, JobsHost, JobView } from "../src/host-contract.ts";
import type { PstackScriptHost } from "../src/script.ts";
import { assertSupportedJsonSchema, jsonSchemaToTs, violations } from "./host-schema.ts";
import { ROOT } from "../scripts/build-assets.ts";

const fixtures: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "dsh-pstack-script-"));
  fixtures.push(directory);
  return directory;
}

/**
 * A `PstackScriptHost` whose Session directory the test controls.
 *
 * `ensure` is the seam the real row calls before spawning, so returning a fixture
 * directory is what makes "where did the child actually run" observable.
 */
function host(
  options: { readonly cwd?: string; readonly getJobs?: () => JobsHost | undefined } = {},
): PstackScriptHost {
  return {
    tools: { register: () => () => {} },
    workingDirectory: {
      ensure: async () => options.cwd ?? temporaryDirectory(),
    },
    ...(options.getJobs === undefined ? {} : { getJobs: options.getJobs }),
  };
}

/** A fake registry that records specs and reports a fixed view. */
function fakeJobs(status: JobView["status"] = "running"): {
  readonly jobs: JobsHost;
  readonly specs: JobSpec[];
} {
  const specs: JobSpec[] = [];
  const views = new Map<string, JobView>();
  const jobs: JobsHost = {
    start(spec) {
      specs.push(spec);
      const id = `bash-${specs.length}` as JobId;
      views.set(id, {
        id,
        kind: spec.kind,
        label: spec.label,
        status,
        startedAt: Date.now(),
        output: { total: 0, earliest: 0 },
      });
      return id;
    },
    get(id) {
      const view = views.get(id);
      if (view === undefined) throw new Error(`unknown job ${id}`);
      return view;
    },
  };
  return { jobs, specs };
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("pstack_script argument validation", () => {
  it("accepts the documented shape and defaults", () => {
    const args = parseScriptArgs({ id: "log", args: ["a", "b"] });
    expect(args.id).toBe("log");
    expect(args.args).toEqual(["a", "b"]);
    expect(args.background).toBe(false);
    expect("cwd" in args).toBe(false);
    expect("timeoutMs" in args).toBe(false);
  });

  it("defaults args to an empty array", () => {
    expect(parseScriptArgs({ id: "check-plan" }).args).toEqual([]);
  });

  it("rejects any id that is not a bundled script", () => {
    for (const id of ["../../bin/sh", "/usr/bin/env", "bash", "orch.mjs", "Orch"]) {
      expect(() => parseScriptArgs({ id }), id).toThrow(/must be one of/);
    }
  });

  it("rejects a non-string or unknown field instead of ignoring it", () => {
    expect(() => parseScriptArgs({ id: "log", args: "a b" })).toThrow(/"args" must be an array/);
    expect(() => parseScriptArgs({ id: "log", args: [1] })).toThrow(/only strings/);
    expect(() => parseScriptArgs({ id: "log", command: "rm -rf /" })).toThrow(/unknown argument/);
    expect(() => parseScriptArgs({ id: "log", background: "yes" })).toThrow(/"background" must be/);
    expect(() => parseScriptArgs({ id: "log", cwd: "  " })).toThrow(/"cwd" must be/);
  });

  it("bounds timeout and output limits", () => {
    expect(() => parseScriptArgs({ id: "log", timeoutMs: 0 })).toThrow(/positive integer/);
    expect(() => parseScriptArgs({ id: "log", timeoutMs: MAX_TIMEOUT_MS + 1 })).toThrow(
      new RegExp(`at most ${MAX_TIMEOUT_MS}`),
    );
    expect(() => parseScriptArgs({ id: "log", outputLimitBytes: -1 })).toThrow(/positive integer/);
  });

  it("publishes an enum of exactly the shipped ids", () => {
    const parameters = buildScriptParameters() as {
      properties: { id: { enum: string[] } };
      required: string[];
    };
    expect(parameters.properties.id.enum).toEqual([...SCRIPT_IDS]);
    expect(parameters.required).toEqual(["id"]);
    expect(parameters.properties.id.enum).not.toContain("bash");
  });
});

describe("shipped artifact resolution", () => {
  it("resolves every id to an existing file inside assets/", () => {
    for (const id of SCRIPT_IDS) {
      const path = scriptPath(id);
      expect(path.startsWith(join(ROOT, "assets")), path).toBe(true);
      expect(path.endsWith(".mjs"), path).toBe(true);
      expect(readFileSync(path, "utf8").startsWith("#!/usr/bin/env node\n"), path).toBe(true);
    }
  });

  it("rejects an id it does not ship", () => {
    expect(() => scriptPath("bash" as never)).toThrow(ScriptInputError);
  });
});

describe("the Electron selector", () => {
  it("adds ELECTRON_RUN_AS_NODE only when the runtime is Electron", () => {
    const plain = scriptEnvironment({ PATH: "/usr/bin" }, { node: "24.0.0" } as { readonly electron?: string });
    expect(plain["ELECTRON_RUN_AS_NODE"]).toBeUndefined();
    expect(plain["PATH"]).toBe("/usr/bin");

    const electron = scriptEnvironment(
      { PATH: "/Applications/DSH.app/Contents/MacOS" },
      { node: "22.0.0", electron: "30.0.0" } as { readonly electron?: string },
    );
    // Desktop keeps the flag only for child startup; without it the Desktop binary
    // would open a window instead of running the script.
    expect(electron["ELECTRON_RUN_AS_NODE"]).toBe("1");
    expect(electron["PATH"]).toBe("/Applications/DSH.app/Contents/MacOS");
  });

  it("never mutates the environment it was given", () => {
    const base: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    scriptEnvironment(base, { node: "22.0.0", electron: "30.0.0" } as { readonly electron?: string });
    expect(base["ELECTRON_RUN_AS_NODE"]).toBeUndefined();
  });

  it("treats an empty-string electron version as Electron", () => {
    const env = scriptEnvironment({}, { electron: "" } as { readonly electron?: string });
    expect(env["ELECTRON_RUN_AS_NODE"]).toBe("1");
  });
});

describe("foreground execution", () => {
  it("runs a bundled script with process.execPath and returns its exit code", async () => {
    const args = parseScriptArgs({ id: "log", args: [] });
    const result = await runForeground(args);
    expect(result.kind).toBe("foreground");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("usage: log.mjs");
    expect(result.signal).toBeNull();
    expect(result.timedOut).toBe(false);
  });

  it("returns stdout for a successful run", async () => {
    const directory = temporaryDirectory();
    const args = parseScriptArgs({
      id: "log",
      args: [join(directory, "decisions.tsv"), "phase", "decision", "why", "ev", "result"],
    });
    const result = await runForeground(args);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(readFileSync(join(directory, "decisions.tsv"), "utf8")).toContain("phase\tdecision");
  });

  it("passes cwd through to the child", async () => {
    const directory = temporaryDirectory();
    const args = parseScriptArgs({ id: "log", args: ["rel.tsv", "p", "d", "w", "e", "r"], cwd: directory });
    const result = await runForeground(args);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(directory, "rel.tsv"), "utf8")).toContain("p\td");
  });

  it("reports a timeout explicitly instead of hanging", async () => {
    const args = parseScriptArgs({ id: "log", args: [], timeoutMs: 1 });
    const result = await runForeground(args);
    // Either the process finished before the 1 ms timer, or it was killed. Both are
    // legitimate; what matters is that the call returns and says which happened.
    expect(result.kind).toBe("foreground");
    expect(result.exitCode + (result.timedOut ? 1 : 0)).toBeGreaterThan(0);
  });

  it("truncates at the output limit and says so", async () => {
    const args = parseScriptArgs({ id: "log", args: [], outputLimitBytes: 4 });
    const result = await runForeground(args);
    expect(result.stderr.length).toBeLessThanOrEqual(4);
    expect(result.stderrTruncated).toBe(true);
  });

  it("has a sane default output limit", () => {
    expect(DEFAULT_OUTPUT_LIMIT_BYTES).toBeGreaterThan(1024);
  });
});

describe("background execution", () => {
  it("refuses with a reason when the composition has no jobs service", async () => {
    const args = parseScriptArgs({ id: "log", args: [], background: true });
    await expect(runBackground(args, { jobs: undefined })).rejects.toThrow(/needs the Host jobs service/);
  });

  it("starts a job and reports its id without polling", async () => {
    const { jobs, specs } = fakeJobs();
    const args = parseScriptArgs({ id: "worktree-audit", args: ["--help"], background: true });
    const result = await runBackground(args, { jobs });
    expect(result.kind).toBe("background");
    expect(result.jobId).toBe("bash-1");
    expect(result.id).toBe("worktree-audit");
    expect(specs).toHaveLength(1);
    expect(specs[0]?.label).toContain("pstack_script worktree-audit");
  });

  it("surfaces a failed start instead of reporting a running job", async () => {
    const { jobs } = fakeJobs("failed");
    const args = parseScriptArgs({ id: "log", args: [], background: true });
    await expect(runBackground(args, { jobs })).rejects.toThrow(/failed to start/);
  });
});

describe("rendering", () => {
  it("states the exit code and shows both streams", () => {
    const text = renderScriptOutcome({
      kind: "foreground",
      id: "log",
      exitCode: 1,
      signal: null,
      timedOut: false,
      stdout: "out\n",
      stderr: "err\n",
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 5,
    });
    expect(text).toContain("log exited with code 1");
    expect(text).toContain("stdout:");
    expect(text).toContain("err");
    expect(text).toContain("do not report success");
  });

  it("does not claim failure for a clean run", () => {
    const text = renderScriptOutcome({
      kind: "foreground",
      id: "log",
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 2,
    });
    expect(text).toContain("exited with code 0");
    expect(text).not.toContain("do not report success");
  });

  it("names a signal and a timeout when they happened", () => {
    const text = renderScriptOutcome({
      kind: "foreground",
      id: "log",
      exitCode: 1,
      signal: "SIGKILL",
      timedOut: true,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 120_000,
    });
    expect(text).toContain("signal SIGKILL");
    expect(text).toContain("after the timeout");
  });

  it("explains a background start and says not to poll", () => {
    const text = renderScriptOutcome({
      kind: "background",
      id: "orch",
      jobId: "bash-9",
      status: "running",
    });
    expect(text).toContain("bash-9");
    expect(text).toContain("does not poll");
  });
});

describe("tool registration", () => {
  it("declares the row name and the inject list Cordis needs", () => {
    expect(rowName).toBe("pstack-script");
    // Without this list Cordis runs `apply` immediately and `ctx.tools` throws
    // `cannot get property "tools" without inject`, so the row registers nothing.
    // `workingDirectory` resolves the session directory each run starts in (§5).
    expect(inject).toEqual(["tools", "workingDirectory"]);
    // `jobs` must stay out: a profile with no job controller still gets the tool,
    // and only `background: true` is refused.
    expect(inject).not.toContain("jobs");
  });

  it("registers one tool with a closed id enum", () => {
    const registered: string[] = [];
    const tool = createPstackScriptTool({
      tools: {
        register(definition) {
          registered.push(definition.name);
          return () => {};
        },
      },
      workingDirectory: { ensure: async () => temporaryDirectory() },
    });
    expect(tool.name).toBe(TOOL_NAME);
    expect(registered).toEqual([]);
    const parameters = tool.parameters as { properties: { id: { enum: string[] } } };
    expect(parameters.properties.id.enum).toEqual([...SCRIPT_IDS]);
  });

  it("reaches a real process through execute", async () => {
    const tool = createPstackScriptTool(host());
    const value = (await tool.execute(
      { id: "log", args: [] },
      { name: TOOL_NAME, callId: "c1", arguments: {}, signal: new AbortController().signal } as never,
    )) as { kind: string; exitCode: number };
    expect(value.kind).toBe("foreground");
    expect(value.exitCode).toBe(1);
  });

  it("refuses a background call through execute when jobs is absent", async () => {
    const tool = createPstackScriptTool(host());
    await expect(
      tool.execute(
        { id: "log", args: [], background: true },
        { name: TOOL_NAME, callId: "c1", arguments: {}, signal: new AbortController().signal } as never,
      ),
    ).rejects.toThrow(/needs the Host jobs service/);
  });

  it("reads the job controller per call, so one mounted later is seen", async () => {
    const { jobs, specs } = fakeJobs();
    let mounted: JobsHost | undefined;
    const tool = createPstackScriptTool(
      host({ getJobs: () => mounted }),
    );

    // Before the controller exists, the background path is refused...
    await expect(
      tool.execute(
        { id: "log", args: [], background: true },
        { name: TOOL_NAME, callId: "c1", arguments: {}, signal: new AbortController().signal } as never,
      ),
    ).rejects.toThrow(/needs the Host jobs service/);

    // ...and it is not a snapshot: the same tool sees a controller mounted after
    // construction, which a value read once in `apply` could never do.
    mounted = jobs;
    const value = (await tool.execute(
      { id: "log", args: [], background: true },
      { name: TOOL_NAME, callId: "c2", arguments: {}, signal: new AbortController().signal } as never,
    )) as { kind: string };
    expect(value.kind).toBe("background");
    expect(specs).toHaveLength(1);
  });

  it("reads jobs through ctx.get in apply, not a captured field", () => {
    const registered: string[] = [];
    const reads: string[] = [];
    const ctx = {
      tools: {
        register(definition: { name: string }) {
          registered.push(definition.name);
          return () => {};
        },
      },
      workingDirectory: { ensure: async () => temporaryDirectory() },
      get(service: string) {
        reads.push(service);
        return undefined;
      },
    };
    apply(ctx as never);
    expect(registered).toEqual([TOOL_NAME]);
    // `apply` itself does not read the optional service; each call does.
    expect(reads).toEqual([]);
  });
});

describe("the child runs in the session's directory", () => {
  /** A directory with one script that prints its own working directory. */
  function cwdReporter(): string {
    const directory = temporaryDirectory();
    const file = join(directory, "print-cwd.mjs");
    writeFileSync(file, 'process.stdout.write(process.cwd());\n');
    return file;
  }

  it("resolves an omitted cwd to the session directory, not the Host's", async () => {
    const session = temporaryDirectory();
    const reporter = cwdReporter();
    // Drive the resolver through the same seam `execute` uses. Running a shipped
    // artefact is not possible here because none of them print their cwd, and
    // adding one to the package to satisfy a test would ship dead code.
    const args = parseScriptArgs({ id: "log", args: [] });
    const cwd = resolveWorkingDirectory(args.cwd, session);
    expect(cwd).toBe(resolve(session));
    expect(cwd).not.toBe(resolve(process.cwd()));
    // And the child really lands there.
    const child = spawnSync(process.execPath, [reporter], { cwd, encoding: "utf8" });
    expect(child.stdout).toBe(resolve(session));
  });

  it("resolves a relative cwd against the session directory", () => {
    const session = temporaryDirectory();
    const nested = join(session, "sub");
    mkdirSync(nested);
    const args = parseScriptArgs({ id: "log", args: [], cwd: "sub" });
    expect(resolveWorkingDirectory(args.cwd, session)).toBe(resolve(nested));
  });

  it("uses an absolute cwd as given", () => {
    const session = temporaryDirectory();
    const other = temporaryDirectory();
    const args = parseScriptArgs({ id: "log", args: [], cwd: other });
    expect(resolveWorkingDirectory(args.cwd, session)).toBe(resolve(other));
  });

  it("puts relative paths inside the session directory during a real run", async () => {
    // The end-to-end shape of the defect: `log` writes a TSV relative to its cwd,
    // so with the fix the file lands in the session directory.
    const session = temporaryDirectory();
    const tool = createPstackScriptTool(host({ cwd: session }));
    const value = (await tool.execute(
      { id: "log", args: ["decisions.tsv", "phase", "decision", "why", "ev", "result"] },
      {
        name: TOOL_NAME,
        callId: "c-cwd",
        arguments: {},
        agent: { id: "s-1" },
        signal: new AbortController().signal,
      } as never,
    )) as { exitCode: number };
    expect(value.exitCode).toBe(0);
    expect(readFileSync(join(session, "decisions.tsv"), "utf8")).toContain("phase\tdecision");
  });

  it("asks the Host for the session directory on every call", async () => {
    const calls: string[] = [];
    const tool = createPstackScriptTool({
      tools: { register: () => () => {} },
      workingDirectory: {
        ensure: async (agent) => {
          calls.push(agent.id);
          return temporaryDirectory();
        },
      },
    });
    await tool.execute(
      { id: "log", args: [] },
      {
        name: TOOL_NAME,
        callId: "c1",
        arguments: {},
        agent: { id: "s-1" },
        signal: new AbortController().signal,
      } as never,
    );
    expect(calls).toEqual(["s-1"]);
  });

  it("does not ask for a session directory when there is no Agent", async () => {
    let asked = 0;
    const tool = createPstackScriptTool({
      tools: { register: () => () => {} },
      workingDirectory: {
        ensure: async () => {
          asked += 1;
          return temporaryDirectory();
        },
      },
    });
    await tool.execute(
      { id: "log", args: [] },
      { name: TOOL_NAME, callId: "c1", arguments: {}, signal: new AbortController().signal } as never,
    );
    expect(asked).toBe(0);
  });
});

describe("the declared output schema accepts every outcome the tool produces", () => {
  /** A foreground result with an overridable terminating signal. */
  function foreground(signal: NodeJS.Signals | null): Record<string, unknown> {
    return {
      kind: "foreground",
      id: "log",
      exitCode: signal === null ? 0 : 1,
      signal,
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 7,
    };
  }

  it("is inside the Host's supported schema subset", () => {
    // `minimum`, `format`, and type arrays are outside it; asserting the subset
    // here is what keeps a future edit from silently degrading the generated SDK.
    expect(() => assertSupportedJsonSchema(OUTPUT_SCHEMA)).not.toThrow();
    expect(jsonSchemaToTs(OUTPUT_SCHEMA as never)).not.toBe("unknown");
  });

  it("accepts a clean exit, where the signal is null", () => {
    // The regression this section exists for: before the fix, this value was the
    // tool's most common output and the Host rejected it.
    expect(violations(OUTPUT_SCHEMA, foreground(null))).toEqual([]);
  });

  it("accepts a signal-terminated exit", () => {
    expect(violations(OUTPUT_SCHEMA, foreground("SIGKILL"))).toEqual([]);
  });

  it("accepts a background result", () => {
    const value = { kind: "background", id: "watch-pr", jobId: "bash-1", status: "running" };
    expect(violations(OUTPUT_SCHEMA, value)).toEqual([]);
  });

  it("rejects a foreground result that omits a field the model reads", () => {
    const { exitCode: _omitted, ...withoutExitCode } = foreground(null);
    expect(violations(OUTPUT_SCHEMA, withoutExitCode).length).toBeGreaterThan(0);
  });

  it("rejects a value that mixes the two kinds", () => {
    const mixed = { ...foreground(null), jobId: "bash-1" };
    expect(violations(OUTPUT_SCHEMA, mixed).length).toBeGreaterThan(0);
  });

  it("accepts what runForeground really returns for a clean exit", async () => {
    const result = await runForeground(parseScriptArgs({ id: "worktree-audit", args: ["--help"] }));
    expect(result.signal).toBeNull();
    expect(violations(OUTPUT_SCHEMA, result)).toEqual([]);
  });

  it("accepts what a real failing run returns", async () => {
    // `log` with no arguments writes a usage line and exits 1.
    const result = await runForeground(parseScriptArgs({ id: "log", args: [] }));
    expect(result.exitCode).toBe(1);
    expect(result.signal).toBeNull();
    expect(violations(OUTPUT_SCHEMA, result)).toEqual([]);
  });
});
