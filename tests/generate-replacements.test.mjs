import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  CLAUDE_CODE_REPLACEMENTS,
  applyClaudeCodeReplacements,
  findUnmappedClaudeCode,
} from "../port/generate.mjs";

// Unit coverage for the Claude Code to DSH replacement table in port/generate.mjs.
// Each rule gets one case: the passage it targets must change, and the case input
// must trip at least one residual marker so the fixture is meaningful.

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = join(repository, "upstream/cursor-plugins/pstack");
const fence = "```";
const byName = (a, b) => a.localeCompare(b);

const cases = {
  "install-fence": {
    input: [
      "## install",
      "",
      "in claude code:",
      "",
      `${fence}bash`,
      "/plugin marketplace add cursor/plugins",
      "/plugin install pstack@cursor-plugins",
      fence,
      "",
      "## get started",
    ].join("\n"),
    expected: [
      "## install",
      "",
      "in DeepSeek Harness:",
      "",
      `${fence}bash`,
      "dsh plugin --profile web add dsh-pstack",
      fence,
      "",
      "## get started",
    ].join("\n"),
  },
  "install-auto-update": {
    input:
      "claude code leaves auto-update off for third-party marketplaces, so pstack stays on the version you installed.\n\nnext paragraph",
    expected: "next paragraph",
  },
  "install-generated-copy": {
    input:
      "claude code installs a generated copy of pstack, including this readme and the guide.\n\n## get started",
    expected: "## get started",
  },
  "install-inline": {
    input:
      "it also installs in Claude Code with `/plugin marketplace add cursor/plugins`, then `/plugin install pstack@cursor-plugins`.",
    expected: "it also installs in Claude Code with `dsh plugin --profile web add dsh-pstack`.",
  },
  "prefix-readme": {
    input:
      "claude code prefixes plugin commands and agents, so `/poteto-mode` is `/pstack:poteto-mode`. the rest",
    expected:
      "in DeepSeek Harness, commands keep their plain names with no prefix, so `/poteto-mode` stays `/poteto-mode`. the rest",
  },
  "prefix-guide": {
    input:
      "Claude Code prefixes plugin commands, so each command in this guide takes a `pstack:` prefix there, such as `/pstack:setup-pstack`, which writes",
    expected:
      "DeepSeek Harness adds no command prefix, so each command in this guide keeps its plain name, such as `/setup-pstack`, which writes",
  },
  "prefix-help": {
    input:
      "There, each command takes a `pstack:` prefix, such as `/pstack:poteto-mode`. The adapter",
    expected: "Commands keep their plain names there, such as `/poteto-mode`. The adapter",
  },
  "setup-writes-readme": {
    input:
      "in claude code, `/pstack:setup-pstack` writes your model choices to `~/.claude/rules/pstack-models.md`, and a step",
    expected:
      "`/setup-pstack` writes your model choices to `$DSH_HOME/pstack-models.mdc`, and a step",
  },
  "adapter-label": {
    input:
      "the [claude code adapter](./docs/harness/claude-code.md) and the [Claude Code adapter](../x/claude-code.md)",
    expected:
      "the [DSH adapter](./docs/harness/claude-code.md) and the [DSH adapter](../x/claude-code.md)",
  },
  "adapter-file": {
    input: "the [DSH adapter](./docs/harness/claude-code.md) and [x](../harness/claude-code.md)",
    expected: "the [DSH adapter](./docs/harness/dsh.md) and [x](../harness/dsh.md)",
  },
  "rules-path": {
    input: "writes to `~/.claude/rules/pstack-models.md` now",
    expected: "writes to `$DSH_HOME/pstack-models.mdc` now",
  },
  "command-prefix": {
    input: "Type `/pstack:poteto-mode` or `/pstack:setup-pstack`, not `Not in pstack:`.",
    expected: "Type `/poteto-mode` or `/setup-pstack`, not `Not in pstack:`.",
  },
  "claude-code-name": {
    input: "installs in Claude Code and in claude code too",
    expected: "installs in DeepSeek Harness and in DeepSeek Harness too",
  },
};

describe("Claude Code replacement rules", () => {
  it("has a case for every rule in the table", () => {
    expect(Object.keys(cases).sort(byName)).toEqual(
      CLAUDE_CODE_REPLACEMENTS.map((rule) => rule.name).sort(byName),
    );
  });

  for (const rule of CLAUDE_CODE_REPLACEMENTS) {
    it(`${rule.name} rewrites its passage`, () => {
      const fixture = cases[rule.name];
      expect(fixture, `missing fixture for ${rule.name}`).toBeDefined();
      expect(
        findUnmappedClaudeCode(fixture.input).length,
        `${rule.name} fixture must contain a Claude Code marker`,
      ).toBeGreaterThan(0);
      expect(fixture.input.replace(rule.match, rule.replace)).toBe(fixture.expected);
    });
  }
});

describe("Claude Code scan over the real upstream passages", () => {
  const files = ["README.md", "skills/poteto-help/SKILL.md", "docs/guide/01-setup.md"];

  for (const relativePath of files) {
    it(`cleans ${relativePath} and keeps no residual marker`, () => {
      const cleaned = applyClaudeCodeReplacements(
        readFileSync(join(upstream, relativePath), "utf8"),
      );
      expect(findUnmappedClaudeCode(cleaned)).toEqual([]);
      expect(cleaned).toContain("dsh plugin --profile web add dsh-pstack");
      expect(cleaned).toContain("harness/dsh.md");
      expect(cleaned).not.toContain("~/.claude");
      expect(cleaned).not.toContain("claude-code.md");
    });
  }
});

describe("Claude Code scan on the generated tree", () => {
  const files = ["README.md", "skills/poteto-help/SKILL.md", "docs/guide/01-setup.md"];

  for (const relativePath of files) {
    it(`generated ${relativePath} has no Claude Code install copy`, () => {
      const text = readFileSync(join(repository, "pstack", relativePath), "utf8");
      expect(findUnmappedClaudeCode(text)).toEqual([]);
    });
  }
});

describe("unmapped detection", () => {
  it("reports the matched Claude Code copy and leaves the text untouched", () => {
    const text = "Run `/plugin install pstack@cursor-plugins` and read `~/.claude/rules/x.md`.";
    expect(
      findUnmappedClaudeCode(text)
        .map((hit) => hit.label)
        .sort(byName),
    ).toEqual(["claude rules path", "install command"].sort(byName));
  });

  it("ignores legitimate text that merely looks similar", () => {
    expect(
      findUnmappedClaudeCode("Not in pstack: use claude-opus-5-5-xhigh or ~/.cursor/rules."),
    ).toEqual([]);
  });
});
