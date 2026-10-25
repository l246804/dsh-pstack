---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects the child model routes this deployment serves and writes `$DSH_HOME/pstack-models.md`, which overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

Write `$DSH_HOME/pstack-models.md`, the role file `pstack_subagent` re-reads on every delegation and that sets pstack's model per role.

That file is the only thing this skill writes. It never touches `package.json`, `cordis.patch.yml`, a native default model, or a credential.

## Steps

### 1. Detect available models

Call `list_subagent_models()` with no arguments to list the LLM providers this deployment serves. Call `list_subagent_models({ provider })` to list that provider's models, then `list_subagent_models({ provider, model })` to list the reasoning efforts that exact model supports.

That adapter metadata is the only dependable source. This deployment decides which routes exist, and only the model's own advertised effort list says whether `max`, `xhigh`, `high`, or `medium` is available. Do not infer an effort ladder from a model id.

When `list_subagent_models` is not available in this session, do not invent a route. Either ask the user for a `provider/model` pair they have already confirmed, or write `inherit-parent` for every role and say plainly that the choices are unverified. Never hardcode a model id, never ask for an API key, and never claim a route works because it looks plausible. `inherit-parent` and `auto` always work because they send no route at all.

### 2. Load current state

The role list and the shape of a value come from this package's `../../docs/pstack-models.example.md`. Read that file. It is generated from the role manifest, so it is the list: do not re-derive role names from memory and never add a role the manifest does not name.

If `$DSH_HOME/pstack-models.md` already exists, read it and treat its `# budget` line and its role values as the current choices, and keep every role the user changed by hand. Otherwise start from the example's `inherit-parent` values. A line whose role is not in the example, such as `how critics`, is from a retired role: list it for the user as retired, then drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Prefer `ask_user_question` over free text. Offer these four options with these exact labels, and name the current budget when the file records one. With no file, say that no budget is recorded yet and that every role currently inherits the parent route.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Keep the route of every role the user set by family, list, or alias (`inherit-parent`, `auto`). Only the effort of a role that already names a route follows the budget. `unlimited`, `large`, `medium`, and `small` target `max`, `xhigh`, `high`, and `medium`.

Apply a target only when that model's own `list_subagent_models({ provider, model })` list contains it. When it does not, use the highest effort at or below the target that the model does advertise, and say which role moved. When nothing at or below the target is advertised, mark the role as needing a choice instead of writing an effort the adapter would reject. `inherit-parent` and `auto` never change, because they carry no effort.

**(c) Show the roles and confirm.** Show every role with its route, marking any route that does not resolve on this deployment as needing a choice. Also list each line step 2 dropped as retired. Ask whether to accept as-is or change specific roles, offering the confirmed routes plus `inherit-parent` and `auto`, which both mean this role runs on the parent chat model. Prefer `ask_user_question` over free text.

For the panel roles (`arena runners`, `architect runners`, `interrogate reviewers`) the value is a list, and `pstack_subagent` starts one child per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but `pstack_subagent` starts one child from it, chosen with `roleIndex`. `swarm workers` is a list as well: its first entry is the default route for every worker, a race passes `roleIndex` to give different arms different entries, and the caller still starts each worker itself. Two entries on the same route are not a cross-model panel; say so instead of implying model diversity.

### 4. Validate

Every route written must be one this deployment serves, and every effort must appear in that exact model's advertised list. `inherit-parent` and `auto` always pass. If a chosen route does not resolve, stop and ask again rather than writing it and hoping the first delegation catches it.

### 5. Write the file

Read the old `$DSH_HOME/pstack-models.md` first, keep the user's own edits, name the retired roles you dropped, and confirm before overwriting. Then write the complete file in one pass, so a re-run of this skill produces the same bytes and converges: a `# budget` line naming the chosen label and its target effort, and one line per role, using the exact role keys from the example.

Read `../../docs/pstack-models.example.md` from this package and write the same shape to `$DSH_HOME/pstack-models.md`, replacing each `inherit-parent` with the route the user confirmed. Do not retype the role keys from this skill: the example is generated from the role manifest, and a hand-written copy would drift from the parser.

### 6. Confirm

Tell the user the file was written and that it applies to the next delegation, because `pstack_subagent` re-reads it every time. A child that already started keeps the route it started with. Re-running this skill updates the file.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill` (its `SKILL.md` is in this package's skill resources). On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /create-formal-verification-skill." On yes, invoke `/create-formal-verification-skill` (its `SKILL.md` is in this package's skill resources). On no, move on without pushing.
