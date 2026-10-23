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

A missing file or line means every role inherits the parent's route. The tool validates configured provider, model, and effort before starting a child. It also enforces the optional `allowedModels` list on the `pstack-subagent` row; a role outside that list is rejected before the child starts. The native DSH session `allowedModels` policy is not read by this adapter, so set the pstack list when the profile restricts models. The three panel roles expand to one child per entry because their skills define panel behavior; use `roleIndex` to select one route from another list-valued role. The shipped defaults are in `../pstack-models.example.md`.

## Cursor-only features

| Cursor | DSH |
| --- | --- |
| Cursor's built-in `create-skill` | No built-in authoring skill. Follow the `authoring-a-skill` playbook in `poteto-mode`. |
| Custom Modes | No persistent mode. Start each task with `/poteto-mode`. |
| Cursor Automations, routines, `SendToUser` secret requests | No equivalent. Use `schedule_create` for time-based follow-ups; skip the step with one line. |
| `environment: "cloud"` | A background `pstack_subagent` child session. The DSH worktree plugin is part of the supported install; have a writing child call `create_worktree` before editing. Child sessions are not separate VMs. |
| `/loop` | `schedule_create` plus `create_goal` for long autonomous runs. |
| `/deslop`, `control-cli`, `control-ui` from `cursor-team-kit` | Not shipped. Ask for the same outcome in plain words: remove narrating comments, unsupported guards, dead compatibility paths, and unrelated edits. `/no-comments` covers the comment half. |
| `cursor-team-kit` | Not shipped with pstack. Install it separately, or ask for the same outcome in plain words. |
| Bugbot | Comments arrive as ordinary forge review threads; triage them with `gh`. If a PR has no bot check or comment, skip the step. |

## DSH presets and tools

`agentPreset` is a DSH activation option that chooses the child's preset (its tools, skills, and plugins); omitting it uses the configured default, or inherits the parent preset when none is set. It is separate from pstack's `agent` argument, which selects only a prompt preamble. The model can select a preset only when the `pstack-subagent` row sets `allowedAgentPresets`; otherwise the parameter is absent. A configured `agentPreset` value sets the default. The `cordis` preset includes plugin-development skills and inspection/management tools such as `cordis_inspect_list`, `cordis_inspect_query`, and `plugin_manager`; add it to `allowedAgentPresets` only for DSH plugin authoring.

pstack declares the DSH worktree plugin as a peer dependency. The bundle mounts `pstack-worktree` and `pstack-tool-worktree`; when the official `@deepseek-ai/dsh-experimental-tool-worktree` bundle is already active, those rows stay disabled and the official rows serve the tool. `create_worktree` creates a local Git worktree, switches the calling session's working directory, and reports the checkout path and branch metadata; it does not fetch refs, is not a VM, does not merge changes, and does not clean up. pstack assumes the tool is enabled for parallel writers. File-access policy still controls which paths can be written.

## Subagent completion

`pstack_subagent` returns child ids immediately; final answers arrive later as completion notices. Pass `cwd` to select an existing working directory and `agentPreset` only when the `pstack-subagent` row allows presets. The `pstack-subagent` row sets `maxDepth: 2`; the model may request a lower value, but the tool clamps it to that cap. DSH counts the root session at depth 0, so a depth-1 coordinator can start depth-2 workers. Use a larger configured cap only when the actual tree has that many descendant levels.
