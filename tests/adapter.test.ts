import { describe, expect, it } from "vite-plus/test";

import {
  ADAPTER_POINTER,
  ADAPTER_TERMS,
  checkAdapterDoc,
  requiredAdapterRows,
  tableRows,
} from "../pstack/scripts/adapter.ts";

/**
 * The adapter gate's own failure modes, pinned.
 *
 * The document it guards is the only place a host difference is written down, so the
 * check has to fail when a row disappears. Two earlier shapes in this repository passed
 * while the tree drifted (a generated capability table, then a divergence ledger checked
 * by count and by member anchor), and both were replaced by deriving the requirement from
 * the prose that ships. These cases keep that derivation honest.
 */

const PROSE = [
  "Spawn a `Task` with `subagent_type: \"generalPurpose\"` and pass `readonly: true`.",
  "Keep the list in a todolist and ask through `AskQuestion`.",
];

describe("adapter terms", () => {
  it("derives required rows from prose rather than from a list", () => {
    expect([...requiredAdapterRows(PROSE)].sort()).toEqual(
      ["AskQuestion", "Task", "generalPurpose", "readonly", "subagent_type", "todolist"].sort(),
    );
  });

  it("requires nothing when the prose names no Cursor concept", () => {
    expect(requiredAdapterRows(["Run the tests and open a PR."])).toEqual([]);
  });

  it("gives every term a distinct row token", () => {
    // A shared token would let one row satisfy the check for another, which is the swap
    // the previous ledgers kept missing.
    const tokens = ADAPTER_TERMS.map((term) => term.rowToken);
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});

describe("checkAdapterDoc", () => {
  it("accepts a document that answers every concept with a table row", () => {
    const doc = [
      "# Adapter",
      "",
      "Drop it and say so if a field has no row.",
      "",
      "| Cursor | Here |",
      "| --- | --- |",
      "| `Task` | `pstack_subagent` |",
      "| `subagent_type` | `agent` |",
      "| `generalPurpose` | `general` |",
      "| `readonly` | prose only |",
      "| `AskQuestion` | `ask_user_question` |",
      "| todolist | `todo_write` |",
    ].join("\n");
    expect(checkAdapterDoc(doc, PROSE)).toEqual([]);
  });

  it("fails when a row is deleted, naming the cost", () => {
    const doc = [
      "# Adapter",
      "",
      "Drop it and say so.",
      "",
      "| Cursor | Here |",
      "| --- | --- |",
      "| `subagent_type` | `agent` |",
      "| `generalPurpose` | `general` |",
      "| `readonly` | prose only |",
      "| `AskQuestion` | `ask_user_question` |",
      "| todolist | `todo_write` |",
    ].join("\n");
    const problems = checkAdapterDoc(doc, PROSE);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("`Task`");
    expect(problems[0]).toContain("unnamed tool call");
  });

  it("does not accept an incidental mention in prose as a row", () => {
    // The measured failure this rule exists for: a substring check passed because a
    // paragraph elsewhere said "pstack_subagent", so the real row could be deleted.
    const doc = [
      "# Adapter",
      "",
      "Drop it and say so. `Task` spawns run through `pstack_subagent` here.",
      "",
      "| Cursor | Here |",
      "| --- | --- |",
      "| `subagent_type` | `agent` |",
      "| `generalPurpose` | `general` |",
      "| `readonly` | prose only |",
      "| `AskQuestion` | `ask_user_question` |",
      "| todolist | `todo_write` |",
    ].join("\n");
    expect(checkAdapterDoc(doc, PROSE).join("\n")).toContain("`Task`");
  });

  it("fails when the document does not say what to do with an unmapped name", () => {
    const doc = [
      "# Adapter",
      "",
      "| Cursor | Here |",
      "| --- | --- |",
      "| `Task` | `pstack_subagent` |",
      "| `subagent_type` | `agent` |",
      "| `generalPurpose` | `general` |",
      "| `readonly` | prose only |",
      "| `AskQuestion` | `ask_user_question` |",
      "| todolist | `todo_write` |",
    ].join("\n");
    expect(checkAdapterDoc(doc, PROSE).join("\n")).toContain("has no row");
  });

  it("fails when nothing is left to enforce, because then the term table is stale", () => {
    const problems = checkAdapterDoc("# Adapter\n\nDrop it and say so.", []);
    expect(problems.join("\n")).toContain("gone stale");
  });
});

describe("tableRows", () => {
  it("excludes the separator row and prose", () => {
    const doc = ["| a | b |", "| --- | --- |", "| c | d |", "not a row"].join("\n");
    expect(tableRows(doc)).toEqual(["| a | b |", "| c | d |"]);
  });
});

describe("ADAPTER_POINTER", () => {
  it("points at the adapter and states the unmapped rule", () => {
    expect(ADAPTER_POINTER).toContain("docs/harness/dsh.md");
    expect(ADAPTER_POINTER).toContain("drop it and say so");
  });
});
