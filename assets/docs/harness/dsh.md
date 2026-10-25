# DSH harness mapping

> This package ships its static assets, one bundled skill provider, the `pstack_subagent` delegation tool, the ported workflow skills and playbooks, and the official worktree integration mounted on demand. Restricted history arrives in a later unit.
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
| `Task` spawn | `pstack_subagent`, which returns a child id and reports by completion notice | mapped | - | Every call starts a managed activation and returns the child id; the result arrives as a completion notice, so nothing polls. A panel role starts one child per configured entry and reports a partial start instead of rolling back. |
| `subagent_type: generalPurpose` | `agent: "general"` | mapped | - | A plain child with no injected preamble. `agent` accepts only the three pstack kinds, never a DSH agent preset id. |
| `subagent_type: poteto-agent` | `agent: "poteto-agent"`, with the preamble injected by the tool | mapped | - | The preamble is read from the packaged asset at an absolute path and the `poteto-mode` instructions path is injected into the brief. A missing preamble blocks that agent type instead of degrading to a plain child. |
| `comment-sicko` subagent | `agent: "comment-sicko"`, briefed read-only | degraded | 3 | The persona preamble is injected, but the no-write rule is brief text rather than a sandbox, so a reviewer's scope still has to be checked. |
| `run_in_background: true` | field removed; children start as activations | mapped | - | `pstack_subagent` takes no background flag: every child is a managed activation and reports through a completion notice. |
| `readonly: true` and `readonly: false` | a no-write constraint in the brief; the field is removed | degraded | 3 | Prose is not a sandbox, so a read-only child has to be checked rather than enforced. |
| `resume` | a fresh child; `send_message` only when state is expensive to move | mapped | - | `pstack_subagent` always starts a fresh child. `send_message` continues a live one; a settled child is never silently resumed. |
| `file_attachments` | real paths listed in the brief | mapped | - | The brief carries real paths; no invented attachment argument exists in the tool schema. |
| `AskQuestion` | `ask_user_question` with `multi_select` | mapped | - |  |
| `TodoWrite` | `todo_write` with the full list; a skipped step stays in `content` | mapped | - |  |
| `Grep`, `Glob`, `Read`, `Shell` | `grep`, `glob`, `read`, `bash` | mapped | - |  |
| built-in `create-skill` | the authoring playbook plus this package's frontmatter, link, and structure checks | degraded | 4 | No Cursor drafting, evaluation, or optimization tool is claimed; the playbook points at the validators this package actually runs. |
| `/name` or the named skill | the `skill` tool for model-invocable skills, `/name` for the rest | mapped | - | The bundled provider lists all 55 skills and loads each body from its absolute path; only `setup-pstack` stays model-invocable, exactly as upstream declares. |

## Paths, models, and host features

| Upstream | DSH | Coverage | Unit | Note |
| --- | --- | --- | --- | --- |
| model slug, reasoning effort, `fast` | `role` resolved from `$DSH_HOME/pstack-models.md` | mapped | - | A role value is `inherit-parent`, `auto`, `<provider>/<model>`, or `<provider>/<model> [effort]`. The effort is validated against the live adapter metadata before a child starts; no model id is hardcoded in the assets. |
| `~/.cursor/rules/pstack-models.mdc` | `$DSH_HOME/pstack-models.md`, read for each new delegation | mapped | - | `/setup-pstack` writes the file and `pstack_subagent` re-reads it on every delegation. An unreadable file is an error, not an empty configuration. |
| `.cursor/skills`, `~/.cursor/skills` | `assets/skills/<name>/SKILL.md` inside this package | mapped | - | Skills ship inside the package and are read in place; nothing is copied into `$DSH_HOME/skills`, and no directory is watched. |
| `~/.cursor/plugins`, `.cursor-plugin` | absolute resource paths inside this package | mapped | - | Each candidate carries its own skill directory as the resource base, so `references/` and `scripts/` resolve next to `SKILL.md`. |
| `~/.cursor/projects/.../agent-transcripts` | restricted `sessionQuery` reads | deferred | 5 | The history unit owns the query path and its permissions. |
| agent store | `.audit/<task-slug>/` or a directory the user names | mapped | - |  |
| `paths:` auto-attach globs in SKILL.md | not consumed; skills load by explicit invocation | degraded | not planned | Automatic attachment by file glob has no equivalent, so `typescript-best-practices` stays an explicit invocation. |
| Custom Mode | an explicit `/poteto-mode` on each new task | degraded | 4 | No persistent mode or keyboard shortcut exists. The ported skills say so at the step where a mode would have applied. |
| `/loop` | `create_goal`, plus `schedule_create` where a timed input fits | deferred | 6 | Goal and schedule integration lands with the long-running workflows. |
| Cursor Automations, `update_state`, `SendToUser` | not mapped; routine-style automation is excluded | excluded | 5 | `schedule_create` is not a webhook routine, and secrets are not requested. |
| cloud agent, `cloud_base_branch`, dashboard | a local child with a real `cwd`, started from a local branch or a prepared checkout | degraded | 3 | No VM, cross-device resume, or dashboard is promised. Isolation is the official worktree checkout, which does not cover ports, credentials, or services. |
| `deslop` | `/no-comments` plus one read-through of the diff | degraded | 4 | It is not the same skill under a new name; the diff read-through replaces the plugin. |
| `control-ui`, `control-cli` | a project verification skill or an existing driver | degraded | 4 | Without a driver the verification result stays unproven, and reading source is not accepted as a substitute. |
| Bugbot | triage of review comments already on a pull request | preserved | 4 | Starting or configuring Bugbot is out of scope; existing review threads are read as ordinary data. |
| built-in pull request tool | resolved `gh`, or an `origin` CLI that is actually available | degraded | 4 | A forge path has to be resolved before the shipping steps can run; there is no built-in PR tool. |
| image generation, `/visualize` | Mermaid, existing screenshots, or a real renderer | degraded | 4 | No image is fabricated when none can be rendered, and a read-only capture stays read-only. |
| worktree isolation | the official worktree rows, mounted by this bundle when the profile lacks them | mapped | - | Two rows mount on demand inside the composed profile and are skipped when an equivalent row is already enabled, so the `worktrees` service is provided exactly once. Isolation covers the working directory and branch only: not ports, network, credentials, caches, or services. The four profile paths are not yet verified at runtime. |
| the `/make-bot-ui` skill | excluded from the port | excluded | 1 | It targets Cursor's Grok Bot webhook and Tailscale flow, and there is no equivalent host feature. |
