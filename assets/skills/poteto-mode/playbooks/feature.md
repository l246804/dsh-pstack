### Feature

**You own the design. Plan, review, verify.** Delegate implementation. Stay in the lead.

1. Read the `how` skill's `SKILL.md` at its absolute resource path and run it over the affected subsystem.
2. Read the `architect` skill's `SKILL.md` at its absolute resource path and run it for parallel design exploration.
3. Write the throughput checkpoint as four `todo_write` items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target, as `principle-separate-before-serializing-shared-state` requires; read its `SKILL.md` at its absolute resource path. Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Delegate code-writing to a `pstack_subagent` child with `agent: "poteto-agent"` and `role: "feature, refactoring"`, and a specific scope: file paths, the named data shape and its organizing structure as `principle-model-the-domain` requires (read that `SKILL.md` at its absolute resource path), a state machine over scattered booleans, a table or registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, plus success criteria. Read the Subagents section of the `poteto-mode` skill at its absolute resource path before the spawn. When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), read the `arena` skill's `SKILL.md` at its absolute resource path and delegate through it, so the runners surface the alternatives and the cross-judge guards the pick. Mandatory: no skip-with-reason escape, and `principle-laziness-protocol` does not override it (the gain is review separation, not lines saved). A child that cannot spawn satisfies this by owning the diff directly with the same review separation. No "standing by" reply that waits on a nested agent. Comments per **Comments**. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
6. Rebase into small, ordered commits. Stack follow-ups.
   Apply `principle-sequence-verifiable-units`, read at its absolute resource path, building, verifying, and committing each small unit before the next.
7. If the design is contested, read the `interrogate` skill's `SKILL.md` at its absolute resource path and run it before shipping.
8. Read `playbooks/opening-a-pr.md` next to this file and run it.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. That owner fans out internally after the blocking phase. Parent-level fan-out is for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries. Spawn a fresh owner rather than chaining interrupts.

**Reply:** what you built, what you chose and why, the throughput checkpoint, open decisions. Tables for design alternatives.
