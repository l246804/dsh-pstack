# DSH harness mapping

> This package ships its static assets plus one bundled skill provider. Delegation, restricted history, and the worktree integration arrive in later units.
> The tables below are the target contract, not proof that a capability is installed in a profile.

Generated from `scripts/capabilities.ts` into `assets/docs/harness/dsh.md`. Edit the table, not this file.

## Coverage

- `mapped`: DSH has a direct equivalent, and the port keeps the upstream intent.
- `degraded`: DSH has a partial equivalent, and the row states what is lost.
- `preserved`: the upstream behavior stays as written, inside its narrower scope.
- `excluded`: the feature is not carried, and every skill that needs it is adapted.
- `deferred`: a later unit delivers it, and `Unit` names that unit.

A row without `mapped` carries a reason and a delivery unit. A numeric unit names when the
capability lands; `not planned` marks a gap this port does not close. Neither is evidence
about this tree.

## Tools and fields

| Upstream | DSH | Coverage | Unit | Note |
| --- | --- | --- | --- | --- |
| `Task` spawn | `pstack_subagent`, which returns a child id and reports by completion notice | deferred | 3 | The tool is built in the delegation unit; the ship-date text still describes Task. |
| `subagent_type: generalPurpose` | `agent: "general"` | deferred | 3 | Agent presets arrive with the delegation unit. |
| `subagent_type: poteto-agent` | `agent: "poteto-agent"`, with the preamble injected by the tool | deferred | 3 | The preamble injection is part of the delegation unit. |
| `comment-sicko` subagent | `agent: "comment-sicko"`, kept read-only | deferred | 3 | The comment-review child needs the delegation unit before it can run. |
| `run_in_background: true` | field removed; children start as activations | deferred | 3 | Field removal lands with the delegation text patches. |
| `readonly: true` and `readonly: false` | a no-write constraint in the brief; the field is removed | degraded | 3 | Prose is not a sandbox, so a read-only child has to be checked rather than enforced. |
| `resume` | a fresh child; `send_message` only when state is expensive to move | deferred | 3 | The continuation policy is delivered with the delegation unit. |
| `file_attachments` | real paths listed in the brief | deferred | 3 | Attachment handling is rewritten together with the delegation text. |
| `AskQuestion` | `ask_user_question` with `multi_select` | mapped | - |  |
| `TodoWrite` | `todo_write` with the full list; a skipped step stays in `content` | mapped | - |  |
| `Grep`, `Glob`, `Read`, `Shell` | `grep`, `glob`, `read`, `bash` | mapped | - |  |
| built-in `create-skill` | the authoring playbook plus DSH validation | degraded | 4 | No Cursor drafting, evaluation, or optimization tool is claimed. |
| `/name` or the named skill | the `skill` tool for model-invocable skills, `/name` for the rest | mapped | - | The bundled provider lists all 55 skills and loads each body from its absolute path; only `setup-pstack` stays model-invocable, exactly as upstream declares. |

## Paths, models, and host features

| Upstream | DSH | Coverage | Unit | Note |
| --- | --- | --- | --- | --- |
| model slug, reasoning effort, `fast` | `role` resolved from `$DSH_HOME/pstack-models.md` | deferred | 3 | Route resolution belongs to the role unit; no model id is hardcoded in the assets. |
| `~/.cursor/rules/pstack-models.mdc` | `$DSH_HOME/pstack-models.md`, read for each new delegation | deferred | 3 | Reading the role file is part of the role unit. |
| `.cursor/skills`, `~/.cursor/skills` | `assets/skills/<name>/SKILL.md` inside this package | mapped | - | Skills ship inside the package and are read in place; nothing is copied into `$DSH_HOME/skills`, and no directory is watched. |
| `~/.cursor/plugins`, `.cursor-plugin` | absolute resource paths inside this package | mapped | - | Each candidate carries its own skill directory as the resource base, so `references/` and `scripts/` resolve next to `SKILL.md`. |
| `~/.cursor/projects/.../agent-transcripts` | restricted `sessionQuery` reads | deferred | 5 | The history unit owns the query path and its permissions. |
| agent store | `.audit/<task-slug>/` or a directory the user names | mapped | - |  |
| `paths:` auto-attach globs in SKILL.md | not consumed; skills load by explicit invocation | degraded | not planned | Automatic attachment by file glob has no equivalent, so `typescript-best-practices` stays an explicit invocation. |
| Custom Mode | an explicit `/poteto-mode` on each new task | degraded | 4 | No persistent mode or keyboard shortcut is simulated. |
| `/loop` | `create_goal`, plus `schedule_create` where a timed input fits | deferred | 6 | Goal and schedule integration lands with the long-running workflows. |
| Cursor Automations, `update_state`, `SendToUser` | not mapped; routine-style automation is excluded | excluded | 5 | `schedule_create` is not a webhook routine, and secrets are not requested. |
| cloud agent, `cloud_base_branch`, dashboard | a local child with real completion state and worktree isolation | degraded | 3 | No VM, cross-device resume, or dashboard is promised. |
| `deslop` | `/no-comments` plus one read-through of the diff | degraded | 4 | It is not the same skill under a new name. |
| `control-ui`, `control-cli` | a project verification skill or an existing driver | degraded | 4 | Without a driver the verification result stays unproven. |
| Bugbot | triage of review comments already on a pull request | preserved | 4 | Starting or configuring Bugbot is out of scope for the first release. |
| built-in pull request tool | resolved `gh`, or an `origin` CLI that is actually available | degraded | 4 | A forge path has to be resolved before the shipping steps can run. |
| image generation, `/visualize` | Mermaid, existing screenshots, or a real renderer | degraded | 4 | No image is fabricated when none can be rendered. |
| worktree isolation | the official worktree integration | deferred | 4 | Parallel-write playbooks need it before they can run. |
| the `/make-bot-ui` skill | excluded from the port | excluded | 1 | It targets Cursor's Grok Bot webhook and Tailscale flow, and there is no equivalent host feature. |
