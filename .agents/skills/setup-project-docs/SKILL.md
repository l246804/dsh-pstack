---
name: setup-project-docs
description: Bootstrap architecture, glossary, decision-record conventions, and root agent-doc pointers; rerun to fill approved gaps.
disable-model-invocation: true
---

# Set up project docs

Create or complete living project documentation and its context pointers. Obtain approval before writing or modifying files.

| Piece | Answers | Default location |
|---|---|---|
| Architecture | What is the system now? | `docs/architecture.md` |
| Glossary | What is each concept called? | `docs/glossary.md` |
| Decision conventions | How are decisions recorded and found? | `docs/decisions/AGENTS.md` |
| Pointers | When should an agent open each document? | Root `AGENTS.md` |

## 1. Inventory the repository

Inspect root `AGENTS.md` and existing architecture and glossary documents. Resolve `<dir>` in this order:

1. Use a caller-supplied record or directory path.
2. Otherwise, resolve the decision pointer in root `AGENTS.md` under `## Project docs` when it points to an existing `<dir>/AGENTS.md`.
3. Otherwise, inspect `docs/decisions/`, `docs/adr/`, and `doc/adr/`.

Use the selected directory and read its `AGENTS.md` and `README.md` conventions when present. If several candidates remain, ask which is current and wait. When none exists, use the default location from the table.

Read build and workspace configuration, real directories, and entry points until every principal module has a source-backed responsibility. Finish with an outline for each proposed document and an explicit list of facts the repository cannot supply.

## 2. Confirm the plan

Present existing, missing, and proposed paths. Lead with recommendations for decisions the repository cannot supply:

- **Decision records:** recommend them when choices are costly to reverse; a small script or disposable prototype usually needs none. Declining leaves the related skills inert.
- **Glossary layout:** recommend one file; split by context only for genuinely separate bounded contexts.

Confirm the proposed paths and scope. On a rerun, limit the plan to missing pieces and stale pointers. Confirming this plan is not write approval: step 3 presents the content for that approval.

## 3. Draft source-backed content

- **Architecture:** use a module table with real directories and entry points. Document dependency direction and extension points demonstrated by the code; put rationale in decision records.
- **Glossary:** define three to five existing code terms whose ambiguity could produce divergent names.
- **Decision conventions:** create no placeholder record. Leave any real record to `decision-write`; when enabled, draft `<dir>/AGENTS.md` following [the decision-record conventions](references/decision-conventions.md).

Present every draft together and obtain approval before writing. The approved set is the write plan.

## 4. Write or update

Create or update exactly the approved paths, editing existing files in place. Keep one `## Project docs` block in root `AGENTS.md`, adapted to its language and actual paths:

```markdown
## Project docs

- Read `docs/architecture.md` before changing a module; update it when module boundaries or entry points change.
- Read `docs/glossary.md` when naming a concept; add terms when introducing concepts.
- Before starting any repository task, read `docs/decisions/AGENTS.md` and follow its search rules to read the records relevant to the task.
```

This block contains only document pointers. Include each pointer only for a document retained in the approved plan. Translate the pointer text into the root document's language and adapt its target to the actual path. Replace an existing `## Project docs` block with these pointers; preserve the rest of root `AGENTS.md`. Leave decision status meanings and record-selection rules in the decision directory's `AGENTS.md`.

## 5. Verify and report

Confirm that every approved path was written or updated, root `AGENTS.md` contains one `## Project docs` block with only document pointers, and every pointer resolves to a retained document from the repository root. Report written, updated, and skipped paths with reasons. State that pointers take effect in the next session.
