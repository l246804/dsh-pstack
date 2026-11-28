import { describe, expect, it } from "vite-plus/test";
import { renderPstack, type TreeFile } from "../scripts/lib/generate.ts";

function tree(entries: Record<string, string>): Map<string, TreeFile> {
  return new Map(
    Object.entries(entries).map(([path, text]) => [
      path,
      { bytes: Buffer.from(text), executable: path.endsWith(".sh") },
    ]),
  );
}
describe("native tree generation", () => {
  it("preserves the complete upstream tree and only adds the adapter and its pointer", () => {
    const source = tree({
      "skills/probe/SKILL.md":
        "---\nname: probe\n---\n# Probe\n\nRead [reference](reference.md) and [harness](../../docs/harness/claude-code.md#tools).\n",
      "skills/probe/reference.md": "Use the `Task` tool.\n",
      "skills/probe/run.sh": "#!/bin/sh\n",
      "skills/plain/SKILL.md": "---\nname: plain\n---\n# Plain\n\nWrite a short response.\n",
      "docs/harness/claude-code.md": "# Harness\n",
      "docs/guide/start.md": "[harness](../harness/claude-code.md)\n",
      "automations/benny/README.md": "[guide](../../docs/guide/start.md)\n",
      ".cursor-plugin/plugin.json": '{"name":"pstack"}',
      ".gitignore": "node_modules/\n",
      "plugin.json": '{"version":"1.0.0"}',
      LICENSE: "License",
      "README.md": "[upstream](https://github.com/cursor/plugins/tree/main/pstack)\n",
    });
    source.set("assets/logo.png", { bytes: Buffer.from([0, 128, 255]), executable: false });
    const { files, wrappedCount } = renderPstack(source, "DSH answers");
    expect(wrappedCount).toBe(1);
    expect(files.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "read [the DSH adapter]",
    );
    expect(files.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "[reference](reference.md)",
    );
    expect(files.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "[harness](../../docs/harness/claude-code.md#tools)",
    );
    expect([...files.keys()].sort()).toEqual([...source.keys(), "docs/harness/dsh.md"].sort());
    for (const [path, entry] of source) {
      if (path === "skills/probe/SKILL.md") continue;
      expect(files.get(path), path).toEqual(entry);
    }
    const injected = files.get("skills/probe/SKILL.md")!.bytes.toString();
    expect(injected.replace(/\nIn DeepSeek Harness,[^\n]+\n/, "")).toBe(
      source.get("skills/probe/SKILL.md")!.bytes.toString(),
    );
    expect(files.get("docs/harness/dsh.md")!.bytes.toString()).toBe("DSH answers");
    expect(source.get("skills/probe/SKILL.md")!.bytes.toString()).not.toContain("DSH adapter");
  });

  it("rejects a misnamed skill and a Cursor-dependent skill without an injection heading", () => {
    expect(() =>
      renderPstack(tree({ "skills/probe/SKILL.md": "---\nname: wrong\n---\nUse `Task`." }), "DSH"),
    ).toThrow(/name .*wrong/);
    expect(() =>
      renderPstack(tree({ "skills/probe/SKILL.md": "---\nname: probe\n---\nUse `Task`." }), "DSH"),
    ).toThrow(/no H1/);
  });
});
