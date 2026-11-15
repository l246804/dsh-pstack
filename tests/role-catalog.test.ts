import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { ROLE_MANIFEST } from "../src/roles/role-manifest.ts";
import {
  TOOL_NAME,
  createPstackRolesTool,
  renderRoleCapabilities,
  roleCapabilities,
} from "../src/role-catalog.ts";

describe("pstack_roles", () => {
  it("reports every manifest role in order", () => {
    expect(roleCapabilities().map((role) => role.role)).toEqual(
      ROLE_MANIFEST.map((role) => role.key),
    );
  });

  it("reports configured routes as structured provider/model/reasoningEffort values", () => {
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
      { provider: "p", model: "b", reasoningEffort: "high" },
    ]);
    expect(roles.find((role) => role.role === "arena cross-judge pool")?.routes).toEqual([
      { provider: "p", model: "a" },
    ]);
  });

  it("reports list roles by shape and leaves unconfigured roles without routes", () => {
    const roles = roleCapabilities();
    for (const key of ["arena runners", "architect runners", "interrogate reviewers"]) {
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
    expect(text).toContain("routes=provider=p model=a reasoningEffort=low");
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
});
