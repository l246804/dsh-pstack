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
const pin = { source: "https://github.com/cursor/plugins.git", commit: "123abc", path: "pstack" };

describe("native tree generation", () => {
  it("injects the adapter for referenced Cursor features and pins omitted links", () => {
    const source = tree({
      "skills/probe/SKILL.md":
        "---\nname: probe\n---\n# Probe\n\nRead [reference](reference.md) and [harness](../../docs/harness/claude-code.md#tools).\n",
      "skills/probe/reference.md": "Use the `Task` tool.\n",
      "skills/probe/run.sh": "#!/bin/sh\n",
      "skills/plain/SKILL.md": "---\nname: plain\n---\n# Plain\n\nWrite a short response.\n",
      "docs/harness/claude-code.md": "# Harness\n",
      "docs/guide/start.md": "[harness](../harness/claude-code.md)\n",
      "plugin.json": '{"version":"1.0.0"}',
      LICENSE: "License",
      "README.md": "Readme",
    });
    const { files, wrappedCount } = renderPstack(source, "DSH answers", pin);
    expect(wrappedCount).toBe(1);
    expect(files.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "read [the DSH adapter]",
    );
    expect(files.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "[reference](reference.md)",
    );
    expect(files.get("skills/probe/SKILL.md")!.bytes.toString()).toContain(
      "https://github.com/cursor/plugins/blob/123abc/pstack/docs/harness/claude-code.md#tools",
    );
    expect(files.get("skills/plain/SKILL.md")).toEqual(source.get("skills/plain/SKILL.md"));
    expect(files.get("skills/probe/run.sh")!.executable).toBe(true);
    expect(files.get("docs/harness/dsh.md")!.bytes.toString()).toBe("DSH answers");
    expect(files.has("docs/harness/claude-code.md")).toBe(false);
    expect(source.get("skills/probe/SKILL.md")!.bytes.toString()).not.toContain("DSH adapter");
  });

  it("rejects a misnamed skill and a Cursor-dependent skill without an injection heading", () => {
    expect(() =>
      renderPstack(
        tree({ "skills/probe/SKILL.md": "---\nname: wrong\n---\nUse `Task`." }),
        "DSH",
        pin,
      ),
    ).toThrow(/name .*wrong/);
    expect(() =>
      renderPstack(
        tree({ "skills/probe/SKILL.md": "---\nname: probe\n---\nUse `Task`." }),
        "DSH",
        pin,
      ),
    ).toThrow(/no H1/);
  });
});
