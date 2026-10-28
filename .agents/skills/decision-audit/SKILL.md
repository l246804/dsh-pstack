---
name: decision-audit
description: Read-only report of decision records relevant to a change or repository, with command evidence.
disable-model-invocation: true
---

# Audit decision records

Report which records need human attention. Do not edit files or decide whether the code still matches a decision. Every finding cites the command and observed output that supports it.

## 1. Resolve inputs

Inputs are `mode` (`pr` by default, `local`, or `full`), optional `base`, and optional `scope` paths that replace the computed change set.

Use the PR base for `pr` and `origin/main` otherwise. If absent, try `origin/master`, `main`, `master`, the newest tag, then `HEAD~20`; report the selected ref. If none resolves, stop and list the attempted refs.

Inspect `docs/decisions/`, `docs/adr/`, and `doc/adr/`. Use the single existing directory as `<dir>` and report its path. If several exist, ask which is current and wait. If none exists or it is empty, report that normal result and stop.

## 2. Collect the evidence

For `pr` and `local`, compute the change set unless `scope` was supplied:

```bash
git diff --name-only "$(git merge-base HEAD <base>)"..HEAD
```

Exclude lock files, generated files, snapshots, and pure assets. For `full`, use all tracked files instead.

Read each record through its first `## ` heading and parse the header. Put records predating the five-field header in a separate legacy list; they need human backfill and are exempt from the checks below.

## 3. Apply all five checks

**A — Route.** For every non-`superseded` record whose `Scope` matches the change set, report its title, path, matching paths, and change-set evidence. Keep this to one line; the record supplies the details.

**B — Candidate status.** Report a `proposed` record only when its anchor verifies:

- `PR #N`: `gh pr view N --json state` returns `MERGED`.
- `commit:SHA`: `git merge-base --is-ancestor SHA <base>` exits 0.

A `-` anchor is pending, not a finding. Put unverifiable anchors in an `Unverified` section, outside B and C.

**B′ — Dead scope.** For an `accepted` record, report when no `Scope` glob matches an existing file. Give the path and glob-check evidence; ask whether the decision is obsolete or the scope is wrong.

**C — Broken anchor.** Report a commit missing from history or an unresolvable PR. Before calling a commit lost, recover its patch identity when its object remains available:

```bash
git show <dead-sha> | git patch-id --stable
```

Search plausible replacements within the record's date and scope:

```bash
git log --since=<Date> --format=%H -- <Scope paths> |
  while read -r sha; do git show "$sha" | git patch-id --stable; done |
  grep -F "<patch-id>"
```

A match supports suggesting the new SHA. No match remains a human question. Prefer PR anchors in squash-merged repositories.

**D — Overdue review.** In `full` mode only, report commits touching a record's `Scope` after its `Review` date:

```bash
git log --since=<Review> --oneline -- <Scope paths>
```

Include the count and latest subject; suggest human review and a new `Review` date.

## 4. Report and trim

Order findings `C`, `B`, `B′`, `D`, `A`; within each class, put more matched files first.

- `pr`: at most 15 findings, followed by the omitted count.
- `local`: at most 8 findings, including at most 3 class-A findings.
- `full`: no trimming; group by class.

Format:

```
[C] Decision title
  Record: docs/decisions/2026-08-14-use-postgres.md
  Basis: commit:3f9a1c2 is not in history
  Evidence: patch-id d064e03f4e53 matches new commit 8ff9f762
  Suggest: change Implemented-by to commit:8ff9f762
```

When nothing matches, say so in one line. In `full` mode, instead report every class count, including zeroes. List legacy and unverified records separately. If `gh` is missing or unauthenticated, mark PR anchors unverified and continue the other checks.
