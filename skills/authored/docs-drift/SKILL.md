---
name: docs-drift
description: Audit living project documentation when requested directly or as part of a broader review; check accuracy, document responsibilities, redundancy, and actionable instructions, and repair authorized findings.
---

# Check project documentation drift

Audit living project documents against current evidence, then stop after a read-only report or apply approved documentation repairs. Keep implementation changes outside this skill.

## Choose the mode

- **Report:** `/docs-drift` or `/docs-drift report`. Do steps 1–5 without writing files.
- **Fix:** `/docs-drift fix`. Do the same inspection, then steps 6–7. Fix authorizes evidence-backed documentation repairs within the requested scope.

Accept optional paths or globs to add to or narrow the candidate set, plus optional exclusions. Ask when the requested mode or scope is ambiguous.

When called by another review, use its documentation scope and choose Fix only when the user has authorized documentation repairs; otherwise use Report. Return findings and verification evidence to that review.

## 1. Discover the maintained documents

Start with the root agent documents and root README files that actually exist, including linked language variants. Record absent entry points without creating replacements.

Read project maintenance rules and follow pointers designating documents that agents must read, update, or keep synchronized. Use the project's real document names and locations; conventional architecture, glossary, or decision-document paths are leads, not requirements. Ordinary links may supply evidence or receive link checks without recursively adding their targets to the full scan.

Apply explicit paths, globs, narrowing, and exclusions to the candidate set. A whole-repository request broadens candidate discovery without making every stored document a maintained project document. Read the nested agent instructions governing each candidate.

Classify every candidate using project pointers, governing instructions, and ownership and update conventions:

- **Maintained:** owned by this project and updated as its implementation or workflows evolve. Apply every check below.
- **Reference-only:** documentation of a dependency, host product, library, or other external system, even when stored inside the repository. Use it as evidence without auditing its own drift.
- **Excluded:** outside the requested scope or otherwise excluded by an explicit rule.
- **Unresolved:** maintenance ownership is unclear. Ask before including it and continue classifying unrelated candidates.

Determine ownership from evidence rather than paths, directory names, file types, or subjects. A project's own component documents may be maintained; bundled component-library documents may be reference-only. Include governing instruction files in the maintained set only under the same ownership rules.

Keep generated, vendored, and upstream content outside the editable set. Record the authoritative source or upstream destination and any project generation procedure for their findings. Record missing pointer targets and links used only as evidence. Complete this step when every candidate has a classification or unresolved question and the maintained, reference-only, excluded, and editable boundaries have source-backed evidence.

## 2. Build the evidence inventory

Read every maintained document and the instructions governing it. Inventory its checkable claims about current modules, responsibilities, paths, entry points, commands, tools, configuration, dependencies, interfaces, behavior, counts, and status.

Trace those claims through current call chains, types, configuration, manifests, real directories, relevant tests, and actual artifacts. Treat paths mentioned by documentation as leads, not proof. For prescriptive guidance, identify a current caller, reachable trigger, or confirmed requirement; hypothetical risks alone do not justify adding instructions. Use existing read-only project checks when they answer a specific evidence question.

Distinguish current facts, intended requirements, and historical statements. Current implementation establishes what exists, not whether that behavior is correct. Mark a claim unverified when the repository cannot supply sufficient evidence.

Complete this step when every checkable claim in every maintained document has a source-backed disposition or an explicit evidence limitation.

## 3. Apply every check

Each check names the finding kind it reports. Apply every check to every maintained document, and give each potential finding the kind of the check that produced it. A finding with no kind is an unapplied check.

For agent-facing documents, use `writing-for-agents` to review context pointers and instruction structure.

**Implementation drift.** Find stale statements or statements contradicted by current evidence about architecture, behavior, paths, commands, interfaces, configuration, dependencies, counts, and status. Report it as `Implementation drift`.

**Contradictions.** Find incompatible statements within one document or across documents. Distinguish contradictions from intentionally different levels of detail. Report it as `Contradiction`.

**Terminology and language variants.** Find one concept with conflicting names, one name denoting incompatible concepts, and definitions that diverge from actual usage. Check intentional language variants for corresponding meaning. Report a conflicting name or definition as `Terminology`, and a language pair whose meaning diverges as `Language drift`.

**Links and pointers.** Resolve repository-relative links, referenced paths, and anchors from their containing document. Check external links when feasible; classify network or access failures as unverified rather than dead. Report an unresolved link, path, or anchor as `Link`.

**Document responsibilities.** Check content against the document's scope. Directory guidance owns local responsibilities and operating rules; cross-directory content uses pointers with clear triggers, and cross-module relationships belong in project architecture. Report misplaced guidance as `Document scope`, naming its proper location.

**Redundancy.** Find semantic duplication, scattered rules, repeated guardrails, and obsolete passages. Before proposing consolidation, identify an authoritative location. Preserve intentional summaries, audience-specific views, language variants, and unique qualifications. Report it as `Redundancy`.

**Implementation coupling.** Find guidance that mirrors changing headings, fields, defaults, file inventories, or script lists when a reference to the source or configuration would suffice. Retain stable contracts and rationale that code cannot explain. Before flagging a mirrored structure, establish whether a skill owns it as a discovery, parsing, generation, or record-format contract, or whether consumers rely on its template or fixed pointer location; validate such contracts against their consumers. Report unnecessary mirroring as `Implementation coupling`.

**Actionability.** Walk each instruction through its intended trigger and prerequisites. Check that pointers select the right branch and steps have observable completion conditions. Find ineffective instructions or extra procedural layers that obstruct the stated task. Report the concrete failure or ambiguity as `Actionability`.

**Unsupported elaboration.** Find unsupported facts, assumptions, or invented elaboration accumulated during iteration. Examples include fabricated module responsibilities, command behavior, configuration defaults, design rationale, compatibility, performance conclusions, test coverage, and acceptance status. Shrink disproven or unsupported elaboration to the smallest evidence-backed statement. Insufficient evidence alone makes a claim unverified, not a deletion candidate. Preserve the context of historical statements and explicit future plans. Report it as `Unsupported elaboration`.

Report style, formatting, or completeness preferences only when they substantiate one of these findings. Complete this step when every check has been applied to every maintained document and every potential finding has a location, observed statement, supporting evidence or evidence boundary, a finding kind, and a proposed action.

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
- A fix requires changing implementation, generated output, vendored content, upstream content, or a protected source.
- Existing uncommitted changes make the intended state unclear.

Continue read-only inspection of unrelated items, but exclude unresolved items from the repair plan. Complete this step when every potential finding is classified as repairable, needs-user-decision, or unverified, and every repairable action is documentation-only.

## 5. Report

Summarize scope, ownership, exclusions, and verified documents in groups; expand findings and evidence limitations individually. Keep unresolved questions and unverified claims visible rather than counting them as clean.

Use one entry per finding:

```text
[Implementation drift | Contradiction | Terminology | Language drift | Link | Document scope | Redundancy | Implementation coupling | Actionability | Unsupported elaboration] Title
  Location: <document>:<line or section>
  Current: <statement, duplicated or coupled material, or unsupported elaboration>
  Evidence: <source and observed fact, or the evidence boundary>
  Proposal: <documentation-only correction, deletion, or consolidation>
  Disposition: repairable | needs-user-decision | unverified
```

For redundancy, name the proposed authoritative location and what each other location will retain, merge, or link to. For implementation coupling, name the authoritative structure the copy should defer to. For unsupported elaboration, state whether to delete it or shrink it to an evidence-backed statement. When nothing needs attention, say so and list any remaining unverified items.

Report mode ends here without writing files or creating a report artifact. Complete this step when every maintained document and potential finding has a reported outcome, and every candidate has a reported classification or unresolved question.

## 6. Approve and repair

For Fix, group the exact proposed edits by file and finding. Show exact replacement text or deletion boundaries for substantive rewrites, deletions, and consolidations, including all affected language variants. Identify edits excluded by unresolved questions.

Proceed when the user has authorized these repairs. If write authorization is missing, request approval for the concrete edit set and wait; the user may approve any subset. Preserve unrelated content and existing user changes.

Repair the authoritative source and synchronize intentional summaries and language variants where the evidence supports doing so. Use the project's generation procedure for generated results. Preserve every unique requirement, constraint, caveat, and evidence pointer during consolidation. If a new semantic conflict appears, stop that item and request a new decision rather than expanding the approved edit.

In living documentation, replace or delete obsolete implementation descriptions. Migration and compatibility guidance should cover currently supported behavior and actions users still need. Preserve the context of historical records.

Complete this step when every approved item has been applied exactly or remains explicitly unapplied with its reason, and no unapproved file changed.

## 7. Verify and close

Re-read every changed document. Confirm that approved findings are resolved, links resolve, corresponding language views agree, consolidated content remains traceable, and no unapproved semantic change occurred.

Run relevant existing project checks and record their actual results. Report changed files, resolved findings, approved omissions, unresolved questions, unverified claims, and verification evidence. When no edits were approved or needed, state that no files changed.

Complete this step when every approved edit has verification evidence or a concrete remaining failure, and every check has an actual result.
