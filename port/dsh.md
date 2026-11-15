# pstack in DeepSeek Harness

pstack skills use Cursor names. In DeepSeek Harness, read this file once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/` in the installed `dsh-pstack` package.

Use only tools visible in the current session. If a mapped tool or optional capability is unavailable, follow the fallback in that row. Do not assume optional plugins are enabled because a name appears here.

## Tools

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` | `pstack_subagent`. One call starts one subagent; fan out by calling it once per child in one message. Pass `provider`, `model`, and an optional `reasoningEffort` to override the route, or omit all three to inherit the parent route. `pstack_models` lists each model id on its own line under a provider heading: pass the heading's provider id as `provider` and the listed id as `model`, never the combined `provider/model` route. |
| `AskQuestion` | `ask_user_question` takes a batch of questions with options and free input. Only a live root agent has a human answerer; a delegated child keeps its questions in its result. Ask in plain text when the tool is absent. |
| Open a todolist | `todo_write` replaces the whole list and has no `skipped` status. Keep a skipped step visible as `skip: <reason> - <step>` in `content` and mark it `completed`. |
| Run another pstack skill (`/name` or "the **name** skill") | `pstack_skill` loads a packaged pstack skill by exact kebab-case `name`. Pass `resource` to read a file beside its `SKILL.md`; a user `/name` loads the skill directly. The built-in help skill is `poteto-help`; read a playbook with `name: "poteto-mode"` and `resource: "playbooks/<name>.md"`. |
| `Grep`, `Glob` | `grep` and `glob` are native tools; call them directly. Use `bash` with `rg` only when the session has neither. |

## Subagent fields

| Cursor | DeepSeek Harness |
| --- | --- |
| `subagent_type: generalPurpose` | `agent: "general"` (the default) joins the parent preset and inherits its tools. |
| `poteto-agent`, `comment-sicko` | `agent: "poteto-agent"` or `agent: "comment-sicko"`. These are agent presets, not `subagent_type` values. |
| `readonly: true` | `agent: "readonly"` gives the child a read-only sandbox. Use `general` when the child must write. |
| `readonly: false` | `agent: "general"`. |
| `environment: "cloud"` | No cloud agents. Use `create_worktree` when available and pass its checkout as `cwd`; otherwise skip with the line. |
| `environment: "local"` | Omit `cwd`; the child inherits the session directory. |
| `cloud_base_branch: <b>` | Pass `<b>` as `create_worktree.from`; otherwise tell the child to check out `<b>`. |
| `run_in_background: true` | Omit. `pstack_subagent` is managed and reports by completion notice. |
| `resume` | `pstack_send` to the existing child id continues a pstack child; when that tool is absent, use the native `send_message`. Start a new `pstack_subagent` only when it stopped permanently. |
| `file_attachments` | List the real paths in `prompt`; the child reads them with `read`. |

## Models

| Cursor | DeepSeek Harness |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]` | Do not pass a Cursor slug. Read `pstack_roles` for a role's `provider`, `model`, and `reasoningEffort`, plus that route's served `efforts` and default. To change the effort, pick another value from the route's `efforts` instead of guessing. Use `pstack_models` only to detect served routes during setup or to verify one exists. Drop `-fast`; DSH has no speed parameter. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | Pick the closest advertised route, or omit `provider` and `model` so the child inherits the parent route, and say so. |
| `auto` or `inherit-parent` | Omit `provider` and `model`; the child inherits the parent route. |
| The pstack role file | `$DSH_HOME/pstack-models.json`. Read `pstack_roles` to map a role to its route; `pstack_subagent` does not parse it. A missing file leaves no configured route, so the child inherits the parent route. |
| A role value such as `<model> <effort>` | Write `provider/model [effort]`; a role holds an array of these route strings. Split at the first `/`: `provider` is the first segment and the rest, which may contain `/`, is `model`. |

## setup-pstack

`setup-pstack` writes the role file the calling agent reads to choose a route. Use `pstack_models` to discover the live provider, model, and effort routes; do not infer them from Cursor slugs.

- Detect: write each real route as `provider/model [effort]`. If nothing is detectable, ask the user to paste the routes.
- Defaults: map each found route; use `inherit-parent` or `auto` for an unserved route. Apply the selected budget to the closest advertised effort and say what was chosen.
- Write: write a `roles` object of route arrays and an optional `budget`. Overwrite the whole file so a rerun is idempotent; a missing role inherits the parent route.

## Paths

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | Project skills live in `.dsh/skills/` or `.agents/skills/`; user skills live in `$DSH_HOME/skills/` or `~/.agents/skills/`. Packaged pstack skills load through `pstack_skill`. |
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
| `pstack_subagent` | Start one subagent with an optional `agent` preset (default `general`), optionally overriding its route with `provider`, `model`, and `reasoningEffort`; completion arrives as a notice. A subagent is not a background job: never pass its id to `job_output`; wait for the completion notice, or use `pstack_agents`/`pstack_send`. |
| `pstack_agents` | List the calling agent's direct child sessions with their ids, mode, and activity. Use it instead of the native `list_agents` when you need a pstack child id; in an Agent Teams profile the native tool only lists teammates. |
| `pstack_send` | Continue one pstack child by id. Use it instead of the native `send_message` when the target came from `pstack_subagent`. |
| `pstack_interrupt` | Stop one pstack child's current turn by id. Use it instead of the native `interrupt_agent` when the target came from `pstack_subagent`. |
| `pstack_skill` | Load a packaged pstack skill by exact kebab-case name; `resource` reads a reference or playbook. |
| `pstack_models` | List the provider, model, and reasoning-effort routes this deployment serves. |
| `pstack_roles` | Report each pstack role with its configured routes as provider, model, and reasoningEffort values, plus each route's served efforts and default. |

## Local replacements

| Cursor | DeepSeek Harness |
| --- | --- |
| `create-skill` | Use the vendored `writing-for-agents` skill to create or review a skill, then write and validate its `SKILL.md` directly. |
| `/deslop` | Use the vendored `deslop` skill for code slop; `unslop` is only for prose. |
| `/loop` | Use `create_goal` for automatic continuation, `schedule_create` for a timed heartbeat, or a background `bash` watcher for observable events. |
| `/automate` | Use `writing-for-agents` to turn verified work patterns into a personal skill; fall back to available session evidence when history search is unavailable. |
| Custom Mode | Select the shipped `poteto-mode` or `poteto-mode-creator` root preset at session creation. |
| `control-ui`, `control-cli`, `cursor-team-kit` | Use the vendored instruction skills; their browser or PTY requirements are stated in their own `SKILL.md`. |
