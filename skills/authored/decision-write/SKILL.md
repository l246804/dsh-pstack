---
name: decision-write
description: Write, update, land, or supersede a decision record. Use for resolved alternatives, missing design rationale, reversed decisions, or any record-file change. Land discovers and verifies the implementation.
---

# Write or update a decision record

Deliver one settled choice as a verified record and evidence report. All record edits go through this skill; `decision-audit` only reports.

## Entry rule

Use this procedure for every change to `Status`, `Implemented-by`, `Superseded-by`, `Review`, body, or links. If it cannot run, stop and report; this rule overrides `<dir>/AGENTS.md` conventions permitting direct edits.

## Locate the records

Inspect `docs/decisions/`, `docs/adr/`, and `doc/adr/`:

- One exists: call it `<dir>`, follow its naming convention, and read its `AGENTS.md` when present.
- Several exist: ask which is current and wait.
- None exists: report that this repository keeps no decision records, suggest `/setup-project-docs`, and stop.

`AGENTS.md` and `README.md` are conventions, not records; exclude both from searches, classification, and updates.

## Choose the mode

- **Draft:** no record owns this decision, a new record replaces an old one, or an existing record needs substantive body or relationship updates. Duplicate and overlapping dispositions stay in Draft; explicit status-field updates use Land. Do steps 1–5, present the approval gate in step 6, then write only after confirmation and report with step 7.
- **Land:** the user explicitly asks to mark an existing record `accepted` or update its status fields. Do steps 4, 5, and 7. A record path plus `accepted` is sufficient input; never enter Land autonomously. Without a path, list records whose `Scope` matches the landed change and ask which to update.

## 1. Establish the choice

Obtain all three from the change and discussion; ask only about missing items and wait:

- **Goal:** the problem this decision answers.
- **Constraint:** the boundary that eliminates an option.
- **Alternative:** an option actually rejected, or the explicit fact that only one candidate was considered.

## 2. Find related records

Search for distinctive terms from the topic, affected modules, and alternatives:

```bash
grep -ril --exclude=AGENTS.md --exclude=README.md \
  -e "<keyword-1>" -e "<keyword-2>" <dir>/*.md
```

Read each hit through its first `## ` heading; read the body only when the header cannot distinguish its disposition or cannot supply the content needed for an update. Tighten broad searches rather than reading the whole directory. Classify every hit:

- **Duplicate:** the existing record owns this decision. Update it instead of writing a second one.
- **Replaced:** draft the new record and cross-link both records. Include the old record's supersession in the approval gate.
- **Overlapping:** keep both, cross-link them, and reconcile changed facts.
- **Unrelated:** leave it unchanged.
- **Unresolved:** carry the relationship and human question into the report.

This step is complete when every hit has a disposition and every resulting edit is explicit.

## 3. Draft the record

Follow `<dir>/AGENTS.md`, including heading language. In its absence, use:

```markdown
# Decision: <one-line title>

Status: proposed | accepted | superseded
Date: YYYY-MM-DD
Scope: <glob>[, <glob>...]
Implemented-by: <PR #N | commit:SHA | ->
Review: YYYY-MM-DD
Superseded-by: <record path> — <one-line reason>   (only when Status is superseded)

## Background
## Decision
## Alternatives
## Consequences
```

Write `Background` independently of the chosen solution. For an accepted record, write `Decision` in the present tense. Give every considered alternative its own paragraph and rejection reason; when there was only one candidate, state that fact.

## 4. Set status and verify the anchor

`Status` and `Implemented-by` are one pair. Select the row supported by evidence and write both fields together:

| Evidence | Status | Implemented-by |
|---|---|---|
| No verified landing anchor | `proposed` | `-` |
| `PR #N` is `MERGED` | `accepted` | `PR #N` |
| `commit:SHA` is an ancestor of the default branch | `accepted` | `commit:SHA` |
| Confirmed record-only exception | `accepted` | `commit:<record-commit>` |
| Replaced by a newer draft | `superseded` | Keep the existing value |

A new record stays `proposed` until it lands. `Implemented-by` identifies the implementing change, including an earlier implementation for a retrospective record; a record-only commit requires the confirmed exception. Prefer a merged PR in a squash-merged repository.

For Land without an anchor, or the record-only exception, read [Find and verify the implementation](references/land.md) before editing. For any other proposed anchor, use that reference's verification procedure without its discovery steps.

Resolve `<base>` as the repository's default branch and report the selected ref. Verify every anchor; unavailable evidence or an unresolved base leaves a new record `proposed` + `-`. If an existing `accepted` record's anchor fails verification, stop and report it rather than silently demoting it. Change only fields required by evidence; advancing `Review` alone leaves status unchanged.

When a new draft replaces an old record, set the old record to `superseded` in the same approved edit set, even when it was `accepted`. Keep its body and anchor, add the cross-link, and write `Superseded-by: <new record path> — <one-line reason>` below `Review`. Ask for a missing reason and wait. A `proposed` old record keeps `Implemented-by: -`.

## 5. Check scope covers the change

Use caller-supplied `scope` paths when present. For Land with a verified implementing change, list its paths with:

```bash
gh pr view N --json files --jq '.files[].path'
git show --pretty=format: --name-only SHA
```

For the confirmed record-only fallback, skip this check and report the exception. For every other mode, collect base-relative commits and uncommitted changes:

```bash
git diff --name-only "$(git merge-base HEAD <base>)"..HEAD
git status --porcelain=v1 --untracked-files=all
```

Decode `git status` paths, including the destination of a rename. Require each new or updated record to match at least one selected path to a `Scope` glob. When none matches, ask whether to widen the glob or omit the record. Record matched paths for the report.

## 6. Draft approval gate

For every Draft write, including a Duplicate update, present the complete resulting content of every new or updated record and every related-record disposition. Include each proposed supersession with its `Superseded-by` path and reason. Request explicit confirmation and wait. After confirmation, apply exactly the approved edits; a declined draft leaves every file unchanged.

## 7. Report

Account for every search hit, changed record, relationship, anchor verification, scope match, and unresolved question. A `proposed` record awaiting landing needs a Land update after merge. Name any discovered implementation and its changed paths; mark a record-only anchor as a confirmed exception. Include every `Superseded-by` path and reason.

```text
Record: docs/decisions/2026-10-27-use-postgres.md
Status: accepted
Related: 2026-03-02-mysql-setup.md -> overlapping, cross-linked
Anchor: PR #412 -> MERGED (gh pr view 412 --json state,files)
Scope: src/db/** matched src/db/client.ts
Open: none
```
