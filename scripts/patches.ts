/**
 * Source rewrites for the shipped CLIs.
 *
 * These are not prose patches. pstack scripts are TypeScript run under Bun, and this
 * package ships them as single-file Node programs: a profile resolves no peer
 * dependencies, and the Desktop build runs the package under Electron where `node` is
 * not on `PATH`. Each entry rewrites one construct that has no Node equivalent before
 * the bundler runs, and `build-runtime.ts` asserts every rewrite landed.
 *
 * This is the only patch list left in the repository. The 322 prose patches that used
 * to live beside it went with the generator that applied them; see
 * `docs/decisions/2026-10-27-upstream-text-plus-adapter.md`.
 */

import { BASH_FAKE_FORGE_ANCHOR, NODE_FAKE_FORGE_REPLACEMENT } from "./runtime/tests/fixtures.ts";

export type RewritingPatchKind = "rename" | "path" | "replace";

interface PatchTarget {
  /** Upstream-relative POSIX path. */
  readonly file: string;
  readonly reason: string;
  readonly anchor: string | RegExp;
  readonly expectedMatches: number;
  /** Fragments the patch must introduce. */
  readonly outputIncludes?: readonly string[];
}

export interface RewritingPatch extends PatchTarget {
  readonly kind: RewritingPatchKind;
  readonly replacement: string;
}

export interface DropPatch extends PatchTarget {
  readonly kind: "drop";
}

export type FilePatch = RewritingPatch | DropPatch;

export const PATCH_SCOPES = ["skills/", "agents/", "docs/guide/"] as const;

export const RUNTIME_SOURCE_PATCHES: readonly FilePatch[] = [
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/orch/orch.ts",
    reason:
      "The bundle is one file whose dependencies are already inside it, so nothing may install at startup.",
    anchor:
      '#!/usr/bin/env bun\n\nimport { ensureDependenciesInstalled } from "../bootstrap.ts";',
    expectedMatches: 1,
    replacement: "#!/usr/bin/env node",
    outputIncludes: ["#!/usr/bin/env node"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/orch/orch.ts",
    reason:
      "The bundle is one file whose dependencies are already inside it, so nothing may install at startup.",
    anchor: "\nensureDependenciesInstalled();\n",
    expectedMatches: 1,
    replacement: "",
    outputIncludes: [],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/watch-pr/watch-pr",
    reason:
      "The bundle is one file whose dependencies are already inside it, so nothing may install at startup.",
    anchor:
      '#!/usr/bin/env bun\nimport { ensureDependenciesInstalled } from "../bootstrap.ts";\n\nensureDependenciesInstalled();\n',
    expectedMatches: 1,
    replacement: "#!/usr/bin/env node\n",
    outputIncludes: ["#!/usr/bin/env node"],
  },
  // `check-plan` is already Node, but its content is now a built artifact, so its
  // own semantic rewrite belongs to this list: the template no longer reads from a
  // branch or arms a loop command, so the marker set follows it, and the test's
  // fixture plan carries the markers the checker now requires.
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/check-plan.mjs",
    reason:
      "The template no longer reads from a branch or arms a loop command, so the marker set follows it.",
    anchor: 'const PROGRAM_MARKERS = ["git show origin/main:", "/loop 1h", "status message"];',
    expectedMatches: 1,
    replacement: 'const PROGRAM_MARKERS = ["create_goal", "schedule_create", "status message"];',
    outputIncludes: ['const PROGRAM_MARKERS = ["create_goal", "schedule_create", "status message"];'],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/check-plan.test.ts",
    reason: "The fixture plan has to carry the markers the checker now requires.",
    anchor: "\\`git show origin/main:\\` /loop 1h status message",
    expectedMatches: 1,
    replacement: "\\`create_goal\\` \\`schedule_create\\` status message",
    outputIncludes: ["\\`create_goal\\` \\`schedule_create\\` status message"],
  },
  // ---------------------------------------------------------------------------
  // The five upstream test files.
  //
  // Only the import lines change. `bun:test` becomes `node:test` plus the support
  // module, which supplies the same `expect` and the same two `Bun` process
  // helpers; `import.meta.dir` becomes `import.meta.dirname` because Node has no
  // `dir`. Every assertion body stays the upstream text, which is what keeps the
  // coverage argument honest: these are the upstream cases, not a rewrite.
  // ---------------------------------------------------------------------------
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/check-plan.test.ts",
    reason: "Bun's test API is replaced by node:test plus the shipped support module.",
    anchor: 'import { expect, test } from "bun:test";\n',
    expectedMatches: 1,
    replacement: 'import { test } from "node:test";\nimport { expect } from "./support.ts";\n',
    outputIncludes: ['from "node:test"', 'from "./support.ts"'],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/check-plan.test.ts",
    reason:
      "The test runs the shipped checker beside it, and Node spells the containing directory import.meta.dirname.",
    anchor: 'const checker = join(import.meta.dir, "check-plan.mjs");',
    expectedMatches: 1,
    replacement: 'const checker = join(import.meta.dirname, "check-plan.mjs");',
    outputIncludes: ['join(import.meta.dirname, "check-plan.mjs")'],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/orch/orch.test.ts",
    reason: "Bun's test API is replaced by node:test plus the shipped support module.",
    anchor: 'import { afterEach, describe, expect, it } from "bun:test";\n',
    expectedMatches: 1,
    replacement:
      'import { afterEach, describe, it } from "node:test";\nimport { Bun, expect } from "../support.ts";\n',
    outputIncludes: ['from "node:test"', 'from "../support.ts"'],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/orch/orch.test.ts",
    reason:
      "The test runs the shipped bundle beside it, and Node spells the containing directory import.meta.dirname.",
    anchor: 'const SCRIPT = join(import.meta.dir, "orch.ts");',
    expectedMatches: 1,
    replacement: 'const SCRIPT = join(import.meta.dirname, "orch.mjs");',
    outputIncludes: ['join(import.meta.dirname, "orch.mjs")'],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/orch/orch.test.ts",
    reason:
      "The fake forge was a bash script placed on PATH; the shipped suite must not need bash, so the same fixture is written in Node.",
    anchor: BASH_FAKE_FORGE_ANCHOR,
    expectedMatches: 1,
    replacement: NODE_FAKE_FORGE_REPLACEMENT,
    outputIncludes: ["#!/usr/bin/env node"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/watch-pr/cli.test.ts",
    reason: "Bun's test API is replaced by node:test plus the shipped support module.",
    anchor: 'import { describe, expect, it } from "bun:test";\n',
    expectedMatches: 1,
    replacement:
      'import { describe, it } from "node:test";\nimport { expect } from "../support.ts";\n',
    outputIncludes: ['from "node:test"', 'from "../support.ts"'],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/watch-pr/github.test.ts",
    reason: "Bun's test API is replaced by node:test plus the shipped support module.",
    anchor: 'import { describe, expect, it } from "bun:test";\n',
    expectedMatches: 1,
    replacement:
      'import { describe, it } from "node:test";\nimport { expect } from "../support.ts";\n',
    outputIncludes: ['from "node:test"', 'from "../support.ts"'],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/scripts/watch-pr/policy.test.ts",
    reason: "Bun's test API is replaced by node:test plus the shipped support module.",
    anchor: 'import { describe, expect, it } from "bun:test";\n',
    expectedMatches: 1,
    replacement:
      'import { describe, it } from "node:test";\nimport { expect } from "../support.ts";\n',
    outputIncludes: ['from "node:test"', 'from "../support.ts"'],
  },
];
/** Source rewrites for one script source, if any. */
export function runtimePatchesForFile(file: string): readonly FilePatch[] {
  return RUNTIME_SOURCE_PATCHES.filter((patch) => patch.file === file);
}
