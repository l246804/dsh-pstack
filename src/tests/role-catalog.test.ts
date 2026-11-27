import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import type { LlmRuntime } from "@deepseek-ai/dsh-llm";

import type { CatalogueResult } from "../models.ts";
import { ROLE_MANIFEST } from "../roles/role-manifest.ts";
import {
  TOOL_NAME,
  annotateRoleCapabilities,
  createPstackRolesTool,
  renderRoleCapabilities,
  roleCapabilities,
} from "../role-catalog.ts";

describe("pstack_roles", () => {
  it("reports every manifest role in order", () => {
    expect(roleCapabilities().map((role) => role.role)).toEqual(
      ROLE_MANIFEST.map((role) => role.key),
    );
  });

  it("reports configured routes as structured provider, model, and reasoning_effort values", () => {
    const entries = new Map([
      [
        "arena cross-judge pool",
        { routes: [{ kind: "route" as const, provider: "p", model: "a" }] },
      ],
      [
        "swarm workers",
        { routes: [{ kind: "route" as const, provider: "p", model: "b", effort: "high" }] },
      ],
    ]);
    const roles = roleCapabilities(entries);
    expect(roles.find((role) => role.role === "swarm workers")?.routes).toEqual([
      { provider: "p", model: "b", reasoning_effort: "high" },
    ]);
    expect(roles.find((role) => role.role === "arena cross-judge pool")?.routes).toEqual([
      { provider: "p", model: "a" },
    ]);
  });

  it("reports list roles by shape and leaves unconfigured roles without routes", () => {
    const roles = roleCapabilities();
    for (const key of ["arena runners", "swarm workers", "interrogate reviewers"]) {
      const role = roles.find((entry) => entry.role === key);
      expect(role?.shape).toBe("list");
      expect(role?.routes).toEqual([]);
      expect(role?.usage).toContain("inherit the parent route");
    }
  });

  it("renders structured routes", () => {
    const entries = new Map([
      [
        "arena cross-judge pool",
        { routes: [{ kind: "route" as const, provider: "p", model: "a", effort: "low" }] },
      ],
    ]);
    const text = renderRoleCapabilities(roleCapabilities(entries));
    expect(text).toContain("arena runners — shape=list");
    expect(text).toContain("arena cross-judge pool — shape=list");
    expect(text).toContain("routes=provider=p model=a reasoning_effort=low");
  });

  it("attaches the served effort ladder and default from the catalogue", () => {
    const entries = new Map([
      [
        "swarm workers",
        { routes: [{ kind: "route" as const, provider: "p", model: "a", effort: "low" }] },
      ],
    ]);
    const catalogue: CatalogueResult = {
      providers: [
        {
          provider: "p",
          name: "P",
          models: [
            {
              provider: "p",
              id: "a",
              efforts: ["low", "high"],
              defaultEffort: "high",
            },
          ],
        },
      ],
      truncated: false,
    };
    const roles = annotateRoleCapabilities(roleCapabilities(entries), catalogue);
    expect(roles.find((role) => role.role === "swarm workers")?.routes).toEqual([
      {
        provider: "p",
        model: "a",
        reasoning_effort: "low",
        efforts: ["low", "high"],
        defaultEffort: "high",
        served: true,
      },
    ]);
    expect(renderRoleCapabilities(roles)).toContain("efforts=low,high default=high");
  });

  it("renders a provider error on the route", () => {
    const entries = new Map([
      ["swarm workers", { routes: [{ kind: "route" as const, provider: "p", model: "a" }] }],
    ]);
    const catalogue: CatalogueResult = {
      providers: [{ provider: "p", name: "P", models: [], error: "boom" }],
      truncated: false,
    };
    const roles = annotateRoleCapabilities(roleCapabilities(entries), catalogue);
    expect(renderRoleCapabilities(roles)).toContain('error="boom"');
  });

  it("marks a configured route the catalogue no longer serves", () => {
    const entries = new Map([
      ["swarm workers", { routes: [{ kind: "route" as const, provider: "p", model: "gone" }] }],
    ]);
    const catalogue: CatalogueResult = { providers: [], truncated: false };
    const routes = annotateRoleCapabilities(roleCapabilities(entries), catalogue).find(
      (role) => role.role === "swarm workers",
    )?.routes;
    expect(routes).toEqual([{ provider: "p", model: "gone", served: false, efforts: [] }]);
  });

  it("surfaces a provider discovery error on a configured route", () => {
    const entries = new Map([
      ["swarm workers", { routes: [{ kind: "route" as const, provider: "p", model: "a" }] }],
    ]);
    const catalogue: CatalogueResult = {
      providers: [{ provider: "p", name: "P", models: [], error: "adapter went away" }],
      truncated: false,
    };
    const routes = annotateRoleCapabilities(roleCapabilities(entries), catalogue).find(
      (role) => role.role === "swarm workers",
    )?.routes;
    expect(routes).toEqual([
      { provider: "p", model: "a", served: false, efforts: [], error: "adapter went away" },
    ]);
  });

  it("returns every role through the tool", async () => {
    const home = mkdtempSync(join(tmpdir(), "pstack-roles-"));
    try {
      const tool = createPstackRolesTool(home);
      expect(tool.name).toBe(TOOL_NAME);
      const result = (await tool.execute({}, {
        signal: new AbortController().signal,
      } as never)) as {
        roles: readonly unknown[];
      };
      expect(result.roles).toHaveLength(ROLE_MANIFEST.length);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("annotates role routes through the tool when the llm is available", async () => {
    const home = mkdtempSync(join(tmpdir(), "pstack-roles-"));
    try {
      const modelsPath = join(home, "pstack", "models.json");
      mkdirSync(dirname(modelsPath), { recursive: true });
      writeFileSync(
        modelsPath,
        JSON.stringify({
          version: 2,
          roles: {
            "swarm workers": [{ kind: "route", provider: "p", model: "a", effort: "low" }],
          },
        }),
      );
      const llm = {
        listProviders: () => [{ id: "p", name: "P" }],
        listModels: async () => [{ id: "a", name: "A" }],
        resolveModelInfo: async () => ({
          id: "a",
          name: "A",
          reasoning: { efforts: [{ id: "low" }, { id: "high" }], defaultEffort: "high" },
        }),
      } as unknown as LlmRuntime;
      const tool = createPstackRolesTool(home, llm);
      const result = (await tool.execute({}, {
        signal: new AbortController().signal,
      } as never)) as {
        roles: readonly { role: string; routes: readonly unknown[] }[];
      };
      expect(result.roles.find((role) => role.role === "swarm workers")?.routes).toEqual([
        {
          provider: "p",
          model: "a",
          reasoning_effort: "low",
          efforts: ["low", "high"],
          defaultEffort: "high",
          served: true,
        },
      ]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
