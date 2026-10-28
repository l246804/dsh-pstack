---
name: decision-write
description: Write or supersede a decision record in this repository's decision directory. Use when a change picks one option over a real alternative, when a reviewer asks why the code is shaped this way and no record answers it, or when an accepted decision is being reversed.
---

# Write a decision record

Draft and verify a record of one settled choice; leave unresolved choices to the caller. The deliverable is the record plus a report of every search, relationship, verification, and open question.

## Locate the records

Inspect `docs/decisions/`, `docs/adr/`, and `doc/adr/`.

- One exists: use it and follow its naming convention. Call it `<dir>`.
- Several exist: ask which is current and wait.
- None exists: report that this repository keeps no decision records and suggest `/setup-project-docs`; stop without creating one.

## 1. Establish the choice

Obtain all three before drafting. Ask only about what the change and discussion do not establish, then wait for missing answers.

- **Goal:** the problem this decision answers.
- **Constraint:** the boundary that eliminates an option.
- **Alternative:** an option actually rejected, or the explicit fact that only one candidate was considered.

## 2. Find related records

Read `<dir>/AGENTS.md` when present; it supplies the format, scope, status, and search conventions used below.

Search for distinctive terms from the topic, affected modules, and alternatives:

```bash
grep -ril "<keywords>" <dir>/*.md
```

Classify every returned record, including unrelated ones. Read each header through its first `## ` heading; read the body only if the header cannot distinguish these dispositions:

- **Replaced:** keep the old body unchanged, set its `Status: superseded`, and link the two records to each other.
- **Overlapping:** keep both, link them, and reconcile changed facts.
- **Unrelated:** no edits.

Tighten broad searches rather than reading the whole directory. Stop when every hit is classified as replaced, overlapping, unrelated, or unresolved, and every required edit is explicit. Carry unresolved relationships into the report.

## 3. Draft the record

Follow `<dir>/AGENTS.md`, including heading language. In its absence, use:

```markdown
# Decision: <one-line title>

Status: proposed | accepted | superseded
Date: YYYY-MM-DD
Scope: <globs>
Implemented-by: <PR #N | commit:SHA | ->
Review: YYYY-MM-DD

## Background
## Decision
## Alternatives
## Consequences
```

Write `Background` independently of the chosen solution. For an accepted record, write `Decision` in the present tense. Give every considered alternative its own paragraph and rejection reason; when there was only one candidate, state that fact.

## 4. Verify the anchor and scope

Verify every `Implemented-by` value:

| Value | Command | Verified when |
|---|---|---|
| `PR #N` | `gh pr view N --json state,mergedAt` | `state` is `MERGED` |
| `commit:SHA` | `git merge-base --is-ancestor SHA origin/main` | exit code 0 |

Use `-` for unlanded work, failed verification, or an unavailable `gh`; explain the choice. Prefer `PR #N` when squash merges rewrite commit SHAs.

Compare `Scope` with the change:

```bash
git diff --name-only "$(git merge-base HEAD origin/main)"..HEAD
```

At least one changed file must match a `Scope` glob. If none does, ask whether to widen the glob or omit this record from the change.

## 5. Report

Include every changed record, all search hits and their dispositions, each verification command and result, scope matches, and unresolved questions. For example:

```
Record: docs/decisions/2026-10-27-use-postgres.md
Status: accepted
Duplicates: 1 hit (2026-03-02-mysql-setup.md), overlapping, cross-linked
Anchor: PR #412 -> MERGED (gh pr view 412 --json state,mergedAt)
Scope: 3 globs, 2 matched by this change
Open: whether to supersede the older record
```
