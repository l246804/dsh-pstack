### Perf issue

**You own the measurement story. Plan, review, verify the numbers.** Tie every fix to a measurement, don't read source instead of measuring.

1. Capture a baseline trace through the matching project control path. With no real profiler or trace tool in the project, report the measurement as missing instead of substituting a unit test. Vet the baseline, and each later number, with the `benchmark-checklist` skill, read at its absolute resource path.
2. Read the `how` skill's `SKILL.md` at its absolute resource path and use it to ground hypotheses. Don't claim a perf ceiling without running it first.
   Try the performance mantras in order, cheapest first:
   1. Don't do it. Stop work whose result nothing uses rather than cheapening it.
   2. Do it, but don't do it again.
   3. Do it less.
   4. Do it later.
   5. Do it when they're not looking.
   6. Do it concurrently.
   7. Do it cheaper.

   When an earlier mantra meets the target, stop.
3. Plan the fix from the trace. If it crosses a function boundary, read the `architect` skill's `SKILL.md` at its absolute resource path and run it first. Delegate implementation to a `pstack_subagent` child with `agent: "poteto-agent"` and `role: "perf-issue"`. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first. Review the diff. Capture a post-fix trace. Start from the level the role line names, raise it for hard work and lower it for routine work by passing `reasoningEffort`; a child that cannot call `set_reasoning_effort` keeps the level you gave it.
   Apply `principle-sequence-verifiable-units`, read at its absolute resource path, verifying each attempt before trying the next.
4. Parse and compare the artifacts (JSON to sqlite, diff). "Inconclusive" or wrong-surface is not a pass. Flag it.
5. Cite the measurement in the PR.
6. Read `playbooks/opening-a-pr.md` next to this file and run it.

For sustained improvement against a metric rather than a one-off fix, use the Hillclimb playbook (`playbooks/hillclimb.md`), which keeps one hypothesis per iteration and needs a frozen measurement harness before the first change.

**Reply:** baseline number, post-fix number, delta, artifact path.
