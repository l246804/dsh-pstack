/**
 * Reasoning-effort control, both halves.
 *
 * The two halves fail in different places, so they are asserted differently:
 *
 * - the caller's override is a *plan* property: it must land on the activation
 *   request, and it must be validated for every panel entry before any child starts;
 * - the child's own change is a *waterfall* property: it must rewrite the next
 *   request and leave the one already in flight alone.
 *
 * There is deliberately no test asserting a hardcoded list of effort tokens. Option B
 * in `docs/decisions/2026-10-26-dynamic-reasoning-effort.md` is the decision that no
 * such list exists here: the model advertises its own, and these tests hand the model
 * a different vocabulary than any real deployment uses to prove nothing hardcodes one.
 */
import { describe, expect, it } from "vite-plus/test";

import { fakeAgent, toolExec } from "./fake-agent.ts";
import type { LlmCallConfig, LlmHost } from "../src/host-contract.ts";
import {
  SET_EFFORT_TOOL,
  agentOptionsFor,
  effectiveEffort,
  installEffortControl,
  resolveEffortTarget,
  validateEffortFor,
} from "../src/effort.ts";

/** A deliberately non-standard effort vocabulary, so no token can be hardcoded. */
const ADVERTISED = ["deeper", "standard", "shallower"];

interface LlmOptions {
  readonly efforts?: readonly string[];
  /** Models that advertise no reasoning control at all. */
  readonly noReasoning?: boolean;
  readonly failResolve?: boolean;
}

function fakeLlm(options: LlmOptions = {}) {
  const resolved: Array<{ provider: string; model: string }> = [];
  const llm: LlmHost = {
    listProviders: () => [],
    async resolveModelInfo(provider, model) {
      if (options.failResolve === true) throw new Error("adapter unavailable");
      resolved.push({ provider, model });
      if (options.noReasoning === true) return { provider, id: model, name: model };
      const efforts = options.efforts ?? ADVERTISED;
      return {
        provider,
        id: model,
        name: model,
        reasoning: { efforts: efforts.map((id) => ({ id, name: id })) },
      };
    },
    async resolveCallConfig(config) {
      return config;
    },
  };
  return { llm, resolved };
}

const SIGNAL = new AbortController().signal;
const CONFIG: LlmCallConfig = { provider: "provider", model: "model" };

describe("resolving the route an effort applies to", () => {
  it("prefers the live request header over creation-time options", () => {
    const fake = fakeAgent({
      provider: "old-provider",
      model: "old-model",
      header: { provider: "new-provider", model: "new-model" },
    });
    expect(resolveEffortTarget(fake.agent)).toEqual({
      provider: "new-provider",
      model: "new-model",
    });
  });

  it("falls back to creation-time options before the first request", () => {
    const fake = fakeAgent({ provider: "old-provider", model: "old-model" });
    expect(resolveEffortTarget(fake.agent)).toEqual({
      provider: "old-provider",
      model: "old-model",
    });
  });

  it("prefers an explicit route over both, because that is what will be requested", () => {
    const fake = fakeAgent({
      provider: "old-provider",
      model: "old-model",
      header: { provider: "new-provider", model: "new-model" },
    });
    expect(
      resolveEffortTarget(fake.agent, { kind: "route", provider: "explicit", model: "chosen" }),
    ).toEqual({ provider: "explicit", model: "chosen" });
  });

  it("reports no target when no route can be resolved at all", () => {
    expect(resolveEffortTarget(fakeAgent().agent)).toBeUndefined();
  });

  it("reports no target when there is no agent handle", () => {
    expect(resolveEffortTarget(undefined)).toBeUndefined();
  });
});

describe("validating an override against the target model", () => {
  it("accepts an effort the model advertises", async () => {
    const { llm } = fakeLlm();
    await expect(
      validateEffortFor(
        llm,
        { kind: "route", provider: "local", model: "a" },
        "deeper",
        undefined,
        SIGNAL,
      ),
    ).resolves.toBeUndefined();
  });

  it("validates against the route the child will actually request", async () => {
    const { llm, resolved } = fakeLlm();
    await validateEffortFor(
      llm,
      { kind: "route", provider: "local", model: "a" },
      "standard",
      fakeAgent({ provider: "other", model: "b" }).agent,
      SIGNAL,
    );
    expect(resolved).toEqual([{ provider: "local", model: "a" }]);
  });

  it("validates an inherit-parent override against the live request header", async () => {
    const { llm, resolved } = fakeLlm();
    const parent = fakeAgent({ header: { provider: "new-provider", model: "new-model" } }).agent;
    await validateEffortFor(llm, { kind: "inherit" }, "shallower", parent, SIGNAL);
    expect(resolved).toEqual([{ provider: "new-provider", model: "new-model" }]);
  });

  it("rejects an effort the model does not advertise, and names the real ones", async () => {
    const { llm } = fakeLlm();
    await expect(
      validateEffortFor(
        llm,
        { kind: "route", provider: "local", model: "a" },
        "max",
        undefined,
        SIGNAL,
      ),
    ).rejects.toThrow('does not support reasoning effort "max". It supports: deeper, standard, shallower.');
  });

  it("separates 'no such effort' from 'this model has no efforts at all'", async () => {
    const { llm } = fakeLlm({ noReasoning: true });
    await expect(
      validateEffortFor(
        llm,
        { kind: "route", provider: "local", model: "a" },
        "deeper",
        undefined,
        SIGNAL,
      ),
    ).rejects.toThrow("advertises no reasoning efforts");
  });

  it("reports an unresolvable adapter instead of blaming the effort", async () => {
    const { llm } = fakeLlm({ failResolve: true });
    await expect(
      validateEffortFor(
        llm,
        { kind: "route", provider: "local", model: "a" },
        "deeper",
        undefined,
        SIGNAL,
      ),
    ).rejects.toThrow("could not be resolved for reasoningEffort");
  });

  it("rejects when no route can be resolved for an inherit-parent override", async () => {
    const { llm } = fakeLlm();
    await expect(
      validateEffortFor(llm, { kind: "inherit" }, "deeper", fakeAgent().agent, SIGNAL),
    ).rejects.toThrow("cannot resolve the child provider/model route");
  });
});

describe("the child-scoped effort control", () => {
  it("registers the request waterfall and the child's own tool on its own scope", () => {
    const fake = fakeAgent();
    installEffortControl(fake.agent, fakeLlm().llm, "deeper");
    expect(fake.listeners).toBe(1);
    expect(fake.tools.map((tool) => tool.name)).toEqual([SET_EFFORT_TOOL]);
  });

  it("starts at the effort the parent supplied", async () => {
    const fake = fakeAgent();
    installEffortControl(fake.agent, fakeLlm().llm, "deeper");
    expect(await fake.request(CONFIG)).toMatchObject({ reasoningEffort: "deeper" });
  });

  it("leaves the request untouched when the delegation supplied no effort", async () => {
    const fake = fakeAgent();
    installEffortControl(fake.agent, fakeLlm().llm, undefined);
    expect(await fake.request(CONFIG)).toEqual(CONFIG);
  });

  it("applies a child-issued change to the next request", async () => {
    const fake = fakeAgent({ provider: "provider", model: "model" });
    installEffortControl(fake.agent, fakeLlm().llm, "deeper");
    const tool = fake.tools.find((entry) => entry.name === SET_EFFORT_TOOL);
    expect(tool).toBeDefined();

    await tool!.execute({ effort: "shallower" }, toolExec(fake.agent));
    expect(await fake.request(CONFIG)).toMatchObject({ reasoningEffort: "shallower" });
  });

  it("does not rewrite a request that already passed the waterfall", async () => {
    const fake = fakeAgent({ provider: "provider", model: "model" });
    installEffortControl(fake.agent, fakeLlm().llm, "deeper");
    const tool = fake.tools.find((entry) => entry.name === SET_EFFORT_TOOL)!;

    // The waterfall is the last thing to run before the Host hands the config to the
    // adapter, so "in flight" means "this value has already been returned". What must
    // hold is that a later change cannot reach back into it: the returned config is a
    // snapshot, not a view onto the control's mutable state.
    const first = await fake.request(CONFIG);
    expect(first).toMatchObject({ reasoningEffort: "deeper" });

    await tool.execute({ effort: "shallower" }, toolExec(fake.agent));

    expect(first).toMatchObject({ reasoningEffort: "deeper" });
    expect(await fake.request(CONFIG)).toMatchObject({ reasoningEffort: "shallower" });
  });

  it("hands each request its own config object, so two cannot alias one effort", async () => {
    const fake = fakeAgent({ provider: "provider", model: "model" });
    installEffortControl(fake.agent, fakeLlm().llm, "deeper");
    const first = await fake.request(CONFIG);
    const second = await fake.request(CONFIG);
    // A shared object would let one request's effort leak into another's.
    expect(first).not.toBe(second);
    // And it must not mutate the caller's own object either.
    expect(first).not.toBe(CONFIG);
    expect(CONFIG).toEqual({ provider: "provider", model: "model" });
  });

  it("keeps the previous effort when the model rejects the new one", async () => {
    const fake = fakeAgent({ provider: "provider", model: "model" });
    installEffortControl(fake.agent, fakeLlm().llm, "deeper");
    const tool = fake.tools.find((entry) => entry.name === SET_EFFORT_TOOL)!;

    await expect(
      tool.execute({ effort: "maximum" }, toolExec(fake.agent)),
    ).rejects.toThrow("so nothing changed");
    expect(await fake.request(CONFIG)).toMatchObject({ reasoningEffort: "deeper" });
  });

  it("refuses an empty effort instead of silently restoring the adapter default", async () => {
    const fake = fakeAgent({ provider: "provider", model: "model" });
    installEffortControl(fake.agent, fakeLlm().llm, "deeper");
    const tool = fake.tools.find((entry) => entry.name === SET_EFFORT_TOOL)!;

    await expect(tool.execute({ effort: "  " }, toolExec(fake.agent))).rejects.toThrow(
      "needs a non-empty `effort`",
    );
    expect(await fake.request(CONFIG)).toMatchObject({ reasoningEffort: "deeper" });
  });

  it("validates a child change against the live header, not creation options", async () => {
    const fake = fakeAgent({
      provider: "stale",
      model: "stale",
      header: { provider: "new-provider", model: "new-model" },
    });
    const llm = fakeLlm();
    installEffortControl(fake.agent, llm.llm, undefined);
    const tool = fake.tools.find((entry) => entry.name === SET_EFFORT_TOOL)!;

    await tool.execute({ effort: "standard" }, toolExec(fake.agent));
    expect(llm.resolved).toEqual([{ provider: "new-provider", model: "new-model" }]);
  });

  it("reports a route that advertises no efforts rather than accepting any token", async () => {
    const fake = fakeAgent({ provider: "provider", model: "model" });
    installEffortControl(fake.agent, fakeLlm({ noReasoning: true }).llm, "deeper");
    const tool = fake.tools.find((entry) => entry.name === SET_EFFORT_TOOL)!;

    await expect(
      tool.execute({ effort: "deeper" }, toolExec(fake.agent)),
    ).rejects.toThrow("advertises no reasoning efforts");
  });

  it("reports a missing route instead of accepting the change", async () => {
    const fake = fakeAgent({ provider: "provider", model: "model" });
    installEffortControl(fake.agent, fakeLlm().llm, "deeper");
    const tool = fake.tools.find((entry) => entry.name === SET_EFFORT_TOOL)!;

    // `exec.agent` is authoritative when the Host supplies it; with neither that nor a
    // resolvable creation route there is nothing to validate against.
    await expect(
      tool.execute(
        { effort: "deeper" },
        toolExec(fakeAgent().agent),
      ),
    ).rejects.toThrow("no resolved provider/model route");
  });

  it("documents that the tool may appear only after the first step", () => {
    const fake = fakeAgent();
    installEffortControl(fake.agent, fakeLlm().llm, undefined);
    const tool = fake.tools.find((entry) => entry.name === SET_EFFORT_TOOL)!;
    expect(tool.description).toContain("second step");
    expect(tool.description).toContain("first step");
  });

  it("is not marked concurrency-safe, so two changes cannot interleave", () => {
    const fake = fakeAgent();
    installEffortControl(fake.agent, fakeLlm().llm, undefined);
    const tool = fake.tools.find((entry) => entry.name === SET_EFFORT_TOOL)!;
    expect(tool.isConcurrencySafe?.({ effort: "deeper" })).toBe(false);
  });

  it("unwinds both contributions when the disposer runs", async () => {
    const fake = fakeAgent();
    const dispose = installEffortControl(fake.agent, fakeLlm().llm, "deeper");
    dispose();
    expect(fake.listeners).toBe(0);
    expect(fake.tools).toHaveLength(0);
    expect(await fake.request(CONFIG)).toEqual(CONFIG);
  });
});

describe("the effort one route contributes to agentOptions", () => {
  it("carries the role line's effort", () => {
    expect(agentOptionsFor({ kind: "route", provider: "p", model: "m", effort: "high" })).toEqual({
      provider: "p",
      model: "m",
      reasoningEffort: "high",
    });
  });

  it("lets the override win over the role line", () => {
    expect(
      agentOptionsFor({ kind: "route", provider: "p", model: "m", effort: "high" }, "deeper"),
    ).toEqual({ provider: "p", model: "m", reasoningEffort: "deeper" });
  });

  it("keeps only the effort when the route inherits the parent", () => {
    expect(agentOptionsFor({ kind: "inherit" }, "shallower")).toEqual({
      reasoningEffort: "shallower",
    });
  });

  it("sends no agentOptions for an inherit route with no override", () => {
    expect(agentOptionsFor({ kind: "inherit" })).toBeUndefined();
  });

  it("omits reasoningEffort when neither the line nor the call names one", () => {
    expect(agentOptionsFor({ kind: "route", provider: "p", model: "m" })).toEqual({
      provider: "p",
      model: "m",
    });
  });

  it("reports the effort that will actually apply", () => {
    expect(effectiveEffort({ kind: "route", provider: "p", model: "m", effort: "high" })).toBe(
      "high",
    );
    expect(
      effectiveEffort({ kind: "route", provider: "p", model: "m", effort: "high" }, "deeper"),
    ).toBe("deeper");
    expect(effectiveEffort({ kind: "inherit" }, "deeper")).toBe("deeper");
    expect(effectiveEffort({ kind: "inherit" })).toBeUndefined();
  });
});
