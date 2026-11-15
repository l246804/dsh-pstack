import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { parseConfig } from "../playground/scripts/lib/config.ts";
import { environments, scenariosById } from "../playground/scenarios/index.ts";

interface InventoryCapability {
  id: string;
  status: string;
  probes?: { base?: string };
}

function inventory(): InventoryCapability[] {
  const text = readFileSync(
    new URL("../playground/scenarios/capability-inventory.json", import.meta.url),
    "utf8",
  );
  return (JSON.parse(text) as { capabilities: InventoryCapability[] }).capabilities;
}

function config(provider = "provider-a", model = "model-a", effort = "low") {
  return {
    testModel: { provider, model, effort },
    providers: {
      "provider-a": { apiKey: "secret-a", models: { "model-a": ["low", "high"] } },
      "provider-b": { apiKey: "secret-b", models: { "model-b": ["medium"] } },
    },
  };
}

describe("playground configuration", () => {
  it.each([
    ["provider-a", "model-a", "high"],
    ["provider-b", "model-b", "medium"],
  ])("selects an allowed target %s/%s[%s]", (provider, model, effort) => {
    expect(parseConfig(config(provider, model, effort)).testModel).toEqual({
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
    expect(() => parseConfig(config(provider, model, effort))).toThrow(/testModel/);
  });

  it("uses the existing bare model ids in the provider allowlist", () => {
    expect(parseConfig(config()).providers["provider-a"]?.models).toHaveProperty("model-a");
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
});

describe("playground environments", () => {
  it("declares complete plugin environments instead of host inheritance", () => {
    for (const environment of environments) {
      expect(environment.id).not.toBe("");
      expect(new Set(environment.enabledPluginPackages).size).toBe(
        environment.enabledPluginPackages.length,
      );
    }
  });
});

describe("playground capability coverage", () => {
  it("resolves every covered capability to a registered probe", () => {
    for (const capability of inventory()) {
      if (capability.status !== "covered") continue;
      expect(
        capability.probes?.base,
        `${capability.id} is covered without a base probe`,
      ).toBeDefined();
      expect(
        scenariosById.has(capability.probes!.base!),
        `${capability.id} points at unknown probe ${capability.probes!.base}`,
      ).toBe(true);
    }
  });
});
