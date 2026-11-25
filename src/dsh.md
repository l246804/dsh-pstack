# pstack in DeepSeek Harness

pstack skills use Cursor names. In DeepSeek Harness, map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/` in the installed `dsh-pstack` package.

Use only tools visible in the current session, even when a name appears here. When a mapped tool or optional capability is unavailable, follow that row's fallback. When a step needs a Cursor-only capability, write `Skipped in DeepSeek Harness: <step>. <reason>.`, then continue. If a later step needs what the skipped step made, leave a placeholder and name it in the line.

## Plugin tools

| Tool | Purpose |
| --- | --- |
| `pstack_subagent` | Start one subagent per call and report completion by notice. It is not a background job; do not wait for it with `job_output`. |
| `pstack_interrupt` | Stop one pstack child's current turn by the name from `list_agents` or its Session id. Built-in presets disable native `interrupt_agent`, so this is the interruption path. |
| `pstack_models` | List the `provider`, `model`, and `reasoning_effort` routes the deployment serves for setup discovery. It does not read the role file; role lookups use `pstack_roles`. A listed route can still fail at call time. |
| `pstack_roles` | Report each role's configured routes, served `efforts`, and defaults. Use it for every role-to-model lookup and for selecting a model for `pstack_subagent`. |

## Tools

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` | `pstack_subagent` starts one child per call; call it once per child in one message with `description` and `prompt`. Pass the route from `pstack_roles` as `provider`, `model`, and an optional `reasoning_effort`; omit them to inherit the parent route. |
| `AskQuestion` | `ask_user_question` accepts a batch of questions with options and free input. Only a live root agent has a human answerer; a delegated child keeps questions in its result. Use plain text when the tool is absent. |
| Open a todolist | `todo_write` replaces the whole list and has no `skipped` status. Keep a skipped step visible in `content` as `skip: <reason> - <step>` and mark it `completed`. |
| Run another pstack skill (`/name` or "the **name** skill") | Use native `skill` for catalog skills. A bundled skill with `disable-model-invocation: true` is hidden from `skill`, so read `<pstack>/skills/<name>/SKILL.md` and follow it. A user `/name` gesture injects it directly; built-in help is `poteto-help`. |
| `Grep`, `Glob` | `grep` and `glob` are native; use `bash` with `rg` only when neither exists. |

## Subagent fields

| Cursor | DeepSeek Harness |
| --- | --- |
| `subagent_type: generalPurpose` | `agent_preset: "general"` (the default) joins the parent preset and inherits its tools. |
| `poteto-agent`, `comment-sicko` | `agent_preset: "poteto-agent"` or `agent_preset: "comment-sicko"`. These are agent presets, not `subagent_type` values. |
| `readonly: true` | `agent_preset: "readonly"` gives the child a read-only sandbox. Use `general` when the child must write. |
| `readonly: false` | `agent_preset: "general"`. |
| `environment: "cloud"` | No cloud agents. Use `enter_worktree` when available to work in a local worktree; otherwise skip with the line. |
| `environment: "local"` | No such argument; a child starts in the session directory. |
| `cloud_base_branch: <b>` | Pass `<b>` as `enter_worktree.from`; otherwise tell the child to check out `<b>`. |
| `run_in_background: true` | Omit; the child is managed (Plugin tools). |
| `resume` | Use native `send_message`, addressing the pstack child by the name `list_agents` reports or by its Session id. Start a new `pstack_subagent` only when it stopped permanently. |
| `file_attachments` | List the real paths in `prompt`; the child reads them with `read`. |

## Agent Teams

When the session enables Agent Teams, every `pstack_subagent` child is a teammate, and the shared task board is optional.

Use the board when the work is shared or durable: two or more children feed one deliverable, steps must run in order, another member takes over, or the Lead tracks the task after the child returns. A single child whose result the Lead consumes once stays off the board.

On the board path, create the task first, start the child with a `name`, reassign the task to that name, and put the task id in the child prompt. Re-read the task before every update. Only the owner completes it. Reassign it to the Lead before the Lead finishes it. `pstack_roles` reports model routes, not Team members.

## Models

| Cursor | DeepSeek Harness |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]` | Drop `-fast`; DeepSeek Harness has no speed parameter. Read the role's `provider`, `model`, and `reasoningEffort` from `pstack_roles`, and use a served `effort` when you change it. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | Pick the closest advertised route, or omit the route and let the child inherit the parent route; say which you did. |
| `auto` or `inherit-parent` | Omit the route; the child inherits the parent route. |
| The pstack role file | `$DSH_HOME/pstack/models.json`. Read it through `pstack_roles`; `pstack_subagent` does not parse it. A missing file leaves the parent route in effect. |
| A role value such as `<model> <effort>` | Use the structured route object described under setup-pstack; never join or split a `provider/model` string. |

When overriding a child route, pass a `reasoning_effort` when the target model does not serve the parent's current effort. Omitting it inherits the parent effort and can fail before the child starts.

## setup-pstack

`setup-pstack` writes the role file the calling agent uses to choose a route. Discover the routes with `pstack_models` (Plugin tools); do not infer them from Cursor slugs.

- Detect: write each real route found by `pstack_models` as a structured `{ kind: "route", provider, model, effort? }` object. If none is detectable, ask the user to paste the routes.
- Defaults: map each found route; use `inherit-parent` or `auto` for an unserved route. Apply the selected budget to the closest advertised effort and say what you chose.
- Write: write `$DSH_HOME/pstack/models.json` with `version: 2`, an optional `budget`, and a `roles` object of route-object arrays. Overwrite the whole file so a rerun is idempotent; a missing role inherits the parent route.

Done when the file parses as version 2, every role maps to a route or to `inherit-parent`/`auto`, and a rerun produces the same file.

## Paths

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | Project skills live in `.dsh/skills/` or `.agents/skills/`; user skills live in `$DSH_HOME/skills/` or `~/.agents/skills/`. Packaged pstack skills live under `<pstack>/skills/` and load by reading their `SKILL.md`. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | Resolve package resources beside their `SKILL.md`; a plugin manifest is the `dsh` section of its `package.json`. |
| `.cursor/rules/*.mdc`, always-applied rules | The `AGENTS.md`-compatible chain. DeepSeek Harness never reads `.mdc`. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when the package ships it. Read the local copy and give the user the public URL when needed. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/<workspace-key>/<session-id>/`. Optional session search adds model-facing search tools. |

## Local replacements

| Cursor | DeepSeek Harness |
| --- | --- |
| `create-skill` | Use the vendored `writing-for-agents` skill to create or review a skill, then write and validate its `SKILL.md` directly. |
| `/deslop` | Use the vendored `deslop` skill for code slop; `unslop` is only for prose. |
| `/loop` | Use `create_goal` for automatic continuation, `schedule_create` for a timed heartbeat, or a background `bash` watcher for observable events. |
| `/automate` | Use `writing-for-agents` to turn verified work patterns into a personal skill; fall back to available session evidence when history search is unavailable. |
| `control-ui`, `control-cli`, `cursor-team-kit` | Use the vendored instruction skills; their browser or PTY requirements are stated in their own `SKILL.md`. |

## Cursor-only features

The table lists each Cursor-only capability and how to handle it. A skipped step is not a passed step. Do not stop, ask, or retry.

| Cursor | DeepSeek Harness |
| --- | --- |
| Cursor Automations, routines, webhooks, and `SendToUser` secrets | Skip with the line. Use local scheduling or background work where it fits the step. |
| Bugbot | Treat PR comments as ordinary review threads and use the step's `gh` command; skip starting or waiting for Bugbot when there is no check or comment. |
| Cursor cloud agents | Map `environment: "cloud"` to a local worktree; skip steps that need the cloud machine itself. |
| A built-in PR tool | Use the step's `gh` command through `bash`; that is not a skip, so write no line. |
| Cursor Projects | Skip with the line; there is no persistent cloud Project coordinator. |
