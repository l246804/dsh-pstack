---
name: reflect
description: "Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect."
disable-model-invocation: true
---

> DSH port of pstack. `pstack_subagent` replaces Cursor's `Task` tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Locate the active transcript

Before fanning out, find this conversation's session log. DSH keeps logs under `$DSH_HOME/sessions/<workspace-slug>/<session-id>/`. The system prompt names the active workspace and session id. Do not scan other workspace directories.

```bash
ls -t "$DSH_HOME"/sessions/*/*/session.v*.jsonl* 2>/dev/null | head -10
```

For each candidate, read the first JSONL line. Take the file whose opening user message matches this conversation's opening prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

One message, three `pstack_subagent` calls with `agent: "general"`. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references.

Each reviewer and the synthesizer pass a `role` to `pstack_subagent`: `reflect judgment, divergent, synthesizer` for the judgment and divergent reviewers and the synthesizer, `reflect tooling` for the tooling reviewer. The tool resolves routes from `~/.dsh/pstack-models.md`; a missing line inherits the parent model.

| Lens | Role | Prompt template |
|---|---|---|
| Judgment | `reflect judgment, divergent, synthesizer` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | `references/tooling-reviewer.md` |
| Divergent | `reflect judgment, divergent, synthesizer` | `references/divergent-reviewer.md` |


Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the completion notice.

## 3. Synthesize

One `pstack_subagent` call with `agent: "general"` and `role: "reflect judgment, divergent, synthesizer"`. It spot-verifies citations through MCP. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): use the authoring-a-skill playbook and run its draft / test / iterate loop.
- `tune description: <skill path>` (the skill exists but did not trigger when it should have): revise its description, then replay three realistic prompts that should match it.
- `new skill via authoring-a-skill: <kebab-name>`: use the authoring-a-skill playbook. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
