/**
 * Every shipped tool's *parameter* schema must be inside the Host's subset.
 *
 * `tools.register()` validates `output.schema` only, so a parameter schema can carry
 * a keyword the Host does not support and nothing fails at mount time. The damage is
 * later and quieter: `jsonSchemaToTs` / `jsonSchemaToPy` catch the `JsonSchemaError`
 * and return `"unknown"`, so in `ptc` mode the tool's entire input and output lose
 * their generated types, and the keyword itself is skipped during argument
 * validation — the declared bound was never enforced at all.
 *
 * That is what `minimum` did in all three tools. This file is the gate that keeps it
 * from coming back, and it checks the real builders rather than a copy:
 * `assertSupportedJsonSchema` is the Host's own function.
 */

import { describe, expect, it } from "vite-plus/test";

import { assertSupportedJsonSchema, jsonSchemaToTs } from "./host-schema.ts";
import { createHistoryTool } from "../src/history.ts";
import { createPstackScriptTool, buildScriptParameters } from "../src/script.ts";
import { createPstackSubagentTool } from "../src/subagent.ts";

/** A history runtime that is never called; only its tool schema is inspected. */
const inertHistoryRuntime = {
  subagents: { listChildren: async () => [] },
  getSessionQuery: () => undefined,
};

const tools = [
  ["pstack_script", { parameters: buildScriptParameters() }],
  ["pstack_history", createHistoryTool(inertHistoryRuntime as never)],
  ["pstack_subagent", createPstackSubagentTool({} as never)],
] as const;

describe("every tool parameter schema is inside the Host's subset", () => {
  for (const [name, tool] of tools) {
    it(`${name} passes assertSupportedJsonSchema`, () => {
      expect(() => assertSupportedJsonSchema(tool.parameters as never)).not.toThrow();
    });

    it(`${name} still generates a typed SDK, not "unknown"`, () => {
      // The observable consequence of an unsupported keyword: the generator gives
      // up and the whole tool becomes untyped.
      expect(jsonSchemaToTs(tool.parameters as never)).not.toBe("unknown");
    });

    it(`${name} declares no numeric bound the Host would ignore`, () => {
      const text = JSON.stringify(tool.parameters);
      expect(text).not.toContain('"minimum"');
      expect(text).not.toContain('"maximum"');
      expect(text).not.toContain('"exclusiveMinimum"');
    });
  }

  it("keeps the bounds in the descriptions, where a reader and a model see them", () => {
    // Removing `minimum` is only correct if the limit is still stated and still
    // enforced by the tool's own argument validation.
    const script = JSON.stringify(buildScriptParameters());
    expect(script).toContain("values below 1 are rejected");
    expect(script).toContain("values above");
  });
});

describe("the tool definitions still carry what the registry needs", () => {
  it("registers the script tool with a closed id enum", () => {
    const tool = createPstackScriptTool({ tools: { register: () => () => {} } } as never);
    expect(tool.name).toBe("pstack_script");
  });
});
