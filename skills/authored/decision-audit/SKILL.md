---
name: decision-audit
description: Report which decision records need a human look, based on the files a change touches. Read-only.
disable-model-invocation: true
---

# Audit decision records

Answer one question: for the code this change touches, which decision records should a person read now? The output is a list of leads for a human to judge, never an automatic fix.

## Where the records live

Look for the directory instead of assuming one. The default is `docs/decisions/`; a repository that already kept ADRs has `docs/adr/` or `doc/adr/`. Read whichever exists and report its path in the output. When more than one exists, ask which one is current rather than merging them.

Stop with "this repository keeps no decision records" when none exists. That is a normal result, not a failure. The rest of this skill writes `<dir>` for that path.

## Inputs

- `mode`: `pr` (the default, the change under review), `local` (unpushed commits), or `full` (the whole repository).
- `base`: the PR base in `pr` mode, `origin/main` otherwise. When that ref is missing, try `origin/master`, `main`, `master`, the newest tag, then `HEAD~20`, and say which one was used.
- `scope`: an optional path list that replaces the computed change set.

## Output discipline

- This skill changes no file. Not a status, not a field, not a sentence. The report is the whole deliverable.
- Name the record and leave the verdict to the reader. Whether the code still matches it is a new decision for a person to make.
- Treat a scheduled `proposed` record as normal and leave it out.
- Quote the command and its output behind every line. A line without them does not ship, and "possibly stale" is not a finding.

## 1. Collect the change set

```bash
git diff --name-only "$(git merge-base HEAD <base>)"..HEAD
```

Drop lock files, generated files, snapshots, and pure assets. In `full` mode, skip this step and use every file in the repository.

## 2. Load the headers

Read each record up to its first `## ` heading and parse the fields there. A record that predates the five-field header is legacy rather than malformed. List those in their own section and keep them out of the checks below. They are the backfill list a person works through once.

## 3. Five checks

**A, routing.** `Status` is not `superseded`, and at least one `Scope` glob matches a changed file. Report the title and the path. State no opinion on whether the change is right.

**B, status candidate.** Only when `Status: proposed` and the anchor verifies:

- `PR #N` returns `MERGED` from `gh pr view N --json state`
- `commit:SHA` exits 0 from `git merge-base --is-ancestor SHA <base>`

A `-` anchor never qualifies. Neither does an unverifiable one: mark it unverified and keep it out of this class.

**B', scope went dead.** `Status: accepted` and no `Scope` glob matches any file that still exists. Two very different causes, so report the question rather than a verdict. Either the decision is obsolete and wants `superseded`, or the paths were written wrong and want fixing.

**C, anchor broke.** A `commit:SHA` that is not in history, or a `PR #N` that does not resolve. Look for the commit's content before calling it lost:

```bash
git show <dead-sha> | git patch-id --stable
```

Then search only the commits that could contain it, which keeps this affordable on a large repository:

```bash
git log --since=<Date> --format=%H -- <Scope paths> |
  while read -r sha; do git show "$sha" | git patch-id --stable; done |
  grep -F "<patch-id>"
```

A hit means the SHA moved and the record can be corrected to the new one. No hit means a person decides. A repository that squash-merges usually lands here, which is why records in one should carry `PR #N` instead.

**D, overdue for review.** `full` mode only. Files matching `Scope` gained commits after `Review`:

```bash
git log --since=<Review> --oneline -- <Scope paths>
```

Report the commit count and the most recent subject, and suggest re-reading the record and moving `Review` forward.

## 4. Order and trim

`C` first, then `B`, `B'`, `D`, `A`. Within a class, more matched files first.

- `pr`: at most 15 items, then one line naming how many were left out.
- `local`: at most 8 items, of which at most 3 are class `A`.
- `full`: no trim, grouped by class.

Class `A` gets a title and a link only. Its job is to send the reader to the record, so restating the record defeats it.

## 5. Output

```
[C] Decision title
  Record: docs/decisions/2026-08-14-use-postgres.md
  Basis: commit:3f9a1c2 is not in history
  Evidence: patch-id d064e03f4e53 matches new commit 8ff9f762
  Suggest: change Implemented-by to commit:8ff9f762
```

With nothing found, print one line saying no record matched. In `full` mode, print the per-class counts instead, including the zeroes.

## Failure handling

- No usable base: stop and list every ref that was tried. Do not fall back to a base that changes what the report means.
- `gh` missing or unauthenticated: mark `PR #N` items unverified and continue with the rest.
- Empty `<dir>`: say so and exit normally.
