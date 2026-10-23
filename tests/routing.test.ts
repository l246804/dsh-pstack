import { describe, expect, it } from "vite-plus/test";
import { parseModelConfig } from "../src/roles.ts";
import { buildActivationRequest, createPstackTool, routeToAgentOptions } from "../src/subagent.ts";

/**
 * End-to-end route assembly: role table → resolved route → provider options on
 * the activation request. This is the seam where a wrong role name or a lost
 * effort token used to fail silently, because nothing asserted the options the
 * child actually receives.
 */
describe("role to agent options", () => {
  const table = parseModelConfig(
    [
      "feature, refactoring: deepseek-official/deepseek-reasoner high",
      "judgment and prose: inherit-parent",
      "arena runners: inherit-parent, anthropic/claude-sonnet xhigh, openai/gpt-5 medium",
    ].join("\n"),
  );

  it("maps a resolved route onto provider options", () => {
    expect(
      routeToAgentOptions({
        provider: "deepseek-official",
        model: "deepseek-reasoner",
        reasoningEffort: "high",
      }),
    ).toEqual({
      provider: "deepseek-official",
      model: "deepseek-reasoner",
      reasoningEffort: "high",
    });
  });

  it("omits agentOptions when the role inherits the parent", () => {
    expect(routeToAgentOptions(undefined)).toBeUndefined();
  });

  const parent = { id: "parent" } as never;
  const prompt = [{ type: "text" as const, text: "do the work" }];

  it("allows independent delegated activations to run concurrently", () => {
    const tool = createPstackTool({
      start: async () => ({ childId: "child" }),
      loadAgent: async () => "",
      loadRole: async () => ({ route: undefined, notes: [] }),
    });
    expect(
      tool.isConcurrencySafe?.({
        description: "independent task",
        prompt: "Do the work.",
      } as never),
    ).toBe(true);
  });

  it("carries the resolved role onto the activation request", () => {
    const request = buildActivationRequest({
      parent,
      prompt,
      route: { provider: "anthropic", model: "claude-sonnet", reasoningEffort: "xhigh" },
      cwd: "/tmp/work",
      agentPreset: "cordis",
    });
    expect(request.agentOptions).toEqual({
      provider: "anthropic",
      model: "claude-sonnet",
      reasoningEffort: "xhigh",
    });
    expect(request.cwd).toBe("/tmp/work");
    expect(request.agentPreset).toBe("cordis");
  });

  it("omits both cwd and agentOptions when neither is set", () => {
    const request = buildActivationRequest({ parent, prompt, route: undefined, cwd: undefined });
    expect("agentOptions" in request).toBe(false);
    expect("cwd" in request).toBe(false);
  });

  it("carries maxDepth into the activation request", () => {
    expect(
      buildActivationRequest({
        parent,
        prompt,
        route: undefined,
        cwd: undefined,
        maxDepth: 3,
      }).maxDepth,
    ).toBe(3);
  });

  it("starts one child per configured panel route at tool execution", async () => {
    const starts: Array<{
      route: unknown;
      label: string;
      maxDepth: number | undefined;
    }> = [];
    const tool = createPstackTool({
      start: async (input) => {
        starts.push({
          route: input.route,
          label: input.label,
          maxDepth: input.maxDepth,
        });
        return { childId: `child-${starts.length}` };
      },
      loadAgent: async () => "",
      maxDepth: () => 3,
      loadRole: async () => ({
        route: undefined,
        panelRoutes: [
          undefined,
          { provider: "anthropic", model: "claude-sonnet", reasoningEffort: "xhigh" },
        ],
        notes: [],
      }),
    });
    const result = await tool.execute(
      {
        description: "review candidates",
        prompt: "Review this design.",
        agent: "general",
        role: "arena runners",
      },
      {
        agent: parent,
        signal: new AbortController().signal,
      } as never,
    );
    expect(starts).toEqual([
      { route: undefined, label: "review candidates (1/2)", maxDepth: 3 },
      {
        route: { provider: "anthropic", model: "claude-sonnet", reasoningEffort: "xhigh" },
        label: "review candidates (2/2)",
        maxDepth: 3,
      },
    ]);
    expect(result).toContain("child-1, child-2");
  });

  it("validates a configured model route before creating a child", async () => {
    let started = false;
    const tool = createPstackTool({
      start: async () => {
        started = true;
        return { childId: "child" };
      },
      loadAgent: async () => "",
      loadRole: async () => ({
        route: { provider: "missing-provider", model: "missing-model" },
        notes: [],
      }),
      validateRoute: async () => {
        throw new Error("unknown configured model");
      },
    });
    await expect(
      tool.execute(
        {
          description: "run helper",
          prompt: "Do the task.",
          agent: "general",
        },
        { agent: parent, signal: new AbortController().signal } as never,
      ),
    ).rejects.toThrow("unknown configured model");
    expect(started).toBe(false);
  });

  it("falls back to the parent route for an unavailable panel entry", async () => {
    const startedRoutes: Array<unknown> = [];
    const tool = createPstackTool({
      start: async ({ route }) => {
        startedRoutes.push(route);
        return { childId: `child-${startedRoutes.length}` };
      },
      loadAgent: async () => "",
      loadRole: async () => ({
        route: undefined,
        panelRoutes: [
          { provider: "valid", model: "first" },
          { provider: "missing", model: "second" },
        ],
        notes: [],
      }),
      validateRoute: async (route) => {
        if (route.provider === "missing") throw new Error("route not available");
      },
    });
    const result = await tool.execute(
      {
        description: "review candidates",
        prompt: "Review this design.",
        agent: "general",
        role: "arena runners",
      },
      { agent: parent, signal: new AbortController().signal } as never,
    );
    expect(startedRoutes).toEqual([{ provider: "valid", model: "first" }, undefined]);
    expect(result).toContain("panel entry 2 route missing/second is unavailable");
    expect(result).toContain("using the parent route");
  });

  it("passes an explicit DSH agent preset to each panel child", async () => {
    const startedPresets: Array<string | undefined> = [];
    const tool = createPstackTool({
      start: async ({ agentPreset }) => {
        startedPresets.push(agentPreset);
        return { childId: `child-${startedPresets.length}` };
      },
      loadAgent: async () => "",
      allowedAgentPresets: ["cordis"],
      loadRole: async () => ({
        route: undefined,
        panelRoutes: [undefined, undefined],
        notes: [],
      }),
    });
    await tool.execute(
      {
        description: "review candidates",
        prompt: "Review this design.",
        agent: "general",
        role: "arena runners",
        agentPreset: "cordis",
      },
      { agent: parent, signal: new AbortController().signal } as never,
    );
    expect(startedPresets).toEqual(["cordis", "cordis"]);
  });

  it("clamps a requested maxDepth to the configured cap", async () => {
    let startedDepth: number | undefined;
    const tool = createPstackTool({
      start: async ({ maxDepth }) => {
        startedDepth = maxDepth;
        return { childId: "child" };
      },
      loadAgent: async () => "",
      maxDepth: () => 2,
      loadRole: async () => ({ route: undefined, notes: [] }),
    });
    const result = await tool.execute(
      {
        description: "nested task",
        prompt: "Do the task.",
        agent: "general",
        maxDepth: 9,
      },
      { agent: parent, signal: new AbortController().signal } as never,
    );
    expect(startedDepth).toBe(2);
    expect(result).toContain("exceeds the pstack-subagent cap 2");
  });

  it("rejects an agent preset outside the configured allowlist", async () => {
    const tool = createPstackTool({
      start: async () => ({ childId: "child" }),
      loadAgent: async () => "",
      allowedAgentPresets: ["cordis"],
      loadRole: async () => ({ route: undefined, notes: [] }),
    });
    await expect(
      tool.execute(
        {
          description: "run helper",
          prompt: "Do the task.",
          agent: "general",
          agentPreset: "minimal",
        },
        { agent: parent, signal: new AbortController().signal } as never,
      ),
    ).rejects.toThrow('must be one of ["cordis"]');
  });

  it("rejects a role route outside the configured allowedModels list", async () => {
    const tool = createPstackTool({
      start: async () => ({ childId: "child" }),
      loadAgent: async () => "",
      allowedModels: ["allowed/model"],
      loadRole: async () => ({
        route: { provider: "other", model: "model" },
        notes: [],
      }),
    });
    await expect(
      tool.execute(
        {
          description: "run helper",
          prompt: "Do the task.",
          agent: "general",
        },
        { agent: parent, signal: new AbortController().signal } as never,
      ),
    ).rejects.toThrow("is not in the pstack-subagent allowedModels list");
  });

  it("omits agentPreset from the schema when no allowlist is configured", () => {
    const tool = createPstackTool({
      start: async () => ({ childId: "child" }),
      loadAgent: async () => "",
      loadRole: async () => ({ route: undefined, notes: [] }),
    });
    expect("agentPreset" in tool.parameters).toBe(false);
  });

  it("resolves a panel entry to concrete options", async () => {
    const { resolveRole } = await import("../src/roles.ts");
    expect(routeToAgentOptions(resolveRole(table, "arena runners", 1))).toEqual({
      provider: "anthropic",
      model: "claude-sonnet",
      reasoningEffort: "xhigh",
    });
    expect(routeToAgentOptions(resolveRole(table, "arena runners", 2))).toEqual({
      provider: "openai",
      model: "gpt-5",
      reasoningEffort: "medium",
    });
  });

  it("wraps the panel index so extra children still get a route", async () => {
    const { resolveRole } = await import("../src/roles.ts");
    // Three entries, so index 3 wraps to the first (inherit-parent → undefined).
    expect(resolveRole(table, "arena runners", 3)).toBeUndefined();
  });
});
