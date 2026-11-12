# pstack in DeepSeek Harness

pstack skills use Cursor names. In DeepSeek Harness, read this file once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/` in the installed `dsh-pstack` package. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

## Tools

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` | `pstack_subagent`, provided by this package. It starts one fresh child per selected route, and one per automatic panel entry, then returns every child id with its resolved route. Results arrive as completion notices; do not poll. Every argument is required except `maxDepth`: `description` (a short non-empty label shown in notices), `prompt` (the complete self-contained brief, non-empty; the child does not see this conversation), `agent` (`"poteto-agent"`, `"comment-sicko"`, `"readonly"`, or `"general"`), `role` (an exact pstack role key, or `null` to inherit the parent route), `roleIndex` (a non-negative integer or `null`; only for a list role that is not an automatic panel, and it requires a non-null `role`), `reasoningEffort` (one advertised effort token with no whitespace, or `null` to keep the role's starting effort), and `cwd` (a directory inside the session or a separate Git worktree, or `null` to inherit the session directory). `maxDepth` is optional: omit it or pass `null` to use the configured row and Host cap, or pass an integer of at least 1 that cannot exceed that cap. It validates every route and effort before the first child starts; a later failure returns a partial result. |
| `AskQuestion` | `ask_user_question`. It takes a `questions` array with options, `multi_select`, and free input. Only a live root agent has a human answerer, so a delegated child keeps its questions in its report. |
| Open a todolist | `todo_write`. Each call replaces the entire list, so resend every item with its status at each phase. Statuses are `pending`, `in_progress`, and `completed`; keep a skipped step visible as `skip: <reason> - <step>` in its `content` with status `completed`. |
| Run another pstack skill (`/name` or "the **name** skill") | `pstack_skill` with the exact kebab-case `name`. This package registers its bundled skills into the session catalog through `dsh-skill-filesystem` `bundledSkillDir` providers (`pstack`, `pstack-vendored`, `pstack-authored`), and `pstack_skill` loads any pstack skill by name even when `disable-model-invocation: true` hides it from the native `skill` tool, because it reads the invocation-neutral skill registry instead of the model catalog. Pass a relative `resource` to read one reference or playbook beside `SKILL.md`; the path cannot leave the skill directory. User commands keep their plain names, such as `/setup-pstack`; DSH adds no `pstack:` prefix. |
| `Grep`, `Glob` | `grep` and `glob` are native tools; call them directly. `grep` uses ripgrep syntax, and both report where an over-limit result was saved. Use `read` for a known file and `bash` for shell commands. Use `bash` with `rg` only when the session has neither search tool. |

## Subagent fields

| Cursor | DeepSeek Harness |
| --- | --- |
| `subagent_type: generalPurpose` | `agent: "general"`. This plain child joins the parent agent preset and inherits its tools. Every `pstack_subagent` call must also pass `description`, `prompt`, `role`, `roleIndex`, `reasoningEffort`, and `cwd`; only `maxDepth` is optional. Pass `null` for `role`, `roleIndex`, `reasoningEffort`, or `cwd` when unused. `roleIndex` requires a non-null role. A non-null `cwd` must be inside the session directory or a separate Git worktree. |
| `poteto-agent`, `comment-sicko` | `agent: "poteto-agent"`, `agent: "comment-sicko"`. The package declares both as `@deepseek-ai/dsh-agent-preset` rows. `poteto-agent` injects the pstack persona and the absolute `poteto-mode` instruction path; `comment-sicko` mounts the comment reviewer. These are agent presets, not `subagent_type` values. |
| `readonly: true` | `agent: "readonly"`. The readonly preset mounts the read-only sandbox policy; file writes and write-capable shell commands are denied while reads and queries remain available. |
| `readonly: false` | `agent: "general"`. The child keeps the parent's tools, including mounted MCP tools. |
| `environment: "cloud"` | The plugin does not change this row. DSH runs no cloud agents; the local equivalent is a separate worktree. Requires enabling `@deepseek-ai/dsh-experimental-tool-worktree` (also shipped inside `@deepseek-ai/dsh-experimental-forge-bundle`), whose `create_worktree` tool makes the branch and checkout. Pass that checkout as the child's `cwd` and name the branch or commit. Only the checkout and branch are isolated. Without the bundle, skip a step that needs a cloud VM, its dashboard, or its own machine. |
| `environment: "local"` | `cwd: null`. The child inherits the session directory. |
| `cloud_base_branch: <b>` | `create_worktree({ from: "<b>" })`, or tell the child to check out `<b>` first. `from` resolves local refs only and does not fetch. |
| `run_in_background: true` | Omit. Every `pstack_subagent` activation is managed and reports by completion notice; there is no background flag. |
| `resume` | Send `send_message` to the existing child id. An idle continuable child cold-resumes; a running child receives the message at its next step. |
| `file_attachments` | List the real paths in `prompt`; the child reads them with `read`. There is no attachment argument. |

## Models

| Cursor | DeepSeek Harness |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | Never pass a Cursor slug to `pstack_subagent`. Pass `role: "<role key>"`. `pstack_subagent` reads `$DSH_HOME/pstack-models.mdc` on every delegation and supplies the exact `<provider>/<model> [effort]` route. Drop `-fast`; DSH has no speed parameter. Run `pstack_models` to see the routes this deployment actually serves. A call may override the role's starting effort with `reasoningEffort`, using a token the target model advertises. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | Pass `role: null` so the child inherits the parent route, and say so. A role line with `inherit-parent` or `auto` does the same. |
| `auto` or `inherit-parent` | Pass `role: null`, or write the role value as `inherit-parent` or `auto`. `pstack_subagent` sends no route override. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | `$DSH_HOME/pstack-models.mdc`, where `$DSH_HOME` defaults to `~/.dsh`. This is the one file the plugin reads that base DSH never loads: base DSH has no `.mdc` rules and no `rules/` directory, so `pstack_subagent` re-reads this file on every delegation instead. An edit affects the next child, never a running child. A missing file makes every role inherit the parent route; an unreadable file is an error; a malformed line is reported at its line number. Role names come from the pstack role manifest; `pstack_roles` lists them. |
| A role value `<model> <effort>`, such as `opus high` | `<provider>/<model> [effort]`, such as `provider/model [high]`. Split at the first `/`. The bracketed effort must be a token the model advertises. A comma-separated value is a list. `arena runners`, `architect runners`, and `interrogate reviewers` are automatic panels that start one child per entry. `arena cross-judge pool` and `swarm workers` select one entry by `roleIndex` (null selects the first). `swarm workers` is the default route for every worker unless a race assigns one per arm. For `arena cross-judge pool`, skip `inherit-parent` and `auto` and prefer a family other than the parent's. Call `pstack_roles` first when a role may hold a list. |

## setup-pstack

`setup-pstack` writes `$DSH_HOME/pstack-models.mdc`, the role file `pstack_subagent` reads on every delegation. Run `pstack_models` first. It reports the live providers, models, and reasoning-effort tokens instead of inferring routes from Cursor slugs. The pstack tab on the Web Plugins settings page edits the same file; the last write wins, and the next delegation uses it without a restart.

- Detect. Enumerate the routes `pstack_models` returns. Write each real route as `<provider>/<model> [effort]`. The effort must be one that route advertises. If nothing is detectable, ask the user to paste the routes. Never write an unconfirmed one. `inherit-parent` and `auto` are always valid.
- Defaults. Map each default Cursor slug with the Models rows. Apply the budget to the effort token: `unlimited`, `large`, `medium`, and `small` target `max`, `xhigh`, `high`, and `medium`. If a model has no such token, choose the highest advertised effort at or below the target and say so. If every advertised effort is above the target, ask the user to choose a route. If it advertises no effort at all, keep the route without a bracketed effort and say so.
- Write. Write `$DSH_HOME/pstack-models.mdc` with no frontmatter, then the comment lines, the `# budget:` line, and one line per role. Overwrite the whole file so a rerun is idempotent. Delete a role line to make that role inherit the parent route. Report an unknown or retired role line at its line number, omit it from the new file, and tell the user. Never put role lines in `AGENTS.md` or `CLAUDE.md`.

## Paths

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | Project skills live in `.dsh/skills/` or `.agents/skills/`; user skills live in `$DSH_HOME/skills/` or `~/.agents/skills/`. Packaged pstack skills live under `<pstack>/skills/` and load through `pstack_skill`; read relative resources in place. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | The installed `dsh-pstack` package's absolute resource paths. Resolve `references/`, `playbooks/`, and `scripts/` beside their `SKILL.md`. Bundled scripts keep their declared interpreter (`node`, `bun`, `bash`, `sh`) and run from the shell; the plugin does not wrap them. Install the package through a DSH profile or bundle. A plugin's manifest is the `dsh` section of its `package.json`; there is no `.cursor-plugin/plugin.json` equivalent. |
| `.cursor/rules/*.mdc`, always-applied rules | The `AGENTS.md`-compatible instruction chain. Base DSH never reads `.mdc` files and has no `rules/` directory. Each session loads the project `AGENTS.md`/`AGENTS.local.md` (`CLAUDE.md`/`CLAUDE.local.md` accepted) plus `$DSH_HOME/AGENTS.md`. The pstack role file `$DSH_HOME/pstack-models.mdc` is the one exception: only `pstack_subagent` reads it. See Models and setup-pstack. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when the package ships that file. Read the local copy and never fetch it. Give the user the public URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | The optional `@deepseek-ai/dsh-experimental-session-search` bundle (experimental, disabled by default). `session_search` finds earlier Sessions whose `cwd` exactly matches the current Session's `cwd`. `session_event_search`, `session_trace`, `session_event_trace`, and `session_event_read` inspect them. For the current Session, call `session_event_search` with its own id. Do not read a Cursor transcript directory. |

## Cursor-only features

DeepSeek Harness has no Cursor Automations, Bugbot, Cursor cloud agents, or built-in PR tool. When a step needs one, write one line in your reply, `Skipped in DeepSeek Harness: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL, a key, or a machine, leave a placeholder and name it in the line. A skipped step is not a passed step. Report unavailable verification separately.

| Cursor | DeepSeek Harness |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. `schedule_create` handles local time-based follow-ups, but it is not a routine and does not receive Cursor webhooks. Never ask for a `SendToUser` secret in chat. A step that exists only for `make-bot-ui`'s routine, sender key, or wake loop is also skipped. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command that the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps to a local worktree, as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard status or its own machine. |
| A built-in PR tool | Use the forge command that the step gives, such as `gh pr create`. That is not a skip, so write no line. For PR status, checks, review, and merge through DSH, enable the experimental `@deepseek-ai/dsh-experimental-forge-bundle` (disabled by default). Otherwise use `gh`. If neither is available, report the blocked forge step. |
| Cursor Projects | Skipped in DeepSeek Harness: Run a persistent Cursor Project with cloud child agents that continue after the laptop closes. DeepSeek Harness has no Cursor Project service or cloud coordinator. Local agent teams and workflows are not an equivalent replacement. |

## Local replacements

| Cursor | DeepSeek Harness |
| --- | --- |
| `create-skill` | Use the vendored `writing-for-agents` skill to create or review a skill, then write and validate its `SKILL.md` directly. |
| `/deslop` | Use the vendored `deslop` skill. It removes AI-generated code slop from a diff; `unslop` is only for prose. |
| `/loop` | Use `create_goal` for automatic continuation, `schedule_create` for a timed heartbeat, or a background `bash` watcher for observable events. These tools do not subscribe to forge events. |
| `/automate` | Use `writing-for-agents` to create a personal skill from verified work patterns. When historical evidence is needed, use the session-search fallback in Optional plugins. |
| Custom Mode | Select the shipped `poteto-mode` root preset for the standard tool surface, or `poteto-mode-creator` for the Creator tool surface, at session creation. Both keep the full skill in the system prompt for the whole session. If the session uses another preset, invoke `/poteto-mode` on each task. |
| `/visualize` | Use Mermaid for diagrams. DSH has no built-in chart renderer, so return the Mermaid text and do not claim an image. |
| `statechart` | Use Mermaid for the chart. DSH has no built-in SVG renderer, so ignore the `references/render.md` render step, return the `chart.mmd` text, and do not claim an image. |
| `ketchup-video` | A renderer the skill supplies is allowed: if the skill's own script or project code renders a video, run it and hand over the resulting mp4 (or other artifact) so the user can open and check it. Only when no verifiable artifact is produced, fall back to the text summary and say so; never claim a rendered video you cannot show. |
| `control-ui`, `control-cli`, and `cursor-team-kit` | The package vendors `control-ui` and `control-cli` as instruction skills. Their browser and PTY requirements are stated in their own `SKILL.md`; enable `@deepseek-ai/dsh-browser-use` or the experimental persistent terminal bundle when those dependencies are required. Keep unavailable GUI or video evidence marked as skipped. |

## Optional plugins

The following DSH plugins are disabled by default. Enable a package through the Plugins page or `dsh plugin --profile <profile> add <package>`, then restart the profile if required. A disabled plugin does not make a dependent step pass.

| Plugin packages | Capability when enabled | When not enabled |
| --- | --- | --- |
| `@deepseek-ai/dsh-experimental-forge-bundle` | PR panels, checks, reviews, ready state, merge, Session binding, and the model-side `create_worktree` tool. | Use `gh` or `git worktree add` through `bash`. |
| `@deepseek-ai/dsh-browser-use` and one browser provider | Browser navigation, input, screenshots, and ARIA snapshots. | Use project-owned browser scripts; otherwise mark browser evidence as skipped. |
| `@deepseek-ai/dsh-cua-bundle` | macOS desktop application control and screenshots. | Use a project-owned desktop driver; otherwise mark desktop evidence as skipped. |
| `@deepseek-ai/dsh-experimental-terminal-bundle` | Persistent PTY tools for CLI and TUI verification. | Run foreground commands or background jobs through `bash`. |
| `@deepseek-ai/dsh-experimental-session-search` | Session history search and event inspection. | Use a resume note or evidence supplied by the user. |
| `@deepseek-ai/dsh-mcp-client` | Configured MCP tools. | Inspect local files and use standard search or fetch tools. |
| `@deepseek-ai/dsh-experimental-agent-team-profile` | Lead and teammate roles and a shared task board. | Do not enable Agent Teams in a profile that offers the pstack root presets. Both own delegation and task coordination; the pstack root preset fails at startup when the Agent Teams service is present, so never enable both. |
| `@deepseek-ai/dsh-experimental-ralph-bundle` | A foreground `ralph` loop with a structured handoff. | Use `create_goal` with `schedule_create` or a background `bash` watcher. |
