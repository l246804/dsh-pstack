/**
 * The shipped script runtime, as one table.
 *
 * pstack ships five CLIs and five test bundles. None of them may require Bun, bash, a
 * `node_modules` tree beside them, or an install step: the npm package installs into a
 * profile whose workspace resolves no peer dependencies, and the Desktop build runs the
 * same package under Electron, where `node` is not on `PATH`.
 *
 * Every source is checked in under `pstack/runtime/`, and every artifact is a
 * single-file Node bundle emitted into `pstack/pstack/skills/.../scripts/`, beside the
 * skill that invokes it. Two consequences shape this table.
 *
 * **The fork is the source.** `orch`, `watch-pr`, and `check-plan` began as upstream
 * TypeScript that a patch list rewrote at build time. That patch list is gone: the
 * rewritten text is now the checked-in source under `pstack/runtime/fork/`, so a build
 * reads files that exist instead of files that are assembled from an upstream tree plus
 * thirteen anchors. The cost is that an upstream change no longer arrives by syncing
 * the submodule; it has to be re-ported by hand, and
 * `docs/decisions/2026-10-27-script-fork.md` records that trade.
 *
 * **There is no staging step.** Nothing rewrites a source before bundling, so the
 * bundler reads the repository directly. `log` and `worktree-audit` were already
 * authored here because their upstream form is a shell script.
 */

export interface RuntimeEntry {
  /** Stable id, used in logs and by the Host tool's `id` enum. */
  readonly id: string;
  /** A runnable CLI, or a test bundle run by `node --test`. */
  readonly kind: "cli" | "test";
  /** Bundler entry file, repository-relative POSIX path. */
  readonly entry: string;
  /** Output path relative to `.build/runtime/`. */
  readonly out: string;
  /** The same path below `pstack/pstack/`. */
  readonly assetPath: string;
  /** Whether the artifact is meant to be executed directly. */
  readonly executable: boolean;
  /** One line for the build's output. */
  readonly summary: string;
}

/** Where the checked-in sources live. */
export const RUNTIME_SOURCE_ROOT = "pstack/runtime/";

/** Where the fork of the upstream scripts lives, keeping upstream's own layout. */
export const FORK_ROOT = `${RUNTIME_SOURCE_ROOT}fork/`;

/** Upstream script directories whose contents the built artifacts replace. */
export const REPLACED_SCRIPT_DIRECTORIES: readonly string[] = [
  "skills/poteto-mode/scripts/",
  "skills/show-me-your-work/scripts/",
];

const fork = (path: string): string => `${FORK_ROOT}${path}`;

/** CLI artifacts, in the order the reviews and the prose name them. */
export const RUNTIME_CLIS: readonly RuntimeEntry[] = [
  {
    id: "check-plan",
    kind: "cli",
    entry: fork("skills/poteto-mode/scripts/check-plan.mjs"),
    out: "check-plan.mjs",
    assetPath: "skills/poteto-mode/scripts/check-plan.mjs",
    executable: true,
    summary: "plan-shape checker",
  },
  {
    id: "orch",
    kind: "cli",
    entry: fork("skills/poteto-mode/scripts/orch/orch.ts"),
    out: "orch/orch.mjs",
    assetPath: "skills/poteto-mode/scripts/orch/orch.mjs",
    executable: true,
    summary: "orchestration bookkeeping store",
  },
  {
    id: "watch-pr",
    kind: "cli",
    entry: fork("skills/poteto-mode/scripts/watch-pr/watch-pr"),
    out: "watch-pr/watch-pr.mjs",
    assetPath: "skills/poteto-mode/scripts/watch-pr/watch-pr.mjs",
    executable: true,
    summary: "pull-request watcher",
  },
  {
    id: "worktree-audit",
    kind: "cli",
    entry: `${RUNTIME_SOURCE_ROOT}worktree-audit.ts`,
    out: "worktree-audit.mjs",
    assetPath: "skills/poteto-mode/scripts/worktree-audit.mjs",
    executable: true,
    summary: "read-only worktree audit",
  },
  {
    id: "log",
    kind: "cli",
    entry: `${RUNTIME_SOURCE_ROOT}log.ts`,
    out: "log.mjs",
    assetPath: "skills/show-me-your-work/scripts/log.mjs",
    executable: true,
    summary: "decision-log row appender",
  },
];

/** Test bundles, run by `node --test` from a copy with no install step. */
export const RUNTIME_TESTS: readonly RuntimeEntry[] = [
  {
    id: "check-plan-test",
    kind: "test",
    entry: fork("skills/poteto-mode/scripts/check-plan.test.ts"),
    out: "check-plan.test.mjs",
    assetPath: "skills/poteto-mode/scripts/check-plan.test.mjs",
    executable: false,
    summary: "check-plan tests",
  },
  {
    id: "orch-test",
    kind: "test",
    entry: fork("skills/poteto-mode/scripts/orch/orch.test.ts"),
    out: "orch/orch.test.mjs",
    assetPath: "skills/poteto-mode/scripts/orch/orch.test.mjs",
    executable: false,
    summary: "orch tests",
  },
  {
    id: "watch-pr-cli-test",
    kind: "test",
    entry: fork("skills/poteto-mode/scripts/watch-pr/cli.test.ts"),
    out: "watch-pr/cli.test.mjs",
    assetPath: "skills/poteto-mode/scripts/watch-pr/cli.test.mjs",
    executable: false,
    summary: "watch-pr argument and rendering tests",
  },
  {
    id: "watch-pr-github-test",
    kind: "test",
    entry: fork("skills/poteto-mode/scripts/watch-pr/github.test.ts"),
    out: "watch-pr/github.test.mjs",
    assetPath: "skills/poteto-mode/scripts/watch-pr/github.test.mjs",
    executable: false,
    summary: "watch-pr GitHub reader tests",
  },
  {
    id: "watch-pr-policy-test",
    kind: "test",
    entry: fork("skills/poteto-mode/scripts/watch-pr/policy.test.ts"),
    out: "watch-pr/policy.test.mjs",
    assetPath: "skills/poteto-mode/scripts/watch-pr/policy.test.mjs",
    executable: false,
    summary: "watch-pr policy and queue tests",
  },
];

/** Every artifact, CLIs first. */
export const RUNTIME_ENTRIES: readonly RuntimeEntry[] = [...RUNTIME_CLIS, ...RUNTIME_TESTS];

/** The shebang every emitted artifact starts with. */
export const SHEBANG = "#!/usr/bin/env node\n";

/** True when an upstream-relative path is replaced by a built artifact. */
export function isReplacedUpstreamScript(upstreamRelativePath: string): boolean {
  return REPLACED_SCRIPT_DIRECTORIES.some((prefix) => upstreamRelativePath.startsWith(prefix));
}

/** Look up one entry by id. */
export function runtimeEntry(id: string): RuntimeEntry {
  const entry = RUNTIME_ENTRIES.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`unknown runtime entry "${id}"`);
  return entry;
}
