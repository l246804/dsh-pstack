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
| `resume` | This bundle has no child-steering tool. Use a fresh child with consolidated scope unless the DSH profile provides a control tool. |
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

## Skill visibility

The provider preserves the upstream `disable-model-invocation` and `user-invocable` flags. A skill with model invocation disabled remains available as a user slash command but is not callable through DSH's model-facing `skill` tool. This package does not silently change that policy. The provider exposes each skill's file path and resource base, but opening a referenced file still depends on the active file tools and path policy; do not assume a hidden skill can be invoked by name.

## Role configuration

`/setup-pstack` writes `~/.dsh/pstack-models.md`. One role per line:

```text
# pstack model configuration. One line per role.
# Value is `inherit-parent` or `<provider>/<model>` with an optional effort token.
feature, refactoring: deepseek-official/deepseek-reasoner high
judgment and prose: inherit-parent
```

A missing file or line means every role inherits the parent's route. The tool validates configured provider, model, and effort before starting a child. However, it starts children through `ctx.subagents.startActivation`, and the public DSH SDK does not expose the session's `allowedModels` policy to this adapter. Until DSH provides a policy-aware public API, explicit role routes are not checked against that allowlist; use `inherit-parent` where the profile's model restrictions must be enforced. The three panel roles expand to one child per entry because their skills define panel behavior; use `roleIndex` to select one route from another list-valued role. The shipped defaults are in `docs/pstack-models.example.md`.

## Cursor-only features

| Cursor | DSH |
| --- | --- |
| Cursor's built-in `create-skill` | No built-in authoring skill. Follow the `authoring-a-skill` playbook in `poteto-mode`. |
| Custom Modes | No persistent mode. Start each task with `/poteto-mode`. |
| Cursor Automations, routines, `SendToUser` secret requests | No equivalent. Use `schedule_create` for time-based follow-ups; skip the step with one line. |
| `environment: "cloud"` | A background `pstack_subagent` child session. When available, have a writing child call DSH's `create_worktree` before editing; alternatively prepare a Git worktree and pass its path as `cwd`. Child sessions are not separate VMs. |
| `/loop` | `schedule_create` plus `create_goal` for long autonomous runs. |
| `/deslop`, `control-cli`, `control-ui` from `cursor-team-kit` | Not shipped. Ask for the same outcome in plain words: remove narrating comments, unsupported guards, dead compatibility paths, and unrelated edits. `/no-comments` covers the comment half. |
| `cursor-team-kit` | Not shipped with pstack. Install it separately, or ask for the same outcome in plain words. |
| Bugbot | Comments arrive as ordinary forge review threads; triage them with `gh`. If a PR has no bot check or comment, skip the step. |

## DSH presets and tools

`agentPreset` is a DSH activation option that chooses the child's preset (its tools, skills, and plugins); omitting it inherits the parent preset. It is separate from pstack's `agent` argument, which selects only a prompt preamble. In profiles that provide the `cordis` preset, use `agentPreset: "cordis"` for DSH plugin authoring only. That preset includes plugin-development skills and inspection/management tools such as `cordis_inspect_list`, `cordis_inspect_query`, and `plugin_manager`; use the inspector to confirm what is actually available in the child session.

The DSH Agent Team profile is a separate collaboration mode. Its `spawn_teammate`, `list_agents`, `send_message`, `interrupt_agent`, and task-board tools manage Agent Team members, not `pstack_subagent` children. Team members share one checkout; the profile does not create a worktree per member. This package does not enable Agent Team automatically because doing so changes the profile's global delegation tools and is not required for pstack role routing.

When the active child session exposes DSH's `create_worktree`, fetch the intended base and set `from` to it before writing shared-repository changes; the tool does not fetch refs. It creates a local Git worktree, switches that session's working directory, and reports the checkout path and branch metadata; it is not a VM, does not merge changes, and does not clean up. For `pstack_subagent`, each writer can create its own worktree in its child session. If the child lacks the tool, prepare a Git worktree separately and pass it through `cwd`. File-access policy still controls which paths can be written.

## Subagent completion

`pstack_subagent` returns child ids immediately; final answers arrive later as completion notices. Pass `cwd` to select an existing working directory and `agentPreset` to select a DSH preset. The DSH SDK counts the root session at depth 0; its default `maxDepth: 1` allows only a direct child. For a depth-1 coordinator that delegates once more to a depth-2 worker, pass `maxDepth: 2` on that nested call. Use a larger limit only when the actual tree has that many descendant levels.
