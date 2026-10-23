# pstack on DSH: working decisions

This is the short decision record behind the current adapter. It explains why
the package depends on the worktree plugin, why Agent Team is not a dependency,
and where the delegation limits live. Update it when one of those choices
changes.

## The worktree plugin is required

pstack's parallel-writer playbooks use DSH's `create_worktree`. The package
declares `@deepseek-ai/dsh-experimental-worktree` and
`@deepseek-ai/dsh-experimental-tool-worktree` as peer dependencies, and
`cordis.patch.yml` inserts `pstack-worktree` and `pstack-tool-worktree`.

The two rows are conditional:

```yaml
disabled: !!js "ctx.get('profileContext')?.startedBundles.includes('@deepseek-ai/dsh-experimental-tool-worktree') ?? false"
```

When the official worktree bundle is already active, pstack's rows stay
disabled and the official rows serve the tool. When it is not active, pstack
mounts the rows itself. Do not detect the plugin with `ctx.get('worktrees')`;
entries are created concurrently and that check races. `startedBundles` is a
startup snapshot, so toggle the bundle before a restart, not during a session.

pstack assumes the plugin is enabled. If the active profile cannot enable it,
the parallel-writer playbooks are unsupported. pstack does not fall back to a
hand-made `git worktree`. A bare `cordis.yml` or SDK host has no
`profileContext`, so the pstack rows enable there; if the official rows are also
mounted manually, expect a non-fatal duplicate-registration warning. That host
is outside the supported profile install.

## Agent Team is not a dependency

pstack does not depend on `@deepseek-ai/dsh-experimental-agent-team-profile` or
its tools. `pstack_subagent` children are created through `ctx.subagents`; they
are not Agent Team members.

In a profile that mounts `@deepseek-ai/dsh-tool-subagent-control`, its
`send_message`, `interrupt_agent`, and `list_agents` tools can steer, interrupt,
and list pstack children. Do not assume those names are Agent Team-only. The
profile's Team bundle is the user's separate choice; pstack never enables it and
its docs do not depend on it.

## Delegation policy

- `agentPreset` is model-selectable only when the `pstack-subagent` row sets
  `allowedAgentPresets`. The schema omits the parameter otherwise. A configured
  `agentPreset` value sets the default.
- `maxDepth` is a `pstack-subagent` row cap, currently `2`. The model may
  request a lower value, never a higher one. The cap is resolved on each call.
- `allowedModels` is a `pstack-subagent` row list of exact `provider/model`
  routes. A route outside it is rejected before the child starts, including a
  panel entry. It does not read the native DSH session `allowedModels`
  projection; configure the pstack list when the profile restricts models.

## Documentation rules

- Keep confirmed capability facts in `assets/docs/harness/dsh.md`, and have
  skills refer to them.
- pstack requires the worktree plugin; do not document a `git worktree`
  fallback as an automatic path.
- Agent Team is not a pstack dependency; do not add Team-specific instructions
  to pstack skills.
- Profile-installed packages live under
  `$DSH_HOME/profiles/$DSH_PROFILE/node_modules/`. User skills live under
  `~/.dsh/skills/`; project skills live under `.dsh/skills/`.
