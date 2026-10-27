---
name: reflect
description: Spawn three parallel review subagents over this run's raw event log, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Read this run's raw events

Before fanning out, call `pstack_history` with `scope: "current"` for this run's raw log events, and with `scope: "children"` to list the child sessions this run may review. Read one child by passing its `sessionId`. Any other session is outside this tool: never read the session store directory, decompress a log file, or search `~/.dsh` directly, because those paths and formats are private to the host and globbing them would cross workspace boundaries.

Page the log instead of sampling it: pass the previous page's `nextFromSeq` back as `fromSeq`, and pin `throughSeq` to the first page's value so a later page cannot absorb events that landed after you started. Open steps and turns are expected; an unbalanced tail is not an error.

The result carries raw events, not the model-visible transcript. That is deliberate: this review is about what actually happened.

If the tool answers `denied` or `unavailable`, say which layer failed and report this audit as unfinished. Do not substitute a summary for the log and call the review complete, and do not read an unavailable result as evidence that the run did nothing.

## 2. Start three reviewers in parallel

One message, three `pstack_subagent` calls with `agent: "general"`. Reviewers need the MCP servers the log references, so do not brief them to avoid tool use; they must not write.

Each reviewer and the synthesizer name a role line in `$DSH_HOME/pstack-models.md`. Pass that line as `role`. When the file or the line is missing, omit `role` so the child inherits this run's route, and say so in the reply. There is no per-call model slug: an unknown role fails instead of silently falling back, and `inherit-parent` or `auto` means the same as omitting `role`. Pick each subagent's role per the Subagents section of `poteto-mode`; read its `SKILL.md` at its absolute resource path.

| Lens | Role line | Prompt template |
|---|---|---|
| Judgment | `reflect judgment, divergent, synthesizer` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | `references/tooling-reviewer.md` |
| Divergent | `reflect judgment, divergent, synthesizer` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the paged event log where marked. A reviewer cannot read this run's log on its own: inline the events you paged, or a compact summary when the log is too large, and when you inline a summary instead of the events, say so and treat the full-transcript audit as unfinished. Reviewers return findings in their completion notice. Start from the level the role line names, raise it for hard work and lower it for routine work by passing `reasoningEffort`; a child that cannot call `set_reasoning_effort` keeps the level you gave it.

## 3. Synthesize

One `pstack_subagent` call with `agent: "general"` and `role` from the `reflect judgment, divergent, synthesizer` line, inheriting this run's route when that line is missing. It spot-verifies citations through MCP, so brief it not to write. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See `principle-encode-lessons-in-structure`; read its `SKILL.md` at its absolute resource path.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): follow the `authoring-a-skill` playbook, which carries the frontmatter, link, and structure checks.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): rewrite its `description` against the frontmatter rules yourself and reload the catalog to confirm it is picked up. There is no description-optimization tool here.
- `new skill via the authoring playbook: <kebab-name>`: create it with the `authoring-a-skill` playbook and run the checks it names. Do not invent the shape ad hoc.

Run the checks the `authoring-a-skill` playbook names on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
