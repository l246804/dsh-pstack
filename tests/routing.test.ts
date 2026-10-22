import { describe, expect, it } from "vite-plus/test";
import { parseModelConfig } from "../src/roles.ts";
import { buildActivationRequest, routeToAgentOptions } from "../src/subagent.ts";

/**
 * End-to-end route assembly: role table → resolved route → provider options on
 * the activation request. This is the seam where a wrong role name or a lost
 * effort token used to fail silently, because nothing asserted the options the
 * child actually receives.
 */
describe("role to agent options", () => {
  const table = parseModelConfig(
    [
      "feature, refactoring: deepseek-official/deepseek-reasoner high",
      "judgment and prose: inherit-parent",
      "arena runners: inherit-parent, anthropic/claude-sonnet xhigh, openai/gpt-5 medium",
    ].join("\n"),
  );

  it("maps a resolved route onto provider options", () => {
    expect(
      routeToAgentOptions({
        provider: "deepseek-official",
        model: "deepseek-reasoner",
        reasoningEffort: "high",
      }),
    ).toEqual({
      provider: "deepseek-official",
      model: "deepseek-reasoner",
      reasoningEffort: "high",
    });
  });

  it("omits agentOptions when the role inherits the parent", () => {
    expect(routeToAgentOptions(undefined)).toBeUndefined();
  });

  const parent = { id: "parent" } as never;
  const prompt = [{ type: "text" as const, text: "do the work" }];

  it("carries the resolved role onto the activation request", () => {
    const request = buildActivationRequest({
      parent,
      prompt,
      route: { provider: "anthropic", model: "claude-sonnet", reasoningEffort: "xhigh" },
      cwd: "/tmp/work",
    });
    expect(request.agentOptions).toEqual({
      provider: "anthropic",
      model: "claude-sonnet",
      reasoningEffort: "xhigh",
    });
    expect(request.cwd).toBe("/tmp/work");
  });

  it("omits both cwd and agentOptions when neither is set", () => {
    const request = buildActivationRequest({ parent, prompt, route: undefined, cwd: undefined });
    expect("agentOptions" in request).toBe(false);
    expect("cwd" in request).toBe(false);
  });

  it("resolves a panel entry to concrete options", async () => {
    const { resolveRole } = await import("../src/roles.ts");
    expect(routeToAgentOptions(resolveRole(table, "arena runners", 1))).toEqual({
      provider: "anthropic",
      model: "claude-sonnet",
      reasoningEffort: "xhigh",
    });
    expect(routeToAgentOptions(resolveRole(table, "arena runners", 2))).toEqual({
      provider: "openai",
      model: "gpt-5",
      reasoningEffort: "medium",
    });
  });

  it("wraps the panel index so extra children still get a route", async () => {
    const { resolveRole } = await import("../src/roles.ts");
    // Three entries, so index 3 wraps to the first (inherit-parent → undefined).
    expect(resolveRole(table, "arena runners", 3)).toBeUndefined();
  });
});
