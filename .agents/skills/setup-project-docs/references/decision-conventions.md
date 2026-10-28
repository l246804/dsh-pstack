# Decision-record conventions

When decision records are enabled, draft `<dir>/AGENTS.md` as the repository's authoritative format, scope, status, and search reference. Include:

- The five-field header: `Status`, `Date`, `Scope`, `Implemented-by`, `Review`.
- The status/anchor pair rule and transitions, including immediate supersession by a new draft. A replaced `proposed` record retains `Implemented-by: -`; preserve its body rather than deleting or reverting it.
- Related-record search and classification.
- `decision-write` as the entry rule for every record change.
- `Superseded-by` with the replacing record path and one-line reason for every `superseded` record.

Adapt `decision-write`'s fallback template to the repository's language and conventions. Require a real implementation anchor to intersect `Scope` and include a path outside `<dir>`. Permit a record-only commit only through `decision-write`'s explicitly confirmed Land exception, and state that audits continue to report it.
