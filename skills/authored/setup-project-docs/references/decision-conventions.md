# Decision-record conventions

When decision records are enabled, draft `<dir>/AGENTS.md` as the repository's authoritative format, scope, status, and search reference. Include:

- The five-field header: `Status`, `Date`, `Scope`, `Implemented-by`, `Review`.
- The status/anchor pair rule and transitions, including immediate supersession by a new draft. A replaced `proposed` record retains `Implemented-by: -`; preserve its body rather than deleting or reverting it.
- Before starting any repository task, read the headers of every `proposed` and `accepted` record, then select by `Scope` against the task and its affected paths and read the full text of relevant records. `accepted` records constrain current implementation; `proposed` records state the intended direction. When the task conflicts with a relevant record, report the conflict and obtain the user's direction before proceeding.
- Related-record search and classification before writing or substantially updating a record.
- `decision-write` as the entry rule for every record change.
- One `Scope` matcher shared by writing and auditing, including repository-relative paths and directory globs that cover descendants.
- `Superseded-by` with the replacing record path and one-line reason for every `superseded` record.

Adapt `decision-write`'s fallback template to the repository's language and conventions. Require a real implementation anchor to intersect `Scope` and include a path outside `<dir>`. Permit a record-only commit only through `decision-write`'s explicitly confirmed Land exception, and state that audits continue to report it.
