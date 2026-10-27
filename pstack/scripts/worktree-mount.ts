/**
 * The conditional mount of the official worktree rows.
 *
 * This package promises, in the README content decision, that worktree support is
 * a necessary dependency: the bundle turns it on when it is off and never mounts a
 * second provider when it is already on. A second provider is not a cosmetic
 * duplicate -- `ctx.provide()` throws when the service name is taken -- so the
 * guard has to be exact.
 *
 * The guard is a Cordis `disabled: !!js` expression on the inserted row. The loader
 * re-evaluates that expression at every mount decision (`Entry.disabledOf`), so the
 * answer follows the composed profile instead of a cached snapshot taken at startup.
 * `disabled: true` means "do not mount", so the expression returns true when some
 * *other* row already mounts the same plugin.
 *
 * Two deliberate choices, both visible in the tests:
 *
 * 1. The expression reads the composed row list from **this row's** loader entry
 *    (`ctx[Symbol.for("cordis.entry")].parent.data`), not from the `worktrees`
 *    service. A service lookup cannot tell this row's own provider from another
 *    row's, and it is not yet provided while sibling entries are still importing.
 *    It must be the entry handle rather than `ctx.fiber.entry`: see
 *    `worktreeRowGuardExpression` and
 *    `docs/decisions/2026-10-26-worktree-guard-reads-own-entry.md`.
 * 2. A row whose own `disabled` is a `!!js` expression counts as a provider. That
 *    leans toward "do not mount" rather than risking a duplicate provider we cannot
 *    see; the cost is a worktree row somebody disabled by expression.
 *
 * Row ids are ours, so the expression never matches itself. The official bundle
 * keeps its own ids (`worktree`, `tool-worktree`), and a profile that already has
 * them keeps exactly one provider.
 */

/** A composed loader row, as the loader sees it before mounting. */
export interface LoaderRow {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly disabled?: unknown;
  readonly group?: unknown;
  readonly config?: unknown;
}

export interface WorktreeRowMount {
  /** Row id this package inserts. Never an id the official bundles use. */
  readonly id: string;
  /** Official plugin package the row mounts. */
  readonly plugin: string;
  /** Plain-language reason the guard exists, for diagnostics and reports. */
  readonly reason: string;
}

/**
 * The two rows that make worktree usable: the runtime that owns `worktrees` and
 * the tool that exposes `create_worktree` to a model. Mounting only the runtime
 * would leave a child able to talk about isolation but unable to create a checkout,
 * so the pair is mounted or skipped together.
 */
export const WORKTREE_ROWS: readonly WorktreeRowMount[] = [
  {
    id: "pstack-worktree",
    plugin: "@deepseek-ai/dsh-experimental-worktree",
    reason: "Owns the `worktrees` service the parallel-write playbooks need.",
  },
  {
    id: "pstack-tool-worktree",
    plugin: "@deepseek-ai/dsh-experimental-tool-worktree",
    reason: "Registers `create_worktree`, the tool a child uses inside its own Session.",
  },
];

/**
 * One row is a provider of the plugin when it names that plugin and is not
 * explicitly disabled.
 *
 * A `!!js` value in `disabled` is an object, not `true`, so it counts as a
 * provider. Treating an unknown expression as "may provide" keeps the guard on the
 * safe side: the failure it prevents is a boot-time duplicate-provider error.
 */
export function rowProvidesPlugin(row: LoaderRow | null | undefined, plugin: string): boolean {
  if (row === null || typeof row !== "object") return false;
  if (row.name !== plugin) return false;
  return row.disabled !== true;
}

/**
 * Whether some other row already mounts `plugin`.
 *
 * `ownId` is excluded so the guarded row never counts itself once it is running.
 * `undefined` rows mean the composed list could not be read at all; that is not a
 * provider, and the caller then mounts, which is the documented dependency promise.
 */
export function hasExternalProvider(
  rows: readonly LoaderRow[] | undefined,
  plugin: string,
  ownId: string,
): boolean {
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => row !== null && typeof row === "object" && row.id !== ownId && rowProvidesPlugin(row, plugin));
}

/**
 * The exact `disabled: !!js` expression shipped in `cordis.patch.yml`.
 *
 * The expression is a string because the loader evaluates it with
 * `new Function("ctx", "with (ctx) { return eval(expr) }")`. `cordis.patch.yml` is
 * a static file, so this function is the single source of the text: check-assets
 * compares the file against it, and the mount tests evaluate the file's own string.
 */
export function worktreeRowGuardExpression(row: WorktreeRowMount): string {
  return (
    "(() => { " +
    // Read THIS row's entry, not the enclosing include entry. The Loader mounts
    // each entry's context with `Symbol.for('cordis.entry')` pointing at the entry
    // itself (`cordis-plugin-loader/lib/index.js:324`), so it is the only handle
    // that sees the composed sibling rows.
    //
    // `ctx.fiber.entry` resolves to the outer `include` row instead: measured on a
    // real Loader, `ownId` is `include:guarded` while `fiberEntryId` is `include`
    // and `fiberSiblings` is `["include"]` — an array holding only `include`. Its
    // `name` is `cordis:include`, which never matches an official worktree plugin,
    // so that form returned false for every profile and both rows always mounted.
    "const own = ctx[Symbol.for('cordis.entry')]; " +
    "const rows = own && own.parent && own.parent.data; " +
    "if (!Array.isArray(rows)) return false; " +
    "return rows.some((row) => row !== null && typeof row === 'object' && " +
    `row.id !== '${row.id}' && row.name === '${row.plugin}' && row.disabled !== true) ` +
    "})()"
  );
}
