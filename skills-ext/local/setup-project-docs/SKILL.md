---
name: setup-project-docs
description: Set up this repository's living documents (architecture, glossary, decision records) plus the agent instruction line that makes an agent read them. Run once per repository.
disable-model-invocation: true
---

# Set up project docs

Create the documents that answer three questions: what this system is now, what each concept is called, and why it turned out this way. Then write the one line that makes an agent open them.

Four pieces, and only the last one runs on its own:

| Piece | Answers | Lives at |
|---|---|---|
| Architecture | what the system is now | `docs/architecture.md` |
| Glossary | what each concept is called | `docs/glossary.md` |
| Decision records | why it turned out this way | `docs/decisions/`, or the directory this repository already uses |
| Pointer | when to open each one | the repository's agent instruction file |

An agent reads the instruction file before its first request in every session. Here that file is the root `AGENTS.md`. It reads the other three only when a line there sends it, so a pointer that names no trigger leaves them unread.

The decision directory is one fact with one home. Whichever directory step 1 finds, the pointer names that one, and `decision-write` and `decision-audit` read the same one. A repository that already kept `docs/adr/` keeps it; a fresh one gets `docs/decisions/`.

## 1. Explore before asking

Answer these from the repository. Ask only what the code cannot say.

- Instruction file. Read the root `AGENTS.md`. It may already carry a block this skill would write again. When it is missing, this skill creates it.
- Existing conventions. Someone may already have picked a layout. A root `GLOSSARY.md` is the common one, and `docs/adr/` means decisions already live in an ADR directory rather than `docs/decisions/`. Reuse whichever you find instead of opening a second home for the same content, and keep the name that repository uses.
- Existing docs. Look for `docs/architecture.md`, `docs/glossary.md`, a `GLOSSARY.md` at the root, `docs/decisions/`, `docs/adr/`, and `doc/adr/`. A partial setup is the normal case, so plan to fill gaps rather than replace files.
- Shape. One unit or several. Read the build files that already decide this: `package.json` workspaces, `pnpm-workspace.yaml`, `go.work`, a Maven or Gradle parent with `<modules>` or `include(...)`, a Cargo workspace `[workspace] members`, `settings.gradle`, `pom.xml`, or several top-level directories that each carry their own build file and `src/`. The answer decides whether the glossary is one file or one per context, and nothing about the answer is language-specific.
- Modules. Read the tree until you can name three or four real modules and what each owns. A template with placeholder names is worse than no file, because the next agent reads it, learns nothing, and stops opening it.

## 2. Present, then ask

List what exists and what is missing. Then take these in order, one answer each, and lead with your recommendation.

Decision records. Offer to enable them. They pay off where some choices are hard to reverse. A small script or a throwaway prototype does not need them. Say that declining leaves the two related skills inert rather than absent, since they ship with the package and only check whether `docs/decisions/` exists.

Glossary shape. One file suits almost every repository. Offer per-context glossaries only when the monorepo check found real multi-package structure, then confirm the layout.

## 3. Draft the content

Fill each template from what step 1 found. Leave no placeholder behind.

Architecture gets the module table first, built from real directories and real entry points. Add the dependency direction and the extension points only where the code states them. Reasons belong in a decision record, not here.

Glossary gets three to five terms that already exist in the code, picked because a newcomer would otherwise invent a different word for each. A list of invented terms teaches the next agent that the file is empty.

Decision records start with one real record when the repository has a choice worth writing down, and with an empty directory otherwise. A skeleton record full of placeholders is what makes people stop reading the directory.

Show the drafts before writing anything. Let the person cut what they do not want.

## 4. Write

Create each file the person accepted. Keep every existing file that step 1 found, and edit it in place rather than replacing it.

Give the pointer block a stable heading, so a re-run updates it instead of appending a second copy:

```markdown
## Project docs

- Read `docs/architecture.md` before changing a module: module boundaries, dependency direction, extension points. Update it in the same change when the code no longer matches.
- Read `docs/glossary.md` when a name is in doubt: one concept, one canonical word. Add a new concept in the same change that introduces it.
- Write `docs/decisions/` for a choice that is hard to reverse, using the `decision-write` skill. Details in `docs/decisions/AGENTS.md`.
```

Substitute the glossary path, the decision directory, and its `AGENTS.md` path with what step 1 found, so the block never points at a directory this repository does not use.

Write the block in the language the existing instruction file already uses. Three lines is the target, because this block loads in every session of every future task and every word of it is paid for on each turn. Each line names one document and the one condition that opens it.

Everything else belongs in the decision directory's own `AGENTS.md`, which loads only when someone touches that directory: the record format, the scope rule, the status transitions, and the list of what not to write.

## 5. Prove the pointer fires

An instruction file that names a path the agent cannot reach looks the same as a working one until someone relies on it.

- Check that every path in the block exists and resolves from the repository root.
- Check that the block sits in the root `AGENTS.md`, which is the instruction file this host loads.
- Tell the person the block applies from the next session, because the instruction file is read once before the first request.

Remove the line for any file the person declined. A pointer to a file that does not exist costs the next agent a turn to discover.

## 6. Report

```
Written: docs/architecture.md (4 modules), docs/glossary.md (5 terms), docs/decisions/AGENTS.md
Pointer: the `## Project docs` block in AGENTS.md
Skipped: records in docs/decisions/, until the first hard-to-reverse choice
Applies: next session
```

Print the paths you actually wrote, which may be `docs/adr/` rather than `docs/decisions/`. Name what was skipped and why. A person who declined the glossary in step 2 should not have to check whether it got written anyway.
