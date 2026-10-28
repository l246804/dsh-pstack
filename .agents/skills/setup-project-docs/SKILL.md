---
name: setup-project-docs
description: Set up a repository's architecture, glossary, decision records, and root agent-doc pointers. Run once per repository.
disable-model-invocation: true
---

# Set up project docs

Establish living documentation and context pointers to it. Reuse existing homes and conventions; the person approves every new file before it is written.

| Piece | Answers | Default location |
|---|---|---|
| Architecture | What is the system now? | `docs/architecture.md` |
| Glossary | What is each concept called? | `docs/glossary.md` |
| Decision records | Why did it turn out this way? | `docs/decisions/` |
| Pointers | When should an agent open each document? | Root `AGENTS.md` |

## 1. Inventory the repository

Inspect the root `AGENTS.md`, existing architecture and glossary documents, and `docs/decisions/`, `docs/adr/`, `doc/adr/`. Use existing paths and conventions instead of creating parallel homes. If several decision directories exist, ask which is current.

Read the build and workspace configuration to determine the repository's module boundaries. Inspect real directories and entry points until you can name the principal modules and their responsibilities. Stop when every proposed document has a source-backed outline and every missing fact is identified.

## 2. Confirm the plan

Present what exists, what is missing, and the proposed paths. Ask for decisions the repository cannot supply, leading with a recommendation:

- **Decision records:** recommend them when choices are costly to reverse; a small script or disposable prototype usually needs none. Declining leaves the related skills inert.
- **Glossary layout:** recommend one file. Offer per-context glossaries only when the repository has genuinely separate bounded contexts.

Get approval for the files and content to write. A re-run instead confirms which missing pieces to add and which existing pointers to update.

## 3. Draft source-backed content

- **Architecture:** start with a module table using real directories and entry points. Document dependency direction and extension points demonstrated by the code; leave rationale to decision records.
- **Glossary:** define three to five terms already used by the code whose ambiguity would cause divergent names.
- **Decisions:** write one real record only when an existing choice warrants it; otherwise create no placeholder record.
- **Decision conventions:** put record format, scope, status transitions, and search rules in the chosen decision directory's `AGENTS.md` when decision records are enabled.

Show all drafts together and obtain approval before writing.

## 4. Write or update

Create only approved files. Preserve and edit existing files in place. Update the single block under `## Project docs` in root `AGENTS.md`, adapting this example to its language and approved paths:

```markdown
## Project docs

- Read `docs/architecture.md` before changing a module; update it when module boundaries or entry points change.
- Read `docs/glossary.md` when naming a concept; add terms when introducing concepts.
- Before writing or reviewing decisions, read `docs/decisions/AGENTS.md` for format and search conventions.
```

Each pointer states its trigger and target. Keep the block to these three approved branches; omit pointers to declined documents. Use the actual glossary and decision paths, and point to the plain decision reference rather than presenting a user-invoked skill as automatically callable.

## 5. Verify and report

Verify that root `AGENTS.md` contains one `## Project docs` block and that every pointer resolves from the repository root. Report written, updated, and skipped paths with reasons. State that the pointers take effect in the next session.
