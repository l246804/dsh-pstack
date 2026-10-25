import { describe, expect, it } from "vite-plus/test";

import {
  applyFilePatches,
  assertPatchOutput,
  PatchError,
  validatePatchTargets,
} from "../scripts/apply-patches.ts";
import { buildAssets, UPSTREAM_ROOT } from "../scripts/build-assets.ts";
import { EXCLUDED_SKILLS, FILE_PATCHES, patchesForFile } from "../scripts/patches.ts";
import type { FilePatch } from "../scripts/patches.ts";

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

  it("rejects an empty regex and a mismatched file", () => {
    expect(() => applyFilePatches(file, "text", [rewrite(/^/m, "x")])).toThrow(
      /matched empty text/,
    );
    expect(() =>
      applyFilePatches(file, "text", [{ ...rewrite("text", "x"), file: "skills/other/SKILL.md" }]),
    ).toThrow(PatchError);
  });
});

describe("patch output", () => {
  it("keeps every promised fragment", () => {
    expect(() => assertPatchOutput(file, [rewrite("a", "b")], "b")).not.toThrow();
    expect(() =>
      assertPatchOutput(file, [{ ...rewrite("a", "b"), outputIncludes: ["missing"] }], "b"),
    ).toThrow(/missing "missing"/);
  });

  it("rejects non-normalized, directory, and excluded targets", () => {
    const traversal = { ...rewrite("x", "y"), file: "skills/../docs/guide/01-setup.md" };
    expect(() => validatePatchTargets([traversal], EXCLUDED_SKILLS, UPSTREAM_ROOT)).toThrow(
      /normalized POSIX path/,
    );

    const directory = { ...rewrite("x", "y"), file: "skills/how" };
    expect(() => validatePatchTargets([directory], EXCLUDED_SKILLS, UPSTREAM_ROOT)).toThrow(
      /not a regular file/,
    );

    const excluded = { ...rewrite("x", "y"), file: "skills/make-bot-ui/SKILL.md" };
    expect(() => validatePatchTargets([excluded], EXCLUDED_SKILLS, UPSTREAM_ROOT)).toThrow(
      /excluded skill/,
    );
  });
});

describe("declared patch data", () => {
  it("declares every patch against an existing upstream file and builds cleanly", () => {
    expect(FILE_PATCHES.length).toBeGreaterThanOrEqual(9);
    expect(new Set(FILE_PATCHES.map((patch) => patch.file)).size).toBe(7);
    expect(() => validatePatchTargets(FILE_PATCHES, EXCLUDED_SKILLS, UPSTREAM_ROOT)).not.toThrow();
    expect(() => buildAssets()).not.toThrow();
  });

  it("covers the unit 3 text: the setup skill and the poteto preamble", () => {
    expect(patchesForFile("skills/setup-pstack/SKILL.md").length).toBeGreaterThan(5);
    expect(patchesForFile("agents/poteto-agent.md").length).toBeGreaterThan(0);
    expect(patchesForFile("agents/comment-sicko.md")).toEqual([]);
  });

  it("returns the patches for one file", () => {
    expect(patchesForFile("skills/poteto-help/SKILL.md")).toHaveLength(3);
    expect(patchesForFile("skills/how/SKILL.md")).toEqual([]);
  });

  it("fails the build when an output fragment is missing", () => {
    const poisoned: FilePatch = {
      kind: "replace",
      file: "skills/poteto-help/SKILL.md",
      reason: "test fragment",
      anchor: "# Poteto help",
      expectedMatches: 1,
      replacement: "# Poteto help",
      outputIncludes: ["THIS FRAGMENT NEVER APPEARS"],
    };

    expect(() => buildAssets([...FILE_PATCHES, poisoned])).toThrow(
      /missing "THIS FRAGMENT NEVER APPEARS"/,
    );
  });
});
