import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { Context } from "@deepseek-ai/cordis";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";

import type { LlmHost } from "../src/internal/host-contract.ts";
import { parseDelegationArgs, planDelegation, type SubagentRuntime } from "../src/subagent.ts";
import { PstackRolesService } from "../src/roles.ts";

const directories: string[] = [];
const previousHome = process.env["DSH_HOME"];

afterEach(() => {
  if (previousHome === undefined) delete process.env["DSH_HOME"];
  else process.env["DSH_HOME"] = previousHome;
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const llm = {
  listProviders: () => [{ id: "cpa", name: "CPA" }],
  listModels: async () => [{ provider: "cpa", id: "model-a", name: "Model A" }],
  resolveModelInfo: async (provider: string, model: string) => ({
    provider,
    id: model,
    name: model,
    reasoning: { efforts: [{ id: "low" }, { id: "high" }], defaultEffort: "high" },
  }),
} as unknown as LlmHost;

async function service(): Promise<{ ctx: Context; service: PstackRolesService; home: string }> {
  const home = mkdtempSync(join(tmpdir(), "pstack-role-service-"));
  directories.push(home);
  process.env["DSH_HOME"] = home;
  const ctx = new Context();
  await ctx.plugin(TypertRegistry);
  ctx.provide("llm", llm as never);
  await ctx.plugin(PstackRolesService);
  return { ctx, service: ctx.get("pstackRoles") as PstackRolesService, home };
}

describe("pstack roles Host service", () => {
  it("registers the strict Remote descriptors with the Typert registry", async () => {
    const { ctx } = await service();
    expect(ctx.typert.local.get("pstackRoles/status")).toBeDefined();
    expect(ctx.typert.local.get("pstackRoles/catalogue")).toBeDefined();
    expect(ctx.typert.local.get("pstackRoles/save")).toBeDefined();
  });

  it("reads the file path, saves one role, and exposes it on the next read", async () => {
    const { service: roles, home } = await service();
    const initial = roles.status();
    expect(initial.status).toBe("missing");
    expect(initial.path).toBe(join(home, "pstack-models.mdc"));

    const saved = await roles.save(
      {
        key: "bug-fix",
        routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
      },
      new AbortController().signal,
    );
    expect(saved.ok).toBe(true);
    const next = roles.status();
    expect(next.status).toBe("loaded");
    expect(next.roles.find((role) => role.key === "bug-fix")?.routes).toEqual([
      { kind: "route", provider: "cpa", model: "model-a", effort: "high" },
    ]);

    const plan = planDelegation(
      parseDelegationArgs({
        description: "use the saved route",
        prompt: "Read the saved route.",
        agent: "general",
        role: "bug-fix",
        roleIndex: null,
        reasoningEffort: null,
        cwd: null,
        maxDepth: 1,
      }),
      { subagents: {}, llm: {}, workingDirectory: {}, dshHome: home } as unknown as SubagentRuntime,
    );
    expect(plan.children[0]!.routeLabel).toBe("cpa/model-a [high]");
  });

  it("refuses a route the live directory does not advertise", async () => {
    const { service: roles } = await service();
    const saved = await roles.save(
      { key: "bug-fix", routes: [{ kind: "route", provider: "nope", model: "model-a" }] },
      new AbortController().signal,
    );
    expect(saved).toMatchObject({
      ok: false,
      reason: expect.stringContaining("not in the live model directory"),
    });
    expect(roles.status().status).toBe("missing");
  });

  it("reports the live catalogue used by the page", async () => {
    const { service: roles } = await service();
    const catalogue = await roles.catalogue(new AbortController().signal);
    expect(catalogue.providers[0]!.models[0]!.efforts).toEqual(["low", "high"]);
  });
});
