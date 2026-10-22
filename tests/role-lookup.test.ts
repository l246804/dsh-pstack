import { describe, expect, it } from "vite-plus/test";
import { findNearMisses, parseModelConfig, resolveRole } from "../src/roles.ts";

/**
 * Role lookup must be exact. Resolving a near miss picks a route the user never
 * named, which changes both cost and model without saying so.
 */
describe("role lookup precision", () => {
  const table = parseModelConfig(
    [
      "how explorer: anthropic/claude-sonnet high",
      "how explainer: openai/gpt-5 medium",
      "feature, refactoring: deepseek-official/deepseek-reasoner high",
      "reflect judgment, divergent, synthesizer: inherit-parent",
    ].join("\n"),
  );

  it("resolves an exact shared-line member", () => {
    expect(resolveRole(table, "refactoring")).toEqual({
      provider: "deepseek-official",
      model: "deepseek-reasoner",
      reasoningEffort: "high",
    });
  });

  it("does not resolve a prefix of a configured role", () => {
    expect(resolveRole(table, "how")).toBeUndefined();
    expect(resolveRole(table, "reflect")).toBeUndefined();
  });

  it("does not resolve a longer name that contains a configured role", () => {
    expect(resolveRole(table, "how explorer extra")).toBeUndefined();
  });

  it("names the candidates a near miss could have meant", () => {
    expect(findNearMisses(table, "how")).toEqual(["how explorer", "how explainer"]);
    expect(findNearMisses(table, "reflect judgment")).toEqual([
      "reflect judgment, divergent, synthesizer",
    ]);
  });

  it("reports no candidates for an unrelated name", () => {
    expect(findNearMisses(table, "bug-fix")).toEqual([]);
  });
});
