import { describe, expect, it } from "vite-plus/test";

import type { LlmRuntime } from "@deepseek-ai/dsh-llm";

import { collectCatalogue, renderCatalogue } from "../models.ts";

const signal = new AbortController().signal;

const llm = {
  listProviders: () => [
    { id: "cpa", name: "CPA" },
    { id: "broken", name: "Broken" },
  ],
  listModels: async (provider: string) => {
    if (provider === "broken") throw new Error("adapter went away");
    return [
      { provider: "cpa", id: "vendor/model-a", name: "Model A" },
      { provider: "cpa", id: "vendor/model-b", name: "Model B" },
    ];
  },
  resolveModelInfo: async (provider: string, model: string) => ({
    provider,
    id: model,
    name: model,
    reasoning: {
      efforts: [{ id: "off" }, { id: "low" }, { id: "high" }],
      defaultEffort: "high",
    },
  }),
} as unknown as LlmRuntime;

describe("pstack_models", () => {
  it("lists live providers, routes, and efforts", async () => {
    const result = await collectCatalogue(llm, undefined, signal);
    expect(result.providers.map((provider) => provider.provider)).toEqual(["cpa", "broken"]);
    expect(result.providers[0]?.models[0]?.id).toBe("vendor/model-a");
    expect(result.providers[0]?.models[0]?.efforts).toEqual(["off", "low", "high"]);
    expect(result.providers[1]?.error).toMatch(/adapter went away/);
    const rendered = renderCatalogue(result);
    expect(rendered).toContain("cpa (CPA)");
    expect(rendered).toContain("  vendor/model-a — efforts: off, low, high");
    expect(rendered).not.toContain("cpa/vendor/model-a —");
  });

  it("filters by provider id or display name", async () => {
    expect((await collectCatalogue(llm, "CPA", signal)).providers).toHaveLength(1);
    expect((await collectCatalogue(llm, "missing", signal)).providers).toHaveLength(0);
  });

  it("keeps providers and models beyond the former directory limits", async () => {
    const large = {
      resolveModelInfo: llm.resolveModelInfo.bind(llm),
      listProviders: () =>
        Array.from({ length: 65 }, (_, index) => ({ id: `p${index}`, name: `P${index}` })),
      listModels: async (provider: string) =>
        Array.from({ length: provider === "p64" ? 201 : 1 }, (_, index) => ({
          provider,
          id: `m${index}`,
          name: `M${index}`,
        })),
    } as LlmRuntime;
    const result = await collectCatalogue(large, undefined, signal);
    expect(result.providers).toHaveLength(65);
    expect(result.providers[64]?.models).toHaveLength(201);
    expect(result.providers[64]?.models[200]?.efforts).toEqual(["off", "low", "high"]);
    expect(result.truncated).toBe(false);
  });

  it("propagates cancellation instead of reporting it as a provider error", async () => {
    const controller = new AbortController();
    const cancelled = {
      listProviders: () => [{ id: "cpa", name: "CPA" }],
      listModels: async () => {
        controller.abort();
        throw new Error("cancelled");
      },
    } as unknown as LlmRuntime;
    await expect(collectCatalogue(cancelled, undefined, controller.signal)).rejects.toThrow(
      "cancelled",
    );
  });
});
