# pstack in DeepSeek Harness

pstack skills use Cursor names. In DeepSeek Harness, read this file once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/` in the installed `dsh-pstack` package.

Use only tools visible in the current session. If a mapped tool or optional capability is unavailable, follow the fallback in that row. Do not assume optional plugins are enabled because a name appears here.

## Tools

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` | `pstack_subagent` starts one subagent per call; fan out by calling it once per child in one message, passing `description` and `prompt`. To override the route, pass `provider` and `model` as a pair, never one alone, plus an optional `reasoning_effort`. Omit all three to inherit the parent route. `pstack_models` lists each model id on its own line under a provider heading: pass the heading's provider id as `provider` and the listed id as `model`, never the combined `provider/model` route. |
| `AskQuestion` | `ask_user_question` takes a batch of questions with options and free input. Only a live root agent has a human answerer; a delegated child keeps its questions in its result. Ask in plain text when the tool is absent. |
| Open a todolist | `todo_write` replaces the whole list and has no `skipped` status. Keep a skipped step visible as `skip: <reason> - <step>` in `content` and mark it `completed`. |
| Run another pstack skill (`/name` or "the **name** skill") | Use the native `skill` tool for skills in the session catalog. A bundled pstack skill with `disable-model-invocation: true` is hidden from `skill`, so `read` `<pstack>/skills/<name>/SKILL.md` and follow it, including playbooks and references under the skill directory. A user `/name` gesture injects one directly; the built-in help skill is `poteto-help`. |
| `Grep`, `Glob` | `grep` and `glob` are native tools; call them directly. Use `bash` with `rg` only when the session has neither. |

## Subagent fields

| Cursor | DeepSeek Harness |
| --- | --- |
| `subagent_type: generalPurpose` | `agent_preset: "general"` (the default) joins the parent preset and inherits its tools. |
| `poteto-agent`, `comment-sicko` | `agent_preset: "poteto-agent"` or `agent_preset: "comment-sicko"`. These are agent presets, not `subagent_type` values. |
| `readonly: true` | `agent_preset: "readonly"` gives the child a read-only sandbox. Use `general` when the child must write. |
| `readonly: false` | `agent_preset: "general"`. |
| `environment: "cloud"` | No cloud agents. Use `create_worktree` when available and pass its checkout as `cwd`; otherwise skip with the line. |
| `environment: "local"` | Omit `cwd`; the child inherits the session directory. |
| `cloud_base_branch: <b>` | Pass `<b>` as `create_worktree.from`; otherwise tell the child to check out `<b>`. |
| `run_in_background: true` | Omit. `pstack_subagent` is managed and reports by completion notice. |
| `resume` | Use the native `send_message`, addressing the pstack child by the name `list_agents` reports or by its Session id. Start a new `pstack_subagent` only when it stopped permanently. |
| `file_attachments` | List the real paths in `prompt`; the child reads them with `read`. |

## Models

| Cursor | DeepSeek Harness |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]` | Do not pass a Cursor slug. Read `pstack_roles` for the role's `provider`, `model`, `reasoningEffort`, and served `efforts`, then pass them as `provider`, `model`, and `reasoning_effort` when changing effort; use `pstack_models` only for setup or to verify a route. Drop `-fast`; DSH has no speed parameter. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | Pick the closest advertised route, or omit `provider` and `model` so the child inherits the parent route, and say so. |
| `auto` or `inherit-parent` | Omit `provider` and `model`; the child inherits the parent route. |
| The pstack role file | `$DSH_HOME/pstack-models.json`. Read `pstack_roles` to map a role to its route; `pstack_subagent` does not parse it. A missing file leaves no configured route, so the child inherits the parent route. |
| A role value such as `<model> <effort>` | Write a structured route object `{ kind: "route", provider, model, effort? }`; a role holds an array of these, or `{ kind: "inherit", alias }` for `auto` or `inherit-parent`. Read `provider`, `model`, and `effort` from `pstack_models` or `pstack_roles`; never join or split a `provider/model` string. |

When passing `provider` and `model` to override the child route, also pass `reasoning_effort` when the target model does not support the parent's current effort. Omitting it inherits the parent's effort and can fail before the child starts.

## setup-pstack

`setup-pstack` writes the role file the calling agent reads to choose a route. Use `pstack_models` to discover the live provider, model, and effort routes; do not infer them from Cursor slugs.

- Detect: write each real route as a structured `{ provider, model, effort? }` object. If nothing is detectable, ask the user to paste the routes.
- Defaults: map each found route; use `inherit-parent` or `auto` for an unserved route. Apply the selected budget to the closest advertised effort and say what was chosen.
- Write: write `version: 2` with a `roles` object of route-object arrays and an optional `budget`. Overwrite the whole file so a rerun is idempotent; a missing role inherits the parent route.

## Paths

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | Project skills live in `.dsh/skills/` or `.agents/skills/`; user skills live in `$DSH_HOME/skills/` or `~/.agents/skills/`. Packaged pstack skills live under `<pstack>/skills/` and load by reading their `SKILL.md`. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | Resolve package resources beside their `SKILL.md`; a plugin manifest is the `dsh` section of its `package.json`. |
| `.cursor/rules/*.mdc`, always-applied rules | The `AGENTS.md`-compatible chain. DSH never reads `.mdc`; the calling agent reads the pstack role file, and `pstack_subagent` does not parse it. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when the package ships it. Read the local copy and give the user the public URL when needed. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/<workspace-key>/<session>.jsonl`. Optional session search adds model-facing search tools. |

## Cursor-only features

DeepSeek Harness has no Cursor Automations, Bugbot, Cursor cloud agents, or built-in PR tool. When a step needs one, write one line in your reply, `Skipped in DeepSeek Harness: <step>. <reason>.`, then continue. A skipped step is not a passed step.

| Cursor | DeepSeek Harness |
| --- | --- |
| Cursor Automations, routines, webhooks, and `SendToUser` secrets | Skip with the line. Use local scheduling or background work where it fits the step. |
| Bugbot | Treat PR comments as ordinary review threads and use the step's `gh` command; skip starting or waiting for Bugbot when there is no check or comment. |
| Cursor cloud agents | Map `environment: "cloud"` to a local worktree; skip steps that need the cloud machine itself. |
| A built-in PR tool | Use the step's `gh` command through `bash`; that is not a skip, so write no line. |
| Cursor Projects | Skip with the line; there is no persistent cloud Project coordinator. |

## Plugin tools

The package registers its own model-facing tools beyond the native DSH tools above.

| Tool | Purpose |
| --- | --- |
| `pstack_subagent` | Start one subagent. Requires `description` and `prompt`; optional `agent_preset` (default `general`), `name`, `cwd`, `maxDepth`, and a route override with `provider`, `model`, and `reasoning_effort`. Returns `{kind:"activation", name}`. Completion arrives as a notice. A subagent is not a background job: never pass its name to `job_output`; wait for the completion notice, or use the native `list_agents`/`send_message`. |
| `pstack_interrupt` | Stop one pstack child's current turn by its name from `list_agents` or its Session id. Built-in presets disable the native `interrupt_agent`, so this is the interruption path for a pstack child. |
| `pstack_models` | List the advertised provider, model, and reasoning-effort routes for this deployment. Availability is confirmed only by an actual call; a listed route can still fail or be disallowed for the Session. |
| `pstack_roles` | Report each pstack role with its configured routes as provider, model, and reasoningEffort values, plus each route's served efforts and default. Pass them to `pstack_subagent` as `provider`, `model`, and `reasoning_effort`. |

## Agent Teams

When the session enables Agent Teams, `pstack_subagent` starts a teammate. Create the shared task with `team_task_create` first, start the child with a `name`, then reassign the task to that returned name with `team_task_update` action `reassign`. Include the task id in the child prompt so the child can claim and complete it. The role entries reported by `pstack_roles` are model routes, not Team members.

Use the Team board for durable work that needs an owner, dependencies, write scopes, or handoff to another member. Do not create a Team task for private or one-shot exploration, quick lookups, tool setup, or a single-turn check the Lead can finish directly; those remain ordinary `pstack_subagent` delegation without a task.

After each `pstack_subagent` call made for a Team task, immediately bind the task owner with `team_task_update`. After dispatching a batch, run `team_task_list` and reject any pending task that has no owner; reassign or delete it before waiting. Re-read the task immediately before every `team_task_update` so its revision is current. Only the task owner completes a task; if the Lead must finish it, reassign it to the Lead first instead of completing a child's in-progress task.

## Local replacements

| Cursor | DeepSeek Harness |
| --- | --- |
| `create-skill` | Use the vendored `writing-for-agents` skill to create or review a skill, then write and validate its `SKILL.md` directly. |
| `/deslop` | Use the vendored `deslop` skill for code slop; `unslop` is only for prose. |
| `/loop` | Use `create_goal` for automatic continuation, `schedule_create` for a timed heartbeat, or a background `bash` watcher for observable events. |
| `/automate` | Use `writing-for-agents` to turn verified work patterns into a personal skill; fall back to available session evidence when history search is unavailable. |
| `control-ui`, `control-cli`, `cursor-team-kit` | Use the vendored instruction skills; their browser or PTY requirements are stated in their own `SKILL.md`. |
