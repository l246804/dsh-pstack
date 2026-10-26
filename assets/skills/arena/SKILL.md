---
name: arena
description: Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape.
disable-model-invocation: true
---

# Arena

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

Open a `todo_write` list with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners. Use `role: "arena runners"`: that role is a panel, so one `pstack_subagent` call starts one child per entry in the role file and the result lists every child id with the route it actually got. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first. An entry the file does not name inherits the parent route. An entry whose route does not resolve fails that seat and names the role file; the remaining seats still start and the result records the degradation. Two entries on the same route give you two attempts from one model, not a cross-model arena, and the result says so. Add entries when the arena covers multiple design directions, and repeat one route when the work is generation-bound rather than judgment-sensitive. Start from the level the role line names, raise it for hard work and lower it for routine work by passing `reasoningEffort`; a child that cannot call `set_reasoning_effort` keeps the level you gave it.
4. Give each candidate its own output location. The child calls `create_worktree({ name })` in its own Session and writes there, or you create the checkouts one at a time first and pass each absolute `path` as that child's `cwd`; `create_worktree` returns the path, branch, pinned commit, and repository root. That isolation covers the working directory and branch only, so ports, credentials, running services, and caches still collide. A scratch directory outside the repository is the fallback when Git isolation is not wanted. This is `principle-separate-before-serializing-shared-state`; read its `SKILL.md` at its absolute resource path.

## Phase B: Fan out

Start all N subagents in one batch of `pstack_subagent` calls, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected. A child is a managed activation, so there is no background flag and nothing polls: each result arrives as a completion notice. A brief that needs a read-only candidate still has to say so, because the tool enforces no such mode.

If a candidate produces no output, proceed with N-1 and note the dropout. To keep a live candidate's local state, such as its checkout, uncommitted edits, or a running process, send it another instruction with `send_message`; that returns an acceptance, not an answer, and the reply still arrives as the child's own completion notice. Otherwise start a fresh child, because a settled child is never silently resumed.

## Phase C: Cross-judge

After all Phase B candidates complete, choose one entry from `role: "arena cross-judge pool"` with `roleIndex`. That role is a list but is not fanned out: one call starts one judge on the entry you picked. Prefer a route whose provider and model family differ from the parent's, and when you cannot confirm a different family, say plainly that the cross-judge is the same model reviewing itself. Start it with a brief that forbids writes and tells it to check `git status` instead of claiming it wrote nothing. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don't start it while candidates are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per `principle-laziness-protocol`; read its `SKILL.md` at its absolute resource path.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, as `principle-redesign-from-first-principles` requires; read its `SKILL.md` at its absolute resource path, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, as `principle-prove-it-works` requires; read its `SKILL.md` at its absolute resource path. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
