import { describe, expect, it } from "vite-plus/test";
import { composePrompt, stripFrontmatter } from "../src/subagent.ts";

describe("subagent prompt assembly", () => {
  it("returns the prompt alone for a general reviewer", () => {
    expect(
      composePrompt({
        kind: "general",
        description: "review",
        prompt: "Review the diff.",
        agentInstructions: "ignored",
      }),
    ).toBe("Review the diff.");
  });

  it("prepends the delegate preamble and the poteto-mode path", () => {
    const prompt = composePrompt({
      kind: "poteto-agent",
      description: "fix the bug",
      prompt: "Fix it.",
      agentInstructions: "# Poteto subagent\n\nRead the mode.",
    });
    expect(prompt.startsWith("# Poteto subagent")).toBe(true);
    expect(prompt).toContain("Parent task label: fix the bug");
    expect(prompt).toContain("poteto-mode/SKILL.md");
    expect(prompt).toContain("Fix it.");
  });

  it("uses an explicit poteto-mode path when the parent supplies one", () => {
    const prompt = composePrompt({
      kind: "poteto-agent",
      description: "fix",
      prompt: "Fix it.",
      agentInstructions: "",
      potetoModePath: "/tmp/pstack/skills/poteto-mode/SKILL.md",
    });
    expect(prompt).toContain("/tmp/pstack/skills/poteto-mode/SKILL.md");
  });

  it("strips YAML frontmatter from packaged agent instructions", () => {
    expect(stripFrontmatter("---\nname: x\n---\n\n# Body")).toBe("# Body");
    expect(stripFrontmatter("# Body")).toBe("# Body");
  });
});
