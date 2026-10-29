import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  parseDelegationArgs,
  planDelegation,
  startPlannedChildren,
  type SubagentRuntime,
} from "../src/subagent.ts";

const directories: string[] = [];

function homeWithRoles(text: string | undefined): string {
  const directory = mkdtempSync(join(tmpdir(), "pstack-roles-"));
  directories.push(directory);
  if (text !== undefined) writeFileSync(join(directory, "poteto-models.mdc"), text);
  return directory;
}

function runtime(dshHome: string): SubagentRuntime {
  return {
    subagents: {},
    llm: {},
    workingDirectory: {},
    dshHome,
  } as unknown as SubagentRuntime;
}

function args(overrides: Record<string, unknown> = {}) {
  return parseDelegationArgs({
    description: "inspect the parser",
    prompt: "Read the parser and report.",
    agent: "poteto-agent",
    role: null,
    roleIndex: null,
    reasoningEffort: null,
    cwd: null,
    maxDepth: 1,
    ...overrides,
  });
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("pstack_subagent planning", () => {
  it("maps poteto-agent and comment-sicko to their presets and general to the parent preset", () => {
    const dshHome = homeWithRoles(undefined);
    expect(planDelegation(args(), runtime(dshHome)).children[0]!.agentPreset).toBe("poteto-agent");
    expect(
      planDelegation(args({ agent: "comment-sicko" }), runtime(dshHome)).children[0]!.agentPreset,
    ).toBe("comment-sicko");
    expect(
      planDelegation(args({ agent: "general" }), runtime(dshHome)).children[0]!.agentPreset,
    ).toBeUndefined();
  });

  it("reads a role line into an explicit route and effort", () => {
    const dshHome = homeWithRoles(
      "# budget: large (xhigh)\nfeature, refactoring: cpa/workbuddy/deepseek-v4.1-flash [high]\n",
    );
    const plan = planDelegation(args({ role: "feature, refactoring" }), runtime(dshHome));
    expect(plan.role).toBe("feature, refactoring");
    expect(plan.children[0]!.routeLabel).toBe("cpa/workbuddy/deepseek-v4.1-flash [high]");
    expect(plan.children[0]!.agentOptions).toEqual({
      provider: "cpa",
      model: "workbuddy/deepseek-v4.1-flash",
      reasoningEffort: "high",
    });
  });

  it("starts one child per automatic panel entry", () => {
    const dshHome = homeWithRoles(
      "arena runners: cpa/workbuddy/deepseek-v4.1-flash [high], cpa/workbuddy/minimax-m3.1-flash [low]\n",
    );
    const plan = planDelegation(args({ role: "arena runners" }), runtime(dshHome));
    expect(plan.children).toHaveLength(2);
    expect(plan.children.map((child) => child.routeLabel)).toEqual([
      "cpa/workbuddy/deepseek-v4.1-flash [high]",
      "cpa/workbuddy/minimax-m3.1-flash [low]",
    ]);
    expect(plan.children.map((child) => child.label)).toEqual([
      "inspect the parser [arena runners 1/2]",
      "inspect the parser [arena runners 2/2]",
    ]);
  });

  it("selects one entry from a list role with roleIndex", () => {
    const dshHome = homeWithRoles(
      "swarm workers: cpa/workbuddy/deepseek-v4.1-flash [high], cpa/workbuddy/minimax-m3.1-flash [low]\n",
    );
    const plan = planDelegation(args({ role: "swarm workers", roleIndex: 1 }), runtime(dshHome));
    expect(plan.children).toHaveLength(1);
    expect(plan.children[0]!.routeLabel).toBe("cpa/workbuddy/minimax-m3.1-flash [low]");
    expect(plan.diagnostics.join("\n")).toMatch(/entry 2 was selected/);
  });

  it("falls back to the parent route when the file or role line is missing", () => {
    const missing = planDelegation(args({ role: "bug-fix" }), runtime(homeWithRoles(undefined)));
    expect(missing.children[0]!.route).toEqual({ kind: "inherit" });
    expect(missing.diagnostics.join("\n")).toMatch(/has no line/);

    const empty = planDelegation(
      args({ role: "bug-fix" }),
      runtime(homeWithRoles("# budget: small (medium)\n")),
    );
    expect(empty.children[0]!.routeLabel).toBe("inherit-parent");
  });

  it("reports malformed role lines with their line number", () => {
    const dshHome = homeWithRoles("bug-fix: not-a-route\n");
    const plan = planDelegation(args({ role: "bug-fix" }), runtime(dshHome));
    expect(plan.diagnostics.join("\n")).toMatch(/poteto-models\.mdc:1: bug-fix: .* is not a route/);
  });
});

describe("pstack_subagent execution", () => {
  it("starts a poteto-agent child with its preset and injected instruction path", async () => {
    const dshHome = homeWithRoles(undefined);
    const starts: unknown[] = [];
    const provider = {
      capabilities: { agentOptions: true, agentPreset: true, depthLimit: true },
    };
    const live = {
      ...runtime(dshHome),
      subagents: {
        getProvider: () => provider,
        list: () => ["spawn"],
        resolveMaxDepth: () => undefined,
        startActivation: async (spec: unknown) => {
          starts.push(spec);
          return { childId: "child-1" };
        },
      },
      workingDirectory: { ensure: async () => "/session" },
    } as unknown as SubagentRuntime;

    const plan = planDelegation(args(), live);
    const result = await startPlannedChildren(
      {} as never,
      plan,
      live,
      { provider: "spawn", maxDepth: 2 },
      new AbortController().signal,
    );

    expect(result.children[0]!.childId).toBe("child-1");
    expect(result.children[0]!.agent).toBe("poteto-agent");
    expect(starts).toHaveLength(1);
    const request = (starts[0] as { request: { agentPreset?: string; prompt: { text: string }[] } })
      .request;
    expect(request.agentPreset).toBe("poteto-agent");
    expect(request.prompt[0]!.text).toContain("poteto-mode");
  });
});
