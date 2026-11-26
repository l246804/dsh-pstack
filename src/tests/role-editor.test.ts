import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { LlmRuntime } from "@deepseek-ai/dsh-llm";

import { parseRoleConfiguration } from "../roles/role-store.ts";
import { ROLE_MANIFEST } from "../roles/role-manifest.ts";
import {
  saveBudgetConfiguration,
  saveRoleConfiguration,
  snapshotFromConfiguration,
  validateSaveRequest,
} from "../roles/role-editor.ts";
import { parseSaveRoleRequest } from "../roles/role-wire.ts";
import { parseLegacyRoute } from "../compat/legacy-route.ts";
import type { Route } from "../roles/route.ts";
import type { CatalogueResult } from "../models.ts";

const directories: string[] = [];

interface SeededDocument {
  readonly budget?: string;
  readonly roles: Record<string, Array<string | Route>>;
}

function tempHome(document: SeededDocument | undefined): string {
  const directory = mkdtempSync(join(tmpdir(), "pstack-editor-"));
  directories.push(directory);
  if (document !== undefined) {
    const { budget, roles } = document;
    const path = pathOf(directory);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          version: 2,
          ...(budget === undefined ? {} : { budget }),
          roles: Object.fromEntries(
            Object.entries(roles).map(([key, routes]) => [
              key,
              routes.map((route) =>
                typeof route === "string" ? parseLegacyRoute(route).route : route,
              ),
            ]),
          ),
        },
        null,
        2,
      )}\n`,
    );
  }
  return directory;
}

function pathOf(directory: string): string {
  return join(directory, "pstack", "models.json");
}

function formatRoute(route: Route): string {
  return route.kind === "inherit"
    ? route.alias
    : route.effort === undefined
      ? `${route.provider}/${route.model}`
      : `${route.provider}/${route.model} [${route.effort}]`;
}

function readDoc(path: string): {
  version: number;
  budget?: string;
  roles: Record<string, string[]>;
} {
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    version: number;
    budget?: string;
    roles: Record<string, Array<string | Route>>;
  };
  const roles: Record<string, string[]> = {};
  for (const [key, routes] of Object.entries(raw.roles)) {
    roles[key] = routes.map((route) => (typeof route === "string" ? route : formatRoute(route)));
  }
  return { version: raw.version, budget: raw.budget, roles };
}

function writeDoc(path: string, document: unknown): void {
  const doc = document as {
    version: number;
    budget?: string;
    roles?: Record<string, Array<string | Route>>;
  };
  const roles =
    doc.roles === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(doc.roles).map(([key, routes]) => [
            key,
            routes.map((route) =>
              typeof route === "string" ? parseLegacyRoute(route).route : route,
            ),
          ]),
        );
  writeFileSync(path, `${JSON.stringify({ ...doc, roles }, null, 2)}\n`);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const catalogue: CatalogueResult = {
  truncated: false,
  providers: [
    {
      provider: "cpa",
      name: "CPA",
      models: [
        { provider: "cpa", id: "model-a", efforts: ["low", "high"] },
        { provider: "cpa", id: "model-b", efforts: ["low", "high"] },
      ],
    },
  ],
};

function llmFixture(overrides: Partial<Record<keyof LlmRuntime, unknown>> = {}): LlmRuntime {
  return {
    listProviders: () =>
      catalogue.providers.map((entry) => ({ id: entry.provider, name: entry.name })),
    listModels: async () => [
      { provider: "cpa", id: "model-a", name: "Model A" },
      { provider: "cpa", id: "model-b", name: "Model B" },
    ],
    resolveModelInfo: async (provider: string, model: string) => ({
      provider,
      id: model,
      name: model,
      reasoning: { efforts: [{ id: "low" }, { id: "high" }], defaultEffort: "high" },
    }),
    ...overrides,
  } as unknown as LlmRuntime;
}

const llm = llmFixture();

const unavailable = {
  listProviders() {
    throw new Error("catalogue unavailable");
  },
} as unknown as LlmRuntime;

describe("role editor", () => {
  it("reports every manifest role in a missing snapshot", () => {
    const path = join(tempHome(undefined), "missing.json");
    const snapshot = snapshotFromConfiguration({ status: "missing", path });
    expect(snapshot.status).toBe("missing");
    expect(snapshot.roles.length).toBe(ROLE_MANIFEST.length);
    expect(snapshot.canSave).toBe(true);
  });

  it("saves one role and preserves the budget and other roles", async () => {
    const home = tempHome({ budget: "large (xhigh)", roles: { "bug-fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const result = await saveRoleConfiguration(
      path,
      {
        key: "feature, refactoring",
        routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
      },
      llm,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    const document = readDoc(path);
    expect(document.budget).toBe("large (xhigh)");
    expect(document.roles["bug-fix"]).toEqual(["cpa/model-a [low]"]);
    expect(document.roles["feature, refactoring"]).toEqual(["cpa/model-a [high]"]);
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
    expect(parseRoleConfiguration(readFileSync(path, "utf8"), path).status).toBe("loaded");
  });

  it("validates provider, model, and effort against the catalogue", () => {
    expect(
      validateSaveRequest(
        {
          key: "bug-fix",
          routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
        },
        catalogue,
      ).ok,
    ).toBe(true);
    expect(
      validateSaveRequest(
        {
          key: "bug-fix",
          routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "max" }],
        },
        catalogue,
      ),
    ).toMatchObject({ ok: false });
  });

  it("accepts deletion and rejects malformed routes at the wire boundary", () => {
    expect(validateSaveRequest({ key: "bug-fix", routes: [] }, catalogue)).toEqual({
      ok: true,
      key: "bug-fix",
      routes: [],
    });
    expect(() =>
      parseSaveRoleRequest({ key: "bug-fix", routes: [{ kind: "route", provider: "cpa" }] }),
    ).toThrow();
  });

  it("deletes a role by removing its key", async () => {
    const home = tempHome({ roles: { "bug-fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const result = await saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [] },
      llm,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(readDoc(path).roles["bug-fix"]).toBeUndefined();
  });

  it.each(["Bug-Fix", "  BUG-FIX :  "])(
    "replaces every alias of a role, including %s, without changing other roles",
    async (alias) => {
      const home = tempHome({
        budget: "large (xhigh)",
        roles: {
          "bug-fix": ["cpa/model-a [low]"],
          [alias]: ["cpa/model-b [low]"],
          "perf-issue": ["cpa/model-a [high]"],
        },
      });
      const path = pathOf(home);
      const result = await saveRoleConfiguration(
        path,
        {
          key: "bug-fix",
          routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
        },
        llm,
        new AbortController().signal,
      );
      if (!result.ok) throw new Error(result.reason);
      expect(readDoc(path)).toEqual({
        version: 2,
        budget: "large (xhigh)",
        roles: {
          "bug-fix": ["cpa/model-a [high]"],
          "perf-issue": ["cpa/model-a [high]"],
        },
      });
      expect(result.snapshot.issues).toEqual([]);
      expect(result.snapshot.roles.find((role) => role.key === "bug-fix")?.routes).toEqual([
        { kind: "route", provider: "cpa", model: "model-a", effort: "high" },
      ]);
    },
  );

  it("clears a role stored under a normalized alias", async () => {
    const home = tempHome({ roles: { "Bug-Fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const result = await saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [] },
      unavailable,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(readDoc(path).roles).toEqual({});
    expect(result.snapshot.roles.find((role) => role.key === "bug-fix")?.configured).toBe(false);
  });

  it.each([{ routes: [] }, { routes: [{ kind: "inherit", alias: "inherit-parent" }] }] satisfies {
    routes: Route[];
  }[])("replaces only the target's malformed entries with $routes", async ({ routes }) => {
    const home = tempHome(undefined);
    const path = pathOf(home);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        version: 2,
        budget: "large (xhigh)",
        roles: {
          "Bug-Fix": [{ kind: "route", model: "model-a" }],
          "perf-issue": [{ kind: "inherit", alias: "auto" }],
        },
      }),
    );
    const result = await saveRoleConfiguration(
      path,
      { key: "bug-fix", routes },
      unavailable,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    const document = readDoc(path);
    expect(document.budget).toBe("large (xhigh)");
    expect(document.roles["perf-issue"]).toEqual(["auto"]);
    expect(document.roles["Bug-Fix"]).toBeUndefined();
    expect(result.snapshot.roles.find((role) => role.key === "bug-fix")?.routes).toEqual(routes);
    expect(result.snapshot.issues).toEqual([]);
  });

  it("keeps an unrelated malformed entry intact when a role save is refused", async () => {
    const home = tempHome(undefined);
    const path = pathOf(home);
    mkdirSync(dirname(path), { recursive: true });
    const original = JSON.stringify({
      version: 2,
      roles: { "perf-issue": [{ kind: "route", model: "model-a" }] },
    });
    writeFileSync(path, original);
    const result = await saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [{ kind: "inherit", alias: "auto" }] },
      unavailable,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("perf-issue") });
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("updates every route of a list role", async () => {
    const home = tempHome({ roles: { "arena runners": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const result = await saveRoleConfiguration(
      path,
      {
        key: "arena runners",
        routes: [
          { kind: "route", provider: "cpa", model: "model-a", effort: "high" },
          { kind: "route", provider: "cpa", model: "model-b", effort: "low" },
        ],
      },
      llm,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(readDoc(path).roles["arena runners"]).toEqual([
      "cpa/model-a [high]",
      "cpa/model-b [low]",
    ]);
  });

  it("re-reads the role file after an asynchronous catalogue lookup", async () => {
    const home = tempHome({ roles: { "bug-fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const concurrentLlm = llmFixture({
      listModels: async () => {
        const current = readDoc(path);
        current.roles["perf-issue"] = ["cpa/model-a [high]"];
        writeDoc(path, current);
        return [{ provider: "cpa", id: "model-a", name: "Model A" }];
      },
    });
    const result = await saveRoleConfiguration(
      path,
      {
        key: "feature, refactoring",
        routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
      },
      concurrentLlm,
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    expect(readDoc(path).roles["perf-issue"]).toEqual(["cpa/model-a [high]"]);
  });

  it("clears a role without model discovery and makes repeat clears a no-op", async () => {
    const home = tempHome({ roles: { "bug-fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const first = await saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [] },
      unavailable,
      new AbortController().signal,
    );
    if (!first.ok) throw new Error(first.reason);
    expect(readDoc(path).roles["bug-fix"]).toBeUndefined();
    expect(first.snapshot.roles.find((role) => role.key === "bug-fix")?.configured).toBe(false);

    const afterFirst = readFileSync(path, "utf8");
    const second = await saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [] },
      unavailable,
      new AbortController().signal,
    );
    expect(second.ok).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(afterFirst);
  });

  it("saves an inherit-only route without model discovery", async () => {
    const home = tempHome({ roles: { "bug-fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const result = await saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [{ kind: "inherit", alias: "auto" }] },
      unavailable,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(readDoc(path).roles["bug-fix"]).toEqual(["auto"]);
  });

  it("does not create a file when an absent role is cleared", async () => {
    const path = join(tempHome(undefined), "missing.json");
    const result = await saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [] },
      llm,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.snapshot.status).toBe("missing");
    expect(existsSync(path)).toBe(false);
  });

  it("rejects an aborted clear without changing the file", async () => {
    const home = tempHome({ roles: { "bug-fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const original = readFileSync(path, "utf8");
    const controller = new AbortController();
    controller.abort();
    await expect(
      saveRoleConfiguration(path, { key: "bug-fix", routes: [] }, llm, controller.signal),
    ).rejects.toThrow();
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("returns a refused save for provider and model discovery failures", async () => {
    const home = tempHome({ roles: {} });
    const path = pathOf(home);
    const original = readFileSync(path, "utf8");
    const failures = [
      {
        listProviders() {
          throw new Error("provider failed");
        },
      },
      llmFixture({ listModels: async () => Promise.reject(new Error("models failed")) }),
      llmFixture({
        resolveModelInfo: async () => Promise.reject(new Error("info failed")),
      }),
    ] as unknown as LlmRuntime[];
    for (const failing of failures) {
      const result = await saveRoleConfiguration(
        path,
        {
          key: "bug-fix",
          routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
        },
        failing,
        new AbortController().signal,
      );
      expect(result).toMatchObject({ ok: false, reason: expect.any(String) });
      expect(readFileSync(path, "utf8")).toBe(original);
    }
  });

  it("applies a budget to concrete routes and sets the budget value", async () => {
    const home = tempHome({ budget: "large (xhigh)", roles: { "bug-fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const result = await saveBudgetConfiguration(
      path,
      { tier: "large", scope: "concrete" },
      llm,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    const document = readDoc(path);
    expect(document.budget).toBe("large (xhigh)");
    expect(document.roles["bug-fix"]).toEqual(["cpa/model-a [high]"]);
  });

  it("applies a budget to a role stored under a normalized alias", async () => {
    const home = tempHome({ roles: { "Bug-Fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const result = await saveBudgetConfiguration(
      path,
      { tier: "large", scope: "concrete" },
      llm,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(readDoc(path).roles).toEqual({ "bug-fix": ["cpa/model-a [high]"] });
    expect(result.snapshot.issues).toEqual([]);
  });

  it("leaves the file byte-identical when the budget is a no-op", async () => {
    const original = `${JSON.stringify(
      {
        version: 2,
        budget: "large (xhigh)",
        roles: {
          "bug-fix": [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
        },
      },
      null,
      2,
    )}\n`;
    const home = tempHome(undefined);
    const path = pathOf(home);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, original);
    const result = await saveBudgetConfiguration(
      path,
      { tier: "large", scope: "concrete" },
      llm,
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("refuses a budget when a configured route model is missing", async () => {
    const home = tempHome({
      roles: {
        "bug-fix": [{ kind: "route", provider: "ghost", model: "model", effort: "low" }],
      },
    });
    const path = pathOf(home);
    const original = readFileSync(path, "utf8");
    const result = await saveBudgetConfiguration(
      path,
      { tier: "large", scope: "concrete" },
      llm,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("bug-fix") });
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("re-reads the role file after an asynchronous catalogue lookup for a budget", async () => {
    const home = tempHome({ roles: { "bug-fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const concurrentLlm = llmFixture({
      listModels: async () => {
        const current = readDoc(path);
        current.roles["perf-issue"] = ["cpa/model-a [high]"];
        writeDoc(path, current);
        return [
          { provider: "cpa", id: "model-a", name: "Model A" },
          { provider: "cpa", id: "model-b", name: "Model B" },
        ];
      },
    });
    const result = await saveBudgetConfiguration(
      path,
      { tier: "large", scope: "concrete" },
      concurrentLlm,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    const document = readDoc(path);
    expect(document.roles["perf-issue"]).toEqual(["cpa/model-a [high]"]);
    expect(document.roles["bug-fix"]).toEqual(["cpa/model-a [high]"]);
  });

  it("fills unconfigured roles with the selected default model", async () => {
    const home = tempHome({ roles: {} });
    const path = pathOf(home);
    const result = await saveBudgetConfiguration(
      path,
      {
        tier: "large",
        scope: "unconfigured",
        defaultModel: { provider: "cpa", model: "model-a" },
      },
      llm,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    const document = readDoc(path);
    expect(document.budget).toBe("large (xhigh)");
    expect(document.roles["feature, refactoring"]).toEqual(["cpa/model-a [high]"]);
  });

  it("does not rewrite configured concrete routes in the unconfigured scope", async () => {
    const home = tempHome({ roles: { "bug-fix": ["cpa/model-a [low]"] } });
    const path = pathOf(home);
    const result = await saveBudgetConfiguration(
      path,
      {
        tier: "large",
        scope: "unconfigured",
        defaultModel: { provider: "cpa", model: "model-a" },
      },
      llm,
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(readDoc(path).roles["bug-fix"]).toEqual(["cpa/model-a [low]"]);
  });

  it("refuses a budget when a role entry is malformed and leaves the file untouched", async () => {
    const home = tempHome({
      roles: { "bug-fix": [{ kind: "route", model: "model-a" } as unknown as Route] },
    });
    const path = pathOf(home);
    const original = readFileSync(path, "utf8");
    const result = await saveBudgetConfiguration(
      path,
      { tier: "large", scope: "concrete" },
      llm,
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(original);
  });
});
