---
name: setup-project-docs
description: Bootstrap architecture, glossary, decision-record documentation, and root agent-doc pointers; rerun to fill approved gaps.
disable-model-invocation: true
---

# Set up project docs

Create or complete living project documentation and its context pointers. Obtain approval before writing or modifying files.

| Piece | Answers | Default location |
|---|---|---|
| Architecture | What is the system now? | `docs/architecture.md` |
| Glossary | What is each concept called? | `docs/glossary.md` |
| Decision records | Why did it turn out this way? | `docs/decisions/` |
| Pointers | When should an agent open each document? | Root `AGENTS.md` |

## 1. Inventory the repository

Inspect root `AGENTS.md`, existing architecture and glossary documents, and `docs/decisions/`, `docs/adr/`, `doc/adr/`. Reuse existing homes and conventions. If several decision directories exist, ask which is current and wait.

Read build and workspace configuration, real directories, and entry points until every principal module has a source-backed responsibility. Finish with an outline for each proposed document and an explicit list of facts the repository cannot supply.

## 2. Confirm the plan

Present existing, missing, and proposed paths. Lead with recommendations for decisions the repository cannot supply:

- **Decision records:** recommend them when choices are costly to reverse; a small script or disposable prototype usually needs none. Declining leaves the related skills inert.
- **Glossary layout:** recommend one file; split by context only for genuinely separate bounded contexts.

Confirm the proposed paths and content. On a rerun, limit the plan to missing pieces and stale pointers. Step 3 supplies the final write approval.

## 3. Draft source-backed content

- **Architecture:** use a module table with real directories and entry points. Document dependency direction and extension points demonstrated by the code; put rationale in decision records.
- **Glossary:** define three to five existing code terms whose ambiguity could produce divergent names.
- **Decisions:** create no placeholder record. Leave any real record to `decision-write`; this skill only scaffolds the directory and conventions.
- **Decision conventions:** when enabled, write `<dir>/AGENTS.md` following [the decision-record conventions](references/decision-conventions.md).

Present every draft together and obtain approval before writing. The approved set is the write plan.

## 4. Write or update

Create or update exactly the approved paths, editing existing files in place. Keep one `## Project docs` block in root `AGENTS.md`, adapted to its language and actual paths:

```markdown
## Project docs

- Read `docs/architecture.md` before changing a module; update it when module boundaries or entry points change.
- Read `docs/glossary.md` when naming a concept; add terms when introducing concepts.
- Before writing or reviewing decisions, read `docs/decisions/AGENTS.md` for format and search conventions.
```

Lead each pointer with its trigger and target; include only approved branches. Point decision work to the plain reference.

## 5. Verify and report

Confirm that root `AGENTS.md` contains one `## Project docs` block, every approved path was written or updated, and every pointer resolves from the repository root. Report written, updated, and skipped paths with reasons. State that pointers take effect in the next session.
