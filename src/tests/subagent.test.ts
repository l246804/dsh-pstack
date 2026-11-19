import { describe, expect, it } from "vite-plus/test";

import type { Agent } from "@deepseek-ai/dsh-agent";
import {
  createPstackInterruptTool,
  createPstackSubagentTool,
  normalizeConfig,
  parseDelegationArgs,
  planDelegation,
  startChild,
  type DelegationArgs,
  type DelegationRuntime,
} from "../subagent.ts";

const parent = { id: "parent-1" } as unknown as Agent;

function args(overrides: Partial<DelegationArgs> = {}): DelegationArgs {
  return {
    description: "Probe",
    prompt: "Do the probe",
    agent: "general",
    name: null,
    provider: null,
    model: null,
    reasoningEffort: null,
    cwd: null,
    maxDepth: null,
    ...overrides,
  };
}

function fakeRuntime(overrides: Partial<DelegationRuntime> = {}): DelegationRuntime {
  return {
    subagents: {
      startActivation: async () => ({ childId: "child-1", name: "agent-1" }),
      getProvider: () => ({
        name: "spawn",
        capabilities: { agentOptions: true, agentPreset: true, depthLimit: true },
        inheritsParentContext: false,
      }),
      resolveMaxDepth: (configured?: number) => configured ?? 1,
      resolveName: async (_caller: unknown, name: string) => name,
      interrupt: () => {},
    },
    llm: { resolveCallConfig: async () => ({}) },
    potetoModeSkillPath: "/pkg/pstack/skills/poteto-mode/SKILL.md",
    ...overrides,
  } as unknown as DelegationRuntime;
}

describe("normalizeConfig", () => {
  it("defaults to the spawn backend", () => {
    expect(normalizeConfig(undefined)).toEqual({ provider: "spawn" });
  });

  it("keeps provider and a valid maxDepth", () => {
    expect(normalizeConfig({ provider: "spawn", maxDepth: 2 })).toEqual({
      provider: "spawn",
      maxDepth: 2,
    });
  });

  it("rejects an empty provider or a non-positive maxDepth", () => {
    expect(() => normalizeConfig({ provider: "" })).toThrow(/provider/);
    expect(() => normalizeConfig({ provider: "spawn", maxDepth: 0 })).toThrow(/maxDepth/);
  });
});

describe("parseDelegationArgs", () => {
  it("requires prompt and description", () => {
    expect(() => parseDelegationArgs({})).toThrow(/prompt is required/);
    expect(() => parseDelegationArgs({ prompt: "do it" })).toThrow(/description is required/);
  });

  it("reads every optional field and the reasoning_effort param", () => {
    expect(
      parseDelegationArgs({
        description: "d",
        prompt: "p",
        agent_preset: "readonly",
        name: "scout",
        provider: "cpa",
        model: "m",
        reasoning_effort: "high",
        cwd: "/work",
        maxDepth: 2,
      }),
    ).toEqual({
      description: "d",
      prompt: "p",
      agent: "readonly",
      name: "scout",
      provider: "cpa",
      model: "m",
      reasoningEffort: "high",
      cwd: "/work",
      maxDepth: 2,
    });
  });

  it("requires provider and model together, and both for reasoning_effort", () => {
    expect(() => parseDelegationArgs({ description: "d", prompt: "p", provider: "cpa" })).toThrow(
      /provided together/,
    );
    expect(() =>
      parseDelegationArgs({ description: "d", prompt: "p", reasoning_effort: "high" }),
    ).toThrow(/requires provider and model/);
  });

  it("defaults the agent to general", () => {
    expect(parseDelegationArgs({ description: "d", prompt: "p" }).agent).toBe("general");
  });

  it("rejects an unknown agent preset", () => {
    expect(() =>
      parseDelegationArgs({ description: "d", prompt: "p", agent_preset: "nope" }),
    ).toThrow(/unknown agent preset/);
  });

  it("rejects a maxDepth that is not a positive safe integer", () => {
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => parseDelegationArgs({ description: "d", prompt: "p", maxDepth: value })).toThrow(
        /positive safe integer/,
      );
    }
  });

  it("rejects a name outside the native child naming rule", () => {
    for (const name of ["Lead", "lead", "Bad_Name", "-start", "a".repeat(33)]) {
      expect(() => parseDelegationArgs({ description: "d", prompt: "p", name })).toThrow(
        /name must be/,
      );
    }
  });
});

describe("planDelegation", () => {
  it("maps a preset agent and injects the poteto-mode path", () => {
    const runtime = fakeRuntime();
    const plan = planDelegation(args({ agent: "poteto-agent", prompt: "work" }), runtime);
    expect(plan.agentPreset).toBe("poteto-agent");
    expect(plan.prompt).toContain(runtime.potetoModeSkillPath);
  });

  it("builds route agentOptions and labels the route", () => {
    const plan = planDelegation(
      args({ provider: "cpa", model: "model-a", reasoningEffort: "high" }),
      fakeRuntime(),
    );
    expect(plan.agentOptions).toEqual({
      provider: "cpa",
      model: "model-a",
      reasoningEffort: "high",
    });
  });

  it("caps maxDepth by the resolved limit and the row config", () => {
    expect(planDelegation(args(), fakeRuntime(), { provider: "spawn", maxDepth: 2 }).maxDepth).toBe(
      2,
    );
    expect(
      planDelegation(args({ maxDepth: 1 }), fakeRuntime(), { provider: "spawn", maxDepth: 2 })
        .maxDepth,
    ).toBe(1);
    expect(() =>
      planDelegation(args({ maxDepth: 3 }), fakeRuntime(), { provider: "spawn", maxDepth: 2 }),
    ).toThrow(/exceeds the delegation limit/);
  });
});

describe("startChild", () => {
  it("checks capabilities, preflights the route, and starts one activation", async () => {
    const specs: unknown[] = [];
    const calls: unknown[] = [];
    const runtime = fakeRuntime({
      subagents: {
        getProvider: () => ({
          name: "spawn",
          capabilities: { agentOptions: true, agentPreset: true, depthLimit: true },
          inheritsParentContext: false,
        }),
        resolveMaxDepth: (configured?: number) => configured ?? 1,
        startActivation: async (spec: unknown) => {
          specs.push(spec);
          return { childId: "child-1", name: "agent-1" };
        },
      } as unknown as DelegationRuntime["subagents"],
      llm: {
        resolveCallConfig: async (request: unknown) => {
          calls.push(request);
          return request as never;
        },
      } as unknown as DelegationRuntime["llm"],
    });
    const record = await startChild(
      parent,
      planDelegation(
        args({
          name: "scout",
          cwd: "sub/dir",
          provider: "cpa",
          model: "m",
          reasoningEffort: "high",
        }),
        runtime,
      ),
      runtime,
      new AbortController().signal,
    );
    expect(calls[0]).toEqual({ provider: "cpa", model: "m", reasoningEffort: "high" });
    expect(specs[0]).toMatchObject({
      provider: "spawn",
      delivery: "parent",
      name: "scout",
      cwd: "sub/dir",
      agentOptions: { provider: "cpa", model: "m", reasoningEffort: "high" },
    });
    expect(record).toEqual({ kind: "activation", name: "agent-1" });
  });

  it("rejects a provider that lacks a required capability", async () => {
    const runtime = fakeRuntime({
      subagents: {
        getProvider: () => ({
          name: "spawn",
          capabilities: { agentOptions: false, agentPreset: false, depthLimit: false },
          inheritsParentContext: false,
        }),
        resolveMaxDepth: (configured?: number) => configured ?? 1,
      } as unknown as DelegationRuntime["subagents"],
    });
    await expect(
      startChild(
        parent,
        planDelegation(args({ provider: "cpa", model: "m" }), runtime),
        runtime,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/agentOptions/);
  });
});

describe("createPstackSubagentTool", () => {
  it("requires description and prompt and exposes reasoning_effort", () => {
    const parameters = createPstackSubagentTool(fakeRuntime()).parameters as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(parameters.required).toEqual(["description", "prompt"]);
    expect(parameters.properties).toHaveProperty("reasoning_effort");
    expect(parameters.properties).not.toHaveProperty("reasoningEffort");
  });
});

describe("pstack interrupt tool", () => {
  const signal = new AbortController().signal;
  const exec = { agent: parent, signal } as never;

  it("resolves a name or Session id before interrupting under ancestor authority", async () => {
    const calls: unknown[] = [];
    const runtime = fakeRuntime({
      subagents: {
        resolveName: async (_caller: unknown, name: string) =>
          (name === "src-reader" ? "child-1" : name) as never,
        interrupt: (...callArgs: unknown[]) => {
          calls.push(callArgs);
        },
      } as unknown as DelegationRuntime["subagents"],
    });
    const byName = await createPstackInterruptTool(runtime).execute?.(
      { agent: "src-reader" },
      exec,
    );
    expect(byName).toEqual({ interrupted: true });
    expect(calls[0]).toEqual(["child-1", { kind: "ancestor", agent: parent }]);
    const byId = await createPstackInterruptTool(runtime).execute?.({ agent: "session-9" }, exec);
    expect(byId).toEqual({ interrupted: true });
    expect(calls[1]).toEqual(["session-9", { kind: "ancestor", agent: parent }]);
  });

  it("rejects an empty agent before touching the runtime", async () => {
    await expect(
      createPstackInterruptTool(fakeRuntime()).execute?.({ agent: " " }, exec),
    ).rejects.toThrow(/non-empty string/);
  });
});
