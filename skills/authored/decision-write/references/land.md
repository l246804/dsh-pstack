# Find and verify the implementation

Use this reference for Land anchor discovery, record-only fallback, and anchor verification. The main skill owns status pairs, supersession, scope, approval, and reporting.

## Find the implementation

In Land when no candidate anchor is available, search commits and merged PRs touching the record's `Scope`:

```bash
git log --since=<Date> --format='%H %cs %s' -- <Scope paths>
gh pr list --state merged --search "<record title or scope keyword>" --json number,title,mergedAt,files --limit 20
```

If `Scope` is absent, search commit subjects and PR titles for the record's title or keywords. Start at its `Date`; for a retrospective record, also inspect recent commits before `Date` that touch `Scope`. If `gh` is unavailable, search commits and report that PR discovery was skipped.

Keep candidates whose changed paths intersect `Scope` and include at least one path outside `<dir>`; a change containing only decision records is not an implementation. Use one clearly matching candidate's `PR #N` or `commit:SHA`. If several match, list their dates, titles, and paths and ask which one. If none matches, use the fallback below.

## Record-only fallback

When no implementation exists and the user still wants `accepted`, explain both points and wait for explicit confirmation:

- **Reason:** the record commit records the decision but does not implement it, so the anchor would claim a landing that never happened.
- **Consequence:** `decision-audit` reports this anchor as a C finding; a later implementation should replace it.

Ask whether to use `commit:<record-commit>` or leave `proposed` + `-`. Use `accepted` + `commit:<record-commit>` only after confirmation, and report the exception. This exception overrides an `<dir>/AGENTS.md` ban on record-only anchors. If that commit is outside the default branch, retain `proposed` + `-` until it merges.

## Verify the anchor

Resolve `<base>` as the default branch:

```bash
git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null ||
  git rev-parse --verify origin/main 2>/dev/null ||
  git rev-parse --verify origin/master 2>/dev/null ||
  git rev-parse --verify main 2>/dev/null ||
  git rev-parse --verify master 2>/dev/null
```

Verify every proposed `Implemented-by` value:

| Value | Command | Verified when |
|---|---|---|
| `PR #N` | `gh pr view N --json state,files` | `state` is `MERGED` and the change implements the decision |
| `commit:SHA` | `git merge-base --is-ancestor SHA <base>` | Exit code 0 and the change implements the decision |

List candidate paths with `gh pr view N --json files --jq '.files[].path'` or `git show --pretty=format: --name-only SHA`. A real implementation intersects `Scope` and includes a path outside `<dir>`; a record-only anchor needs the confirmed exception. Return these paths to the scope check.

For unlanded work, failed verification, unavailable `gh`, or an unresolved `<base>`, write `proposed` + `-` and report the evidence or attempted refs. An unresolved base also blocks base-relative scope checks; use caller-supplied paths or report that evidence as unavailable. Never demote an existing `accepted` record on failed verification; return its broken anchor to the main skill's stop-and-report rule.
