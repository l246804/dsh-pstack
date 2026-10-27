---
name: decision-write
description: Write or supersede a decision record in this repository's decision directory. Use when a change picks one option over a real alternative, when a reviewer asks why the code is shaped this way and no record answers it, or when an accepted decision is being reversed.
---

# Write a decision record

Turn one judgement from a change into a record a future reader can find and act on. You draft and check. The person decides.

## Where the records live

Read the directory before guessing it. The default is `docs/decisions/`, and a repository that already kept ADRs has `docs/adr/` or `doc/adr/` instead. Use whichever exists, and keep its numbering or date convention. When more than one exists, ask rather than merging them.

Stop before drafting when none exists. Say the repository keeps no decision records and name `/setup-project-docs` as the way to start. Creating that directory here gives the project a convention nobody agreed to.

The rest of this skill writes `<dir>` for that path.

## 1. Confirm the discussion has settled

Three things must hold. Ask for whichever is missing and wait.

- **Goal.** The problem this decision answers.
- **Constraint.** The boundary that removed the obvious option, such as a cost ceiling, a compatibility promise, or a contract with another system.
- **A rejected alternative.** A real option that lost. When discussion produced only one candidate, say that in the alternatives section rather than inventing a rival.

## 2. Search before drafting

```bash
grep -ril "<keywords>" <dir>/*.md
```

Report what came back and what each hit is, including "unrelated" for the ones that are. An unreported empty result reads the same as a search that never ran.

For each hit:

- **Fully replaced.** The new record wins. Tell the caller the old one needs `Status: superseded` and a link to the new record, and link back. Leave the old body alone.
- **Partial overlap.** Keep both. Link each to the other and correct whichever facts have moved.
- **Unrelated.** Skip it.

## 3. Draft

Read `<dir>/AGENTS.md` for the format this repository uses, including the language its headings are written in. Without that file, use this shape:

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

Write the background so it reads without the decision. Write the decision in the present tense for `accepted`, describing what the system does now rather than what it will do. Give every alternative its own paragraph with the reason it lost.

## 4. Verify the anchor

Run a command against every value in `Implemented-by` and report the command with its result. `-` needs no verification and is correct while the work is unlanded.

| Value | Command | Passes when |
|---|---|---|
| `PR #N` | `gh pr view N --json state,mergedAt` | `state` is `MERGED` |
| `commit:SHA` | `git merge-base --is-ancestor SHA origin/main` | exit code 0 |

When `gh` is missing or unauthenticated, report the anchor unverified and offer `commit:` instead. When verification fails, write `-` and say why. A guessed anchor is worse than none because every later audit re-checks it.

Prefer `PR #N` in a repository that squash-merges. A squash rewrites the commit, so `commit:` stops resolving.

## 5. Check the scope covers the change

```bash
git diff --name-only "$(git merge-base HEAD origin/main)"..HEAD
```

At least one changed file should match at least one glob. When nothing matches, name the two readings it allows, that the glob is too narrow or that this record does not belong to this change, and let the caller choose.

## 6. Report

```
Record: docs/decisions/2026-10-27-use-postgres.md
Status: accepted
Duplicates: 1 hit (2026-03-02-mysql-setup.md), partial overlap, cross-linked
Anchor: PR #412 -> MERGED (gh pr view 412)
Scope: 3 globs, 2 matched by this change
Open: whether the older record should be marked superseded
```

Name the open questions last. Deciding them is the caller's job, and a record that silently resolved one is a record its author stops trusting.
