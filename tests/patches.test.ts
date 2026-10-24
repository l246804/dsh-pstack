import { describe, expect, it } from "vite-plus/test";

import { applyFilePatches, PatchError } from "../scripts/patches/apply.ts";
import { FILE_PATCHES, patchesForFile } from "../scripts/patches/index.ts";
import type { FilePatch } from "../scripts/patches/types.ts";
import { checkPatches } from "../scripts/check-patches.ts";
import { assertPatchOutput } from "../scripts/build-assets.ts";

const file = "skills/demo/SKILL.md";

function rewrite(anchor: string | RegExp, replacement: string, expectedMatches = 1): FilePatch {
  return {
    kind: "replace",
    file,
    reason: "test rewrite",
    anchor,
    expectedMatches,
    replacement,
  };
}

describe("applyFilePatches", () => {
  it("replaces a literal anchor once", () => {
    expect(applyFilePatches(file, "a.b c", [rewrite("a.b", "c.d")])).toBe("c.d c");
  });

  it("requires the exact match count", () => {
    expect(() => applyFilePatches(file, "a.b a.b", [rewrite("a.b", "c.d")])).toThrow(
      /matched 2 time/,
    );
  });

  it("supports a global regex without leaking lastIndex", () => {
    const anchor = /a.b/g;
    anchor.lastIndex = 1;

    expect(applyFilePatches(file, "a.b a.b", [rewrite(anchor, "c.d", 2)])).toBe("c.d c.d");
    expect(anchor.lastIndex).toBe(1);
  });

  it("rejects overlapping replacements", () => {
    const patches = [rewrite("abc", "x"), rewrite("bcd", "y")];

    expect(() => applyFilePatches(file, "abcd", patches)).toThrow(/patches overlap/);
  });

  it("resolves every patch against the original text", () => {
    const patches = [rewrite("alpha", "beta"), rewrite("beta", "gamma")];

    expect(() => applyFilePatches(file, "alpha", patches)).toThrow(/matched 0 time/);
  });

  it("drops an exact block", () => {
    const patch: FilePatch = {
      kind: "drop",
      file,
      reason: "test drop",
      anchor: "remove me\n",
      expectedMatches: 1,
    };

    expect(applyFilePatches(file, "keep\nremove me\n", [patch])).toBe("keep\n");
  });

  it("rejects an empty regex match and a mismatched file", () => {
    expect(() => applyFilePatches(file, "text", [rewrite(/^/m, "x")])).toThrow(
      /matched empty text/,
    );
    expect(() =>
      applyFilePatches(file, "text", [{ ...rewrite("text", "x"), file: "skills/other/SKILL.md" }]),
    ).toThrow(PatchError);
  });

  it("fails the build when a promised output fragment is absent", () => {
    expect(() => assertPatchOutput(file, [rewrite("a", "b")], "b")).not.toThrow();
    expect(() =>
      assertPatchOutput(file, [{ ...rewrite("a", "b"), outputIncludes: ["missing"] }], "b"),
    ).toThrow(/missing "missing"/);
  });
});

describe("declared patches", () => {
  it("all apply, do not overlap, and keep their output fragments", () => {
    const report = checkPatches();

    expect(report.problems).toEqual([]);
    expect(report.patches).toBe(6);
    expect(report.files).toBe(4);
    expect(report.byKind).toEqual({ drop: 3, path: 1, replace: 2 });
  });

  it("targets the excluded skill nowhere", () => {
    expect(FILE_PATCHES.some((patch) => patch.file.includes("make-bot-ui"))).toBe(false);
  });

  it("rejects a path that only escapes its scope after normalization", () => {
    const unsafe: FilePatch = {
      kind: "path",
      file: "skills/../docs/guide/01-setup.md",
      reason: "test traversal",
      anchor: "# Setup",
      expectedMatches: 1,
      replacement: "# Setup",
    };

    expect(checkPatches([unsafe]).problems.join("\n")).toContain("normalized POSIX path");
  });

  it("rejects a directory target without throwing EISDIR", () => {
    const directory: FilePatch = {
      kind: "path",
      file: "skills/how",
      reason: "test directory",
      anchor: "x",
      expectedMatches: 1,
      replacement: "y",
    };

    expect(checkPatches([directory]).problems.join("\n")).toContain("not a regular file");
  });

  it("independently catches a missing output fragment", () => {
    const poisoned: FilePatch = {
      kind: "replace",
      file: "skills/poteto-help/SKILL.md",
      reason: "test fragment",
      anchor: "# Poteto help",
      expectedMatches: 1,
      replacement: "# Poteto help",
      outputIncludes: ["THIS FRAGMENT NEVER APPEARS"],
    };

    expect(checkPatches([poisoned]).problems.join("\n")).toContain(
      'missing "THIS FRAGMENT NEVER APPEARS"',
    );
  });

  it("returns the patches for one file", () => {
    expect(patchesForFile("skills/poteto-help/SKILL.md")).toHaveLength(3);
    expect(patchesForFile("skills/how/SKILL.md")).toEqual([]);
  });
});
