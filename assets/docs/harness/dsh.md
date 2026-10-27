# pstack in DeepSeek Harness

pstack skills keep upstream wording. They say `Task`, `readonly: true`, and
`~/.cursor/rules/pstack-models.mdc`, because that is what pstack says for Cursor.
Read this file once per session, then map each Cursor name with the tables below. If a
Cursor field has no row, drop it and say so in your reply. Never pass a field or a value
this host's tool schema rejects.

The generator applies four mechanical transforms and nothing else: it narrows frontmatter
to the fields this host reads, repoints a relative link that would leave the shipped tree,
inserts the pointer you followed here under the H1 of each skill that uses a Cursor name,
and copies this file into `assets/`. Everything a skill says about the host is translated
at read time, here.

## Tools

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` and `Task` subagents | `pstack_subagent`. Every call starts one child per activation and returns its id; the report arrives as a completion notice, so nothing polls. Never start a child to run the playbook itself. |
| `subagent_type: "generalPurpose"` | `agent: "general"`. A plain child with no injected preamble. |
| `subagent_type: "poteto-agent"` | `agent: "poteto-agent"`. The tool injects that preamble itself and puts the `poteto-mode` instructions path into the brief. |
| `poteto-agent` and `comment-sicko` | `agent: "poteto-agent"` and `agent: "comment-sicko"`. These are this package's three brief kinds; they are not host agent preset ids. To run a child under a host preset, the row has to configure an allowlist and you pass the separate `agentPreset` argument. |
| `comment-sicko` subagent | `agent: "comment-sicko"` and brief it read-only in words. The no-write rule is brief text, not a sandbox, so check `git status` after the child reports. |
| `readonly: true` | Drop the field and state the no-write constraint in the brief. Prose is not a sandbox, so a read-only child has to be checked rather than trusted. |
| `readonly: false` | Drop it. A child gets the session's tools unless the brief narrows them. |
| `run_in_background: true` | Drop it. There is no background flag: every child is a managed activation that reports through a completion notice. |
| `resume` | Start a fresh child. Use `send_message` or resume only when the state that would move is expensive: its checkout, its uncommitted work, or a process it still runs. A settled child is not silently resumed, and a stop order is not reuse. |
| `file_attachments` | List the real paths in the brief. No attachment argument exists. |
| `environment: "local"` | Drop it. Every child is local. |
| `environment: "cloud"` | Name the working directory and the branch. Isolation is a real `cwd` in its own checkout, not a separate machine. |
| `cloud_base_branch: <b>` | Tell the child to check out `<b>` first, or pass the checkout path as its `cwd`. |
| `AskQuestion` | `ask_user_question`, which takes `multi_select` for a choice. |
| Opening a todolist | `todo_write` with the full list. A step you skip stays in the list with a one-line `skip: <reason>`. |
| `Grep`, `Glob`, `Read`, `Shell` | `grep`, `glob`, `read`, `bash`. |
| Running another pstack skill (the **name** skill, or `/name`) | Load it with the `skill` tool when it is model-invocable; otherwise read `SKILL.md` at its absolute resource path and follow it. A bare `**name**` or `/name` only works for a skill the catalog offers, and most pstack skills are invoked by name rather than by the model. |
| `MCP` servers and tools | The session's own tool list. There is no MCP directory to inspect, and narrowing a child's tool set can strip the evidence its brief depends on, so name the tools a child must keep instead of assuming a preset is safe. |

## The pstack CLIs

pstack ships five CLIs, and they run through `pstack_script` rather than a shell.

| Cursor | DeepSeek Harness |
| --- | --- |
| `bun` running `poteto-mode/scripts/` | `pstack_script` with `id` from the shipped manifest. Every artifact is one dependency-free Node module launched on the Host's own runtime, so no `bun`, `bash`, or `node` on `PATH` is needed. |
| `scripts/log.sh <logfile> <phase> <decision> <why> <evidence> <result>` | `pstack_script` with `id: "log"` and those six arguments. Same columns, same header-once rule, same escaping. |
| `scripts/worktree-audit.sh [-b <ref>] [repo-path]` | `pstack_script` with `id: "worktree-audit"`. `-b` reads as its first argument. |
| `node pstack/skills/poteto-mode/scripts/check-plan.mjs <plan.md>` | `pstack_script` with `id: "check-plan"` and `args: ["<plan.md>"]`. |
| `scripts/snapshot.sh` in a decision-log example | An example row naming evidence kinds, not a shipped helper. Name the real command your project uses for that evidence. |

`pstack_script` goes through no command approval and no sandbox policy. Say so when a
step depends on that difference, because the caller cannot see it happen. `background:
true` needs the Host jobs service and is refused with a reason when the composition has none.

## Models and effort

| Cursor | DeepSeek Harness |
| --- | --- |
| `~/.cursor/rules/pstack-models.mdc` | `$DSH_HOME/pstack-models.md`. `/setup-pstack` writes it and `pstack_subagent` re-reads it on every delegation, so an edit reaches the next child and never one that already started. An unreadable file is an error, not an empty configuration. |
| A `claude-*`, `grok-*`, or `gpt-*` model slug | Nothing. Pass `role: "<role key>"` and let the role line supply the route. No model id is hardcoded in the assets, and this package cannot know which routes a deployment serves, so an invented slug fails the call before any child starts. |
| `model: "claude-opus-5-5-xhigh"` in a table below a role | The role line's value, not the slug. The tables in the skills name their intended default; the role file decides, and `.example.md` shows the shipped defaults. |
| `inherit-parent` or `auto` | Both mean the same thing: send no route for that child and it runs on the parent. A role the file does not name inherits the parent too. |
| `-fast` speed variants, and "fast or standard speed" | There is no speed parameter. Drop the phrase and keep the effort instruction. |
| "Pick each subagent's reasoning level", "raise it one step" | `reasoningEffort` on the same call, per delegation. The role line is where the role starts, not a ceiling or a floor. One step is the adjacent entry in the model's own effort list, which the adapter reports from least to greatest; never infer a token from a model id. A child can lower or raise its own with `set_reasoning_effort`, which applies from its next step. |
| "If the Task tool rejects a slug, use the default" | A refusal lists that model's real efforts. Read the refusal instead of guessing a token, and report the route each child resolved. |
| A panel role: a list of models, one child per entry | The same thing, spelled as a comma-separated role line. Two entries on one route are not a cross-model review, and `pstack_subagent` says so in its result. Pass `roleIndex` to pick one entry for a race arm or a cross-judge. |

`/setup-pstack` writes the file. Follow its steps with these changes. Detect by the routes
this deployment serves and each model's advertised effort list. Write one line per role as
`<provider>/<model> [effort]`, which splits at the first `/` so a model id may keep its own
vendor prefix. Overwrite the whole file and an unreadable file is an error, not an empty
configuration. The budget line targets an effort; apply it only to routes that advertise it
and otherwise use the highest advertised effort at or below the target, saying so.

## Paths

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.dsh/skills/` for project skills, or this package's `assets/skills/<name>/` for the ported ones, which are read in place and never copied. |
| `.cursor/plugins/`, `.cursor-plugin/plugin.json` | Absolute resource paths inside this package. Each skill carries its own directory as the resource base, so `references/`, `scripts/`, and `playbooks/` resolve next to `SKILL.md`. |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md` for project instruction, and `$DSH_HOME/pstack-models.md` for the role file. Nothing else is loaded into every session. |
| `agent-transcripts/` in `~/.cursor/projects/<slug>/` | `pstack_history`, a restricted read of raw session events over the calling session and its reviewable direct children. There is no transcript directory, and an arbitrary session id is refused rather than opened. |
| A cross-session search through transcripts | The official session-search bundle's tools, mounted only when the profile enables it. `pstack_history` does not substitute for it. Without the bundle, the cross-session half of a step is unavailable and a step that needs it says so instead of presenting it as done. |
| `agent store`, a per-agent directory named in the system prompt, outside the repository | `.audit/` in the repository, stated in a prompt context so a child knows the path without being told. Plans, decision trails, and orchestration state go under it. What is lost is durability: nothing resumes from `.audit/` on its own, so a resumed child is handed its instructions again rather than told to re-read them. The operator's named directory wins. |
| `Projects` | No container for long runs exists. A run is this Session plus whatever the goal and reminder rows carry. |
| A relative link that leaves the shipped tree | The generator repoints it, so the link you are reading already resolves inside the package. |

## Host features

| Cursor | DeepSeek Harness |
| --- | --- |
| `AskQuestion` in a plan-mode step | `ask_user_question`. Reserve it for a product or preference call no experiment can settle. |
| Custom Mode, and "keep `/poteto-mode` on for the whole chat" | Type `/poteto-mode` on each new task. The skill attaches to the task that invoked it and nothing keeps it in context afterwards, so there is no persistent mode and no keyboard shortcut. |
| `/loop <duration>` and "arm a tick" | `create_goal` carries a predicate across rounds for automatic continuation, and `schedule_create` is a timed heartbeat that delivers a follow-up into this Session. Neither watches a PR or CI, a reminder refuses a delegated caller, and a goal can be created while the profile mounts no round driver, so the run then stops unless a background job's settlement wakes it or you poll and say that you are polling. |
| Automations, routines, `update_state`, `SendToUser` secret requests, automation packs | Not carried. There is no webhook ingress, no routine id, and no wake call. A scheduled input is a cron job or a `schedule_create` reminder, and a step that needs a routine is skipped with one line naming it. |
| Bugbot, and a review-aware wait for it | Review comments already on a PR are ordinary data: triage them with the forge command the step gives, and treat an Absent Bugbot check as absent rather than as pending. Starting or configuring Bugbot is out of scope. |
| A cloud agent, its dashboard, and its own machine | A local child in its own checkout. Worktree isolation covers the working directory and branch only, so name which of ports, caches, credentials, and services each lane still shares, and remember that every child ends with the host process. |
| A built-in PR tool | Resolve the forge once: `gh`, or `origin` when it can resolve the repository. That resolution is a required step, not a fallback. |
| `/visualize`, and a generated-image step | A Mermaid diagram, an existing screenshot, or a real renderer the project ships. When none can produce the image, say so and leave the figure out rather than fabricating one. A read-only capture stays read-only. |
| `cursor-team-kit`, `control-ui`, `control-cli`, `create-skill`, and `/deslop` | None of these plugins can be installed here. Use a project verification skill that `create-verification-skill` builds, or a driver the repo already ships; a surface with no driver is a gap you report rather than a pass you claim. Author skills through the `authoring-a-skill` playbook, which carries this host's frontmatter, link, and structure rules. Before a commit, read the whole staged diff back once instead of running a stripping plugin, and run `/no-comments` before review. |
| worktree isolation, "give parallel work its own machine" | The official worktree rows this bundle mounts when the profile lacks them. Two writers get two checkouts, not two machines. |
| `make-bot-ui` | Not carried. Its webhook routine and secret-request loop have no equivalent host feature, so the skill is not shipped and the two sentences that linked it are dropped from the tree. |

## When a step cannot run

Say so at the step, in one line, and continue with what the step was for.

- `Skipped in DeepSeek Harness: <step>. <reason>.` A step that needs a routine, a cloud
  machine, Bugbot's setup, a control skill, or a rendered image has no equivalent.
- If a later step needed what the skipped one produced, such as a URL, an id, or a key,
  leave a named placeholder instead of inventing one.
- A skipped step is never a silent one, and an unverified step is reported as unverified
  rather than as passed.

## What the gate enforces

`check-adapter.ts` derives the rows this file owes from the prose that actually ships. Add
a skill that says `Task` or `/loop`, and the build fails until this file answers for it; the
failure names the row and what a reader loses without it. There is no hand-maintained list
of differences to fall out of date, which is what makes this file the only place a
divergence is written down.
