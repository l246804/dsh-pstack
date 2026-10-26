---
name: recall
description: Reconstruct your recent working context from your own chat history, live state, and the shared record (user reports, prior fixes, incidents), then hand back a tight current-state brief. Use for 'recall my work on X', 'catch me up', 'what have I been working on', 'where did I leave off', before starting or resuming work.
disable-model-invocation: true
---

# Recall

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

**Before you start or resume work, you rebuild the user's recent working context and hand back a tight capsule of where things stand now and what to do next.**

Keep it tight and on-topic. Read only what the in-scope threads need, then stop.

Your context lives in two records. Your own chat history holds what you did and decided. The shared record holds everything that happened around the same code under other names: the symptoms users keep reporting, the fixes that shipped and got reverted, the errors still firing in prod. That second record is what `why` searches, across source control, the issue tracker, chat and issue channels, long-form docs, and error tracking; read that skill's `SKILL.md` at its absolute resource path. A feature with a long bug tail keeps most of its story there, so don't reconstruct it from your own sessions alone.

Prior sessions are read through `pstack_history`, which returns raw log events for the calling session and, when named, one of its reviewable direct children, all inside the caller's workspace. The official `session_search` tool can accelerate finding a topic across this workspace's other sessions, and `session_event_read` opens the region around a hit; neither replaces the log of the session you are auditing, and neither stands in for `pstack_history` when you need complete events. Never read the session store directory, decompress a log file, or search `~/.dsh` directly: those paths and formats are private to the host.

1. Classify, then route. One specific prior chat to resume is the `session-pickup` playbook, not this. Turning habits into a durable skill is `automate-me`. A human-readable summary of your work is a different task. Recall loads working context across recent chats before you act. If the user already gave you a full state capsule (paths, branch, the change), use it and skip the mining.
2. Lock the scope before searching. Pin the window ("recent" is a real range, default the last 7 days), the topic if named, and the workspace (default the active one. Never read another project's sessions without being asked). State the scope back. Never quietly turn "all" into "recent N".
3. Fan out across your chat history. Start parallel children with `pstack_subagent`, each taking a slice of the window, and give each one a role that is actually configured in `$DSH_HOME/pstack-models.md`; when no cheaper route is configured, let the child inherit this run's route and say so instead of claiming a fast model. Tell every subagent to order candidates by real activity time (the `time` field of the events it reads, never the session id), scan the topic first and then read only the matching sessions and only their relevant regions, and skip the current session plus obvious noise (subagent, eval, and test sessions). Each returns the same schema, one block per session: topic, the user's goal, decisions, open threads, struggles and corrections, and artifacts (PRs, tickets, branches), each citing the session id. For one or two sessions, skip the fan-out and read directly. The raw events stay with the subagents. The main thread gets only their findings. Pick each subagent's role per the Subagents section of `poteto-mode`; read its `SKILL.md` at its absolute resource path. Start from the level the role line names, raise it for hard work and lower it for routine work by passing `reasoningEffort`; a child that cannot call `set_reasoning_effort` keeps the level you gave it.
4. Sweep the shared record whenever the topic names a feature, file, subsystem, area, or bug. This is the default, not a judgment call, and "my work on X" does not exempt it. Hand it to the `why` skill's source investigators, but steer their question from "why was this built this way" to "what's the current state, what's been tried and didn't hold, and what are users still reporting". Reuse its per-source playbooks, run the investigators in parallel with the chat-history mining, and inherit its posture: one investigator per source, null results are findings, skip an unavailable MCP and say so. Fold what comes back into the brief. Skip this step only for pure activity recall with no named target ("what did I do this week"), where your own history and live state are the entire answer.
5. Verify against live state. Take the PRs, branches, and tickets that the mining and the sweep surfaced and check them with `git` and `gh`. When the answer hinges on what an agent actually did (the tools it ran, files it read, errors it hit), read the full event log through `pstack_history`, paging with `fromSeq` and `nextFromSeq` when it is long, not just a summary. A summary can support a recap; it cannot support a claim about which files or tools were touched, and a `denied` or `unavailable` result means that claim stays unproven.
6. Write the brief to the contract below. Group by thread. Stay on the named topic.

## Output contract

Lead with the capsule, then the thread status, then the problems, then the next move. Deeper detail goes below or gets cut.

- **Capsule.** At most 5 bullets. What this work is and where it stands overall.
- **Threads.** One line each, prefixed with exactly one status tag: `[merged #N]`, `[open PR #N]`, `[in flight <branch>]`, `[verified, uncommitted]`, `[reverted #N]`, or `[planned, not started]`. A thread with no tag is not done yet, so tag it.
- **Problems.** At most 5, the recurring ones. Include the symptoms users keep reporting and any fix that shipped and was reverted, so the next attempt starts where the last one failed.
- **Next move.** The single most useful next action, concrete.

An adjacent feature or ticket stays out unless it blocks this one. When the capsule and thread lines outgrow a screen, cut detail before you cut threads. Write the brief through `unslop`; read its `SKILL.md` at its absolute resource path, and cite chat findings by session id and shared-record findings by their source (PR #, ticket ID, chat permalink, error-tracker issue), and sanitize private context before any public output.

**Reply:** the brief, to the contract above.
