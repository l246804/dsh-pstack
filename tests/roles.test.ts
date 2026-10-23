import { describe, expect, it } from "vite-plus/test";
import { parseFrontmatter } from "../src/frontmatter.ts";
import {
  parseModelConfig,
  parseModelConfigWithIssues,
  resolvePanel,
  resolveRole,
} from "../src/roles.ts";

describe("parseFrontmatter", () => {
  it("reads quoted, plain, boolean, and folded scalars", () => {
    const source = [
      "---",
      "name: demo",
      "description: >-",
      "  Use when the task needs",
      "  a careful answer.",
      "disable-model-invocation: true",
      "---",
      "",
      "# Body",
      "text",
    ].join("\n");

    const { data, body } = parseFrontmatter(source);
    expect(data.name).toBe("demo");
    expect(data.description).toBe("Use when the task needs a careful answer.");
    expect(data["disable-model-invocation"]).toBe("true");
    expect(body).toBe("# Body\ntext");
  });

  it("returns the whole text when there is no frontmatter", () => {
    expect(parseFrontmatter("# Body").body).toBe("# Body");
    expect(parseFrontmatter("# Body").data).toEqual({});
  });

  it("keeps a colon inside a quoted description", () => {
    const source = '---\nname: demo\ndescription: "Use for one thing: another"\n---\n';
    expect(parseFrontmatter(source).data.description).toBe("Use for one thing: another");
  });
});

describe("model role resolution", () => {
  const table = parseModelConfig(
    [
      "# comment",
      "feature, refactoring: deepseek-official/deepseek-reasoner high",
      "judgment and prose: inherit-parent",
      "arena runners: inherit-parent, anthropic/claude-sonnet high",
      "swarm workers:",
      "reflect judgment, divergent, synthesizer: inherit-parent",
    ].join("\n"),
  );

  it("maps a panel role to its entries", () => {
    expect(resolvePanel(table, "arena runners")).toEqual([
      "inherit-parent",
      { provider: "anthropic", model: "claude-sonnet", reasoningEffort: "high" },
    ]);
  });

  it("returns undefined for an inherit-parent role", () => {
    expect(resolveRole(table, "judgment and prose")).toBeUndefined();
  });

  it("resolves a route with effort", () => {
    expect(resolveRole(table, "bug-fix")).toBeUndefined();
    expect(resolveRole(table, "feature")).toEqual({
      provider: "deepseek-official",
      model: "deepseek-reasoner",
      reasoningEffort: "high",
    });
  });

  it("resolves a role listed beside other roles", () => {
    expect(resolveRole(table, "refactoring")).toEqual({
      provider: "deepseek-official",
      model: "deepseek-reasoner",
      reasoningEffort: "high",
    });
    expect(resolveRole(table, "divergent")).toBeUndefined();
  });

  it("accepts the minimal reasoning effort and reports its source line", () => {
    const parsed = parseModelConfigWithIssues("feature: provider/model minimal");
    expect(resolveRole(parsed.table, "feature")).toEqual({
      provider: "provider",
      model: "model",
      reasoningEffort: "minimal",
    });
    expect(parsed.issues).toEqual([]);
  });

  it("reports invalid efforts without dropping the usable route", () => {
    const parsed = parseModelConfigWithIssues("feature: provider/model hihg");
    expect(resolveRole(parsed.table, "feature")).toEqual({
      provider: "provider",
      model: "model",
    });
    expect(parsed.issues[0]?.line).toBe(1);
    expect(parsed.issues[0]?.message).toContain('unknown effort "hihg"');
  });
});
