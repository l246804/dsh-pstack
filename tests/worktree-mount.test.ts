import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { ROOT } from "../scripts/build-assets.ts";
import {
  WORKTREE_ROWS,
  hasExternalProvider,
  rowProvidesPlugin,
  worktreeRowGuardExpression,
} from "../scripts/worktree-mount.ts";
import type { LoaderRow } from "../scripts/worktree-mount.ts";

/**
 * The guard the Loader actually runs.
 *
 * Cordis evaluates a `disabled: !!js` value with
 * `new Function("ctx", "expr", "with (ctx) { return eval(expr) }")`, so these tests
 * evaluate the string that ships instead of a paraphrase of it.
 */
const evaluate = new Function("ctx", "expr", "with (ctx) { return eval(expr) }") as (
  ctx: unknown,
  expr: string,
) => unknown;

const patchText = readFileSync(join(ROOT, "cordis.patch.yml"), "utf8");

function shippedGuard(rowId: string): string {
  const lines = patchText.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^\\s*- id: ${rowId}\\s*$`).test(line));
  if (start === -1) throw new Error(`cordis.patch.yml: no row "${rowId}"`);
  const next = lines.findIndex(
    (line, index) => index > start && /^\s*- id: /.test(line),
  );
  const block = lines.slice(start, next === -1 ? undefined : next).join("\n").trimEnd();
  const match = /^ *disabled: !!js "(.*)"$/m.exec(block);
  if (match === null) throw new Error(`cordis.patch.yml: row "${rowId}" has no guard`);
  return match[1] as string;
}

/**
 * The minimal loader context shape the guard reads.
 *
 * `Symbol.for("cordis.entry")` is the key the Loader uses for "this entry"
 * (`cordis-plugin-loader/lib/index.js:312,324`). The shape here mirrors that,
 * but a hand-built context cannot prove *which* entry the Loader hands over —
 * that is what the real-assembly case in `tests/plugin-wiring.test.ts` is for.
 */
function contextWith(rows: readonly LoaderRow[] | undefined): unknown {
  const entry = { parent: { data: rows } };
  return { [Symbol.for("cordis.entry")]: entry };
}

const RUNTIME = "@deepseek-ai/dsh-experimental-worktree";
const TOOL = "@deepseek-ai/dsh-experimental-tool-worktree";
type WorktreeRow = (typeof WORKTREE_ROWS)[number];
const runtimeRow = WORKTREE_ROWS.find((row) => row.plugin === RUNTIME) as WorktreeRow;
const toolRow = WORKTREE_ROWS.find((row) => row.plugin === TOOL) as WorktreeRow;

function guardFor(row: WorktreeRow, rows: readonly LoaderRow[] | undefined): boolean {
  return evaluate(contextWith(rows), shippedGuard(row.id)) === true;
}

describe("worktree row identity", () => {
  it("uses row ids the official bundles never use", () => {
    expect(WORKTREE_ROWS.map((row) => row.id)).toEqual(["pstack-worktree", "pstack-tool-worktree"]);
    for (const row of WORKTREE_ROWS) {
      expect(["worktree", "tool-worktree"]).not.toContain(row.id);
      expect(row.reason.trim().length, row.id).toBeGreaterThan(0);
    }
  });

  it("ships the guard text from the module, not a copy", () => {
    for (const row of WORKTREE_ROWS) {
      expect(shippedGuard(row.id), row.id).toBe(worktreeRowGuardExpression(row));
    }
    // Each guard names its own row, so a row never counts itself as a provider.
    expect(shippedGuard("pstack-worktree")).toContain("pstack-worktree");
    expect(shippedGuard("pstack-tool-worktree")).toContain("pstack-tool-worktree");
  });
});

describe("worktree mount decision", () => {
  it("mounts when the profile has no equivalent row", () => {
    expect(guardFor(runtimeRow, [{ id: "pstack" }, { id: "pstack-subagent" }])).toBe(false);
    expect(guardFor(toolRow, [{ id: "pstack" }, { id: "pstack-subagent" }])).toBe(false);
  });

  it("skips when another row already mounts the same plugin", () => {
    expect(guardFor(runtimeRow, [{ id: "worktree", name: RUNTIME }])).toBe(true);
    expect(guardFor(toolRow, [{ id: "tool-worktree", name: TOOL }])).toBe(true);
  });

  it("still mounts the runtime when only the tool row exists, and the reverse", () => {
    expect(guardFor(runtimeRow, [{ id: "tool-worktree", name: TOOL }])).toBe(false);
    expect(guardFor(toolRow, [{ id: "worktree", name: RUNTIME }])).toBe(false);
  });

  it("mounts again after the equivalent row is disabled, and skips once it is re-enabled", () => {
    const disabled = [{ id: "worktree", name: RUNTIME, disabled: true }];
    expect(guardFor(runtimeRow, disabled)).toBe(false);

    const reEnabled = [{ id: "worktree", name: RUNTIME, disabled: false }];
    expect(guardFor(runtimeRow, reEnabled)).toBe(true);
  });

  it("does not count its own row once it is running", () => {
    const own = [{ id: "pstack-worktree", name: RUNTIME }];
    expect(guardFor(runtimeRow, own)).toBe(false);
    expect(hasExternalProvider(own, RUNTIME, "pstack-worktree")).toBe(false);
  });

  it("keeps working when the official row arrives under another id or after an upgrade", () => {
    expect(guardFor(runtimeRow, [{ id: "worktree-v2", name: RUNTIME }])).toBe(true);
    expect(guardFor(toolRow, [{ id: "tool-worktree-v2", name: TOOL }])).toBe(true);
  });

  it("mounts instead of guessing when the composed list cannot be read", () => {
    // No loader context: the guard must not disable the row it cannot judge.
    expect(evaluate({}, shippedGuard(runtimeRow.id))).toBe(false);
    expect(guardFor(runtimeRow, undefined)).toBe(false);
    expect(hasExternalProvider(undefined, RUNTIME, "pstack-worktree")).toBe(false);
  });

  it("treats a provider disabled by expression as still providing", () => {
    const expressive = [{ id: "worktree", name: RUNTIME, disabled: { __jsExpr: "false" } }];
    expect(guardFor(runtimeRow, expressive)).toBe(true);
    expect(rowProvidesPlugin(expressive[0], RUNTIME)).toBe(true);
  });

  it("agrees with the pure predicate on every case", () => {
    const cases: readonly (readonly LoaderRow[] | undefined)[] = [
      undefined,
      [],
      [{ id: "pstack" }],
      [{ id: "worktree", name: RUNTIME }],
      [{ id: "worktree", name: RUNTIME, disabled: true }],
      [{ id: "pstack-worktree", name: RUNTIME }],
      [{ id: "tool-worktree", name: TOOL }],
      [{ id: "weird", name: RUNTIME }, { id: "pstack-tool-worktree", name: TOOL }],
    ];
    for (const rows of cases) {
      for (const row of WORKTREE_ROWS) {
        expect(guardFor(row, rows), `${row.id} ${JSON.stringify(rows)}`).toBe(
          hasExternalProvider(rows, row.plugin, row.id),
        );
      }
    }
  });

  it("ignores rows that are not objects", () => {
    expect(rowProvidesPlugin(null, RUNTIME)).toBe(false);
    expect(rowProvidesPlugin("worktree" as unknown as LoaderRow, RUNTIME)).toBe(false);
    expect(rowProvidesPlugin({ id: "x" }, RUNTIME)).toBe(false);
    expect(rowProvidesPlugin({ id: "x", name: "other-plugin" }, RUNTIME)).toBe(false);
  });
});
