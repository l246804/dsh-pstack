import { describe, expect, it } from "vite-plus/test";

import { installEffortControl, SET_EFFORT_TOOL } from "../src/internal/effort.ts";
import type {
  Agent,
  LlmHost,
  ToolDefinition,
  ToolRunContext,
} from "../src/internal/host-contract.ts";

const signal = new AbortController().signal;

const llm = {
  resolveModelInfo: async (provider: string, model: string) => ({
    provider,
    id: model,
    name: model,
    reasoning: { efforts: [{ id: "low" }, { id: "high" }] },
  }),
} as unknown as LlmHost;

function fakeChild() {
  const registered: ToolDefinition[] = [];
  const selected: unknown[] = [];
  const events: string[] = [];
  const child = {
    options: { provider: "cpa", model: "workbuddy/deepseek-v4.1-flash" },
    session: { requestHeader: () => undefined },
    ctx: {
      on: (name: string) => {
        events.push(name);
        return () => {};
      },
      tools: {
        register: (tool: ToolDefinition) => {
          registered.push(tool);
          return () => {};
        },
      },
    },
    model: {
      current: () => selected.at(-1),
      select: (selection: unknown) => selected.push(selection),
    },
  } as unknown as Agent;
  return { child, registered, selected, events };
}

const execute = (tool: ToolDefinition, args: unknown, child: Agent) =>
  tool.execute(args, { agent: child, signal } as unknown as ToolRunContext);

describe("set_reasoning_effort", () => {
  it("declares a root object schema with the effort property", () => {
    const { child, registered, events } = fakeChild();
    installEffortControl(child, llm);
    expect(events).toEqual([]);
    const tool = registered[0]!;
    expect(tool.name).toBe(SET_EFFORT_TOOL);
    expect(tool.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: { effort: { type: "string" } },
      required: ["effort"],
    });
  });

  it("records the next step's effort through Agent.model.select", async () => {
    const { child, registered, selected } = fakeChild();
    installEffortControl(child, llm);
    const result = await execute(registered[0]!, { effort: "high" }, child);
    expect(result).toMatch(/reasoning effort set to "high"/);
    expect(selected).toEqual([
      {
        provider: "cpa",
        model: "workbuddy/deepseek-v4.1-flash",
        reasoningEffort: "high",
      },
    ]);
  });

  it("rejects an unknown effort without changing the selection", async () => {
    const { child, registered, selected } = fakeChild();
    installEffortControl(child, llm);
    await expect(execute(registered[0]!, { effort: "max" }, child)).rejects.toThrow(
      /does not support reasoning effort "max"/,
    );
    expect(selected).toEqual([]);
  });
});
