---
name: docs-drift
description: Audit living project documentation for drift, redundancy, and unsupported claims; repair approved findings.
disable-model-invocation: true
---

# Check project documentation drift

Compare maintained documents with current evidence. Report in read-only mode, or repair approved findings. Edit only documents, following the target project's ownership and generation rules.

## Modes

- **Report:** `/docs-drift` or `/docs-drift report`. Run steps 1 to 5 and stop.
- **Fix:** `/docs-drift fix`. Run steps 1 to 7. Fix waits for the step 6 approval before writing.

Accept paths, globs, and exclusions to set the scope. Ask when the mode or scope is ambiguous.

## The ledger

Keep one ledger. Define every value list here. Reconcile the ledger in step 5.

**DocumentCoverage** is one row per candidate:
`path · class · audit · edit route · checked · findings · unverified`

- class: `maintained` | `reference` | `excluded` | `unresolved`
- audit: `checkable` | `limited` | `evidence-only` | `not-audited` | `unresolved`
- edit route: `direct`, a declared source and update procedure, or `-`
- `checked = supported + contradicted + unverified`. `unverified` is a subset of `checked`.
- `findings` counts each Finding that cites one of the document's claims. State the distinct Finding total separately from the sum of per-document counts.
- `limited` gets the same claim inventory and check coverage as `checkable`.

**Claim** is one row per independently checkable statement:
`id · location · kind · evidence · outcome`

- id is document-local. One sentence with several independent facts yields several claims. Navigation and transitions yield none.
- kind: `current-fact` | `requirement` | `historical` | `example` | `summary`
- outcome: `supported` | `contradicted` | `unverified`
- An unsupported factual assertion is `unverified` and stays in the unverified list.
- A `contradicted` current-fact claim always produces a Finding.

**Finding** is one row per confirmed issue:
`id · kind · claim ids · current text · evidence · proposal · disposition`

- kind: `Implementation drift` | `Implementation coupling` | `Stale example` | `Environment assumption` | `Contradiction` | `Terminology` | `Link` | `Redundancy` | `Language drift` | `Unsupported elaboration`
- disposition: `repairable` | `needs-user-decision` | `unverified`

## 1. Set the scope

Take the user's paths when given. Otherwise start from the project's entry documents and maintenance rules, including linked language variants. Follow pointers that name documents to read, update, or keep synchronized. An explicitly requested document is an audit target even when it normally serves as evidence. Read the governing instructions for each candidate.

Derive class from project pointers, governing instructions, ownership, and update conventions. Derive audit and edit route separately. A maintained document may be generated, vendored, or upstream; name its declared source and update procedure. Classify external and vendored documents by the same criteria.

Record the current revision and working-tree state through the project's version control when available. State when no revision baseline exists. Separate readable documents with a clear baseline from documents whose working-tree changes obscure the intended state. Mark evidence that exists only in the working tree. Keep the working tree unchanged.

**Done when** every candidate has one coverage row with class, audit, edit route, and the evidence for each. Maintained rows carry audit and edit route. Reference rows name the evidence questions they answer. Excluded and unresolved rows cite their rule or reason. Limited rows name the limitation.

## 2. Extract the claims

Read each maintained document and its governing instructions. Index every section or cohesive block with its line range. Give each block its claim IDs, or the marker `no checkable claims`.

**Done when** every block of every maintained document has an index entry and either claim IDs or `no checkable claims`.

## 3. Resolve claims to evidence

For each claim, record its kind first. Then trace it to the source that kind needs: code, specifications, configuration, manifests, real directories, entry points, bindings, or tests. Use the governing specification as authority for requirement claims and historical evidence for historical claims. Record the exact source and the observed fact. Verify paths against the observed source or directory. A read-only project check may answer a specific evidence question; record its command and result.

Set each outcome. An unverified claim records its attempted check and evidence boundary. Keep conflicting authority visible. Mark claims affected by an unclear working-tree baseline unverified. Record which claims support each check in **Checks**; write `not applicable` only when the block index shows no applicable claim.

**Done when** every claim has an outcome or an explicit boundary, and every maintained document's claim count matches its ledger.

## 4. Run the checks

Apply every check in **Checks** to its applicable claims in every maintained document. Record the claim IDs behind each result.

**Done when** every check has supporting claim IDs or a block-backed `not applicable` for every maintained document, and every contradicted claim or disproven elaboration has a Finding.

## 5. Dispose and report

Pick authority by the kind of question. Explicit user requirements govern requested behavior. Project specifications and binding conventions govern declared constraints. Verifiable implementation evidence governs current behavior. Historical context governs past events.

Set each Finding's disposition:

- `repairable`: evidence establishes the fact, and the edit corrects a description, removes genuine redundancy, or shrinks disproven elaboration.
- `needs-user-decision`: authorities conflict, or the choice changes requirements.
- `unverified`: the finding's evidence is incomplete.

Stop a repairable item and ask the user in any of these cases:

- Implementation may be wrong, and the document may state the requirement.
- A repair would change functionality or an established constraint.
- Cited requirements and implementation disagree.
- A fix needs a non-document change or bypasses the project's source ownership and update procedure.

Emit the report from **Report shapes**: the coverage table, per-document claim ledgers, every Finding entry, and the explicit unverified and unresolved items. Report mode ends here.

**Done when** every line of this list holds:

- Each candidate has exactly one coverage row.
- Each document's `checked` equals the sum of its claim outcomes.
- Each contradicted claim and each disproven elaboration maps to a Finding.
- Each Finding cites at least one Claim and has a disposition.
- Each repairable action changes documents only.
- Each unverified claim lists its attempted check and boundary.
- Unverified and unresolved items appear explicitly.

## 6. Approve and repair

Fix only. Exclude unverified and unresolved items from the repair plan. Show the exact unified diff for every affected file, including language variants and deletion boundaries, as text in the reply. Label every hunk with its finding IDs. Put language pairs and other atomic synchronizations in one finding group. Mark edits excluded by unresolved questions.

Request explicit approval and wait. The user may approve a subset of complete finding groups. Immediately before editing, compare the current baseline with the recorded one through version control, or compare the target text and evidence directly. If either changed or cannot be compared, stop and present a new diff. Apply exactly the approved hunks. Repair the authoritative source, synchronize summaries and language variants, and follow the project's source ownership and generation procedure for derived documents, all through approved hunks. Preserve every unique requirement, constraint, caveat, and evidence pointer. If a new semantic conflict appears, stop that item and request a decision.

**Done when** every approved hunk is applied exactly or explicitly left unapplied with its reason, and no unapproved file changed.

## 7. Verify and close

Re-read every changed document and recheck all its claims. Confirm approved findings are resolved, paths and links resolve, language views agree, and no unapproved semantic change occurred. Run relevant existing project checks and record their results. Report changed files, resolved findings, approved omissions, unresolved questions, unverified claims, and verification evidence. State when no files changed.

**Done when** every approved edit has verification evidence or a concrete remaining failure, and every check has an actual result.

## Checks

Seven checks. Each yields zero or more Findings. Cite the claim IDs behind each.

**Paths, trees, commands, links, and pointers.** Resolve repository-relative links, paths, and anchors from the containing document. Match directory-tree entries to real files or the code that creates them. For parameterized paths, compare segment order and parameters with the constructors and their callers. Resolve command examples through real script or task declarations and argument parsers. Run an example only when read-only and it answers the claim. Network or access failures are `unverified`.

**Implementation coupling.** When a document names members of an enum, registry, group, phase, or configuration set, locate the authoritative definition. Weigh the document's purpose and the members' stability. A general process rule that repeats changing internal members is `Implementation coupling`, even when the names currently match; propose an applicability rule or a reference to that definition. User references, support matrices, public contracts, and fixed record formats intentionally enumerate members; verify them against consumers and the authoritative definition.

**Examples and temporary inventories.** Check that an example still exercises the stated behavior and that its status, selectors, inputs, and expected results remain current. Trace each concrete value to current implementation. When a permanent rule lists one-time work whose items or states are obsolete, report `Stale example`. When the governing contract requires a lasting principle or checklist, replace a temporary inventory with that form.

**Repeated concepts and authority.** Group claims by concept within and across maintained documents. Compare definitions, conditions, exceptions, and process rules. Identify the authoritative location before proposing consolidation. A repeated rule links to that authority or has evidence to stand alone. Retain summaries that add no obligations, audience-specific detail, and unique qualifications. Report duplicated rules without authority as `Redundancy` and conflicting rules as `Contradiction`. If no authority exists and rules agree, propose one; if their obligations conflict, use `needs-user-decision`.

**Environment, dependencies, and plugins.** Check claims about installed or unavailable capabilities against the project's specifications and manifests. Verify dependency names and installation advice against declared sources. Installation guides name the dependencies they install. When governing rules restrict environment-specific assumptions or names in general process documents, report `Environment assumption`; cite the project's declared exception and its authorization when one applies. Propose capability categories or applicability references as the governing rules require. Classify a missing external capability from evidence about its cause.

**Terminology and language variants.** Find conflicting names for one concept, one name for incompatible concepts, and definitions that diverge from usage. Pair maintained documents with their declared or conventional language variants. Compare obligations, exceptions, procedures, paths, parameters, counts, versions, examples, status, and summary meaning. A change on either side needs an evidence-backed synchronized counterpart. Equivalent meaning may be expressed differently.

**Unsupported elaboration.** Find unsupported facts, assumptions, invented rationale, performance conclusions, test coverage, and acceptance status. Shrink disproven elaboration to the smallest evidence-backed statement. Without counterevidence, keep the claim in the unverified list and request the missing evidence. Preserve historical context and explicit future plans. Verify intentional contracts against their consumers or tests; record resulting drift as a Finding.

## Report shapes

**Coverage table**, one row per candidate, including zero-claim rows:

```text
Path | Class | Audit | Edit route | Checked | Findings | Unverified
<path> | maintained | checkable | direct | <count> | <count> | <count>
<path> | maintained | limited | <source and update procedure> | <count> | <count> | <count>
<path> | reference | evidence-only | - | - | - | -
<path> | excluded | <reason> | - | - | - | -
<path> | unresolved | <reason> | - | - | - | -
```

For each maintained document, report its ownership pointer, every claim's id, location, evidence, and outcome, and every check's result or limitation. A compact table serves. List every unverified claim with its attempted check and boundary. A no-finding conclusion carries the coverage table and claim evidence. With unverified or unresolved items and no confirmed finding, conclude `No confirmed findings; audit incomplete`.

**Finding entry:**

```text
[Kind] Title
  Location: <document>:<line or section>
  Current: <exact current statement>
  Evidence: <code, config, directory, test, command and observed fact, or evidence boundary>
  Proposal: <documentation correction, deletion, consolidation, source reference, or evidence need>
  Disposition: repairable | needs-user-decision | unverified
```

For redundancy or coupling, name the authoritative source and what the document retains or references. For unsupported elaboration with verified counterevidence, state whether to delete or shrink it. Report `needs-user-decision` and unverified items explicitly.
