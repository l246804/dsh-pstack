/**
 * The shipped script runtime, as one table.
 *
 * pstack ships five CLIs and five test bundles. None of them may require Bun,
 * bash, a `node_modules` tree beside them, or an install step: the npm package
 * installs into a profile whose workspace resolves no peer dependencies, and the
 * Desktop build runs the same package under Electron, where `node` is not on
 * `PATH`.
 *
 * So every shipped script is a single-file Node bundle produced by
 * `scripts/build-runtime.ts` and copied into `assets/` by `scripts/build-assets.ts`.
 * This module is the one place that says what ships and where it lands; the
 * bundler, the asset generator, and the checks read it instead of keeping their
 * own copy.
 *
 * Two source origins:
 *
 * - `upstream` — the pinned upstream TypeScript, rewritten by
 *   `RUNTIME_SOURCE_PATCHES` before it is bundled. `orch`, `watch-pr`,
 *   `check-plan` and their tests stay upstream sources so they keep tracking their
 *   original instead of becoming a fork of it.
 * - `authored` — this repository's own Node implementation under
 *   `scripts/runtime/`. `log` and `worktree-audit` are here because their upstream
 *   form is a shell script; their behaviour is specified by that script and
 *   re-implemented.
 */

/** Where a shipped artifact's source text comes from. */
export type RuntimeSourceKind = "authored" | "upstream";

export interface RuntimeSource {
  readonly kind: RuntimeSourceKind;
  /** Repository-relative POSIX path. */
  readonly path: string;
}

export interface RuntimeEntry {
  /** Stable id, used in logs and by the Host tool's `id` enum. */
  readonly id: string;
  /** A runnable CLI, or a test bundle run by `node --test`. */
  readonly kind: "cli" | "test";
  /** Bundler entry file. */
  readonly entry: RuntimeSource;
  /** Output path relative to `runtime/`. */
  readonly out: string;
  /** The same path below `assets/`. */
  readonly assetPath: string;
  /** Whether the artifact is meant to be executed directly. */
  readonly executable: boolean;
  /**
   * Every source the build touches, entry first.
   *
   * The bundler follows imports itself, so this is not a module list: it is the
   * set staged before the build and the set whose patches must all land. A file
   * missing here would either fail to resolve or silently skip its rewrite.
   */
  readonly sources: readonly RuntimeSource[];
  /** One line for `build-runtime` output. */
  readonly summary: string;
}

/** Upstream script directories whose contents the built artifacts replace. */
export const REPLACED_SCRIPT_DIRECTORIES: readonly string[] = [
  "skills/poteto-mode/scripts/",
  "skills/show-me-your-work/scripts/",
];

/** The directory holding the authored runtime sources. */
export const AUTHORED_RUNTIME_ROOT = "scripts/runtime/";

/** Support modules the ported tests import instead of `bun:test`. */
export const TEST_SUPPORT: readonly RuntimeSource[] = [
  { kind: "authored", path: `${AUTHORED_RUNTIME_ROOT}tests/expect.ts` },
  { kind: "authored", path: `${AUTHORED_RUNTIME_ROOT}tests/support.ts` },
];

/**
 * Where the support modules land inside the staged source tree.
 *
 * `support.ts` re-exports from `./expect.ts`, so the pair has to stay adjacent.
 * Staging them at the root of `poteto-mode/scripts` lets `orch/` and `watch-pr/`
 * both reach them through `../support.ts` with one copy, instead of one copy per
 * test directory.
 */
export const TEST_SUPPORT_STAGED_PREFIX = "skills/poteto-mode/scripts/";

/** `TEST_SUPPORT` as entry sources, so a test entry declares what it imports. */
const TEST_SUPPORT_ROOTS: readonly RuntimeSource[] = TEST_SUPPORT;

const upstreamScript = (path: string): RuntimeSource => ({
  kind: "upstream",
  path: `skills/poteto-mode/scripts/${path}`,
});

/** CLI artifacts, in the order the reviews and the prose name them. */
export const RUNTIME_CLIS: readonly RuntimeEntry[] = [
  {
    id: "check-plan",
    kind: "cli",
    entry: upstreamScript("check-plan.mjs"),
    out: "check-plan.mjs",
    assetPath: "skills/poteto-mode/scripts/check-plan.mjs",
    executable: true,
    sources: [upstreamScript("check-plan.mjs")],
    summary: "plan-shape checker",
  },
  {
    id: "orch",
    kind: "cli",
    entry: upstreamScript("orch/orch.ts"),
    out: "orch/orch.mjs",
    assetPath: "skills/poteto-mode/scripts/orch/orch.mjs",
    executable: true,
    sources: [upstreamScript("orch/orch.ts"), upstreamScript("orch/store.ts")],
    summary: "orchestration bookkeeping store",
  },
  {
    id: "watch-pr",
    kind: "cli",
    entry: upstreamScript("watch-pr/watch-pr"),
    out: "watch-pr/watch-pr.mjs",
    assetPath: "skills/poteto-mode/scripts/watch-pr/watch-pr.mjs",
    executable: true,
    sources: [
      upstreamScript("watch-pr/watch-pr"),
      upstreamScript("watch-pr/cli.ts"),
      upstreamScript("watch-pr/github.ts"),
      upstreamScript("watch-pr/policy.ts"),
      upstreamScript("watch-pr/render.ts"),
      upstreamScript("watch-pr/types.ts"),
    ],
    summary: "pull-request watcher",
  },
  {
    id: "worktree-audit",
    kind: "cli",
    entry: { kind: "authored", path: `${AUTHORED_RUNTIME_ROOT}worktree-audit.ts` },
    out: "worktree-audit.mjs",
    assetPath: "skills/poteto-mode/scripts/worktree-audit.mjs",
    executable: true,
    sources: [{ kind: "authored", path: `${AUTHORED_RUNTIME_ROOT}worktree-audit.ts` }],
    summary: "read-only worktree audit",
  },
  {
    id: "log",
    kind: "cli",
    entry: { kind: "authored", path: `${AUTHORED_RUNTIME_ROOT}log.ts` },
    out: "log.mjs",
    assetPath: "skills/show-me-your-work/scripts/log.mjs",
    executable: true,
    sources: [{ kind: "authored", path: `${AUTHORED_RUNTIME_ROOT}log.ts` }],
    summary: "decision-log row appender",
  },
];

/** Test bundles, run by `node --test` from a copy with no install step. */
export const RUNTIME_TESTS: readonly RuntimeEntry[] = [
  {
    id: "check-plan-test",
    kind: "test",
    entry: upstreamScript("check-plan.test.ts"),
    out: "check-plan.test.mjs",
    assetPath: "skills/poteto-mode/scripts/check-plan.test.mjs",
    executable: false,
    sources: [upstreamScript("check-plan.test.ts")],
    summary: "check-plan tests",
  },
  {
    id: "orch-test",
    kind: "test",
    entry: upstreamScript("orch/orch.test.ts"),
    out: "orch/orch.test.mjs",
    assetPath: "skills/poteto-mode/scripts/orch/orch.test.mjs",
    executable: false,
    sources: [
      upstreamScript("orch/orch.test.ts"),
      upstreamScript("orch/store.ts"),
      ...TEST_SUPPORT_ROOTS,
    ],
    summary: "orch tests",
  },
  {
    id: "watch-pr-cli-test",
    kind: "test",
    entry: upstreamScript("watch-pr/cli.test.ts"),
    out: "watch-pr/cli.test.mjs",
    assetPath: "skills/poteto-mode/scripts/watch-pr/cli.test.mjs",
    executable: false,
    sources: [
      upstreamScript("watch-pr/cli.test.ts"),
      upstreamScript("watch-pr/cli.ts"),
      upstreamScript("watch-pr/github.ts"),
      upstreamScript("watch-pr/policy.ts"),
      upstreamScript("watch-pr/render.ts"),
      upstreamScript("watch-pr/types.ts"),
      upstreamScript("watch-pr/fakes.test-helper.ts"),
      ...TEST_SUPPORT_ROOTS,
    ],
    summary: "watch-pr argument and rendering tests",
  },
  {
    id: "watch-pr-github-test",
    kind: "test",
    entry: upstreamScript("watch-pr/github.test.ts"),
    out: "watch-pr/github.test.mjs",
    assetPath: "skills/poteto-mode/scripts/watch-pr/github.test.mjs",
    executable: false,
    sources: [
      upstreamScript("watch-pr/github.test.ts"),
      upstreamScript("watch-pr/github.ts"),
      upstreamScript("watch-pr/types.ts"),
      upstreamScript("watch-pr/fakes.test-helper.ts"),
      ...TEST_SUPPORT_ROOTS,
    ],
    summary: "watch-pr GitHub reader tests",
  },
  {
    id: "watch-pr-policy-test",
    kind: "test",
    entry: upstreamScript("watch-pr/policy.test.ts"),
    out: "watch-pr/policy.test.mjs",
    assetPath: "skills/poteto-mode/scripts/watch-pr/policy.test.mjs",
    executable: false,
    sources: [
      upstreamScript("watch-pr/policy.test.ts"),
      upstreamScript("watch-pr/policy.ts"),
      upstreamScript("watch-pr/github.ts"),
      upstreamScript("watch-pr/types.ts"),
      upstreamScript("watch-pr/fakes.test-helper.ts"),
      ...TEST_SUPPORT_ROOTS,
    ],
    summary: "watch-pr policy and queue tests",
  },
];

/** Every artifact, CLIs first. */
export const RUNTIME_ENTRIES: readonly RuntimeEntry[] = [...RUNTIME_CLIS, ...RUNTIME_TESTS];

/** The shebang every emitted artifact starts with. */
export const SHEBANG = "#!/usr/bin/env node\n";

/** True when a repository-relative upstream path is replaced by a built artifact. */
export function isReplacedUpstreamScript(upstreamRelativePath: string): boolean {
  return REPLACED_SCRIPT_DIRECTORIES.some((prefix) => upstreamRelativePath.startsWith(prefix));
}

/** Look up one entry by id. */
export function runtimeEntry(id: string): RuntimeEntry {
  const entry = RUNTIME_ENTRIES.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`unknown runtime entry "${id}"`);
  return entry;
}
