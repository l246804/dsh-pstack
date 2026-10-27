# pstack per-role model configuration
#
# `/setup-pstack` writes this file to `$DSH_HOME/pstack-models.md`. `pstack_subagent`
# re-reads it on every delegation, so an edit reaches the next child and never a child
# that already started.
#
# One line per role. The key must match a role in the manifest exactly, commas
# included. Delete a line to inherit the parent route for that role.
#
# Value forms:
#
# - `inherit-parent` or `auto` sends no `agentOptions`, so the child runs on the parent
#   route.
# - `<provider>/<model>` is an exact route. It splits at the first `/`: the
#   provider is the text before it and the model is everything after it, so
#   `gateway/vendor-a/model-x` is provider `gateway` with model
#   `vendor-a/model-x`. No segment may be empty.
# - `<provider>/<model> [effort]` sets the starting level for that role. A caller
#   raises or lowers it per delegation with `reasoningEffort`, and a running child
#   can change its own with `set_reasoning_effort`. The effort must appear in that
#   model's supported effort list. That list is the model's own, ordered from least
#   to greatest, so one step is the adjacent entry: this package carries no effort
#   vocabulary of its own and never invents a token.
#
# `arena runners`, `architect runners`, and `interrogate reviewers` are panels: the
# value is a comma-separated list and one child starts per entry. Two entries on the
# same route are not a cross-model review, and `pstack_subagent` says so in its
# result.
#
# `arena cross-judge pool` is a list too, but it is not fanned out; pass `roleIndex` to
# choose the entry. `swarm workers` is a list as well: its first entry is the default
# route for every worker, `roleIndex` gives one race arm a different entry, and the
# caller still starts each worker itself.
#
# The defaults below are `inherit-parent` because no route is confirmed yet. Replace
# them with routes your own deployment serves.
#
# budget: none (unset)
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
arena runners: inherit-parent
arena cross-judge pool: inherit-parent
swarm workers: inherit-parent
architect runners: inherit-parent
interrogate reviewers: inherit-parent
