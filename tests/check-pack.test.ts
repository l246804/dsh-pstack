import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { ROOT } from "../scripts/root.ts";
import {
  DIST_ROOT,
  ROOT_FILES,
  checkEmbeddedManifests,
  checkExportsTargets,
  compareTarball,
  exportsTargets,
  expectedTarball,
  sections,
} from "../scripts/check-pack.ts";
import type { Tarball } from "../scripts/check-pack.ts";
import { RUNTIME_CLIS } from "../scripts/runtime-manifest.ts";
import { ROLE_MANIFEST } from "../scripts/role-manifest.ts";

const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as unknown;

/** One tarball spelling: the given paths, sorted like the real reader returns them. */
function tarball(files: readonly string[]): Tarball {
  return { files: [...files].sort() };
}

describe("the expected tarball is derived, not written down", () => {
  it("names every asset the generator produces", () => {
    const expected = new Set(expectedTarball());
    for (const asset of ["assets/skills/poteto-mode/SKILL.md", "assets/agents/poteto-agent.md"]) {
      expect(expected.has(asset), asset).toBe(true);
    }
  });

  it("names the four root files and the directories npm ships from", () => {
    const expected = new Set(expectedTarball());
    for (const path of ROOT_FILES) expect(expected.has(path), path).toBe(true);
    expect([...expected].some((path) => path.startsWith(`${DIST_ROOT}/`))).toBe(true);
    expect([...expected].some((path) => path.startsWith("locale/"))).toBe(true);
    expect([...expected].some((path) => path.startsWith("static/"))).toBe(true);
  });

  it("puts every path in exactly one reported section", () => {
    const files = expectedTarball();
    const counts = sections(files);
    expect(counts.reduce((total, section) => total + section.count, 0)).toBe(files.length);
    expect(counts.map((section) => section.name)).toEqual([
      "assets",
      DIST_ROOT,
      "locale",
      "static",
      "root",
    ]);
  });
});

describe("a tarball that lost its build output fails", () => {
  it("reports a missing dist, naming the entry point and the fix", () => {
    const expected = expectedTarball().filter((path) => !path.startsWith(`${DIST_ROOT}/`));
    const problems = compareTarball(expected, tarball(expected));
    expect(problems.some((problem) => problem.includes("dist/index.mjs"))).toBe(true);
    expect(problems.some((problem) => problem.includes("build:bundle"))).toBe(true);
  });

  it("reports a described file the tarball omits", () => {
    const expected = expectedTarball();
    const problems = compareTarball(
      expected,
      tarball(expected.filter((path) => path !== "README.md")),
    );
    expect(problems).toEqual(["README.md: described by the checkout but absent from the tarball"]);
  });

  it("reports a file in the tarball that the checkout does not describe", () => {
    const expected = expectedTarball();
    const problems = compareTarball(expected, tarball([...expected, "docs/notes.md"]));
    expect(problems).toEqual(["docs/notes.md: in the tarball but not in this checkout's expected set"]);
  });

  it("keeps the entry count reproducible instead of hand-counted", () => {
    // The release checklist used to carry "baseline 166" as a copied number. The set
    // is derived here, so this assertion is about the derivation being stable, not
    // about the digits: a change to the tree changes the expected count and the
    // check follows, while a lost directory cannot go unnoticed.
    const files = expectedTarball();
    expect(files.length).toBeGreaterThan(140);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe("exports targets must exist and ship", () => {
  it("expands the locale wildcard to the files on disk", () => {
    const targets = exportsTargets(manifest);
    expect(targets).toContain("dist/index.mjs");
    expect(targets).toContain("locale/en.json");
    expect(targets).toContain("locale/zh.json");
    expect(targets).toContain("cordis.patch.yml");
    expect(targets.every((target) => !target.includes("*"))).toBe(true);
  });

  it("accepts the real manifest", () => {
    expect(checkExportsTargets(manifest, tarball(expectedTarball()))).toEqual([]);
  });

  it("reports an exported file that does not exist", () => {
    const problems = checkExportsTargets(
      { exports: { "./missing": "./dist/not-built.mjs" } },
      tarball([]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("dist/not-built.mjs");
    expect(problems[0]).toContain("does not exist");
  });

  it("reports an exported file that exists but is outside `files`", () => {
    const problems = checkExportsTargets(
      { exports: { "./readme": "./README.md" } },
      tarball([]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("outside \"files\"");
  });
});

describe("the bundled entry points agree with the manifests", () => {
  it("carries every shipped script asset path", () => {
    // The defect this covers: `src/script.ts` compiles `RUNTIME_CLIS[].assetPath`
    // into `dist/script.mjs`, so a manifest edit without a rebuild leaves a `dist`
    // that points at a path which is not in `assets/`. The only symptom is a
    // run-time "script not found".
    const script = RUNTIME_CLIS.map((entry) => `"${entry.assetPath}"`).join(",");
    expect(checkEmbeddedManifests({ script })).not.toEqual(
      expect.arrayContaining([expect.stringContaining("does not carry")]),
    );
    const missing = RUNTIME_CLIS.map(() => "").join("");
    expect(checkEmbeddedManifests({ script: missing })).toHaveLength(RUNTIME_CLIS.length);
  });

  it("carries every role the manifest declares", () => {
    const subagent = ROLE_MANIFEST.map((role) => role.key).join(",");
    expect(checkEmbeddedManifests({ subagent })).toEqual([]);
    expect(checkEmbeddedManifests({ subagent: "" })).toHaveLength(ROLE_MANIFEST.length);
  });

  it("says nothing when the bundler has not run", () => {
    // A missing `dist` is reported by `compareTarball` and `checkExportsTargets`, so
    // repeating it per manifest entry would bury the one real problem.
    expect(checkEmbeddedManifests({})).toEqual([]);
  });
});
