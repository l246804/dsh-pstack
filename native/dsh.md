# pstack in DeepSeek Harness

pstack skills use Cursor names. In DeepSeek Harness, map each Cursor name from the skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/`.

Use only tools visible in the current session, even when a name appears here. When a mapped tool or optional capability is unavailable, follow that row's fallback. When a step needs a Cursor-only capability, write `Skipped in DeepSeek Harness: <step>. <reason>.`, then continue. If a later step needs what the skipped step made, leave a placeholder and name it in the line.

## Tools

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` | `subagent` starts a fresh child and returns its name at once; `subagent_fork` seeds the child with the conversation instead. Put the task in `prompt`, the label in `description`, and the directory in `cwd`; Subagent fields covers the Cursor fields with no native argument. |
| `AskQuestion` | `ask_user_question` takes a `questions` array of options and free input. An empty `selected` with no `custom` means the user skipped, and a timeout is `pending`, not skipped. A live child cannot ask, so it keeps the question in its result; ask in plain text when the tool is absent. |
| Open a todolist | `todo_write` replaces the whole list and has no `skipped` status. Keep a skipped step visible as `skip: <reason> - <step>` and mark it `completed`. |
| Run another pstack skill (`/name` or "the **name** skill") | `skill` loads a catalog skill by exact name. A skill with `disable-model-invocation: true` is hidden from `skill`, so `read` `<pstack>/skills/<name>/SKILL.md`; a user `/name` gesture injects the skill directly, so do not call `skill` again. |
| `Grep`, `Glob` | `grep` and `glob` are native tools; call them directly, with ripgrep syntax for `grep`. Use `bash` with `rg` only when the session has neither. |

## Subagent fields

| Cursor | DeepSeek Harness |
| --- | --- |
| `subagent_type: generalPurpose` | No such field; omit it. The child is the plain `subagent`, and the task goes in `prompt`. |
| `poteto-agent`, `comment-sicko` | No native presets. Read `<pstack>/agents/<name>.md` and pass it as `prompt`, or write the role yourself. |
| `readonly: true` | No sandbox argument. Put "do not edit files" in `prompt`, rely on the session permission mode, and check `git status` afterward. |
| `readonly: false` | Omit; a child under the session permission mode can write. |
| `environment: "cloud"` | No cloud agents. When a worktree tool such as `create_worktree` is available, pass its checkout as `cwd`; otherwise skip with the line. |
| `environment: "local"` | Omit `cwd`; the child inherits the session directory. |
| `cloud_base_branch: <b>` | No such field. Pass `<b>` as `create_worktree.from`; otherwise tell the child to check out `<b>` first. |
| `run_in_background: true` | Omit. `subagent` returns its name immediately and notifies on completion; there is no background flag. |
| `resume` | `send_message` continues the child by `agent`, its name from `list_agents` or its Session id; a running child takes the message at its next step and an idle one resumes. `interrupt_agent` takes the same `agent`, but built-in presets disable it, so treat interruption as unavailable there. Spawn a new `subagent` only when it stopped permanently. |
| `file_attachments` | No such field. List the real paths in `prompt`; the child reads them with `read`. |

## Models

| Cursor | DeepSeek Harness |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | Split it into `provider`, `model`, and `reasoning_effort`, and drop `-fast`; these arguments appear only when the delegation tool enables model selection. Discover ids with `list_subagent_models` when the tool offers it; when it does not, omit them and the child inherits the parent route. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | Pick the closest advertised route. If none matches, omit `provider` and `model` so the child inherits the parent route, and say so. |
| `auto` or `inherit-parent` | Omit `provider`, `model`, and `reasoning_effort`; the child inherits the parent route. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | Base DeepSeek Harness has no `.mdc` rules directory and never loads one. The pstack role file is `$DSH_HOME/pstack/models.json`; base DeepSeek Harness does not read it, so read it yourself before delegation when it exists. |
| A role value `<model> <effort>`, such as `opus high` | Use the structured route object described under setup-pstack; never join or split a `provider/model` string. |

## setup-pstack

`setup-pstack` writes the role file the calling agent uses to choose a route. Use `list_subagent_models` to discover the live `provider`, `model`, and `effort` routes; do not infer them from Cursor slugs.

- Detect: write each real route found by `list_subagent_models` as a structured `{ kind: "route", provider, model, effort? }` object. If none is detectable, ask the user to paste the routes; never write an unconfirmed one.
- Defaults: map each found route; use `inherit-parent` or `auto` for an unserved route. Apply the selected budget to the closest advertised effort and say what you chose.
- Write: write `$DSH_HOME/pstack/models.json` with `version: 2`, an optional `budget`, and a `roles` object of route-object arrays. Overwrite the whole file so a rerun is idempotent; a missing role inherits the parent route.

Done when the file parses as version 2, every role maps to a route or to `inherit-parent`/`auto`, and a rerun produces the same file.

## Paths

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | Project skills live in `.dsh/skills/` or `.agents/skills/`; user skills live in `$DSH_HOME/skills/` or `$DSH_AGENTS_HOME/skills/`, which defaults to `~/.agents`. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | A profile is `$DSH_HOME/profiles/<name>/`, holding `cordis.patch.yml`; a plugin manifest is the `dsh` section of its `package.json`. |
| `.cursor/rules/*.mdc`, always-applied rules | General rules use the `AGENTS.md` chain; DeepSeek Harness never reads `.mdc`. Project `AGENTS.md`/`AGENTS.local.md` (`CLAUDE.md` accepted) plus `$DSH_HOME/AGENTS.md`. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when the file exists. Read the local copy and never fetch it; give the user the URL when needed. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/<workspace-key>/<session>.jsonl`, one append-only log per session. Optional session search adds model-facing search tools. |

## Cursor-only features

The table lists each Cursor-only capability and how to handle it. A skipped step is not a passed step. Do not stop, ask, or retry.

| Cursor | DeepSeek Harness |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. |
| Bugbot | Treat PR comments as ordinary review threads and use the step's `gh` command; skip starting or waiting for Bugbot when there is no check or comment. |
| Cursor cloud agents | Map `environment: "cloud"` to a local worktree; skip steps that need the cloud machine itself. |
| A built-in PR tool | Use the step's `gh` command through `bash`; that is not a skip, so write no line. |
