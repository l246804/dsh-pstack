---
name: no-comments
description: Spawn Comment Sicko, fix accepted findings, and offer encodings for claimed constraints.
disable-model-invocation: true
---

# No comments

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

Spawn Comment Sicko. Act on accepted findings.

Defer to Comment Sicko's fresh perspective.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the base branch, default `main`, including the working tree.

## Steps

1. Call `pstack_subagent` with `agent: "comment-sicko"` and the scope in the brief. That agent type is the only way to get Comment Sicko's persona, because the Host injects its preamble; a `general` child would lose it, and a missing preamble stops the call instead of degrading. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first. Do not restate its rules. Start from the level the role line names, raise it for hard work and lower it for routine work by passing `reasoningEffort`; a child that cannot call `set_reasoning_effort` keeps the level you gave it.
2. Inspect its report and diff. Reject application-code edits, scope escapes, exception-protected deletions, misstated `MUST KILL` reasons, and flags that treat kept intentional code as guilty. Reshape flags on our-code surprises stay actionable. Do not restore those comments. A keep survives only with proof it is about something we cannot change. Audit missed scoped lint and TypeScript suppressions. Correctness or safety suppressions stay actionable `MUST KILL`s. Restore deletions only with exact exceptions and scoped proof. Before accepting thin `IMPORTANT` or `do not remove` kills or keeps, read the `how` or `why` skill's `SKILL.md` at its absolute resource path and run it on their symbol. If a kill is ambiguous, do not restore. If a keep is refuted or still ambiguous, delete it. Revert and rerun one rejected report with the failure named. Reject a second, report it open, and fail this skill with the reason.
3. Fix trivial accepted flags directly by deleting a dead path, dropping a parameter, or using the real API. If any fix needs a shape, read the `architect` skill's `SKILL.md` at its absolute resource path and run it once for the accepted set and surrounding code. Stop at the sketch. Architect shapes. Step 4 implements.
4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. `principle-fix-root-causes` and `principle-redesign-from-first-principles` guide intent only; read either `SKILL.md` at its absolute resource path. Neither authorizes widening the fence nor fixing instances outside it. Never bolt on symptom guards.
5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint. Ask through `ask_user_question` and wait for the answer. An unattended run and the eval playbook need the caller's approval up front, because nobody can answer. If approved, encode then delete. Otherwise delete, report the constraint open, and sketch out-of-scope work.
6. Report the deletion count, restored comments, reruns, architect sketch, fixes, encoding offers, encodings, unenforced constraints, and other open work.
