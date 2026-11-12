# pstack in DSH

pstack skills use Cursor names. In DSH, read this file once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/`. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

## Tools

| Cursor | DSH |
| --- | --- |
| `Task` | `subagent`. It starts an independently managed child and returns its id immediately; the runtime notifies you when the child finishes. Its schema takes `description`, `prompt`, and an optional `cwd`, plus `provider`/`model`/`reasoning_effort` when the session enables model selection. There is no subagent-type field. `subagent_fork` starts a child that inherits the current conversation instead. |
| `AskQuestion` | `ask_user_question`. When the session does not offer it, ask in plain text. |
| Open a todolist | `todo_write`. Each call replaces the entire list, so resend every item with its status at each phase. |
| Run another pstack skill (`/name` or "the **name** skill") | `skill` with the skill's `name` loads its full instructions when the session skill catalog lists it. A skill whose frontmatter sets `disable-model-invocation: true` stays out of the model catalog; `read` `<pstack>/skills/<name>/SKILL.md` and follow it. When you tell the user to type it, write `/<name>`; DSH lists user-invocable skills in its slash menu with no plugin namespace. |
| `Grep`, `Glob` | `grep` and `glob` are native tools; call them directly. Use `bash` with `rg` only when the session has neither. |

## Subagent fields

| Cursor | DSH |
| --- | --- |
| `subagent_type: generalPurpose` | No such field. Omit it; every `subagent` child is general-purpose and takes its role from the `prompt`. |
| `poteto-agent`, `comment-sicko` | No native equivalents. When `<pstack>/agents/<name>.md` exists, `read` it and pass its instructions as the child's `prompt`; otherwise write the role into the `prompt` yourself. |
| `readonly: true` | No such field; the `subagent` schema has no sandbox parameter. File effects follow the session's permission mode (`read-only`, `workspace-write`, or `danger-full-access`), which a child cannot widen from inside. Put "do not edit files" in the `prompt` as well, and check `git status` afterward. |
| `readonly: false` | Omit. Writable is the default under the session's permission mode. |
| `environment: "cloud"` | DSH runs no cloud agents. The local equivalent is a separate worktree. Requires enabling `@deepseek-ai/dsh-experimental-tool-worktree` (also shipped inside `@deepseek-ai/dsh-experimental-forge-bundle`), whose `create_worktree` tool makes the branch and checkout; pass that checkout as the child's `cwd`. Without the bundle, skip with the line. |
| `environment: "local"` | Omit. Children run on the local machine by default. |
| `cloud_base_branch: <b>` | No such field. With `create_worktree` enabled, pass `<b>` as its `from`; otherwise tell the worker in the `prompt` to check out `<b>` first. |
| `run_in_background: true` | Omit. `subagent` always returns immediately and the runtime notifies you when the child finishes. |
| `resume` | `send_message` to the child's `agent_id` continues it. A working child receives the message at its next step; an idle child starts a new turn with it. Only an execution that stopped permanently takes no follow-up; then start a new `subagent` and paste the earlier result into its `prompt`. |
| `file_attachments` | No such field. List the paths in the `prompt`; the child reads them with `read`. |

## Models

| Cursor | DSH |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | A route on the delegation call. `provider` and `model` select the family and version, `reasoning_effort` takes the effort. Valid ids come from `list_subagent_models`. With no arguments it lists providers, with `provider` its models, and with `provider` + `model` that model's reasoning efforts. Supply `provider` and `model` together. There is no `-fast` distinction; drop it. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | Routes are provider-neutral. Pick the closest `provider`/`model` pair that `list_subagent_models` advertises. When nothing matches, omit `provider` and `model` so the child falls back to a compatible parent route, and say so. |
| `auto` or `inherit-parent` | Omit `provider` and `model`. Omitted values use child defaults, falling back to compatible parent values, and an omitted `reasoning_effort` uses the model's default when the route changes. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | DSH has no `.mdc` rules and no `rules/` directory. What every session loads is the `AGENTS.md`-compatible instruction chain, and `setup-pstack` below says where the role lines live. When they are not already in context, `read` that file. When the file or the role's line is missing, use the skill's default slug mapped through the rows above. |
| A role value `<model> <effort>`, such as `opus high` | A role value is a `<provider>/<model> <effort>` route. Pass `<provider>` as `provider`, `<model>` as `model`, and `<effort>` as `reasoning_effort`. |

## setup-pstack

DSH has no rules directory and never reads `.mdc` files. Each session loads the `AGENTS.md`-compatible instruction chain instead. The project chain is `AGENTS.md` or `AGENTS.local.md` (`CLAUDE.md` and `CLAUDE.local.md` are also accepted), and the user-global file is `$DSH_HOME/AGENTS.md`, where `$DSH_HOME` is the `DSH_HOME` environment variable, default `~/.dsh`. So `setup-pstack` writes its role lines there. Follow its steps with these changes:

- Detect. The detected models are the routes `list_subagent_models` advertises. Each is a `provider`/`model` pair with the `reasoning_effort` ids that model accepts. Write a real route as `<provider>/<model> <effort>`. The effort is the last token, so the budget step works as written.
- Defaults. Map each default slug with the rows above. A slug whose family has an advertised route becomes that `<provider>/<model> <effort>`; a slug this deployment does not serve becomes `inherit-parent`.
- Write. Update the user-global `$DSH_HOME/AGENTS.md` with no frontmatter, then the comment lines, the `# budget` line, and one line per role from step 5. Replace only a previous role-lines block and keep the user's own guidance; there is no dedicated rule file to overwrite. Never put the role lines in the project's `AGENTS.md`, which belongs to the repository.

## Paths

| Cursor | DSH |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | Project skills live in `.dsh/skills/` or `.agents/skills/`. User skills live in `$DSH_HOME/skills/` or `$DSH_AGENTS_HOME/skills/`, where `$DSH_AGENTS_HOME` defaults to `~/.agents`. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | A profile is `$DSH_HOME/profiles/<name>/`, holding a `package.json` with the ordered bundle list and a `cordis.patch.yml` user patch layer; installed plugin packages live in that profile's `node_modules/`. A plugin's manifest is the `dsh` section of its `package.json`; there is no `.cursor-plugin/plugin.json` equivalent. The `plugin_manager` tool lists, enables, disables, installs, and removes plugins and bundles. |
| `.cursor/rules/*.mdc`, always-applied rules | The `AGENTS.md`-compatible instruction chain. DSH never reads `.mdc` files. Each session loads the project `AGENTS.md`/`AGENTS.local.md` plus the user-global `$DSH_HOME/AGENTS.md`. The model role lines use the same chain. See Models and setup-pstack. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when that file exists. The plugin ships the skills, `docs/guide/`, and `README.md`. Read the local copy and never fetch it. Give the user the URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/`, one append-only `.jsonl` per session under a folder for the workspace path, whose separators fold to `-`. Read only this workspace's folder, with `read` and `grep`. Requires enabling `@deepseek-ai/dsh-experimental-session-search` for the `session_search`, `session_trace`, and `session_event_*` tools over the same transcripts; without it, DSH has no model-facing transcript search. |

## Cursor-only features

DSH has no Cursor Automations, Bugbot, Cursor cloud agents, or built-in PR tool. When a step needs one, put one line in your reply, `Skipped in DSH: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line.

| Cursor | DSH |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so run the `gh` command that the step gives through `bash`. Enabling `@deepseek-ai/dsh-experimental-forge-bundle` adds change-request tracking beside the session and also drives the `gh` CLI; enable it only when a step needs that tracking. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps to a local worktree, as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard status or its own machine. |
| A built-in PR tool | Use the `gh` command that the step gives through `bash`, such as `gh pr create`. That is not a skip, so write no line. |
