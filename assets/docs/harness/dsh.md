# pstack in DeepSeek Harness

This is the DSH adapter for pstack. It is the single source of truth for how a Cursor-shaped skill maps onto DSH. Read it once per session when a skill asks for a Cursor feature that DSH does not have.

## Tools

| Cursor | DSH |
| --- | --- |
| `Task` | `pstack_subagent`. Starts a background child and returns its id; the runtime sends a completion notice. |
| `subagent_type: "poteto-agent"` | `agent: "poteto-agent"`. The tool prepends the poteto-agent instructions. |
| `subagent_type: generalPurpose` | `agent: "general"`. No preamble; the prompt stands alone. |
| `subagent_type: "comment-sicko"` | `agent: "comment-sicko"`. |
| `run_in_background: true` | Always on. Every child is a managed background activation. |
| `readonly: true` / `readonly: false` | No separate mode. Say "do not edit files" in the prompt, and check `git status` afterward. |
| `resume` | `send_message` to the child id. Prefer a fresh child with consolidated scope, per `poteto-mode`. |
| `AskQuestion` | `ask_user_question`. In non-interactive runs it is absent, so ask in plain text. |
| `TodoWrite` | `todo_write` with the whole list. |
| `Grep` / `Glob` | `grep` / `glob`. |
| `Read` / `Write` / `Edit` | `read` / `write` / `edit`. |
| `Shell` | `bash` (or `pwsh` on Windows). |

## Paths

| Cursor | DSH |
| --- | --- |
| `~/.cursor/rules/pstack-models.mdc` | `~/.dsh/pstack-models.md` |
| `.cursor/skills/`, `~/.cursor/skills/` | `.dsh/skills/`, `~/.dsh/skills/` |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `~/.dsh/plugins/`, `package.json` |
| `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/<workspace-slug>/<session-id>/` |

## Models

| Cursor | DSH |
| --- | --- |
| `model` slug, such as `claude-opus-5-5-xhigh` | `role: "<role line>"`. The tool resolves provider, model, and effort from `~/.dsh/pstack-models.md` at call time. |

## Role configuration

`/setup-pstack` writes `~/.dsh/pstack-models.md`. One role per line:

```text
# pstack model configuration. One line per role.
# Value is `inherit-parent` or `<provider>/<model>` with an optional effort token.
feature, refactoring: deepseek-official/deepseek-reasoner high
judgment and prose: inherit-parent
```

A missing file or line means every role inherits the parent's route. To discover valid routes, call `list_subagent_models`; never invent a provider or model id. The shipped defaults are in `docs/pstack-models.example.md`.

## Cursor-only features

| Cursor | DSH |
| --- | --- |
| Cursor's built-in `create-skill` | No built-in authoring skill. Follow the `authoring-a-skill` playbook in `poteto-mode`. |
| Custom Modes | No persistent mode. Start each task with `/poteto-mode`. |
| Cursor Automations, routines, `SendToUser` secret requests | No equivalent. Use `schedule_create` for time-based follow-ups; skip the step with one line. |
| `environment: "cloud"` | A `pstack_subagent` with its own git worktree. DSH has no per-agent VM. |
| `/loop` | `schedule_create` plus `create_goal` for long autonomous runs. |
| `/deslop`, `control-cli`, `control-ui` from `cursor-team-kit` | Not shipped. Ask for the same outcome in plain words: remove narrating comments, unsupported guards, dead compatibility paths, and unrelated edits. `/no-comments` covers the comment half. |
| `cursor-team-kit` | Not shipped with pstack. Install it separately, or ask for the same outcome in plain words. |
| Bugbot | Comments arrive as ordinary forge review threads; triage them with `gh`. If a PR has no bot check or comment, skip the step. |

## Subagent completion

`pstack_subagent` returns `started subagent <id>` immediately. The child's final answer arrives later as a completion notice. Do not poll. If you need to steer it, call `send_message` with that id. To list children, call `list_agents`.
