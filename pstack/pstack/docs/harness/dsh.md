# pstack in DeepSeek Harness

pstack skills use Cursor names. In DeepSeek Harness, read this file once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/` in the installed `dsh-pstack` package. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

## Tools

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` | `pstack_subagent`, provided by this package. A call starts one fresh child per activation or panel entry, returns every child id with its resolved route, and reports results through completion notices. Do not poll, and do not start a child to run the parent playbook. |
| `AskQuestion` | `ask_user_question`. It takes a `questions` array with options, `multi_select`, and free input. Only a live root agent has a human answerer; a delegated child must keep its questions in its report. In a headless profile with no answerer, ask in plain text instead of blocking. |
| Open a todolist | `todo_write` with the full list, replacing the previous one. It has only `pending`, `in_progress`, and `completed`; keep a skipped step visible as `skip: <reason> — <step>` with status `completed`. |
| Run another pstack skill (`/name` or "the **name** skill") | `pstack_skill` with the exact kebab-case `name`. It loads pstack skills that `disable-model-invocation` hides from the `skill` catalog; pass a relative `resource` to read one reference or playbook beside `SKILL.md`. User commands keep their plain names, such as `/setup-pstack`; DSH adds no `pstack:` prefix. |
| `Grep`, `Glob` | `grep` and `glob` for discovery, `read` for a known file, and `bash` for shell commands. `grep` is ripgrep syntax; both search tools accept a path and report where an over-limit result was saved. |

## Subagent fields

| Cursor | DeepSeek Harness |
| --- | --- |
| `subagent_type: generalPurpose` | `agent: "general"`. A plain child that joins the parent agent preset and inherits its tools. Every call must also pass `description`, `prompt`, `role`, `roleIndex`, `reasoningEffort`, `cwd`, and `maxDepth`; no argument has an implicit default. Pass `null` for `role`, `roleIndex`, `reasoningEffort`, or `cwd` when the setting is unused; `roleIndex` requires a non-null role, and a non-null `cwd` must be inside the Session directory or a separate Git worktree. `maxDepth` is a non-negative integer and may only lower the `pstack-subagent` row's configured cap (2 by default). A reasoning effort is one token, exactly as the target model advertises. Choose `agent` explicitly; never pass a DSH agent-preset id in its place. |
| `poteto-agent`, `comment-sicko` | `agent: "poteto-agent"`, `agent: "comment-sicko"`. The package declares both as `@deepseek-ai/dsh-agent-preset` rows: `poteto-agent` injects the pstack persona and the absolute `poteto-mode` instruction path; `comment-sicko` mounts the comment reviewer preset. These are not `subagent_type` values. |
| `readonly: true` | No per-call field. Use `agent: "comment-sicko"` for the comment reviewer: its preset disables `write` and `edit` but keeps `bash`, so treat the no-write rule as a review constraint and check `git status` after it reports. For any other read-only brief, say "do not edit files" and check `git status`; prose is not a sandbox. |
| `readonly: false` | `agent: "general"`. The child keeps the parent's tools, including mounted MCP tools. |
| `environment: "cloud"` | No cloud VM. Create a local checkout with `create_worktree` (or `git worktree add` through `bash` when the worktree bundle is off), pass its path as `cwd`, and name the branch or commit. Only the checkout and branch are isolated; ports, credentials, caches, and services may remain shared. Skip a step that needs the cloud dashboard or its own machine. |
| `environment: "local"` | `cwd: null`; the child inherits the Session directory. |
| `cloud_base_branch: <b>` | `create_worktree({ from: "<b>" })`, or tell the child to check out `<b>` first. `from` resolves local refs only and does not fetch. |
| `run_in_background: true` | Omit. Every `pstack_subagent` activation is managed and reports by completion notice; there is no background flag. |
| `resume` | Send `send_message` to the existing child id: an idle continuable child cold-resumes, and a running child receives the message at its next step. Start a fresh child only when you do not need its prior context. |
| `file_attachments` | List the real paths in `prompt`; there is no attachment argument. |

## Models

| Cursor | DeepSeek Harness |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | Never pass a Cursor slug to `pstack_subagent`. Pass `role: "<role key>"`; `$DSH_HOME/poteto-models.mdc` supplies the exact `<provider>/<model> [effort]` route. Drop `-fast`; DSH has no speed parameter. Use `pstack_models` to see the routes this deployment actually serves. A call may override the role's starting effort with `reasoningEffort`, using a token the target model advertises; a running child can change it with `set_reasoning_effort`. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | Pass `role: null` so the child inherits the parent route, and say so. A role line with `inherit-parent` or `auto` does the same. |
| `auto` or `inherit-parent` | Pass `role: null`, or write the role value as `inherit-parent` or `auto`. `pstack_subagent` sends no route override and the child inherits the parent route. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | `$DSH_HOME/poteto-models.mdc`. `pstack_subagent` re-reads it on every delegation, so an edit affects the next child and never a running child. A missing file makes every role inherit the parent route; an unreadable file is an error; a malformed line is reported at its line number. Role names come from the pstack role manifest, not free text. |
| A role value `<model> <effort>`, such as `opus high` | `<provider>/<model> [effort]`, such as `provider/model [high]`. Split at the first `/`; the bracketed effort must be a token the model advertises. A comma-separated value is a list: `arena runners`, `architect runners`, and `interrogate reviewers` are automatic panels that start one child per entry; `arena cross-judge pool` and `swarm workers` select one entry by `roleIndex` (null selects the first), and `swarm workers` is the default route for every worker unless a race assigns one per arm. |

## setup-pstack

`setup-pstack` writes `$DSH_HOME/poteto-models.mdc`, the role file `pstack_subagent` reads on every delegation. Run `pstack_models` first; it reports the live providers, models, and reasoning-effort tokens instead of inferring routes from Cursor slugs.

- Detect. Enumerate the routes `pstack_models` returns; write each real route as `<provider>/<model> [effort]`. The effort is the bracketed token and must be one that route advertises. If nothing is detectable, ask the user to paste the routes; never write an unconfirmed one. `inherit-parent` and `auto` are always valid.
- Defaults. Map each default Cursor slug with the Models rows: keep the role and replace the slug with a route from `pstack_models`. For example, a `claude-opus-5-5-xhigh` default becomes a real route with `[xhigh]`, and `grok-4.7-xhigh-fast` becomes `inherit-parent`. Apply the budget to the effort token: `unlimited`, `large`, `medium`, and `small` target `max`, `xhigh`, `high`, and `medium`. If a model has no such token, choose the highest advertised effort at or below the target and say so; if it advertises no effort at all, keep the route and say so.
- Write. Write `$DSH_HOME/poteto-models.mdc` with no frontmatter, then the comment lines, the `# budget:` line, and one line per role from step 5. Overwrite the whole file so a rerun is idempotent; delete a role line to restore its default, and report an unknown or retired role line instead of silently dropping it. Never put role lines in `AGENTS.md` or `CLAUDE.md`.

## Paths

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.dsh/skills/` or `.agents/skills/` in the project, and `$DSH_HOME/skills/` or `~/.agents/skills/` for user skills. Packaged pstack skills live under `<pstack>/skills/`; read them in place. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | The installed `dsh-pstack` package's absolute resource paths. Resolve `references/`, `playbooks/`, and `scripts/` beside their `SKILL.md`. Run a bundled script through `pstack_script` with its registered id — `check-plan`, `watch-pr`, `worktree-audit`, `log`, or `statechart` — passing one string per argument; a relative `cwd` resolves from the Session directory, and `pstack_script` uses the Host's Node runtime, not a shell, so it does not pass through command approval or the filesystem sandbox. Set `background: true` for a long `watch-pr`. Install the package through a DSH profile or bundle; do not scan a plugin cache for the highest version. |
| `.cursor/rules/*.mdc`, always-applied rules | Project instructions in `AGENTS.md`; DSH loads `$DSH_HOME/AGENTS.md`, `<agentsHome>/AGENTS.md`, and the project instruction chain in every new session. DSH never loads `.mdc` files. The pstack role file is the exception: only `pstack_subagent` reads it. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when the package ships that file. The plugin ships `skills/`, `docs/guide/`, and `README.md`. Read the local copy and never fetch it; give the user the public URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | The optional `@deepseek-ai/dsh-experimental-session-search` bundle (experimental, disabled by default). `session_search` finds earlier sessions in the same workspace; `session_event_search`, `session_trace`, `session_event_trace`, and `session_event_read` inspect them. Sessions require exact `cwd` equality. For the current Session, call `session_event_search` with its own id. Do not read a Cursor transcript directory. |

## Cursor-only features

DeepSeek Harness has no Cursor Automations, Bugbot, Cursor cloud agents, or built-in PR tool. When a step needs one, write one line in your reply, `Skipped in DeepSeek Harness: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL, a key, or a machine, leave a placeholder and name it in the line. A skipped step is not a passed step; report unavailable verification separately.

| Cursor | DeepSeek Harness |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. `schedule_create` handles local time-based follow-ups, but it is not a routine and does not receive Cursor webhooks. Never ask for a `SendToUser` secret in chat. A step that exists only for `make-bot-ui`'s routine, sender key, or wake loop is also skipped; an ordinary local page or Tailscale server does not replace that loop. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command that the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps to a local worktree, as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard status or its own machine. |
| A built-in PR tool | Use the forge command that the step gives, such as `gh pr create`. That is not a skip, so write no line. For PR status, checks, review, and merge through DSH, enable the experimental `@deepseek-ai/dsh-experimental-forge-bundle` (disabled by default); otherwise use `gh`. If neither is available, report the blocked forge step. |
