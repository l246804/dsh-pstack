import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { generateRawTree, translateAdapter, treeDigest } from "../playground/raw/generate.ts";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = join(repository, "upstream/cursor-plugins");
const temporary = mkdtempSync(join(tmpdir(), "pstack-raw-test-"));
const isolatedInput = join(temporary, "input");
const output = join(temporary, "raw/generated");

afterAll(() => rmSync(temporary, { recursive: true, force: true }));

describe("isolated raw generation", () => {
  it("copies only upstream inputs, generates twice identically, and translates only adapter names", () => {
    mkdirSync(join(isolatedInput, "scripts"), { recursive: true });
    cpSync(join(upstream, "pstack"), join(isolatedInput, "pstack"), { recursive: true });
    cpSync(
      join(upstream, "scripts/generate-pstack-harness-trees.mjs"),
      join(isolatedInput, "scripts/generate-pstack-harness-trees.mjs"),
    );

    const sourceDigest = treeDigest(isolatedInput);
    const first = generateRawTree({ upstreamRoot: isolatedInput, outputRoot: output });
    const potetoMode = readFileSync(join(output, "tree/skills/poteto-mode/SKILL.md"), "utf8");
    expect(potetoMode).toContain("In DSH, read [the DSH adapter](../../docs/harness/dsh.md)");
    expect(potetoMode).toContain("It maps the Cursor names in pstack skills to DSH.");
    expect(potetoMode).not.toContain("In Claude Code, read");
    expect(potetoMode).not.toContain("../../docs/harness/claude-code.md");
    expect(potetoMode).not.toContain("pstack_subagent");

    expect(existsSync(join(output, "dsh.md"))).toBe(true);
    expect(existsSync(join(output, "upstream/skills/poteto-mode/SKILL.md"))).toBe(true);
    expect(existsSync(join(output, "upstream/agents/poteto-agent.md"))).toBe(true);
    expect(existsSync(join(output, "upstream/docs/guide/README.md"))).toBe(true);
    expect(existsSync(join(output, "scripts/generate-pstack-harness-trees.mjs"))).toBe(true);
    expect(existsSync(join(output, "upstream/automations"))).toBe(false);
    expect(existsSync(join(output, "tree/automations"))).toBe(false);
    expect(existsSync(join(output, "port/dsh.md"))).toBe(false);
    expect(existsSync(join(output, "src"))).toBe(false);

    const second = generateRawTree({ upstreamRoot: isolatedInput, outputRoot: output });
    expect(second).toEqual(first);
    expect(second.treeDigest).toBe(treeDigest(join(output, "tree")));
    expect(second.skillsDigest).toBe(treeDigest(join(output, "tree/skills")));
    const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8")) as {
      digest: string;
    };
    expect(manifest.digest).toBe(second.treeDigest);
    expect(treeDigest(isolatedInput)).toBe(sourceDigest);
    expect(readdirSync(join(output, "tree/skills")).length).toBeGreaterThan(1);
  });

  it("keeps Agent unmapped and translates Claude home paths without copying a final adapter", () => {
    const adapter = readFileSync(join(upstream, "pstack/docs/harness/claude-code.md"), "utf8");
    const translated = translateAdapter(adapter);
    expect(translated).toContain("# pstack in DSH");
    expect(translated).toContain("unmapped upstream Agent capability");
    expect(translated).toContain("$DSH_HOME/rules/pstack-models.md");
    expect(translated).toContain(".dsh/skills/");
    expect(translated).not.toContain("pstack_subagent");
    expect(translated).not.toContain("~/.claude/");
  });
});
