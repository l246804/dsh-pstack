import { describe, expect, it } from "vite-plus/test";

import {
  agentDroppedFields,
  parseFrontmatter,
  serializeAgentFrontmatter,
  serializeSkillFrontmatter,
  skillDroppedFields,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} from "../src/frontmatter.ts";

function skill(fields: string, body = "# Demo\n\nBody.\n"): string {
  return `---\n${fields}\n---\n\n${body}`;
}

describe("parseFrontmatter", () => {
  it("reads plain scalars and the invocation flags", () => {
    const { data } = parseFrontmatter(
      skill(
        [
          "name: demo-skill",
          "description: Use for demo work.",
          "disable-model-invocation: true",
          "user-invocable: false",
          "whenToUse: when a demo is requested",
        ].join("\n"),
      ),
    );

    expect(data).toEqual({
      name: "demo-skill",
      description: "Use for demo work.",
      "disable-model-invocation": "true",
      "user-invocable": "false",
      whenToUse: "when a demo is requested",
    });
    expect(validateSkillFrontmatter(data, "demo")).toEqual({
      name: "demo-skill",
      description: "Use for demo work.",
      disableModelInvocation: true,
      userInvocable: false,
      whenToUse: "when a demo is requested",
    });
  });

  it("decodes double-quoted escapes", () => {
    const { data } = parseFrontmatter(
      skill('name: demo\ndescription: "Use for \\"quoted\\" text and C:\\\\tmp."'),
    );

    expect(data.description).toBe('Use for "quoted" text and C:\\tmp.');
  });

  it("keeps escaped single quotes", () => {
    const { data } = parseFrontmatter(skill("name: demo\ndescription: 'it''s fine'"));

    expect(data.description).toBe("it's fine");
  });

  it("rejects an unescaped single quote", () => {
    expect(() => parseFrontmatter(skill("name: demo\ndescription: 'bad'quote'"))).toThrow(
      /unescaped single quote/,
    );
  });

  it("folds a folded block scalar", () => {
    const { data } = parseFrontmatter(
      skill("name: demo\ndescription: >-\n  first line\n  second line"),
    );

    expect(data.description).toBe("first line second line");
  });

  it("keeps literal block newlines", () => {
    const { data } = parseFrontmatter(
      skill("name: demo\ndescription: |-\n  first line\n  second line"),
    );

    expect(data.description).toBe("first line\nsecond line");
  });

  it("preserves CRLF in the body", () => {
    const source = "---\r\nname: demo\r\ndescription: Demo.\r\n---\r\n\r\n# Demo\r\n\r\nBody.\r\n";
    const parsed = parseFrontmatter(source);

    expect(parsed.data.name).toBe("demo");
    expect(parsed.body).toContain("\r\n# Demo\r\n");
  });

  it("rejects missing and unterminated delimiters", () => {
    expect(() => parseFrontmatter("name: demo\n")).toThrow(/must start with/);
    expect(() => parseFrontmatter("---\nname: demo\n")).toThrow(/missing closing/);
  });

  it("rejects duplicate keys and mixed line endings", () => {
    expect(() => parseFrontmatter(skill("name: demo\nname: other\ndescription: Demo."))).toThrow(
      /duplicate key/,
    );
    expect(() => parseFrontmatter("---\r\nname: demo\n---\n")).toThrow(/mixed line endings/);
  });
});

describe("validateSkillFrontmatter", () => {
  it("requires a kebab-case name that matches the file", () => {
    expect(() =>
      validateSkillFrontmatter({ name: "Demo Skill", description: "Demo." }, "demo"),
    ).toThrow(/kebab-case/);
    expect(() => validateSkillFrontmatter({ name: "demo", description: "" }, "demo")).toThrow(
      /missing "description"/,
    );
  });

  it("accepts only strict booleans", () => {
    expect(() =>
      validateSkillFrontmatter(
        { name: "demo", description: "Demo.", "disable-model-invocation": "yes" },
        "demo",
      ),
    ).toThrow(/must be true or false/);
  });

  it("rejects unknown fields and reports dropped ones", () => {
    expect(() =>
      validateSkillFrontmatter({ name: "demo", description: "Demo.", owner: "x" }, "demo"),
    ).toThrow(/unknown frontmatter field/);

    expect(
      skillDroppedFields(
        { name: "demo", description: "Demo.", icon: "crown", paths: "**/*.ts" },
        "demo",
      ),
    ).toEqual([
      { file: "demo", field: "icon", value: "crown" },
      { file: "demo", field: "paths", value: "**/*.ts" },
    ]);
  });
});

describe("serialization", () => {
  it("round-trips a description that needs quoting", () => {
    const description = 'Use for "quoted" work: keep C:\\tmp and the trailing # marker.';
    const serialized = serializeSkillFrontmatter({
      name: "demo",
      description,
      disableModelInvocation: true,
      userInvocable: false,
    });
    const parsed = parseFrontmatter(`${serialized}\n# Demo\n`);
    const validated = validateSkillFrontmatter(parsed.data, "demo");

    expect(validated.description).toBe(description);
    expect(validated.disableModelInvocation).toBe(true);
    expect(validated.userInvocable).toBe(false);
  });

  it("omits default flags and keeps an explicit false flag", () => {
    const defaultText = serializeSkillFrontmatter({
      name: "demo",
      description: "Demo.",
      disableModelInvocation: false,
      userInvocable: true,
    });
    const nonUserText = serializeSkillFrontmatter({
      name: "demo",
      description: "Demo.",
      disableModelInvocation: true,
      userInvocable: false,
    });

    expect(defaultText).not.toContain("disable-model-invocation");
    expect(defaultText).not.toContain("user-invocable");
    expect(nonUserText).toContain("disable-model-invocation: true");
    expect(nonUserText).toContain("user-invocable: false");
  });

  it("normalizes agent frontmatter and drops is_background", () => {
    const { data, body } = parseFrontmatter(
      "---\nname: demo-agent\ndescription: Demo agent.\nis_background: true\n---\n\n# Agent\n",
    );
    const frontmatter = validateAgentFrontmatter(data, "demo-agent");
    const serialized = serializeAgentFrontmatter(frontmatter);

    expect(frontmatter).toEqual({ name: "demo-agent", description: "Demo agent." });
    expect(serialized).not.toContain("is_background");
    expect(agentDroppedFields(data, "demo-agent")).toEqual([
      { file: "demo-agent", field: "is_background", value: "true" },
    ]);
    expect(body).toContain("# Agent");
  });
});
