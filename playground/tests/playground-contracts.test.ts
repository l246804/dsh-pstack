import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { parseConfig } from "../runner/config/config.ts";
import { fromHost } from "../runner/config/config-host.ts";
import { environments, scenariosById } from "../runner/scenario/index.ts";
import { loadProviderPlan } from "../runner/config/provider.ts";
function config(provider = "provider-a", model = "model-a", effort = "low") {
  return {
    testModel: { provider, model, effort },
    runtime: {
      scenarioTimeoutMs: 600000,
      turnTimeoutMs: 180000,
      subagentTimeoutMs: 600000,
      networkMode: "host",
      workerPortBase: 8080,
      workerCapacity: {
        coreHeadroom: 2,
        memoryFraction: 0.7,
        memoryPerWorkerGB: 1,
      },
      workspaceRoot: "playground/.workspace",
      workersDir: "playground/.workers",
      dockerBin: "docker",
      dshBin: "dsh",
      vpxBin: "vpx",
      pnpmBin: "pnpm",
    },
    providers: {
      "provider-a": {
        kind: "pi-ai",
        apiKey: "secret-a",
        apiKeyEnv: "PROVIDER_A_KEY",
        reasoning: "low",
        models: [{ id: "model-a", reasoningEfforts: { low: "low", high: "high" } }],
      },
      "provider-b": {
        kind: "pi-ai",
        apiKey: "secret-b",
        apiKeyEnv: "PROVIDER_B_KEY",
        reasoning: "low",
        models: [{ id: "model-b", reasoningEfforts: { medium: "medium" } }],
      },
    },
  };
}

describe("playground configuration", () => {
  it.each([
    ["provider-a", "model-a", "high"],
    ["provider-b", "model-b", "medium"],
  ])("selects an allowed target %s/%s[%s]", (provider, model, effort) => {
    expect(loadProviderPlan(parseConfig(config(provider, model, effort))).main).toMatchObject({
      provider,
      model,
      effort,
    });
  });

  it.each([
    ["unknown-provider", "model-a", "low"],
    ["provider-a", "unknown-model", "low"],
    ["provider-b", "model-b", "low"],
  ])("rejects a target outside the allowance %s/%s[%s]", (provider, model, effort) => {
    expect(() => loadProviderPlan(parseConfig(config(provider, model, effort)))).toThrow(
      /testModel/,
    );
  });

  it("accepts role model routes that resolve against the provider allowlist", () => {
    const parsed = parseConfig({
      ...config(),
      roleModels: {
        "bug-fix": { provider: "provider-a", model: "model-a", effort: "low" },
      },
    });
    expect(parsed.roleModels?.["bug-fix"]).toEqual({
      provider: "provider-a",
      model: "model-a",
      effort: "low",
    });
  });

  it("accepts a managed or CDP browser config and rejects CDP without a URL", () => {
    expect(
      parseConfig({ ...config(), browser: { mode: "managed", headed: true } }).browser,
    ).toEqual({ mode: "managed", headed: true });
    expect(
      parseConfig({ ...config(), browser: { mode: "cdp", cdpUrl: "http://127.0.0.1:9222" } })
        .browser,
    ).toEqual({ mode: "cdp", cdpUrl: "http://127.0.0.1:9222" });
    expect(() => parseConfig({ ...config(), browser: { mode: "cdp" } })).toThrow(/browser\.cdpUrl/);
  });

  it("accepts DeepSeek API-key and account provider kinds up to the max tier", () => {
    expect(() =>
      loadProviderPlan(
        parseConfig({
          ...config(),
          testModel: { provider: "deepseek-official", model: "deepseek-flash", effort: "max" },
          providers: {
            "deepseek-official": {
              kind: "deepseek-api-key",
              apiKey: "secret",
              apiKeyEnv: "DEEPSEEK_API_KEY",
              models: [{ id: "deepseek-flash", inputModalities: ["text", "image"] }],
            },
          },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      loadProviderPlan(
        parseConfig({
          ...config(),
          copyCredentials: true,
          testModel: { provider: "deepseek-account", model: "deepseek-flash", effort: "max" },
          providers: { "deepseek-account": { kind: "deepseek-account", modelOverrides: {} } },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects a DeepSeek effort outside the four published tiers", () => {
    expect(() =>
      loadProviderPlan(
        parseConfig({
          ...config(),
          testModel: { provider: "deepseek-official", model: "deepseek-flash", effort: "medium" },
          providers: {
            "deepseek-official": {
              kind: "deepseek-api-key",
              apiKey: "secret",
              apiKeyEnv: "DEEPSEEK_API_KEY",
              models: [{ id: "deepseek-flash", inputModalities: ["text"] }],
            },
          },
        }),
      ),
    ).toThrow(/testModel/);
  });

  it("rejects DeepSeek catalog entries the runtime would refuse to load", () => {
    const withModel = (model: Record<string, unknown>): unknown => ({
      ...config(),
      testModel: { provider: "deepseek-official", model: "deepseek-flash", effort: "high" },
      providers: {
        "deepseek-official": {
          kind: "deepseek-api-key",
          apiKey: "secret",
          apiKeyEnv: "DEEPSEEK_API_KEY",
          models: [{ id: "deepseek-flash", ...model }],
        },
      },
    });
    expect(() => parseConfig(withModel({ inputModalities: [] }))).toThrow(/inputModalities/);
    expect(() => parseConfig(withModel({ inputModalities: ["text", "text"] }))).toThrow(
      /inputModalities/,
    );
    expect(() => parseConfig(withModel({ imageTargetBytes: 1024 }))).toThrow(/text-only/);
    expect(() =>
      parseConfig(withModel({ inputModalities: ["image"], imagePixelBudget: -1 })),
    ).toThrow(/imagePixelBudget/);
    expect(() =>
      parseConfig(withModel({ inputModalities: ["text", "image"], imageTargetBytes: 1.5 })),
    ).toThrow(/imageTargetBytes/);
  });
});

function tempPatch(content: unknown): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "dsh-host-"));
  const file = join(dir, "cordis.patch.yml");
  writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`);
  return { dir, file };
}

describe("fromHost DeepSeek routes", () => {
  it.each([null, "invalid", { id: 42 }, { id: "llm-deepseek", config: [] }])(
    "reports malformed host patch rows with their file: %j",
    (row) => {
      const { dir, file } = tempPatch([row]);
      try {
        expect(() => fromHost({}, { file })).toThrow(`host patch has an invalid row: ${file}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it("builds both DeepSeek providers from an empty host patch", () => {
    const { dir, file } = tempPatch([]);
    try {
      const providers = fromHost(
        {
          "deepseek-official": { models: [{ id: "deepseek-flash" }], reasoning: "high" },
          "deepseek-account": { account: true },
        },
        { file },
      );
      expect(providers["deepseek-official"]).toEqual({
        kind: "deepseek-api-key",
        apiKey: "${DEEPSEEK_API_KEY}",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        reasoning: "high",
      });
      expect(providers["deepseek-account"]).toEqual({ kind: "deepseek-account" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("filters custom DeepSeek models by id and keeps inputModalities", () => {
    const { dir, file } = tempPatch([
      {
        id: "llm-deepseek",
        config: {
          apiKeyEnv: "MY_DEEPSEEK_KEY",
          reasoningEffort: "max",
          models: [
            {
              id: "deepseek-flash",
              name: "Flash",
              contextWindow: 1048576,
              inputModalities: ["text", "image"],
            },
            { id: "custom-model", inputModalities: ["text"] },
          ],
        },
      },
    ]);
    try {
      const providers = fromHost(
        { "deepseek-official": { models: [{ id: "deepseek-flash" }] } },
        { file },
      );
      expect(providers["deepseek-official"]).toEqual({
        kind: "deepseek-api-key",
        apiKey: "${MY_DEEPSEEK_KEY}",
        apiKeyEnv: "MY_DEEPSEEK_KEY",
        reasoning: "max",
        models: [
          {
            id: "deepseek-flash",
            name: "Flash",
            contextWindow: 1048576,
            inputModalities: ["text", "image"],
          },
        ],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an account row that still configures models", () => {
    const { dir, file } = tempPatch([
      { id: "llm-deepseek-account", config: { models: [{ id: "deepseek-flash" }] } },
    ]);
    try {
      expect(() => fromHost({ "deepseek-account": { account: true } }, { file })).toThrow(
        /modelOverrides/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects per-model efforts, which a DeepSeek route does not read", () => {
    const { dir, file } = tempPatch([]);
    try {
      expect(() =>
        fromHost(
          { "deepseek-official": { models: [{ id: "deepseek-flash", efforts: ["low"] }] } },
          { file },
        ),
      ).toThrow(/provider-level reasoning/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scenario definitions", () => {
  it("registers runnable cases without consulting the native gap inventory", () => {
    for (const scenario of scenariosById.values()) {
      expect(scenario.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(["gap", "regression"]).toContain(scenario.kind);
      expect(scenario.turns.length).toBeGreaterThan(0);
      expect(scenario.rubric.prompt.trim()).not.toBe("");
      for (const environment of scenario.environments ?? ["base"]) {
        expect(environments.some((entry) => entry.id === environment)).toBe(true);
      }
    }
  });
});
