# pstack in DeepSeek Harness

This is the DSH adapter for pstack. It is the single source of truth for how a Cursor-shaped skill maps onto DSH. Read it once per session when a skill asks for a Cursor feature that DSH does not have.

## Tools

| Cursor | DSH |
| --- | --- |
| `Task` | `pstack_subagent`. Starts a background child and returns its id; the runtime sends a completion notice. |
| `subagent_type: "poteto-agent"` | `agent: "poteto-agent"`. The tool prepends the poteto-agent instructions. |
| `subagent_type: "comment-sicko"` | `agent: "comment-sicko"`. |
| `subagent_type: generalPurpose` | `agent: "general"`. No preamble; the prompt stands alone. |
| `model` slug | `role: "<role line>"`. The tool resolves provider, model, and effort from `~/.dsh/pstack-models.md`. |
| `run_in_background: true` | Always on. Every child is a managed background activation. |
| `readonly: true` / `readonly: false` | No separate mode. Say "do not edit files" in the prompt, and check `git status` afterward. |
| `resume` | `send_message` to the child id. Prefer a fresh child with consolidated scope, per `poteto-mode`. |
| `AskQuestion` | `ask_user_question`. |
| `TodoWrite` / open a todolist | `todo_write` with the whole list. |
| `Grep` / `Glob` | `grep` / `glob`. |
| `Read` / `Write` / `Edit` | `read` / `write` / `edit`. |
| `Shell` | `bash` (or `pwsh` on Windows). |

## Paths

| Cursor | DSH |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.dsh/skills/`, `~/.dsh/skills/` |
| `~/.cursor/plugins/` | `~/.dsh/plugins/` |
| `~/.cursor/rules/pstack-models.mdc` | `~/.dsh/pstack-models.md` |
| `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/<workspace-slug>/<session-id>/` |

## Model configuration

`/setup-pstack` writes `~/.dsh/pstack-models.md`. One role per line:

```text
# pstack model configuration. One line per role.
# Value is `inherit-parent` or `<provider>/<model>` with an optional effort token.
feature, refactoring: deepseek-official/deepseek-reasoner high
judgment and prose: inherit-parent
```

A missing file or line means every role inherits the parent's route. To discover valid routes, call `list_subagent_models`; never invent a provider or model id.

## Cursor-only features

DSH has no Cursor Automations, Bugbot, cloud agents, Custom Modes, or `/loop`. When a step needs one, write one line, `Skipped in DSH: <step>. <reason>.`, then go to the next step. Never stop, ask, or retry.

- **Automations / routines / `SendToUser` secrets**: skipped. Use DSH `schedule_create` for time-based follow-ups.
- **Bugbot**: treat review-bot comments as ordinary forge review threads and triage them with `gh`. If a PR has no bot check or comment, skip the step.
- **Cloud agents**: use local subagents with their own git worktree. DSH has no per-agent VM.
- **Custom Modes / `/loop`**: start each task with `/poteto-mode`; use `schedule_create` plus `create_goal` for long autonomous runs.
- **`cursor-team-kit`** (`/deslop`, `control-cli`, `control-ui`): not shipped. Use `/no-comments` for comment cleanup, and the project's verification skill for live driving. If neither exists, say so in one line and continue.

## Subagent completion

`pstack_subagent` returns `started subagent <id>` immediately. The child's final answer arrives later as a completion notice. Do not poll. If you need to steer it, call `send_message` with that id. To list children, call `list_agents`.
