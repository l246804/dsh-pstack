import { describe, expect, it } from "vite-plus/test";

import { collectCatalogue, renderCatalogue } from "../src/models.ts";
import type { LlmHost } from "../src/internal/host-contract.ts";

const signal = new AbortController().signal;

/** The read-only directory reports exactly what the live adapters advertise. */
const llm = {
  listProviders: () => [
    { id: "cpa", name: "CPA" },
    { id: "broken", name: "Broken" },
  ],
  listModels: async (provider: string) => {
    if (provider === "broken") throw new Error("adapter went away");
    return [
      { provider: "cpa", id: "workbuddy/deepseek-v4.1-flash", name: "DeepSeek V4" },
      { provider: "cpa", id: "workbuddy/minimax-m3.1-flash", name: "MiniMax" },
    ];
  },
  resolveModelInfo: async (provider: string, model: string) => ({
    provider,
    id: model,
    name: model,
    reasoning: {
      efforts: [{ id: "off" }, { id: "low" }, { id: "high" }, { id: "max" }],
      defaultEffort: "high",
    },
  }),
} as unknown as LlmHost;

describe("pstack_models", () => {
  it("lists providers, routes, and advertised efforts", async () => {
    const result = await collectCatalogue(llm, undefined, signal);
    expect(result.truncated).toBe(false);
    expect(result.providers.map((provider) => provider.provider)).toEqual(["cpa", "broken"]);
    const cpa = result.providers[0]!;
    expect(cpa.models.map((model) => model.route)).toEqual([
      "cpa/workbuddy/deepseek-v4.1-flash",
      "cpa/workbuddy/minimax-m3.1-flash",
    ]);
    expect(cpa.models[0]!.efforts).toEqual(["off", "low", "high", "max"]);
    expect(result.providers[1]!.error).toMatch(/adapter went away/);
    expect(renderCatalogue(result)).toContain(
      "cpa/workbuddy/deepseek-v4.1-flash — efforts: off, low, high, max",
    );
  });

  it("filters to one provider by id or display name", async () => {
    expect((await collectCatalogue(llm, "CPA", signal)).providers).toHaveLength(1);
    expect((await collectCatalogue(llm, "nope", signal)).providers).toHaveLength(0);
  });
});
