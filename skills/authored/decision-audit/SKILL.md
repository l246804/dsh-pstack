---
name: decision-audit
description: Audit decision records against a change set or the whole repository; report routing, status, scope, anchor, supersession, and review findings with command evidence.
disable-model-invocation: true
---

# Audit decision records

Produce a read-only report of records needing human attention, without judging whether code still honors a decision. Cite each finding with its command and observed output; leave every edit to `decision-write`.

## 1. Resolve the inputs

Accept `mode` (`pr`, `local`, or `full`; default `pr`), optional `base`, and optional `scope` paths replacing the computed change set.

For `pr`, resolve the PR base; otherwise try `origin/main`. When absent, try `origin/master`, `main`, `master`, the newest tag, then `HEAD~20`. Report the selected ref, or stop and list every attempted ref.

Inspect `docs/decisions/`, `docs/adr/`, and `doc/adr/`:

- One exists: call it `<dir>` and report its path.
- Several exist: ask which is current and wait.
- None exists or it contains no records: report that normal result and stop.

## 2. Collect the evidence

When `scope` is absent, compute the change set:

```bash
# pr
git diff --name-only "$(git merge-base HEAD <base>)"..HEAD

# local: base-relative commits plus the working tree and index
git diff --name-only "$(git merge-base HEAD <base>)"..HEAD
git status --porcelain=v1 --untracked-files=all
```

Decode `git status` paths, including the destination of a rename. For `full`, use all tracked files. Exclude lock files, generated files, snapshots, and pure assets from the computed set; record these exclusions and the final set.

Read `<dir>/AGENTS.md` and `<dir>/README.md` when present; these are conventions, not records. Apply their conventions to every other `*.md`. Parse each header through its first `## ` heading. List records missing any of `Status`, `Date`, `Scope`, `Implemented-by`, or `Review` separately as `Legacy`, exempt from all six checks.

Apply every applicable check to every current record; a record may have multiple findings.

## 3. Apply all six checks

**A — Route.** For each non-`superseded` record whose `Scope` matches the change set, report its title, path, matched paths, and change-set evidence in one line.

**B — Status pair.** Use the anchor results below and report each matching row:

| Status | Anchor result | Finding |
|---|---|---|
| `proposed` | verified | Should be `accepted` |
| `accepted` | `-`, missing, pending, or unverified | Landing lacks verified evidence |

For `proposed`, `-` or a pending anchor is not a finding; an unverified anchor belongs in `Unverified`, outside B and C.

**B′ — Dead scope.** For each `accepted` record with no `Scope` glob matching an existing file, report its path and glob-check evidence. Ask whether the decision is obsolete or its scope is wrong.

**C — Broken anchor.** For each non-`superseded` `Implemented-by` value, classify it with evidence:

| Value | Verification | Result |
|---|---|---|
| `-` or missing | None | Pending |
| `PR #N` | `gh pr view N --json state,files` | `MERGED`: continue below; `OPEN`: pending; `CLOSED`: C; otherwise: unverified |
| `commit:SHA` | `git merge-base --is-ancestor SHA <base>` | Exit 0: continue below; exit 1: C; otherwise: unverified |
| Any value | Command unavailable, authentication fails, or object cannot be read | Unverified |

For a landed PR or ancestral commit, list its paths with `gh pr view N --json files --jq '.files[].path'` or `git show --pretty=format: --name-only SHA`. `Verified` requires a path matching `Scope` and at least one path outside `<dir>`; otherwise report C with the path evidence.

Before reporting a commit as lost, read [Recover a rewritten commit](references/recover-commit.md) and attempt patch-identity recovery while its object remains available.

**D — Overdue review.** In `full` mode only, report each record whose `Review` date is before the current date. Collect the changes since the decision date:

```bash
date +%F
git log --since=<Date> --oneline -- <Scope paths>
```

Include the count and latest subject when present; suggest human review and a new `Review` date.

**E — Superseded record.** For each current `superseded` record, report when `Superseded-by` is missing, does not resolve to a record in `<dir>`, or carries no ` — <reason>` text. Suggest adding the replacing record path and a one-line reason.

## 4. Report and trim

Account for every current record as pending, clean, unverified, or carrying one or more findings. Order findings `C`, `B`, `B′`, `E`, `D`, `A`; within each class, put more matched files first.

- `pr`: at most 15 findings, followed by the omitted count.
- `local`: at most 8 findings, including at most 3 class-A findings.
- `full`: no trimming; report every class count, including zeroes.

Use this structure for findings; include `Evidence` for every class:

```text
[C] Decision title
  Record: docs/decisions/2026-08-14-use-postgres.md
  Basis: commit:3f9a1c2 is not in history
  Evidence: git merge-base --is-ancestor 3f9a1c2 origin/main -> exit 1
  Suggest: replace the anchor with commit:8ff9f762 (matching patch-id d064e03f4e53)
```

List `Legacy` and `Unverified` separately from findings. When nothing needs attention, say so in one line. An unavailable or unauthenticated `gh` leaves PR anchors unverified while the other checks continue.
