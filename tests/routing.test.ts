/**
 * End-to-end route assembly: role file → planned route → the activation request.
 *
 * This is the seam where a lost effort token is *silent*. A role line that reads
 * `xhigh` but reaches the child as no effort at all produces a working child on a
 * different level, and nothing in the completion notice says so. So every case here
 * asserts the options the child actually receives, and the order the checks run in.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { fakeAgent, type FakeAgent } from "./fake-agent.ts";
import { PSTACK_MODELS_FILENAME } from "../scripts/role-manifest.ts";
import type {
  LlmCallConfig,
  LlmHost,
  SubagentActivationSpec,
  SubagentsHost,
} from "../src/host-contract.ts";
import { ASSETS_ROOT } from "../src/paths.ts";
import { validateEffortFor } from "../src/effort.ts";
import {
  DelegationError,
  agentOptionsFor,
  createPstackSubagentTool,
  delegate,
  parseDelegationArgs,
  planDelegation,
  type DelegationArgs,
  type PstackSubagentConfig,
  type SubagentRuntime,
} from "../src/subagent.ts";

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

const SIGNAL = new AbortController().signal;

/** Each fake model advertises a different vocabulary, so no token can be assumed. */
const MODEL_EFFORTS: Readonly<Record<string, readonly string[]>> = {
  // The default pair in most cases below.
  "local/a": ["deep", "normal", "shallow"],
  "local/b": ["deep", "normal"],
  // Advertises nothing: a model with no reasoning control.
  "local/plain": [],
  // A different vocabulary entirely, to prove the set is per route.
  "vendor/c": ["careful", "quick"],
};

const CONFIG: PstackSubagentConfig = {
  provider: "spawn",
  maxDepth: 2,
  allowedModels: [],
  allowedAgentPresets: [],
};

interface Harness {
  readonly runtime: SubagentRuntime;
  readonly starts: SubagentActivationSpec[];
  readonly configCalls: LlmCallConfig[];
  readonly home: string;
  /** Every fake child the harness created, in start order. */
  readonly created: readonly FakeAgent[];
}

function harness(roleFile: string, options: { readonly withAgents?: boolean } = {}): Harness {
  const home = mkdtempSync(join(tmpdir(), "dsh-pstack-routing-"));
  directories.push(home);
  writeFileSync(join(home, PSTACK_MODELS_FILENAME), roleFile, "utf8");

  const starts: SubagentActivationSpec[] = [];
  const configCalls: LlmCallConfig[] = [];

  const llm: LlmHost = {
    listProviders: () => [
      { id: "local", name: "Local" },
      { id: "vendor", name: "Vendor" },
    ],
    async resolveModelInfo(provider, model) {
      const efforts = MODEL_EFFORTS[`${provider}/${model}`];
      if (efforts === undefined) throw new Error(`unknown model "${provider}/${model}"`);
      return {
        provider,
        id: model,
        name: model,
        ...(efforts.length === 0
          ? {}
          : { reasoning: { efforts: efforts.map((id) => ({ id, name: id })) } }),
      };
    },
    async resolveCallConfig(config) {
      configCalls.push(config);
      const efforts = MODEL_EFFORTS[`${config.provider}/${config.model}`];
      if (efforts === undefined) throw new Error(`unknown model "${config.provider}/${config.model}"`);
      if (config.reasoningEffort !== undefined && !efforts.includes(config.reasoningEffort)) {
        throw new Error(`unsupported reasoning effort "${config.reasoningEffort}"`);
      }
      return config;
    },
  };

  const created: FakeAgent[] = [];
  const provider = {
    name: "spawn",
    capabilities: {
      agentOptions: true,
      agentPreset: true,
      outputSchema: true,
      depthLimit: true,
    },
    inheritsParentContext: false,
  };
  const subagents: SubagentsHost = {
    list: () => ["spawn"],
    getProvider: (name) => (name === "spawn" ? provider : undefined),
    resolveMaxDepth: (configured) =>
      configured === "provider-managed" ? undefined : (configured ?? 2),
    async startActivation(spec) {
      starts.push(spec);
      const child = fakeAgent({
        id: `child-${starts.length}`,
        ...(spec.request.agentOptions?.provider === undefined
          ? {}
          : { provider: spec.request.agentOptions.provider }),
        ...(spec.request.agentOptions?.model === undefined
          ? {}
          : { model: spec.request.agentOptions.model }),
        // `requestHeader` returns undefined until the child makes its first request,
        // which is the state an inherit-parent override has to cope with.
      });
      created.push(child);
      return { childId: child.agent.id };
    },
  };

  const agents = {
    get: (id: string) => created.map((child) => child.agent).find((agent) => agent.id === id),
  };

  return {
    runtime: {
      subagents,
      llm,
      ...(options.withAgents === false ? {} : { agents }),
      dshHome: home,
      assetsRoot: ASSETS_ROOT,
    },
    starts,
    configCalls,
    home,
    created,
  };
}

function args(overrides: Partial<DelegationArgs> = {}): DelegationArgs {
  return {
    description: "demo child",
    prompt: "Do the thing and report back.",
    agent: "general",
    ...overrides,
  };
}

/** The `agentOptions` the single started child received. */
function soleAgentOptions(started: readonly SubagentActivationSpec[]) {
  expect(started).toHaveLength(1);
  return started[0]?.request.agentOptions;
}

const SINGLE_ROLE = "bug-fix: local/a [normal]";

describe("the role line is a starting baseline", () => {
  it("sends the role line's effort when the call names none", async () => {
    const run = harness(SINGLE_ROLE);
    await delegate(fakeAgent().agent, args({ role: "bug-fix" }), run.runtime, CONFIG, SIGNAL);
    expect(soleAgentOptions(run.starts)).toEqual({
      provider: "local",
      model: "a",
      reasoningEffort: "normal",
    });
  });

  it("lets the call raise it, and reports the raised level back", async () => {
    const run = harness(SINGLE_ROLE);
    const result = await delegate(
      fakeAgent().agent,
      args({ role: "bug-fix", reasoningEffort: "deep" }),
      run.runtime,
      CONFIG,
      SIGNAL,
    );
    expect(soleAgentOptions(run.starts)).toEqual({
      provider: "local",
      model: "a",
      reasoningEffort: "deep",
    });
    // The route label and the dedicated field must both describe the override, or the
    // model reads its own result as "the role line won".
    expect(result.children[0]?.effort).toBe("deep");
    expect(result.children[0]?.route).toBe("local/a [deep]");
  });

  it("lets the call lower it", async () => {
    const run = harness(SINGLE_ROLE);
    await delegate(
      fakeAgent().agent,
      args({ role: "bug-fix", reasoningEffort: "shallow" }),
      run.runtime,
      CONFIG,
      SIGNAL,
    );
    expect(soleAgentOptions(run.starts)).toMatchObject({ reasoningEffort: "shallow" });
  });

  it("says in a diagnostic that the role line was overridden", async () => {
    const run = harness(SINGLE_ROLE);
    const result = await delegate(
      fakeAgent().agent,
      args({ role: "bug-fix", reasoningEffort: "deep" }),
      run.runtime,
      CONFIG,
      SIGNAL,
    );
    expect(result.diagnostics.join("\n")).toContain("overrides the effort this call's role line names");
  });

  it("adds no override diagnostic when the two agree", async () => {
    const run = harness(SINGLE_ROLE);
    const result = await delegate(
      fakeAgent().agent,
      args({ role: "bug-fix", reasoningEffort: "normal" }),
      run.runtime,
      CONFIG,
      SIGNAL,
    );
    expect(result.diagnostics.join("\n")).not.toContain("overrides the effort");
  });

  it("carries an override onto an inherit-parent route", async () => {
    const run = harness("bug-fix: inherit-parent");
    const parent = fakeAgent({
      provider: "local",
      model: "a",
      header: { provider: "local", model: "a" },
    }).agent;

    await delegate(parent, args({ role: "bug-fix", reasoningEffort: "deep" }), run.runtime, CONFIG, SIGNAL);

    // The provider and model stay unset so the child still inherits the parent route;
    // only the effort travels.
    expect(soleAgentOptions(run.starts)).toEqual({ reasoningEffort: "deep" });
  });

  it("sends nothing at all for an inherit route with no override", async () => {
    const run = harness("bug-fix: inherit-parent");
    await delegate(fakeAgent().agent, args({ role: "bug-fix" }), run.runtime, CONFIG, SIGNAL);
    expect(soleAgentOptions(run.starts)).toBeUndefined();
  });
});

describe("an override is validated before any child starts", () => {
  it("rejects a token the target model does not advertise, and lists its real ones", async () => {
    const run = harness(SINGLE_ROLE);
    await expect(
      delegate(
        fakeAgent().agent,
        args({ role: "bug-fix", reasoningEffort: "max" }),
        run.runtime,
        CONFIG,
        SIGNAL,
      ),
    ).rejects.toThrow("deep, normal");
    expect(run.starts).toHaveLength(0);
  });

  it("rejects the call for a model that advertises no efforts at all", async () => {
    const run = harness("bug-fix: local/plain");
    await expect(
      delegate(
        fakeAgent().agent,
        args({ role: "bug-fix", reasoningEffort: "deep" }),
        run.runtime,
        CONFIG,
        SIGNAL,
      ),
    ).rejects.toThrow("advertises no reasoning efforts");
    expect(run.starts).toHaveLength(0);
  });

  it("does not reject a model with no efforts when the call names none", async () => {
    // The failure above is about the *requested* override. A route with no reasoning
    // control is a legitimate route as long as nobody asks it for an effort.
    const run = harness("bug-fix: local/plain");
    await delegate(fakeAgent().agent, args({ role: "bug-fix" }), run.runtime, CONFIG, SIGNAL);
    expect(soleAgentOptions(run.starts)).toEqual({ provider: "local", model: "plain" });
  });

  it("fails the whole panel when one entry cannot take the effort", async () => {
    // `arena runners` fans out; entry 2 advertises a different vocabulary.
    const run = harness("arena runners: local/a, vendor/c");
    await expect(
      delegate(
        fakeAgent().agent,
        args({ role: "arena runners", reasoningEffort: "deep" }),
        run.runtime,
        CONFIG,
        SIGNAL,
      ),
    ).rejects.toThrow("careful, quick");
    // This is the whole point: not one child started, so no half-applied override.
    expect(run.starts).toHaveLength(0);
  });

  it("starts every entry when all of them accept the effort", async () => {
    const run = harness("arena runners: local/a, local/b");
    const result = await delegate(
      fakeAgent().agent,
      args({ role: "arena runners", reasoningEffort: "deep" }),
      run.runtime,
      CONFIG,
      SIGNAL,
    );
    expect(run.starts).toHaveLength(2);
    for (const spec of run.starts) {
      expect(spec.request.agentOptions?.reasoningEffort).toBe("deep");
    }
    expect(result.children.map((child) => child.effort)).toEqual(["deep", "deep"]);
  });

  it("validates an inherit-parent panel entry against the parent route", async () => {
    const run = harness("arena runners: local/a, inherit-parent");
    const parent = fakeAgent({
      provider: "local",
      model: "a",
      header: { provider: "local", model: "a" },
    }).agent;
    await delegate(parent, args({ role: "arena runners", reasoningEffort: "deep" }), run.runtime, CONFIG, SIGNAL);
    expect(run.starts).toHaveLength(2);
    expect(run.starts[1]?.request.agentOptions).toEqual({ reasoningEffort: "deep" });
  });

  it("rejects an inherit-parent entry whose parent route cannot take the effort", async () => {
    const run = harness("arena runners: local/a, inherit-parent");
    const parent = fakeAgent({
      provider: "vendor",
      model: "c",
      header: { provider: "vendor", model: "c" },
    }).agent;
    await expect(
      delegate(parent, args({ role: "arena runners", reasoningEffort: "deep" }), run.runtime, CONFIG, SIGNAL),
    ).rejects.toThrow("careful, quick");
    expect(run.starts).toHaveLength(0);
  });

  it("rejects an inherit-parent override when the parent has no resolvable route", async () => {
    const run = harness("bug-fix: inherit-parent");
    await expect(
      delegate(
        fakeAgent().agent,
        args({ role: "bug-fix", reasoningEffort: "deep" }),
        run.runtime,
        CONFIG,
        SIGNAL,
      ),
    ).rejects.toThrow("cannot resolve the child provider/model route");
    expect(run.starts).toHaveLength(0);
  });

  it("checks every entry before starting the first, not as each one starts", async () => {
    // Ordering is the claim, so assert it directly: with entry 2 bad, entry 1 must
    // still have never reached `startActivation`.
    const run = harness("arena runners: local/a, local/plain");
    await expect(
      delegate(
        fakeAgent().agent,
        args({ role: "arena runners", reasoningEffort: "deep" }),
        run.runtime,
        CONFIG,
        SIGNAL,
      ),
    ).rejects.toThrow(DelegationError);
    expect(run.starts).toHaveLength(0);
  });
});

describe("argument validation for reasoningEffort", () => {
  it("accepts a token and trims it", () => {
    expect(parseDelegationArgs({ description: "d", prompt: "p", reasoningEffort: "  deep " })).toMatchObject({
      reasoningEffort: "deep",
    });
  });

  it("rejects an empty value rather than restoring the adapter default", () => {
    expect(() => parseDelegationArgs({ description: "d", prompt: "p", reasoningEffort: "" })).toThrow(
      "reasoningEffort must be a non-empty string",
    );
  });

  it("rejects a multi-word value, because an effort is one token", () => {
    expect(() =>
      parseDelegationArgs({ description: "d", prompt: "p", reasoningEffort: "very deep" }),
    ).toThrow("contains whitespace");
  });

  it("rejects a non-string value", () => {
    expect(() => parseDelegationArgs({ description: "d", prompt: "p", reasoningEffort: 3 })).toThrow(
      "reasoningEffort must be a non-empty string",
    );
  });

  it("keeps the argument reachable from the tool schema", () => {
    const tool = createPstackSubagentTool({} as never);
    const properties = (tool.parameters as { properties: Record<string, { type?: string }> }).properties;
    // Option B: a free string, deliberately not an enum over a ladder this package
    // would have to invent.
    expect(properties["reasoningEffort"]?.type).toBe("string");
    expect(properties["reasoningEffort"]).not.toHaveProperty("enum");
  });
});

describe("planning keeps the plan honest about effort", () => {
  it("puts the overridden effort in the plan's route label", () => {
    const run = harness(SINGLE_ROLE);
    const plan = planDelegation(args({ role: "bug-fix", reasoningEffort: "deep" }), run.runtime, CONFIG);
    expect(plan.children[0]?.routeLabel).toBe("local/a [deep]");
    expect(plan.children[0]?.effort).toBe("deep");
    expect(plan.reasoningEffort).toBe("deep");
  });

  it("reports the role line's effort when the call names none", () => {
    const run = harness(SINGLE_ROLE);
    const plan = planDelegation(args({ role: "bug-fix" }), run.runtime, CONFIG);
    expect(plan.children[0]?.routeLabel).toBe("local/a [normal]");
    expect(plan.children[0]?.effort).toBe("normal");
    expect(plan.reasoningEffort).toBeUndefined();
  });

  it("labels an inherit-parent route with its override", () => {
    const run = harness("bug-fix: inherit-parent");
    const plan = planDelegation(args({ role: "bug-fix", reasoningEffort: "deep" }), run.runtime, CONFIG);
    expect(plan.children[0]?.routeLabel).toBe("inherit-parent [deep]");
  });

  it("builds the same agentOptions the plan promises", () => {
    // The plan and the request are built by the same helper, and this is the assertion
    // that they cannot drift: `agentOptions` is what the child really receives.
    expect(agentOptionsFor({ kind: "route", provider: "local", model: "a", effort: "normal" }, "deep")).toEqual(
      { provider: "local", model: "a", reasoningEffort: "deep" },
    );
  });
});

describe("a child with no live handle keeps the effort it started with", () => {
  it("still delegates, and says the child cannot change its own effort", async () => {
    const run = harness(SINGLE_ROLE, { withAgents: false });
    const result = await delegate(
      fakeAgent().agent,
      args({ role: "bug-fix", reasoningEffort: "deep" }),
      run.runtime,
      CONFIG,
      SIGNAL,
    );

    expect(run.starts).toHaveLength(1);
    expect(soleAgentOptions(run.starts)).toMatchObject({ reasoningEffort: "deep" });
    expect(result.diagnostics.join("\n")).toContain("cannot change its own reasoning effort");
  });

  it("does not claim the child can change effort when it can", async () => {
    const run = harness(SINGLE_ROLE);
    const result = await delegate(
      fakeAgent().agent,
      args({ role: "bug-fix", reasoningEffort: "deep" }),
      run.runtime,
      CONFIG,
      SIGNAL,
    );
    expect(result.diagnostics.join("\n")).not.toContain("cannot change its own reasoning effort");
  });
});

describe("the effort validation seam is the same one the plan uses", () => {
  it("agrees between `validateEffortFor` and the delegation preflight", async () => {
    const run = harness(SINGLE_ROLE);
    await expect(
      validateEffortFor(
        run.runtime.llm,
        { kind: "route", provider: "local", model: "a" },
        "deep",
        undefined,
        SIGNAL,
      ),
    ).resolves.toBeUndefined();
    await expect(
      validateEffortFor(
        run.runtime.llm,
        { kind: "route", provider: "local", model: "a" },
        "max",
        undefined,
        SIGNAL,
      ),
    ).rejects.toThrow("deep, normal, shallow");
  });
});

describe("the delegation installs the child control on the child it started", () => {
  it("registers the waterfall and the tool on the child's own scope", async () => {
    const run = harness(SINGLE_ROLE);
    const before = run.created.length;

    await delegate(
      fakeAgent().agent,
      args({ role: "bug-fix", reasoningEffort: "deep" }),
      run.runtime,
      CONFIG,
      SIGNAL,
    );

    const created = run.created.slice(before);
    expect(created).toHaveLength(1);
    expect(created[0]?.listeners).toBe(1);
    expect(created[0]?.tools.map((tool) => tool.name)).toContain("set_reasoning_effort");
  });

  it("starts the child at the overridden effort through the waterfall", async () => {
    const run = harness(SINGLE_ROLE);
    const before = run.created.length;

    await delegate(
      fakeAgent().agent,
      args({ role: "bug-fix", reasoningEffort: "deep" }),
      run.runtime,
      CONFIG,
      SIGNAL,
    );

    const child = run.created[before];
    expect(child).toBeDefined();
    // What the child's first request will carry: the override, not the role line.
    expect(await child!.request({ provider: "local", model: "a" })).toMatchObject({
      reasoningEffort: "deep",
    });
  });

  it("does not leak one child's control into a sibling started by a second call", async () => {
    const run = harness(SINGLE_ROLE);
    const parent = fakeAgent().agent;
    const before = run.created.length;

    await delegate(parent, args({ role: "bug-fix", reasoningEffort: "deep" }), run.runtime, CONFIG, SIGNAL);
    await delegate(parent, args({ role: "bug-fix", reasoningEffort: "shallow" }), run.runtime, CONFIG, SIGNAL);

    const [first, second] = run.created.slice(before);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(await first!.request({ provider: "local", model: "a" })).toMatchObject({
      reasoningEffort: "deep",
    });
    expect(await second!.request({ provider: "local", model: "a" })).toMatchObject({
      reasoningEffort: "shallow",
    });
  });
});
