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
  it("preserves the packaged scope, injects the adapter and links to omitted resources", () => {
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
      "README.md":
        "[upstream](https://github.com/cursor/plugins/tree/main/pstack) and [automation](automations/benny/)\n",
    });
    source.set("assets/logo.png", { bytes: Buffer.from([0, 128, 255]), executable: false });
    source.set("skills/probe/image.png", { bytes: Buffer.from([0, 128, 255]), executable: false });
    const { files, wrappedCount } = renderPstack(source, "DSH answers");
    expect(wrappedCount).toBe(1);
    expect(files.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "read [the DSH adapter]",
    );
    expect(files.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "[reference](reference.md)",
    );
    expect(files.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "[harness](https://github.com/cursor/plugins/blob/main/pstack/docs/harness/claude-code.md#tools)",
    );
    expect([...files.keys()].sort()).toEqual(
      [
        "skills/probe/SKILL.md",
        "skills/probe/reference.md",
        "skills/probe/run.sh",
        "skills/probe/image.png",
        "skills/plain/SKILL.md",
        "docs/guide/start.md",
        "docs/harness/dsh.md",
        "plugin.json",
        "LICENSE",
        "README.md",
      ].sort(),
    );
    for (const path of [
      "skills/probe/reference.md",
      "skills/probe/run.sh",
      "skills/probe/image.png",
      "skills/plain/SKILL.md",
      "plugin.json",
      "LICENSE",
    ]) {
      expect(files.get(path), path).toEqual(source.get(path));
    }
    expect(files.get("README.md")!.bytes.toString()).toBe(
      "[upstream](https://github.com/cursor/plugins/tree/main/pstack) and [automation](https://github.com/cursor/plugins/tree/main/pstack/automations/benny)\n",
    );
    expect(files.get("docs/guide/start.md")!.bytes.toString()).toBe(
      "[harness](https://github.com/cursor/plugins/blob/main/pstack/docs/harness/claude-code.md)\n",
    );
    expect(files.get("docs/harness/dsh.md")!.bytes.toString()).toBe("DSH answers");
    expect(source.get("skills/probe/SKILL.md")!.bytes.toString()).not.toContain("DSH adapter");
    expect(source.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "[harness](../../docs/harness/claude-code.md#tools)",
    );
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
