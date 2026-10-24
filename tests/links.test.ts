import { describe, expect, it } from "vite-plus/test";

import { checkLinks, scanMarkdownLinks } from "../scripts/links.ts";

const exists = (path: string): boolean =>
  new Set(["assets/README.md", "assets/docs/guide/01-setup.md", "assets/docs/guide/images"]).has(
    path.replace(/\/$/, ""),
  );

describe("scanMarkdownLinks", () => {
  it("finds inline links and images", () => {
    const links = scanMarkdownLinks(
      "See [the guide](../guide/01-setup.md) and ![diagram](./images/a.png).",
    );

    expect(links).toEqual([
      { line: 1, target: "../guide/01-setup.md" },
      { line: 1, target: "./images/a.png" },
    ]);
  });

  it("ignores fenced code blocks", () => {
    const text = ["```md", "[not a link](./missing.md)", "```", "[real](./README.md)"].join("\n");

    expect(scanMarkdownLinks(text)).toEqual([{ line: 4, target: "./README.md" }]);
  });

  it("keeps a title out of the target", () => {
    expect(scanMarkdownLinks('[x](./README.md "title")')).toEqual([
      { line: 1, target: "./README.md" },
    ]);
  });
});

describe("checkLinks", () => {
  it("resolves valid files, directories, and root-relative asset paths", () => {
    const report = checkLinks(
      [
        {
          file: "assets/skills/demo/SKILL.md",
          text: [
            "[guide](../../docs/guide/01-setup.md)",
            "[images](../../docs/guide/images/)",
            "[readme](../../README.md)",
            "[external](https://example.com/x)",
            "[anchor](#section)",
          ].join("\n"),
        },
      ],
      exists,
    );

    expect(report.problems).toEqual([]);
    expect(report.checked).toBe(3);
    expect(report.skipped).toBe(2);
  });

  it("reports missing files and paths that escape the repository", () => {
    const report = checkLinks(
      [
        {
          file: "assets/skills/demo/SKILL.md",
          text: "[missing](./missing.md)\n[outside](../../../../outside.md)",
        },
      ],
      exists,
    );

    expect(report.problems).toEqual([
      {
        file: "assets/skills/demo/SKILL.md",
        line: 1,
        target: "./missing.md",
        resolved: "assets/skills/demo/missing.md",
        reason: "missing",
      },
      {
        file: "assets/skills/demo/SKILL.md",
        line: 2,
        target: "../../../../outside.md",
        resolved: "../outside.md",
        reason: "outside-repository",
      },
    ]);
  });

  it("reports a bare template token without failing it", () => {
    const report = checkLinks(
      [{ file: "assets/docs/example.md", text: "[placeholder](url)" }],
      exists,
    );

    expect(report.problems).toEqual([]);
    expect(report.placeholders).toEqual([
      { file: "assets/docs/example.md", line: 1, target: "url" },
    ]);
  });
});
