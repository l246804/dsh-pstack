import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { Agent } from "@deepseek-ai/dsh-agent";
import {
  createPstackSubagentTool,
  normalizeConfig,
  parseDelegationArgs,
  planDelegation,
  startPlannedChildren,
  type DelegationRuntime,
} from "../src/subagent.ts";

const directories: string[] = [];

function home(text?: string): string {
  const directory = mkdtempSync(join(tmpdir(), "pstack-subagent-"));
  directories.push(directory);
  if (text !== undefined) writeFileSync(join(directory, "pstack-models.mdc"), text);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function args(overrides: Record<string, unknown> = {}) {
  return parseDelegationArgs({
    description: "inspect parser",
    prompt: "Read the parser and report.",
    agent: "poteto-agent",
    role: null,
    roleIndex: null,
    reasoningEffort: null,
    cwd: null,
    ...overrides,
  });
}

function fakeRuntime(dshHome: string): DelegationRuntime {
  return {
    subagents: {
      getProvider: () => ({
        name: "spawn",
        capabilities: { agentOptions: true, agentPreset: true, depthLimit: true },
        inheritsParentContext: false,
      }),
      list: () => ["spawn"],
      resolveMaxDepth: () => 2,
      startActivation: async () => ({ childId: "child-1" }),
    },
    llm: { resolveCallConfig: async () => ({}) },
    workingDirectory: { ensure: async () => "/session" },
    dshHome,
    potetoModeSkillPath: "/pkg/pstack/skills/poteto-mode/SKILL.md",
  } as unknown as DelegationRuntime;
}

describe("pstack_subagent arguments and planning", () => {
  it("normalizes a default config and rejects unknown keys", () => {
    expect(normalizeConfig(undefined)).toEqual({ provider: "spawn" });
    expect(() => normalizeConfig({ nope: true })).toThrow(/unknown config field/);
  });

  it("rejects missing required arguments", () => {
    expect(() => parseDelegationArgs({ agent: "general" })).toThrow(/missing required argument/);
  });

  it("maps the three preset agents and general explicitly", () => {
    const runtime = fakeRuntime(home());
    expect(planDelegation(args(), runtime).children[0]?.agentPreset).toBe("poteto-agent");
    expect(planDelegation(args({ agent: "comment-sicko" }), runtime).children[0]?.agentPreset).toBe(
      "comment-sicko",
    );
    expect(planDelegation(args({ agent: "readonly" }), runtime).children[0]?.agentPreset).toBe(
      "readonly",
    );
    expect(
      planDelegation(args({ agent: "general" }), runtime).children[0]?.agentPreset,
    ).toBeUndefined();
  });

  it("reads a role file route and starts one child per panel entry", async () => {
    const dshHome = home("arena runners: cpa/model-a [high], cpa/model-b [low]\n");
    const runtime = fakeRuntime(dshHome);
    const plan = planDelegation(args({ role: "arena runners" }), runtime);
    expect(plan.children).toHaveLength(2);
    expect(plan.children.map((child) => child.routeLabel)).toEqual([
      "cpa/model-a [high]",
      "cpa/model-b [low]",
    ]);
  });

  it("starts planned children and returns their ids", async () => {
    const runtime = fakeRuntime(home());
    const plan = planDelegation(args(), runtime);
    const result = await startPlannedChildren(
      {
        options: { provider: "cpa", model: "parent" },
        session: { requestHeader: () => undefined },
      } as unknown as Agent,
      plan,
      runtime,
      new AbortController().signal,
    );
    expect(result.kind).toBe("activation");
    expect(result.children[0]?.childId).toBe("child-1");
  });

  it("keeps started child ids when a later activation fails", async () => {
    const dshHome = home("arena runners: cpa/model-a, cpa/model-b\n");
    let starts = 0;
    const base = fakeRuntime(dshHome);
    const subagents = {
      getProvider: base.subagents.getProvider.bind(base.subagents),
      list: base.subagents.list.bind(base.subagents),
      resolveMaxDepth: base.subagents.resolveMaxDepth.bind(base.subagents),
      startActivation: async () => {
        starts += 1;
        if (starts === 1) return { childId: "child-1" };
        throw new Error("activation limit");
      },
    };
    const runtime = { ...base, subagents } as unknown as DelegationRuntime;
    const plan = planDelegation(args({ role: "arena runners" }), runtime);
    const result = await startPlannedChildren(
      { options: {} } as unknown as Agent,
      plan,
      runtime,
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      kind: "partial",
      children: [{ childId: "child-1" }],
      failure: { index: 1, total: 2, reason: "activation limit" },
    });
    const rendered = createPstackSubagentTool(runtime).output?.render({}, result as never) as {
      text: string;
    }[];
    expect(rendered[0]?.text).toContain("started 1 of 2 children");
    expect(rendered[0]?.text).toContain("child-1");
    expect(rendered[0]?.text).toContain("activation limit");
  });

  it("selects a list entry and reports the selection", () => {
    const runtime = fakeRuntime(home("swarm workers: cpa/model-a, cpa/model-b\n"));
    const plan = planDelegation(args({ role: "swarm workers", roleIndex: 1 }), runtime);
    expect(plan.children.map((child) => child.routeLabel)).toEqual(["cpa/model-b"]);
    expect(plan.diagnostics.join("\n")).toContain("entry 2 was selected");
  });

  it("reports a missing role line and preserves slash-containing model ids", () => {
    const missing = planDelegation(args({ role: "bug-fix" }), fakeRuntime(home()));
    expect(missing.children[0]?.routeLabel).toBe("inherit-parent");
    expect(missing.diagnostics.join("\n")).toContain("has no line");

    const routed = planDelegation(
      args({ role: "bug-fix" }),
      fakeRuntime(home("bug-fix: acme/quick-model [high]\n")),
    );
    expect(routed.children[0]?.routeLabel).toBe("acme/quick-model [high]");
  });

  it("rejects a depth above the configured cap", () => {
    expect(() =>
      planDelegation(args({ maxDepth: 3 }), fakeRuntime(home()), {
        provider: "spawn",
        maxDepth: 2,
      }),
    ).toThrow(/exceeds/);
  });

  it("rejects maxDepth 0 before planning", () => {
    expect(() => args({ maxDepth: 0 })).toThrow(/positive safe integer/);
  });

  it("uses the Host cap when maxDepth is omitted", () => {
    const plan = planDelegation(args(), fakeRuntime(home()));
    expect(plan.children[0]?.maxDepth).toBe(2);
  });

  it("omits maxDepth when neither the caller nor the Host sets a cap", () => {
    const base = fakeRuntime(home());
    const runtime = {
      ...base,
      subagents: {
        getProvider: base.subagents.getProvider.bind(base.subagents),
        list: base.subagents.list.bind(base.subagents),
        resolveMaxDepth: () => undefined,
        startActivation: base.subagents.startActivation.bind(base.subagents),
      },
    } as unknown as DelegationRuntime;
    const plan = planDelegation(args(), runtime);
    expect(plan.children[0]?.maxDepth).toBeUndefined();
    expect(plan.children[0] !== undefined && "maxDepth" in plan.children[0]).toBe(false);
  });
});
