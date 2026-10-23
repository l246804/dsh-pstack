---
name: setup-pstack
description: "Configure which routes pstack uses per role and at what reasoning budget. Writes ~/.dsh/pstack-models.md, the role file every pstack skill reads. Use for /setup-pstack, \"configure pstack models\", \"pstack budget\", or changing pstack's model choices."
---

# Setup pstack

Write `~/.dsh/pstack-models.md`, the role file that sets pstack's route per role.

## Steps

### 1. Detect available routes

If the active profile exposes `list_subagent_models`, call it with no arguments to list registered LLM providers, then call it with each provider id to list that provider's models and their reasoning efforts. That is the dependable source when it is available. Never write a provider or model you have not confirmed is available. The value `inherit-parent` is always valid and means the child runs on the parent chat's route.

If `list_subagent_models` is unavailable, ask the user for the provider/model pairs they can use, or fall back to `inherit-parent` for every role and say so.

### 2. Load current state

If `~/.dsh/pstack-models.md` exists, read its `# budget` line and role values and treat them as current choices. Otherwise start from the defaults in step 5. A role not in step 5 is retired; drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Use `ask_user_question` with these four labels. Name the current budget when the file records one. With no file, say that `large` matches the skill defaults.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the defaults. On a re-run, keep any role you changed by family, list, or the `inherit-parent` alias. `unlimited`, `large`, `medium`, and `small` set the effort token of every real route, panel entries included, to `max`, `xhigh`, `high`, or `medium`. The target effort ladder is `max` > `xhigh` > `high` > `medium` > `low` > `minimal` > `off`. If a detected model does not support its target effort, choose the highest supported effort at or below the target. For example, when `xhigh` is unavailable but `high` is supported, use `high`. If no supported effort meets the target, mark the role as needing a choice. `inherit-parent` does not change.

**(c) Show the roles and confirm.** Show every role with its route, marking any real route not in the detected set as needing a choice. Also list each line step 2 dropped. Use `ask_user_question` to ask whether to accept as-is or change specific roles, offering the detected routes plus `inherit-parent`. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a comma-separated list, and one child runs per entry. `arena cross-judge pool` is also a list. `swarm workers` is the default route for every worker.

### 4. Validate

Every real route written must be in the detected set. `inherit-parent` always passes. If a chosen route is not available, stop and ask again.

### 5. Write the file

Write `~/.dsh/pstack-models.md` with a `# budget` line and one line per role. Overwrite the whole file so re-runs stay idempotent.

```text
# pstack model configuration. One line per role. Delete a line to inherit the parent route.
# Value: inherit-parent | <provider>/<model> [effort]
# budget: large (xhigh)
feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: inherit-parent
hardest tasks: inherit-parent
how explorer: inherit-parent
how explainer: inherit-parent
why investigators: inherit-parent
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: inherit-parent, inherit-parent
arena cross-judge pool: inherit-parent, inherit-parent
swarm workers: inherit-parent
architect runners: inherit-parent, inherit-parent
interrogate reviewers: inherit-parent, inherit-parent
```

### 6. Confirm

Tell the user the file was written and that it applies to the next `pstack_subagent` call, including in this session. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill`. On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill. If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /create-formal-verification-skill." On yes, invoke `/create-formal-verification-skill`. On no, move on without pushing.
