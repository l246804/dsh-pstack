---
name: swarm
description: Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration.
disable-model-invocation: true
---

# Swarm

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

## Start

Open a `todo_write` list with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
4. Pick the worker route. Use `role: "swarm workers"` for every worker: that role is one route, not a panel, so you start each worker yourself with one `pstack_subagent` call each. A role the file does not name inherits the parent route. Never invent a model id. For a model race, give each arm its own configured entry instead of the single `swarm workers` route: pass `role: "arena runners"` with a distinct `roleIndex` per arm, so each arm's route shows up in the result rather than being implied. Two arms on one route are not a race between models, and the result says so. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first.
5. Give each worker its own writable output when it writes: the worker calls `create_worktree({ name })` in its own Session, or you create the checkouts one at a time and pass each absolute `path` as that worker's `cwd`. Two workers in one checkout are not isolated, and the parallel writes will collide on shared files. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Start all N workers in one batch of `pstack_subagent` calls with `agent: "general"` and the step 4 role. A worker is a managed activation, so there is no background flag and nothing polls: each result arrives as a completion notice. Every worker runs locally as a child of this Session; there is no cloud environment, no VM, and no per-arm machine.

When a worker must start from a branch other than the current one, make that branch reachable locally and start the checkout from it: the worker calls `create_worktree({ name, from })` with a local revision, or you create the checkout yourself and pass its absolute `path` as the worker's `cwd`. Creation does not fetch, so a branch that only exists on a remote has to be fetched first; a missing local revision fails instead of silently branching off the current commit.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
