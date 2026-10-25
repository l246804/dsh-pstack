---
name: architect
description: Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock in the wrong shape.
disable-model-invocation: true
---

# Architect

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

Sketch types, function signatures, class shapes, and module boundaries with `not implemented` bodies and pseudocode. Synthesize across multiple model perspectives, then fill in code against the chosen sketch.

## Start

Open a `todo_write` list with one entry per phase before starting.

1. Ground
2. Sketch
3. Agree
4. Implement
5. Scrap

## Phase A: Ground the problem

Build a real mental model of every system the new code touches. Read the `how` skill's `SKILL.md` at its absolute resource path and run it over the relevant subsystems. Naming a file isn't grounding. Produce the architectural explanation `how` prescribes. If the design redefines ownership or layering, read the `why` skill's `SKILL.md` at its absolute resource path and run it on the existing shape, so the rationale becomes a constraint, not a guess.

Skip Phase A only when the work is genuinely greenfield with no surrounding system to integrate.

## Phase B: Sketch

Read the `arena` skill's `SKILL.md` at its absolute resource path and run it with the design-sketch task and the Phase A grounding artifacts. Pass `references/runner-prompt.md` as each runner's prompt.

Use `role: "architect runners"` in place of the `arena runners` role. That role is a panel, so one `pstack_subagent` call starts one runner per entry and reports every child id with the route it actually got. A role the file does not name inherits the parent route; an entry whose route does not resolve fails that runner and names the role file, while the remaining entries still start and the result records the degradation. Two entries on the same route are two sketches from one model, not a multi-model sketch, and the result says so. Each runner needs its own checkout: the child calls `create_worktree` in its own Session, or you create the checkouts one at a time and pass each absolute `path` as that child's `cwd`, because two children writing in one parent checkout is not isolation.

Design it twice. Require at least two structurally distinct candidates before synthesis, even when the first looks sufficient. This is `principle-exhaust-the-design-space` made concrete; read its `SKILL.md` at its absolute resource path. Whole-shape alternatives, not point fixes inside one shape.

Screen every candidate against [`references/design-red-flags.md`](references/design-red-flags.md) before synthesis. Assume the next contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Prefer the design where a change that looks right from one file is right for the whole repo.

Compare viable candidates on interface depth. Prefer the design that hides more complexity behind a smaller, simpler public surface. A rich interface can keep call chains short by concentrating capability instead of scattering it across layers.

Arena returns one synthesized design package. Its synthesis decision fills the rationale's "Synthesis decision" section.

## Phase C: Agree (opt-in)

Default: proceed directly to implementation with the synthesized design. No human checkpoint.

Opt in to a checkpoint when the invoker explicitly asks: "/architect with checkpoint," "stop and show me before implementing," or similar. Then surface the synthesized design and pause for sign-off, using `ask_user_question` when there is a real choice. With no answerer, stop and report the design instead of assuming approval.

The synthesis can ship as its own commit either way, as the "scaffold first" mode of `principle-foundational-thinking`. Planned and scoped breakage during fill-in is fine, per `principle-outcome-oriented-execution`. Read either `SKILL.md` at its absolute resource path. For adversarial pressure on the design before implementing, read the `interrogate` skill's `SKILL.md` at its absolute resource path and run it on the synthesized sketch.

If the human pushes back on the shape (in a checkpoint or after the fact), treat that as Phase A evidence. Re-ground and re-run Phase B before writing more code.

## Phase D: Implement against the sketch

Replace `not implemented` bodies with code, pseudocode with logic. The synthesized sketch is the contract. Deviations from it are signal to surface, not friction to absorb silently. If a function needs a parameter the sketch didn't anticipate, ask whether the sketch was wrong, the requirement was missed, or the implementation is overreaching.

## Phase E: Scrap when the architecture is wrong

If implementation keeps producing friction the sketch can't absorb, throw the sketch out. Don't bolt fixes onto a wrong design: read `principle-redesign-from-first-principles` and `principle-fix-root-causes` at their absolute resource paths.

The signal is a *pattern*, not single instances. Tells:

- The same shape of workaround appearing repeatedly across unrelated code.
- Multiple unrelated edge cases that all need special-case branches.
- Types that need escape hatches (`any`, casts, optional fields always set in practice) to compile.
- The "we need a lock" reflex when the sketch said the state wasn't shared.
- Callers having to know the abstraction's internal rules to use it.
- Two or more independent Phase D deviations of the same shape across the implementation.

Use judgment. A few edge cases don't condemn an architecture. Some problems are legitimately complex. Complexity in the data is not complexity in the design.

When you scrap:

1. Read the `how` skill's `SKILL.md` at its absolute resource path and re-run it over what's been built.
2. Redesign as if the new constraints had been day-one assumptions, per redesign-from-first-principles.
3. Subtract before adding, as `principle-subtract-before-you-add` requires; read its `SKILL.md` at its absolute resource path. The new sketch should be smaller than the old one before it grows.
4. Return to Phase B and re-run arena.

## Outputs

The caller's usage is written first and the type sketch derived from it. One file with new types and signatures for small changes. Module map plus type definitions for larger work. The rationale ships alongside, shaped per `references/rationale-template.md`, including the usage sketch and the synthesis decision.
