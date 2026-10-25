import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { PSTACK_MODELS_FILENAME } from "../scripts/role-manifest.ts";
import type {
  LlmCallConfig,
  SubagentActivationSpec,
  SubagentCapabilities,
} from "../src/host-contract.ts";
import { ASSETS_ROOT, POTETO_MODE_SKILL_PATH } from "../src/paths.ts";
import {
  AGENT_KINDS,
  Config,
  DEFAULT_AGENT_KIND,
  DelegationError,
  PartialDelegationError,
  PreambleError,
  TOOL_NAME,
  agentOptionsFor,
  composeChildPrompt,
  createPstackSubagentTool,
  delegate,
  loadAgentPreamble,
  parseDelegationArgs,
  planDelegation,
  resolveDelegationDepth,
  routeLabel,
  type DelegationArgs,
  type PstackSubagentConfig,
  type SubagentRuntime,
} from "../src/subagent.ts";

const tempRoots: string[] = [];
const PARENT = { id: "parent-session" };
const SIGNAL = new AbortController().signal;
const EFFORTS = ["max", "xhigh", "high", "medium", "low"];
const MODELS = ["a", "b", "c"];

afterAll(() => {
  for (const directory of tempRoots) rmSync(directory, { recursive: true, force: true });
});

function temporaryHome(): string {
  const path = mkdtempSync(join(tmpdir(), "dsh-pstack-subagent-"));
  tempRoots.push(path);
  return path;
}

interface HarnessOptions {
  readonly roleFile?: string;
  readonly assetsRoot?: string;
  readonly hostMaxDepth?: number;
  readonly capabilities?: Partial<SubagentCapabilities>;
  readonly failStartAt?: number;
  readonly provider?: string;
  readonly config?: PstackSubagentConfig;
  readonly home?: string;
}

interface Harness {
  readonly runtime: SubagentRuntime;
  readonly starts: SubagentActivationSpec[];
  readonly llmCalls: LlmCallConfig[];
  readonly config: PstackSubagentConfig;
  readonly home: string;
}

const BASE_CONFIG: PstackSubagentConfig = {
  provider: "spawn",
  maxDepth: 2,
  allowedModels: [],
  allowedAgentPresets: [],
};

function harness(options: HarnessOptions = {}): Harness {
  const home = options.home ?? temporaryHome();
  if (options.roleFile !== undefined) {
    writeFileSync(join(home, PSTACK_MODELS_FILENAME), options.roleFile, "utf8");
  }

  const starts: SubagentActivationSpec[] = [];
  const llmCalls: LlmCallConfig[] = [];
  const capabilities: SubagentCapabilities = {
    agentOptions: true,
    agentPreset: true,
    outputSchema: true,
    depthLimit: true,
    ...options.capabilities,
  };
  const providerName = options.provider ?? "spawn";
  // One stable object, like the Host registry: `getProvider` identity is part of the seam.
  const provider = { name: providerName, capabilities, inheritsParentContext: false };

  const runtime: SubagentRuntime = {
    dshHome: home,
    assetsRoot: options.assetsRoot ?? ASSETS_ROOT,
    subagents: {
      list: () => [providerName],
      getProvider: (name) => (name === providerName ? provider : undefined),
      resolveMaxDepth: (configured) =>
        configured === "provider-managed" ? undefined : (configured ?? options.hostMaxDepth),
      startActivation: async (spec) => {
        const index = starts.length;
        if (options.failStartAt === index) {
          throw new Error("backend refused the activation");
        }
        starts.push(spec);
        return { childId: `child-${index + 1}` };
      },
    },
    llm: {
      listProviders: () => [
        { id: "local", name: "Local" },
        { id: "vendor", name: "Vendor" },
      ],
      resolveModelInfo: async (provider, model) => ({
        provider,
        id: model,
        name: model,
        reasoning: { efforts: EFFORTS.map((id) => ({ id, name: id })) },
      }),
      async resolveCallConfig(config) {
        llmCalls.push(config);
        if (config.provider !== "local" && config.provider !== "vendor") {
          throw new Error(`unknown provider "${config.provider}"`);
        }
        if (!MODELS.includes(config.model)) {
          throw new Error(`unknown model "${config.model}"`);
        }
        if (config.reasoningEffort !== undefined && !EFFORTS.includes(config.reasoningEffort)) {
          throw new Error(`unsupported reasoning effort "${config.reasoningEffort}"`);
        }
        return config;
      },
    },
  };

  return { runtime, starts, llmCalls, config: options.config ?? BASE_CONFIG, home };
}

function args(overrides: Partial<DelegationArgs> = {}): DelegationArgs {
  return {
    description: "demo child",
    prompt: "Do the thing and report back.",
    agent: DEFAULT_AGENT_KIND,
    ...overrides,
  };
}

function startSpecRequest(spec: SubagentActivationSpec) {
  return spec.request;
}

function validatedConfig(value: unknown): PstackSubagentConfig {
  const result = Config["~standard"].validate(value);
  if (result.issues !== undefined) {
    throw new Error(result.issues.map((issue) => issue.message).join("; "));
  }
  return result.value;
}

describe("row Config", () => {
  it("defaults an omitted config to the spawn backend with no allowlists", () => {
    expect(validatedConfig(undefined)).toEqual({
      provider: "spawn",
      allowedModels: [],
      allowedAgentPresets: [],
    });
  });

  it("accepts the documented fields", () => {
    expect(
      validatedConfig({
        provider: "spawn",
        maxDepth: 2,
        allowedModels: [{ provider: "local", model: "a" }],
        allowedAgentPresets: ["reviewer"],
      }),
    ).toEqual({
      provider: "spawn",
      maxDepth: 2,
      allowedModels: [{ provider: "local", model: "a" }],
      allowedAgentPresets: ["reviewer"],
    });
  });

  it("rejects bad shapes by name", () => {
    const cases: readonly [unknown, string][] = [
      [{ nope: true }, "unknown field"],
      [{ maxDepth: -1 }, "maxDepth"],
      [{ maxDepth: 1.5 }, "maxDepth"],
      [{ allowedModels: [{ provider: "local" }] }, "allowedModels"],
      [{ allowedModels: [{ provider: "local", model: "a" }, { provider: "local", model: "a" }] }, "duplicate"],
      [{ allowedAgentPresets: ["a", "a"] }, "duplicate"],
    ];
    for (const [value, fragment] of cases) {
      const result = Config["~standard"].validate(value);
      expect(result.issues?.map((issue) => issue.message).join("\n"), fragment).toContain(fragment);
    }
  });
});

describe("preamble loading", () => {
  it("reads the packaged poteto-agent preamble and injects the instructions path", () => {
    const plan = planDelegation(args(), harness().runtime);

    expect(plan.prompt).toContain("You are operating as poteto-mode's full agent style.");
    expect(plan.prompt).toContain(POTETO_MODE_SKILL_PATH);
    expect(plan.prompt).toContain("Do the thing and report back.");
    expect(plan.prompt).toContain("Task:");
  });

  it("reads the packaged comment-sicko persona and injects no instructions path", () => {
    const plan = planDelegation(args({ agent: "comment-sicko" }), harness().runtime);

    expect(plan.prompt).toContain("Yes... Ha ha ha... Yes!");
    expect(plan.prompt).not.toContain(POTETO_MODE_SKILL_PATH);
  });

  it("injects no preamble for the general child", () => {
    const task = "Summarize the diff.";
    const plan = planDelegation(args({ agent: "general", prompt: task }), harness().runtime);

    expect(plan.prompt).toBe(task);
  });

  it("blocks a missing preamble instead of degrading to a plain child", () => {
    const bare = temporaryHome();
    mkdirSync(join(bare, "agents"), { recursive: true });

    expect(() => loadAgentPreamble("poteto-agent", bare)).toThrow(PreambleError);
    try {
      loadAgentPreamble("poteto-agent", bare);
    } catch (error) {
      expect((error as Error).message).toContain("poteto-agent.md");
      expect((error as Error).message).toContain('pass agent: "general"');
    }

    const run = harness({ assetsRoot: bare });
    expect(() => planDelegation(args(), run.runtime)).toThrow(PreambleError);
    expect(run.starts).toHaveLength(0);

    // `general` needs no preamble, so the same broken tree still serves it.
    expect(planDelegation(args({ agent: "general" }), run.runtime).agent).toBe("general");
  });

  it("blocks an empty preamble", () => {
    const bare = temporaryHome();
    mkdirSync(join(bare, "agents"), { recursive: true });
    writeFileSync(
      join(bare, "agents", "comment-sicko.md"),
      ["---", "name: comment-sicko", "---", ""].join("\n"),
      "utf8",
    );
    expect(() => loadAgentPreamble("comment-sicko", bare)).toThrow(/is empty/);
  });

  it("composes a self-contained prompt with injected paths", () => {
    const composed = composeChildPrompt({
      preamble: "PREAMBLE",
      injectedPaths: [{ label: "instructions", path: "/abs/SKILL.md" }],
      task: "TASK",
    });
    expect(composed.indexOf("PREAMBLE")).toBeLessThan(composed.indexOf("/abs/SKILL.md"));
    expect(composed.indexOf("/abs/SKILL.md")).toBeLessThan(composed.indexOf("TASK"));
    expect(composed).toContain("Absolute paths injected by `pstack_subagent`");
  });
});

describe("route resolution", () => {
  it("turns an exact route into agentOptions and preflights it", async () => {
    const run = harness({ roleFile: "bug-fix: local/a [xhigh]\n" });
    const result = await delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL);

    const request = startSpecRequest(run.starts[0] as SubagentActivationSpec);
    expect(request.agentOptions).toEqual({
      provider: "local",
      model: "a",
      reasoningEffort: "xhigh",
    });
    expect(run.llmCalls).toEqual([
      { provider: "local", model: "a", reasoningEffort: "xhigh" },
    ]);
    expect(result.children[0]?.route).toBe("local/a [xhigh]");
  });

  it("sends no agentOptions for inherit-parent", async () => {
    const run = harness({ roleFile: "bug-fix: inherit-parent\n" });
    await delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL);

    expect(startSpecRequest(run.starts[0] as SubagentActivationSpec).agentOptions).toBeUndefined();
    expect(run.llmCalls).toEqual([]);
  });

  it("inherits the parent route when the role has no line", async () => {
    const run = harness({ roleFile: "bug-fix: local/a\n" });
    const result = await delegate(PARENT, args({ role: "hillclimb" }), run.runtime, run.config, SIGNAL);

    expect(startSpecRequest(run.starts[0] as SubagentActivationSpec).agentOptions).toBeUndefined();
    expect(result.diagnostics.join("\n")).toContain("inherits the parent route");
  });

  it("treats a missing role file as no configuration", async () => {
    const run = harness();
    const result = await delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL);
    expect(result.children[0]?.route).toBe("inherit-parent");
  });

  it("reports an unreadable role file as an error, not as no configuration", async () => {
    const home = temporaryHome();
    mkdirSync(join(home, PSTACK_MODELS_FILENAME));
    const run = harness({ home });

    expect(() => planDelegation(args({ role: "bug-fix" }), run.runtime)).toThrow(DelegationError);
    try {
      planDelegation(args({ role: "bug-fix" }), run.runtime);
    } catch (error) {
      expect((error as Error).message).toContain("cannot be read");
      expect((error as Error).message).toContain('not "no configuration"');
    }
    expect(run.starts).toHaveLength(0);
  });

  it("rejects a route the adapter does not serve and names the role", async () => {
    const run = harness({ roleFile: "bug-fix: local/zzz\n" });
    await expect(
      delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL),
    ).rejects.toThrow(/role bug-fix resolves to local\/zzz/);
    expect(run.starts).toHaveLength(0);
  });

  it("reports the supported efforts when an effort is rejected", async () => {
    const run = harness({ roleFile: "bug-fix: local/a [ultra]\n" });
    await expect(
      delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL),
    ).rejects.toThrow(/supports these efforts: max, xhigh, high, medium, low/);
    expect(run.starts).toHaveLength(0);
  });

  it("refuses a misspelled role with a hint and never guesses", async () => {
    const run = harness({ roleFile: "arena runner: local/a\n" });
    await expect(
      delegate(PARENT, args({ role: "arena runner" }), run.runtime, run.config, SIGNAL),
    ).rejects.toThrow(/arena runners/);
    expect(run.starts).toHaveLength(0);
  });

  it("re-reads the role file on every delegation", async () => {
    const run = harness({ roleFile: "bug-fix: local/a\n" });
    await delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL);
    writeFileSync(join(run.home, PSTACK_MODELS_FILENAME), "bug-fix: vendor/b\n", "utf8");
    const second = await delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL);

    expect(second.children[0]?.route).toBe("vendor/b");
    expect(startSpecRequest(run.starts[1] as SubagentActivationSpec).agentOptions).toEqual({
      provider: "vendor",
      model: "b",
    });
  });

  it("labels a route and its agentOptions identically", () => {
    expect(routeLabel({ kind: "inherit" })).toBe("inherit-parent");
    expect(
      routeLabel({ kind: "route", provider: "local", model: "a", effort: "high" }),
    ).toBe("local/a [high]");
    expect(agentOptionsFor({ kind: "inherit" })).toBeUndefined();
  });
});

describe("cwd, preset, and depth", () => {
  it("forwards cwd and an allowlisted preset", async () => {
    const run = harness({
      config: { ...BASE_CONFIG, allowedAgentPresets: ["reviewer"] },
    });
    await delegate(
      PARENT,
      args({ cwd: "/tmp/elsewhere", agentPreset: "reviewer" }),
      run.runtime,
      run.config,
      SIGNAL,
    );

    const request = startSpecRequest(run.starts[0] as SubagentActivationSpec);
    expect(request.cwd).toBe("/tmp/elsewhere");
    expect(request.agentPreset).toBe("reviewer");
  });

  it("keeps agentPreset out of the schema without an allowlist", () => {
    const tool = createPstackSubagentTool(harness().runtime, BASE_CONFIG);
    const properties = (tool.parameters as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties)).not.toContain("agentPreset");

    const withAllowlist = createPstackSubagentTool(harness().runtime, {
      ...BASE_CONFIG,
      allowedAgentPresets: ["reviewer"],
    });
    const allowedProperties = (withAllowlist.parameters as { properties: Record<string, unknown> })
      .properties;
    expect(allowedProperties["agentPreset"]).toEqual({
      type: "string",
      enum: ["reviewer"],
      description: "An independent child preset from this row's allowlist.",
    });
  });

  it("takes the minimum of the request and the row cap", async () => {
    const run = harness({ roleFile: "bug-fix: inherit-parent\n" });

    await delegate(PARENT, args({ maxDepth: 1 }), run.runtime, run.config, SIGNAL);
    expect(startSpecRequest(run.starts[0] as SubagentActivationSpec).maxDepth).toBe(1);

    await delegate(PARENT, args(), run.runtime, run.config, SIGNAL);
    expect(startSpecRequest(run.starts[1] as SubagentActivationSpec).maxDepth).toBe(2);
  });

  it("refuses a request above the row cap instead of clamping silently", async () => {
    const run = harness();
    await expect(
      delegate(PARENT, args({ maxDepth: 3 }), run.runtime, run.config, SIGNAL),
    ).rejects.toThrow(/exceeds this row's configured cap of 2/);
    expect(run.starts).toHaveLength(0);
  });

  it("falls back to the Host setting when the row sets no cap", async () => {
    const run = harness({
      hostMaxDepth: 1,
      config: { ...BASE_CONFIG, maxDepth: undefined },
    });
    await delegate(PARENT, args(), run.runtime, run.config, SIGNAL);
    expect(startSpecRequest(run.starts[0] as SubagentActivationSpec).maxDepth).toBe(1);
  });

  it("resolves depth as a pure minimum", () => {
    expect(resolveDelegationDepth(2, 1, 2)).toBe(1);
    expect(resolveDelegationDepth(2, undefined, 2)).toBe(2);
    expect(resolveDelegationDepth(undefined, undefined, 1)).toBe(1);
    expect(resolveDelegationDepth(undefined, undefined, undefined)).toBeUndefined();
    expect(() => resolveDelegationDepth(1, 2, 1)).toThrow(/exceeds this row/);
    expect(() => resolveDelegationDepth(2, -1, 2)).toThrow(/non-negative safe integer/);
  });
});

describe("panels", () => {
  it("expands each of the three automatic panels to one child per entry", async () => {
    const roleFile = [
      "arena runners: local/a [max], vendor/b [xhigh]",
      "architect runners: local/a, vendor/b",
      "interrogate reviewers: local/a, vendor/b, inherit-parent",
    ].join("\n");

    for (const [role, expected] of [
      ["arena runners", 2],
      ["architect runners", 2],
      ["interrogate reviewers", 3],
    ] as const) {
      const run = harness({ roleFile });
      const result = await delegate(PARENT, args({ role }), run.runtime, run.config, SIGNAL);
      expect(result.kind, role).toBe("activations");
      expect(result.children, role).toHaveLength(expected);
      expect(run.starts, role).toHaveLength(expected);
      expect(new Set(result.children.map((child) => child.label)).size, role).toBe(expected);
    }
  });

  it("labels a same-route panel as not a cross-model review", async () => {
    const run = harness({ roleFile: "arena runners: local/a, local/a\n" });
    const result = await delegate(
      PARENT,
      args({ role: "arena runners" }),
      run.runtime,
      run.config,
      SIGNAL,
    );
    expect(result.children).toHaveLength(2);
    expect(result.diagnostics.join("\n")).toContain("not a cross-model review");
  });

  it("labels a single-entry panel as claiming no model diversity", async () => {
    const run = harness({ roleFile: "architect runners: local/a\n" });
    const result = await delegate(
      PARENT,
      args({ role: "architect runners" }),
      run.runtime,
      run.config,
      SIGNAL,
    );
    expect(result.children).toHaveLength(1);
    expect(result.diagnostics.join("\n")).toContain("one configured entry");
    expect(result.diagnostics.join("\n")).toContain("claims no model diversity");
  });

  it("labels an all-inherit panel the same way", async () => {
    const run = harness({ roleFile: "interrogate reviewers: inherit-parent, inherit-parent\n" });
    const result = await delegate(
      PARENT,
      args({ role: "interrogate reviewers" }),
      run.runtime,
      run.config,
      SIGNAL,
    );
    expect(result.diagnostics.join("\n")).toContain("not a cross-model review");
  });

  it("does not fan out the arena cross-judge pool", async () => {
    const run = harness({ roleFile: "arena cross-judge pool: local/a, vendor/b, vendor/c\n" });
    const first = await delegate(
      PARENT,
      args({ role: "arena cross-judge pool" }),
      run.runtime,
      run.config,
      SIGNAL,
    );
    expect(first.kind).toBe("activation");
    expect(first.children[0]?.route).toBe("local/a");
    expect(first.diagnostics.join("\n")).toContain("not an automatic panel");

    const chosen = await delegate(
      PARENT,
      args({ role: "arena cross-judge pool", roleIndex: 2 }),
      run.runtime,
      run.config,
      SIGNAL,
    );
    expect(chosen.children[0]?.route).toBe("vendor/c");
  });

  it("refuses roleIndex on an automatic panel", async () => {
    const run = harness({ roleFile: "arena runners: local/a, vendor/b\n" });
    await expect(
      delegate(
        PARENT,
        args({ role: "arena runners", roleIndex: 1 }),
        run.runtime,
        run.config,
        SIGNAL,
      ),
    ).rejects.toThrow(/automatic panel/);
    expect(run.starts).toHaveLength(0);
  });

  it("reminds the caller that swarm workers start one at a time", async () => {
    const run = harness({ roleFile: "swarm workers: local/a\n" });
    const result = await delegate(
      PARENT,
      args({ role: "swarm workers" }),
      run.runtime,
      run.config,
      SIGNAL,
    );
    expect(result.children).toHaveLength(1);
    expect(result.diagnostics.join("\n")).toContain("start each worker");
  });
});

describe("partial starts", () => {
  it("keeps the children already started and names them", async () => {
    const run = harness({
      roleFile: "arena runners: local/a, vendor/b, vendor/c\n",
      failStartAt: 1,
    });

    let failure: unknown;
    try {
      await delegate(PARENT, args({ role: "arena runners" }), run.runtime, run.config, SIGNAL);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(PartialDelegationError);
    const message = (failure as Error).message;
    expect(message).toContain("child-1");
    expect(message).toContain("entry 2 of 3");
    expect(message).toContain("not rolled back");
    expect((failure as PartialDelegationError).startedChildren.map((c) => c.childId)).toEqual([
      "child-1",
    ]);
  });

  it("reports a first-entry failure without a partial list", async () => {
    const run = harness({
      roleFile: "arena runners: local/a, vendor/b\n",
      failStartAt: 0,
    });
    await expect(
      delegate(PARENT, args({ role: "arena runners" }), run.runtime, run.config, SIGNAL),
    ).rejects.toThrow(/failed: backend refused the activation/);
  });
});

describe("row policy and capabilities", () => {
  it("enforces the row's own allowedModels before starting anything", async () => {
    const run = harness({
      roleFile: "bug-fix: vendor/b\n",
      config: { ...BASE_CONFIG, allowedModels: [{ provider: "local", model: "a" }] },
    });

    await expect(
      delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL),
    ).rejects.toThrow(/not authorize|does not authorize/);
    expect(run.starts).toHaveLength(0);
  });

  it("lets an inheriting call through an allowlist, because it selects no route", async () => {
    const run = harness({
      config: { ...BASE_CONFIG, allowedModels: [{ provider: "local", model: "a" }] },
    });
    const result = await delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL);
    expect(result.children[0]?.route).toBe("inherit-parent");
  });

  it("refuses agentOptions when the backend cannot enforce them", async () => {
    const run = harness({
      roleFile: "bug-fix: local/a\n",
      capabilities: { agentOptions: false },
    });
    await expect(
      delegate(PARENT, args({ role: "bug-fix" }), run.runtime, run.config, SIGNAL),
    ).rejects.toThrow(/does not support agentOptions/);
    expect(run.starts).toHaveLength(0);
  });

  it("refuses a depth when the backend cannot enforce it", async () => {
    const run = harness({ capabilities: { depthLimit: false, agentOptions: true } });
    await expect(delegate(PARENT, args(), run.runtime, run.config, SIGNAL)).rejects.toThrow(
      /does not support maxDepth/,
    );
  });

  it("refuses a preset when the backend cannot enforce it", async () => {
    const run = harness({
      capabilities: { agentPreset: false },
      config: { ...BASE_CONFIG, allowedAgentPresets: ["reviewer"] },
    });
    await expect(
      delegate(PARENT, args({ agentPreset: "reviewer" }), run.runtime, run.config, SIGNAL),
    ).rejects.toThrow(/does not support agentPreset/);
  });

  it("names the registered providers when the configured one is absent", async () => {
    const run = harness({ provider: "spawn" });
    await expect(
      delegate(PARENT, args(), run.runtime, { ...BASE_CONFIG, provider: "acp" }, SIGNAL),
    ).rejects.toThrow(/registered providers: spawn/);
    expect(run.starts).toHaveLength(0);
  });
});

describe("arguments", () => {
  it("defaults the agent kind and accepts only the three pstack kinds", () => {
    expect(parseDelegationArgs({ description: "d", prompt: "p" }).agent).toBe(DEFAULT_AGENT_KIND);
    expect(AGENT_KINDS).toEqual(["poteto-agent", "comment-sicko", "general"]);
    expect(() =>
      parseDelegationArgs({ description: "d", prompt: "p", agent: "reviewer-preset" }),
    ).toThrow(/accepted kinds|Accepted kinds/);
  });

  it("requires roleIndex to travel with role", () => {
    expect(() => parseDelegationArgs({ description: "d", prompt: "p", roleIndex: 1 })).toThrow(
      /roleIndex requires role/,
    );
    expect(() =>
      parseDelegationArgs({ description: "d", prompt: "p", role: "bug-fix", roleIndex: -1 }),
    ).toThrow(/non-negative safe integer/);
  });

  it("rejects an unknown argument by name", () => {
    expect(() => parseDelegationArgs({ description: "d", prompt: "p", readonly: true })).toThrow(
      /unknown argument "readonly"/,
    );
    expect(() =>
      parseDelegationArgs({ description: "d", prompt: "p", agentPreset: "reviewer" }),
    ).toThrow(/allowedAgentPresets/);
  });

  it("rejects an empty description or prompt", () => {
    expect(() => parseDelegationArgs({ description: "  ", prompt: "p" })).toThrow(/description/);
    expect(() => parseDelegationArgs({ description: "d", prompt: "" })).toThrow(/prompt/);
  });
});

describe("tool wiring", () => {
  it("registers a tool whose schema and output describe the activation result", async () => {
    const run = harness();
    const tool = createPstackSubagentTool(run.runtime, run.config);

    expect(tool.name).toBe(TOOL_NAME);
    expect(tool.description).toContain("completion notice");
    expect(tool.description).not.toContain("arena runners");
    expect(tool.isConcurrencySafe?.({})).toBe(true);

    const parameters = tool.parameters as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, unknown>;
    };
    expect(parameters.required).toEqual(["description", "prompt"]);
    expect(parameters.additionalProperties).toBe(false);
    expect(Object.keys(parameters.properties)).toEqual([
      "description",
      "prompt",
      "agent",
      "role",
      "cwd",
      "maxDepth",
      "roleIndex",
    ]);

    const value = await tool.execute(
      { description: "demo", prompt: "work" },
      {
        name: TOOL_NAME,
        arguments: {},
        agent: PARENT,
        signal: SIGNAL,
        deferContext: () => {},
        concludeTurn: () => {},
      },
    );
    const rendered = tool.output.render({}, value);
    expect(rendered[0]?.type).toBe("text");
    expect(rendered[0]?.text as string).toContain("child-1");
    expect(rendered[0]?.text as string).toContain("do not poll");
  });

  it("fails when there is no calling Agent", async () => {
    const run = harness();
    const tool = createPstackSubagentTool(run.runtime, run.config);
    await expect(
      tool.execute(
        { description: "demo", prompt: "work" },
        {
          name: TOOL_NAME,
          arguments: {},
          signal: SIGNAL,
          deferContext: () => {},
          concludeTurn: () => {},
        },
      ),
    ).rejects.toThrow(/exec.agent was undefined/);
  });

  it("delivers results to the parent", async () => {
    const run = harness();
    const tool = createPstackSubagentTool(run.runtime, run.config);
    await tool.execute(
      { description: "demo", prompt: "work" },
      {
        name: TOOL_NAME,
        arguments: {},
        agent: PARENT,
        signal: SIGNAL,
        deferContext: () => {},
        concludeTurn: () => {},
      },
    );
    expect(run.starts[0]?.delivery).toBe("parent");
    expect(run.starts[0]?.provider).toBe("spawn");
    expect(run.starts[0]?.label).toBe("demo");
  });
});
