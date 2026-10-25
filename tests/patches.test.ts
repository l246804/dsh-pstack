import { describe, expect, it } from "vite-plus/test";

import {
  applyFilePatches,
  assertPatchOutput,
  PatchError,
  validatePatchTargets,
} from "../scripts/apply-patches.ts";
import { buildAssets, UPSTREAM_ROOT } from "../scripts/build-assets.ts";
import {
  EXCLUDED_SKILLS,
  FILE_PATCHES,
  FORBIDDEN_CURSOR_FIELDS,
  UNIT4_PATCHED_FILES,
  UNIT5_FORBIDDEN_FIELDS,
  UNIT5_PATCHED_FILES,
  patchesForFile,
} from "../scripts/patches.ts";
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
    expect(FILE_PATCHES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(FILE_PATCHES.map((patch) => patch.file)).size).toBe(38);
    expect(() => validatePatchTargets(FILE_PATCHES, EXCLUDED_SKILLS, UPSTREAM_ROOT)).not.toThrow();
    expect(() => buildAssets()).not.toThrow();
  });

  it("covers the unit 3 text: the setup skill and the poteto preamble", () => {
    expect(patchesForFile("skills/setup-pstack/SKILL.md").length).toBeGreaterThan(5);
    expect(patchesForFile("agents/poteto-agent.md").length).toBeGreaterThan(0);
    expect(patchesForFile("agents/comment-sicko.md")).toEqual([]);
  });

  it("covers the unit 4 text: eight workflow skills and ten playbooks", () => {
    expect(UNIT4_PATCHED_FILES).toHaveLength(19);
    for (const file of UNIT4_PATCHED_FILES) {
      expect(patchesForFile(file).length, file).toBeGreaterThan(0);
    }
    for (const skill of [
      "how",
      "why",
      "architect",
      "arena",
      "swarm",
      "interrogate",
      "no-comments",
      "figure-it-out",
    ]) {
      expect(patchesForFile(`skills/${skill}/SKILL.md`).length, skill).toBeGreaterThan(0);
    }
    for (const playbook of [
      "investigation",
      "bug-fix",
      "perf-issue",
      "runtime-forensics",
      "trace-forensics",
      "feature",
      "refactoring",
      "prototype",
      "authoring-a-skill",
      "opening-a-pr",
    ]) {
      expect(
        patchesForFile(`skills/poteto-mode/playbooks/${playbook}.md`).length,
        playbook,
      ).toBeGreaterThan(0);
    }
  });

  it("returns the patches for one file", () => {
    expect(patchesForFile("skills/poteto-help/SKILL.md")).toHaveLength(20);
    expect(patchesForFile("skills/how/SKILL.md")).toHaveLength(4);
    expect(patchesForFile("skills/tdd/SKILL.md")).toEqual([]);
  });

  it("rewrites every unit 4 body without leaving the anchor or a Cursor field behind", () => {
    const assets = new Map(
      buildAssets().map((asset) => [asset.path, asset.bytes.toString("utf8")]),
    );

    for (const file of UNIT4_PATCHED_FILES) {
      const text = assets.get(file);
      expect(text, file).toBeDefined();
      for (const field of FORBIDDEN_CURSOR_FIELDS) {
        expect(text?.includes(field), `${file}: ${field}`).toBe(false);
      }
      // A long anchor that survives means the semantic block was never replaced.
      // An appending patch keeps its anchor on purpose, so it is skipped here.
      for (const patch of patchesForFile(file)) {
        if (typeof patch.anchor !== "string" || patch.anchor.length < 80) continue;
        if (patch.kind === "replace" && patch.replacement.includes(patch.anchor)) continue;
        expect(text?.includes(patch.anchor), `${file}: anchor still present`).toBe(false);
      }
    }
  });

  it("rewrites every unit 5 body without leaving the anchor or a Cursor field behind", () => {
    const assets = new Map(
      buildAssets().map((asset) => [asset.path, asset.bytes.toString("utf8")]),
    );

    expect(UNIT5_PATCHED_FILES).toHaveLength(13);
    for (const file of UNIT5_PATCHED_FILES) {
      expect(patchesForFile(file).length, file).toBeGreaterThan(0);
      const text = assets.get(file);
      expect(text, file).toBeDefined();
      for (const field of [...FORBIDDEN_CURSOR_FIELDS, ...UNIT5_FORBIDDEN_FIELDS]) {
        expect(text?.includes(field), `${file}: ${field}`).toBe(false);
      }
      // Same rule as unit 4: a long anchor that survives means the semantic
      // block never left, except for a patch that intentionally appends.
      for (const patch of patchesForFile(file)) {
        if (typeof patch.anchor !== "string" || patch.anchor.length < 80) continue;
        if (patch.kind === "replace" && patch.replacement.includes(patch.anchor)) continue;
        expect(text?.includes(patch.anchor), `${file}: anchor still present`).toBe(false);
      }
    }
  });

  it("covers the unit 5 skills and playbooks", () => {
    for (const skill of [
      "recall",
      "reflect",
      "automate-me",
      "show-me-your-work",
      "typescript-best-practices",
      "create-verification-skill",
      "maintain-verification-skill",
    ]) {
      expect(patchesForFile(`skills/${skill}/SKILL.md`).length, skill).toBeGreaterThan(0);
    }
    for (const playbook of ["eval", "session-pickup", "worktree-cleanup"]) {
      expect(
        patchesForFile(`skills/poteto-mode/playbooks/${playbook}.md`).length,
        playbook,
      ).toBeGreaterThan(0);
    }
    expect(patchesForFile("skills/poteto-mode/scripts/worktree-audit.sh").length).toBeGreaterThan(0);
  });

  it("no longer presents the audit script with a Cursor transcript scan", () => {
    const assets = new Map(
      buildAssets().map((asset) => [asset.path, asset.bytes.toString("utf8")]),
    );
    const script = assets.get("skills/poteto-mode/scripts/worktree-audit.sh") ?? "";

    expect(script).not.toContain("agent-transcripts");
    expect(script).not.toContain(".cursor/projects");
    expect(script).not.toContain("stat -f");
    expect(script).toContain("--sessions");
    expect(script).toContain("bucket=unknown-usage");
    expect(script).toContain("bucket=verify-recent-chat");
    expect(script).toContain("pinned=unknown");
  });

  it("keeps the same-route diagnosis in every panel skill", () => {
    const assets = new Map(
      buildAssets().map((asset) => [asset.path, asset.bytes.toString("utf8")]),
    );
    for (const [file, phrase] of [
      ["assets/skills/arena/SKILL.md", "not a cross-model arena"],
      ["assets/skills/architect/SKILL.md", "two sketches from one model"],
      ["assets/skills/interrogate/SKILL.md", "one model reading the diff twice"],
      ["assets/skills/swarm/SKILL.md", "not a cross-model race"],
    ] as const) {
      expect(assets.get(file.replace(/^assets\//, "")), file).toContain(phrase);
    }
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
