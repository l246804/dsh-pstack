### Runtime forensics

**You own the diagnosis. Instrument the live process, don't theorize from source.** The deliverable is a cited diagnosis, not a fix.

1. Capture the live signal on the matching surface: a CPU profile for a spinning process, a heap snapshot for a leak, a CDP trace for a visual glitch. A real artifact, not a guess, and only through an interface this Session actually has; when no live CPU, heap, or CDP interface is reachable, report that gap instead of reasoning from source and calling it forensics.
2. Reduce the artifact to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a GC root, the loop firing without input. Parse large artifacts in a `pstack_subagent` child with `agent: "general"` and a brief that forbids writes, as `principle-guard-the-context-window` requires; read that skill's `SKILL.md` at its absolute resource path. Keep the reduced finding in the main thread. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first.
3. Prove the mechanism before believing it. Inject instrumentation through a live interface the process actually exposes, such as CDP eval on a running browser target, or hotfix the live code without reloading, to confirm the hypothesis cheaply. With no such interface, mark the mechanism as unproven rather than confirmed.
4. Map the finding back to source: file, symbol, the line that allocates or schedules.
5. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only forensics`.

**Reply:** the signal captured, the reduced finding, how you proved the mechanism, the source location, artifact paths. No fix unless asked. Hand back to Bug fix or Perf once the cause is known.
