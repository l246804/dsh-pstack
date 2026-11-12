---
name: docs-drift
description: Audit living project documentation for drift, redundancy, and unsupported claims; repair approved findings.
disable-model-invocation: true
---

# Check project documentation drift

Audit living project documents against current evidence. Stop after a read-only report, or apply approved documentation repairs. Edit only documents. Follow the target project's ownership and generation rules.

## Choose the mode

- **Report:** `/docs-drift` or `/docs-drift report`. Do steps 1–5 without writing files.
- **Fix:** `/docs-drift fix`. Do the same inspection, then steps 6–7. Invoking Fix is not write approval.

Accept optional paths or globs to add to or narrow the candidate set, plus optional exclusions. Ask when the requested mode or scope is ambiguous.

Use these working records throughout the audit:

- **DocumentCoverage:** path, classification, auditability, edit route, checked claim count, finding count, and unverified count. Checked claims equal supported, contradicted, and unverified claims combined. `limited` has the same inventory and check coverage as `checkable`.
- **Claim:** stable ID, document location, one independently checkable statement, kind, evidence, and outcome. A sentence with several independent facts has several claims. Navigation and transitions need no claim. An unsupported factual assertion is `unverified` and belongs in the unverified list rather than the finding list.
- **Finding:** one or more claim IDs, exact current text, evidence, proposed documentation action, and disposition. Use `unverified` when a finding's evidence is incomplete. Use `needs-user-decision` for conflicting authorities or a choice that changes requirements.

Count only claims actually traced to evidence or given a specific evidence boundary.

## 1. Discover the maintained documents

Start with the user's paths when supplied. Otherwise use the project's entry documents and maintenance rules, including linked language variants. Record absent declared pointers.

Follow project pointers that designate documents to read, update, or keep synchronized. Use ordinary links as evidence. Check links in maintained documents without adding their targets to the full scan.

An explicitly requested document is an audit target even when its normal role is reference. Apply explicit paths, globs, narrowing, and exclusions to the candidate set. Classify each discovered document by the rules below. Read the governing instructions for each candidate. Project-owned rules that require document maintenance are themselves maintained documents.

Classify every candidate from project pointers, governing instructions, ownership, and update conventions:

- **maintained:** owned by this project and updated as its implementation or workflows evolve. Apply every check.
- **reference:** evidence for another claim, rather than an audit target. It may be project-owned or external. Record why it is outside the maintained set.
- **excluded:** outside the requested scope or excluded by an explicit rule.
- **unresolved:** maintenance ownership is unclear. Ask before including it and continue unrelated candidates.

Derive ownership and maintenance duties from project pointers and update conventions. A project pointer that requires maintenance makes its target maintained. Separately determine whether it is directly editable. For generated, vendored, or upstream content, follow the project's declared source and update procedure. Classify external and vendored documents by the same criteria. Every reference row names the evidence questions it answers. Every exclusion or unresolved row cites its explicit rule or decision.

Before checking claims, record the current revision and working-tree status through the project's version control when available. Record when no revision baseline exists. Separate readable documents with a clear baseline from documents whose working-tree changes obscure the intended state. Identify evidence that exists only in the current working tree. Leave the working tree unchanged while establishing the baseline.

Complete this step when every candidate has one DocumentCoverage row and source-backed classification. Maintained rows have auditability and an edit route. Reference rows name their evidence questions. Excluded and unresolved rows name their rule or reason. Limited candidates record the evidence limitation.

## 2. Inventory and verify every claim

Read each maintained document and its governing instructions. Index every section or cohesive block with its line range. Record the claims in each block. For a block with none, record `no checkable claims`.

Give every independently checkable statement a Claim with a document-local ID. Cover current facts, requirements, historical statements, examples, and summaries. Record the kind before using current implementation as evidence.

Trace each claim to the source appropriate for its kind, such as code, specifications, configuration, manifests, real directories, entry points, bindings, or relevant tests. Use the governing specification as authority for requirement claims. Record the exact source and observed fact. Verify paths against the observed source or directory. An existing read-only project check can answer a specific evidence question; record its command and actual result.

Mark each claim `supported`, `contradicted`, or `unverified`. An unverified claim records the attempted check and its evidence boundary. A supported requirement records its governing authority. Use the governing authority for requirement claims and historical evidence for historical claims. A current-behavior claim contradicted by implementation produces a Finding. Keep conflicting authority visible. Mark claims affected by an unclear working-tree baseline unverified.

For each document, record which claims support every applicable check in step 3. Record `not applicable` only with the block index showing that no applicable claim exists.

Complete this step when every claim has an evidence-backed outcome or explicit boundary, and every maintained document has a claim count that reconciles with its ledger.

## 3. Apply every check

Apply each check to its applicable claims in every maintained document.

**Paths, trees, commands, links, and pointers.** Resolve repository-relative links, paths, and anchors from the containing document. Check directory-tree entries against actual files or the code that creates them. For parameterized paths, compare segment order and parameters with the constructors and their callers. A literal existence check cannot verify placeholders. Resolve command examples through real script or task declarations and argument parsers. Run an example only when it is read-only and answers the claim. Check external links when feasible. Network or access failures are unverified, not dead links.

**Implementation coupling.** When a document names members of an enum, registry, group, phase, or configuration set, locate the authoritative definition. Consider the document's purpose and the members' stability. A general process rule that repeats changing internal members is **Implementation coupling**, even when the names currently match. Propose an applicability rule or a reference to that definition. For a user reference, support matrix, public contract, or fixed record format, verify its members against consumers and the authoritative definition.

**Examples and temporary inventories.** Check whether an example still exercises the stated behavior and whether its status, selectors, inputs, or expected results remain current. Trace each concrete value to the current implementation. When a permanent rule lists items currently awaiting one-time work and those items or their states are obsolete, report **Stale example**. Replace a temporary inventory in a standing rule with a lasting selection principle or checklist when the governing contract requires that form.

**Repeated concepts and authority.** Group claims by concept within and across maintained documents. Compare repeated definitions, conditions, exceptions, and process rules. Identify the authoritative location before proposing consolidation. A repeated rule must link to that authority or have an evidence-backed reason to stand alone. Retain summaries that add no obligations, audience-specific detail, and unique qualifications in other locations. Report duplicated rules without an authority as **Redundancy** and conflicting rules as **Contradiction**.

**Environment, dependencies, and plugins.** Check claims about installed or unavailable capabilities against the target project's specifications and manifests. Verify dependency names and installation advice against their declared sources. Installation guides should name the dependencies they install. When governing rules restrict environment-specific assumptions or names in general process documents, report violations as **Environment assumption**. Cite the project's declared exception and its authorization when one applies. Follow the governing rules when proposing capability categories or applicability references. Classify a missing external capability from evidence about its cause.

**Terminology and language variants.** Find conflicting names for one concept, one name used for incompatible concepts, and definitions that diverge from actual usage. Pair maintained documents with their declared or conventional language variants. Compare their claims for obligations, exceptions, procedures, paths, parameters, counts, versions, examples, status, and summary meaning. A change on either side requires an evidence-backed synchronized counterpart before the pair is clean. Equivalent meaning need not be word-for-word translation.

**Unsupported elaboration.** Find unsupported facts, assumptions, invented rationale, performance conclusions, test coverage, and acceptance status. Shrink disproven elaboration to the smallest evidence-backed statement. Preserve historical context and explicit future plans.

Complete this step when every applicable check has supporting claim IDs or a block-backed not-applicable reason. Every contradicted claim or disproven elaboration maps to a Finding. Verify intentional contracts against their consumers or tests. Record any resulting drift as a Finding.

## 4. Resolve authority and classify findings

Use the kind of question to determine authority:

- Explicit user requirements govern requested behavior.
- Current project specifications and binding conventions govern declared constraints.
- Verifiable implementation evidence governs descriptions of current behavior.
- A document's historical context governs statements about past events.

Documentation repair is appropriate when evidence establishes the current fact and the edit only corrects its description or removes genuine redundancy or unsupported elaboration.

Stop resolving a repairable item and ask the user when:

- The implementation may be wrong and the documentation may state the requirement.
- A repair would change functionality, public contracts, acceptance criteria, or an established constraint.
- Cited requirements, specifications, tests, or implementation support incompatible answers.
- A fix requires a non-document change or bypasses the target project's source ownership, generation, or update procedure.

Continue read-only inspection of unrelated items. Exclude unresolved items from the repair plan. Complete this step when every Finding is `repairable`, `needs-user-decision`, or `unverified`, and every repairable action changes documentation only.

## 5. Report

Lead with the scope and this candidate coverage table. Include every candidate, including rows with zero claims:

```text
Path | Classification | Auditability | Edit route | Checked claims | Findings | Unverified
<path> | maintained | checkable | direct | <count> | <count> | <count>
<path> | maintained | limited | <source or update procedure> | <count> | <count> | <count>
<path> | reference | evidence-only | - | - | - | -
<path> | excluded | <reason> | - | - | - | -
<path> | unresolved | <reason> | - | - | - | -
```

For each maintained document, report its ownership pointer, every claim ID and location, its evidence source and outcome, and every check outcome or limitation. A compact table is sufficient. List every unverified claim with its attempted check and evidence boundary. Use auditability `checkable` or `limited` for maintained documents. Use `evidence-only`, `not-audited`, or `unresolved` for the corresponding other classifications, with the reason in that column or the classification. Count a finding on every document whose claim it references, including cross-document findings. Report the distinct-finding total separately from the sum of per-document counts. Reconcile the table counts with the claim ledger and findings. With unverified or unresolved items and no confirmed finding, conclude `No confirmed findings; audit incomplete`. A no-finding conclusion requires the coverage table and claim evidence.

Use one entry per finding:

```text
[Implementation drift | Implementation coupling | Stale example | Environment assumption |
 Contradiction | Terminology | Link | Redundancy | Language drift | Unsupported elaboration] Title
  Location: <document>:<line or section>
  Current: <exact current statement>
  Evidence: <code, configuration, directory, test, command and observed fact, or evidence boundary>
  Proposal: <documentation correction, deletion, consolidation, source reference, or evidence need>
  Disposition: repairable | needs-user-decision | unverified
```

For redundancy or coupling, name the authoritative source and what the document should retain or reference. If no authority exists and the rules agree, a documentation-only proposal may designate one. If their obligations conflict, use needs-user-decision. For unsupported elaboration with verified counterevidence, state whether to delete it or shrink it. Otherwise keep it in the unverified claim list and request the missing evidence. Report needs-user-decision and unverified items explicitly.

Report mode ends here.

## 6. Approve and repair

For Fix, first review the coverage table and exclude unverified or unresolved items from the repair plan. Group proposed edits by file and finding. Show the exact unified diff for every affected file, including language variants and all deletion boundaries. Label every hunk with its finding IDs. Synchronization edits must be in that preview. Identify edits excluded by unresolved questions. Present the preview as text in the reply without creating files.

Request explicit approval and wait. The user may approve any subset of complete finding groups. A language pair or other atomic synchronization stays in one group. Apply exactly the approved diff, preserving unrelated content and existing user changes. Immediately before editing, compare the current baseline with the recorded one when version control provides it. Otherwise compare the target text and evidence directly. If they changed or cannot be compared, stop and present a new diff for approval.

Repair the authoritative source and synchronize intentional summaries and language variants only through the approved hunks. Follow the project's source ownership and generation procedure for derived documents. Include any directly editable source changes in the approved diff. Preserve every unique requirement, constraint, caveat, and evidence pointer during consolidation. If a new semantic conflict appears, stop that item and request a new decision.

Complete this step when every approved edit was applied exactly or remains explicitly unapplied with its reason, and no unapproved file changed.

## 7. Verify and close

Re-read every changed document. Recheck all its claims, not only edited lines. Confirm that approved findings are resolved, paths and links resolve, corresponding language views agree, and no unapproved semantic change occurred.

Run relevant existing project checks and record their actual results. Report changed files, resolved findings, approved omissions, unresolved questions, unverified claims, and verification evidence. When no edits were approved or needed, state that no files changed.

Complete this step when every approved edit has verification evidence or a concrete remaining failure, and every check has an actual result.
