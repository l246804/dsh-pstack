---
name: figure-it-out
description: "Design an auditable playbook when no narrower one fits: a large migration, an ambitious multi-part change, or work a human reviews after stepping away. Scales rigor to the task, runs a hypothesis loop, and logs decisions. Use for /figure-it-out or 'figure it out'."
disable-model-invocation: true
---

# Figure it out

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

When the task matches no playbook, design one. The deliverable before any code is the workflow itself: a sequence of phases that scales rigor to the task, runs the scientific method, and leaves a decision trail a human can audit after stepping away.

## Start

Open a `todo_write` list whose first item is to read the Principles section of the `poteto-mode` skill, at its absolute resource path. Then add the phases below as items.

## Phase A: Frame

Ground first, then commit. Don't start the run until you can state:

- The definition of done as a falsifiable predicate, as `principle-prove-it-works` requires; read its `SKILL.md` at its absolute resource path.
- Scope, quantified: rough units and effort, plus the blockers grounding surfaced.
- The rigor level, biased high. One-way doors and high blast radius get more. Reversible low-stakes steps get less. Rigor is gates and artifacts, not "try harder".

Present the framing and tradeoffs before committing to a long run. Reversible work proceeds, as `principle-never-block-on-the-human` requires; read its `SKILL.md` at its absolute resource path. A multi-hour run earns one checkpoint, asked through `ask_user_question`.

## Phase B: Design the workflow

Decompose into atomic, independently-landable units. Sequence riskiest-unknown-first. Scaffold and verification come before features, as `principle-foundational-thinking` requires; read its `SKILL.md` at its absolute resource path.

- Build the verification harness before the work, with the baseline captured from the pre-change state, so the check reads as "old value vs new value".
- For one-way-door design decisions, read the `architect` skill's `SKILL.md` at its absolute resource path and run it; it runs `arena` in turn. Skip it for mechanical work whose shape is already concrete. A second arena over a settled design is over-engineering, per `principle-laziness-protocol`.
- Decide what fans out. Parallelize only across seams, and give each worker its own checkout: the worker calls `create_worktree` in its own Session, or you create the checkouts one at a time and pass each absolute `path` as that worker's `cwd`. Read `principle-separate-before-serializing-shared-state` at its absolute resource path. Don't over-fan. Read the Subagents section of the `poteto-mode` skill at its absolute resource path before you spawn anyone.
- Write the designed phase list down. That list is what the human reviews.

Then execute the design. Add its steps to the `todo_write` list as concrete items between the Phase C and Phase D entries. Run each under the Phase C loop discipline, and weave the Phase D log through them, a row as each step lands, rather than saving the whole trail for the end.

## Phase C: Run the loop

Each unit is an experiment. State the hypothesis, make the smallest change, measure against the predicate on the real artifact, keep it if it advanced, revert it if it didn't. Read `principle-sequence-verifiable-units` at its absolute resource path and verify each unit before starting the next instead of batching checks at the end.

- Verify by inspecting the artifact, never a self-report. When something passes too easily, suspect the observation method before the system.
- Pair delegated work with a judge: a second `pstack_subagent` child that reads the same artifact and the same predicate, never the worker's own report. If a worker games the gate, reset and harden the contract. If the gate itself is wrong, fix the gate in its own change rather than routing around it.
- A verdict is VERIFIED, NOT VERIFIED, or INCONCLUSIVE. Inconclusive is not a pass. Don't hide a negative.

## Phase D: Keep the audit trail

Log the run as the `show-me-your-work` skill prescribes; read its `SKILL.md` at its absolute resource path. Its session-audit step needs the restricted history tool, which this package does not ship yet, so keep the decision trail inside the repository and report that part of the audit as unverified. figure-it-out's work is usually ambitious enough to commit the trail so the reviewer can read it in the PR. The trail plus the diff is what lets the human come back and trust the work.

## Phase E: Verify and hand back

Check the whole against the Phase A predicate on the real product, not just the harness. Encode any recurring correction as a gate, a lint rule, a check, or a script, as `principle-encode-lessons-in-structure` requires; read its `SKILL.md` at its absolute resource path.

**Reply:** the playbook you designed, the rigor level and why, the decision-trail path, what's verified against the predicate, and what's still open.
