---
name: docs-drift
description: Audit living project documentation for drift, redundancy, and unsupported claims; repair approved findings.
disable-model-invocation: true
---

# Check project documentation drift

Audit living project documents against current evidence. Stop after a read-only report, or apply approved documentation repairs. Never change implementation, scenarios, generated results, vendored content, or upstream content.

## Choose the mode

- **Report:** `/docs-drift` or `/docs-drift report`. Do steps 1–5 without writing files.
- **Fix:** `/docs-drift fix`. Do the same inspection, then steps 6–7. Invoking Fix is not write approval.

Accept optional paths or globs to add to or narrow the candidate set, plus optional exclusions. Ask when the requested mode or scope is ambiguous.

Use these working records throughout the audit:

- **DocumentCoverage:** path, classification, auditability, checked claim count, finding count, and unverified count. Checked includes both evidence-backed and attempted but unverified claims. The latter stay separate.
- **Claim:** stable ID, document location, one independently checkable statement, kind, evidence, and outcome. A sentence with several independent facts has several claims. Navigation and transitions need no claim.
- **Finding:** one or more claim IDs, exact current text, evidence, proposed documentation edit, and disposition.

Count only claims actually traced to evidence or given a specific evidence boundary. Do not count planned checks or unexamined text.

## 1. Discover the maintained documents

Start with the root agent documents and root README files that exist, including linked language variants. Record absent entry points without creating replacements.

Read project maintenance rules and follow pointers designating documents that agents must read, update, or keep synchronized. Use the project's real document names and locations. Conventional architecture, glossary, or decision-document paths are leads, not requirements. Ordinary links may supply evidence or receive link checks without recursively adding their targets to the full scan.

Apply explicit paths, globs, narrowing, and exclusions to the candidate set. A whole-repository request broadens discovery without making every stored document maintained. Read the nested agent instructions governing each candidate.

Classify every candidate from project pointers, governing instructions, ownership, and update conventions:

- **maintained:** owned by this project and updated as its implementation or workflows evolve. Apply every check.
- **reference:** documentation of a dependency, host product, library, or other external system, even when stored in the repository. Use it as evidence without auditing its own drift.
- **excluded:** outside the requested scope or excluded by an explicit rule.
- **unresolved:** maintenance ownership is unclear. Ask before including it and continue unrelated candidates.

Do not infer ownership from paths, directory names, file types, or subjects. A project pointer that requires maintenance makes its target maintained unless generated, vendored, or upstream ownership requires an editable-source redirect. Record that source. Every reference row names the evidence questions it answers. Every exclusion or unresolved row cites its explicit rule or decision. Generated, vendored, and upstream content stays outside the editable set.

Before checking claims, run read-only Git status for the candidates and their evidence sources. Separate clean documents from documents whose uncommitted changes obscure the intended state. Also identify evidence observed only in uncommitted implementation. Never stash, reset, or overwrite changes to obtain a baseline.

Complete this step when every candidate has one DocumentCoverage row, source-backed classification, and auditability of `checkable`, `limited`, or `unresolved`, with the reason for any limitation.

## 2. Inventory and verify every claim

Read each maintained document and its governing instructions. First index every section or cohesive block, including its line range. Record the claims found in each block, or why that block has no checkable claim. This prevents a sampled paragraph from standing in for an unread section.

Give every independently checkable statement a Claim with a document-local ID. Cover current facts, requirements, historical statements, examples, and summaries. Record the kind before using current implementation as evidence.

Trace each claim to current code, configuration, manifests, real directories, entry points, bindings, or relevant tests. Record the exact source and observed fact. Documentation paths are leads, not evidence. An existing read-only project check can answer a specific evidence question; record its command and actual result.

Mark each claim `supported`, `contradicted`, `unsupported`, or `unverified`. Use `unsupported` only for asserted facts without a source, not for a check you could not complete. An unverified claim must record the attempted check and its observed failure or evidence boundary. Requirements and historical statements need authority or historical evidence, not an implementation match. A current-behavior claim contradicted by implementation always produces a Finding. Only a cited requirement, specification, test, or user requirement can change its disposition to needs-user-decision. Keep conflicting authority visible. A failed inspection is an audit limitation, not proof of either drift or cleanliness. Existing uncommitted changes that obscure the intended state make affected claims unverified, while unrelated claims remain checkable.

For each document, record which claims support every applicable check in step 3. Record `not applicable` only with the block index showing that no applicable claim exists. Do not sample a few paths or examples and treat them as the whole document. `limited` still requires the same claim inventory and check coverage as `checkable`.

Complete this step when every claim has an evidence-backed outcome or explicit boundary, and every maintained document has a claim count that reconciles with its ledger.

## 3. Apply every check

Apply each check to its applicable claims in every maintained document. A name match alone does not prove that a rule is decoupled or correct.

**Paths, trees, commands, links, and pointers.** Resolve repository-relative links, paths, and anchors from the containing document. Check directory-tree entries against actual files or the code that creates them. For parameterized paths, compare segment order and parameters with the constructors and their callers. A literal existence check cannot verify placeholders. Resolve command examples through real script or task declarations and argument parsers. Run an example only when it is read-only and answers the claim. Check external links when feasible. Network or access failures are unverified, not dead links.

**Implementation coupling.** When a document names members of an enum, registry, group, phase, or configuration set, locate the code or configuration source of truth. If a general process rule copies changing members, report **Implementation coupling** even when the names currently match. Propose a behavior rule, applicability predicate, or link to that source. Do not request a synchronized rename or another copied list. Preserve intentional public contracts and fixed formats when consumers depend on them; verify those contracts instead of generalizing them.

**Examples and temporary inventories.** Check whether an example still exercises the stated behavior and whether its status, selectors, inputs, or expected results remain current. Trace each concrete value to the current implementation. Usefulness does not exempt an example from verification. When a permanent rule lists items currently awaiting one-time work, report **Stale example** or **Implementation coupling** as applicable. Replace a temporary inventory in a standing rule with a lasting selection principle or checklist, not with a new inventory of current names.

**Repeated concepts and authority.** Group claims by concept within and across maintained documents. Compare repeated definitions, conditions, exceptions, and process rules. Identify the authoritative location before proposing consolidation. A repeated rule must link to that authority or have an evidence-backed reason to stand alone. Retain summaries that add no obligations, audience-specific detail, and unique qualifications in other locations. Report duplicated rules without an authority as **Redundancy** and conflicting rules as **Contradiction**.

**Environment, dependencies, and plugins.** Inspect assumptions that a user environment has or lacks an optional capability. Report concrete package, plugin, binary, or service names and installation or dependency-remediation advice in a general process rule as **Environment assumption**. Use capability categories and applicability metadata instead. Apply an exception only when scenario metadata explicitly declares an environment matrix and a corresponding approval exists. Cite both as evidence. Such metadata and approval can record the authorized package name or ID. Do not classify a missing external capability as an adaptation gap, or propose installation in a general adapter document or ordinary runtime review. Do not convert this check into a name blacklist.

**Terminology and language variants.** Find conflicting names for one concept, one name used for incompatible concepts, and definitions that diverge from actual usage. Use project pointers and naming conventions to pair language variants. A declared or conventionally named language variant must be paired. Pair their claims and compare obligations, exceptions, procedures, paths, parameters, counts, versions, examples, status, and summary meaning. A change on either side requires an evidence-backed synchronized counterpart before the pair is clean. Equivalent meaning need not be word-for-word translation.

**Unsupported elaboration.** Find unsupported facts, assumptions, invented rationale, performance conclusions, test coverage, and acceptance status. Shrink disproven elaboration to the smallest evidence-backed statement. Insufficient evidence alone makes a claim unverified, not a deletion candidate. Preserve historical context and explicit future plans.

Complete this step when every applicable check has supporting claim IDs or a block-backed not-applicable reason. Every contradicted or unsupported statement maps to a Finding. An intentional contract needs a named consumer or test as evidence and a Finding with its disposition, rather than a silent exemption.

## 4. Resolve authority and classify findings

Use the kind of question to determine authority:

- Explicit user requirements govern requested behavior.
- Current project specifications and binding conventions govern declared constraints.
- Verifiable implementation evidence governs descriptions of current behavior.
- A document's historical context governs statements about past events.

Documentation repair is appropriate when evidence establishes the current fact and the edit only corrects its description or removes genuine redundancy or unsupported elaboration.

Stop resolving an item and ask the user when:

- The implementation may be wrong and the documentation may state the requirement.
- A repair would change functionality, public contracts, acceptance criteria, or an established constraint.
- Requirements, specifications, tests, and implementation support incompatible answers.
- Evidence is insufficient or conflicting.
- A fix requires changing implementation, scenarios, generated output, vendored content, upstream content, or a protected source.
- Existing uncommitted changes make the intended state or repair boundary unclear.

Continue read-only inspection of unrelated items. Exclude unresolved items from the repair plan. Complete this step when every Finding is `repairable`, `needs-user-decision`, or `unverified`, and every repairable action changes documentation only.

## 5. Report

Lead with the scope and this candidate coverage table. Include every candidate, including rows with zero claims:

```text
Path | Classification | Auditability | Checked claims | Findings | Unverified
<path> | maintained | checkable | <count> | <count> | <count>
<path> | reference | evidence-only | - | - | -
<path> | excluded | <reason> | - | - | -
<path> | unresolved | <reason> | - | - | -
```

For each maintained document, report its ownership pointer, every claim ID and location, its evidence source and outcome, and every check outcome or limitation. A compact table is sufficient. List every unverified claim with its attempted check and evidence boundary. Reconcile the table counts with the claim ledger and findings. `No confirmed findings` is an incomplete result, not a clean result, while unverified or unresolved items remain.

Use one entry per finding:

```text
[Implementation drift | Implementation coupling | Stale example | Environment assumption |
 Contradiction | Terminology | Link | Redundancy | Language drift | Unsupported elaboration] Title
  Location: <document>:<line or section>
  Current: <exact current statement>
  Evidence: <code, configuration, directory, test, command and observed fact, or evidence boundary>
  Proposal: <documentation-only correction, deletion, consolidation, or source reference>
  Disposition: repairable | needs-user-decision | unverified
```

For redundancy or coupling, name the authoritative source and what the document should retain or reference. For unsupported elaboration, state whether to delete it or shrink it. Do not hide needs-user-decision or unverified items inside a clean conclusion. With unresolved claims and no confirmed finding, say `No confirmed findings; audit incomplete` rather than `No drift`.

Report mode ends here without writing files or creating a report artifact. A no-finding conclusion is incomplete without the coverage table and per-document evidence summary.

## 6. Approve and repair

For Fix, group proposed edits by file and finding. Show the exact unified diff for every affected file, including language variants and all deletion boundaries. Label every hunk with its finding IDs. Synchronization edits must be in that preview. Identify edits excluded by unresolved questions. Do not create or modify files to produce the preview.

Request explicit approval and wait. The user may approve any subset of the labeled hunks. Apply exactly the approved diff, preserving unrelated content and existing user changes. Reconfirm that the target text and evidence have not changed immediately before editing. If they changed, stop and present a new diff for approval.

Repair the authoritative source and synchronize intentional summaries and language variants only through the approved hunks. Use the project's generation procedure for generated results, without hand-editing them. Preserve every unique requirement, constraint, caveat, and evidence pointer during consolidation. If a new semantic conflict appears, stop that item and request a new decision.

Complete this step when every approved edit was applied exactly or remains explicitly unapplied with its reason, and no unapproved file changed.

## 7. Verify and close

Re-read every changed document. Recheck all its claims, not only edited lines. Confirm that approved findings are resolved, paths and links resolve, corresponding language views agree, and no unapproved semantic change occurred.

Run relevant existing project checks and record their actual results. Report changed files, resolved findings, approved omissions, unresolved questions, unverified claims, and verification evidence. When no edits were approved or needed, state that no files changed.

Complete this step when every approved edit has verification evidence or a concrete remaining failure, and every check has an actual result.
