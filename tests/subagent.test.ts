import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { parseDelegationArgs, planDelegation, type SubagentRuntime } from "../src/subagent.ts";

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
