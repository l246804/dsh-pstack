# dsh-pstack

[English](README.md) | [简体中文](README.zh.md)

pstack for DeepSeek Harness. It ports the
[`cursor/plugins/pstack`](https://github.com/cursor/plugins/tree/main/pstack)
skills and adds a native delegation tool.

## What it does

- Registers 55 pstack skills, including `/poteto-mode` and the 24
  `principle-*` rules.
- Routes `/poteto-mode` work through the upstream playbooks: investigation,
  design, implementation, verification, review, and shipping.
- Provides `pstack_subagent`, which resolves role routes from
  `~/.dsh/pstack-models.md`, adds the pstack agent preamble, and starts
  background children through `ctx.subagents`.
- Expands `arena runners`, `architect runners`, and `interrogate reviewers` to
  one child per role entry.
- Depends on the DSH worktree plugin and mounts it when the official bundle is
  absent.

## Install

```bash
dsh plugin --profile web add dsh-pstack
```

From a checkout:

```bash
pnpm install
pnpm run build
dsh plugin --profile web add .
```

Restart `dsh web` after install.

### Bundle rows

The bundle patch declares four rows:

| Row                    | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `pstack`               | Registers the skill provider and its 55 skills.                     |
| `pstack-worktree`      | Mounts the DSH worktree service when the official bundle is absent. |
| `pstack-tool-worktree` | Mounts `create_worktree` when the official bundle is absent.        |
| `pstack-subagent`      | Registers `pstack_subagent` with a `maxDepth: 2` cap.               |

When `@deepseek-ai/dsh-experimental-tool-worktree` is already active, the two
pstack worktree rows stay disabled and reuse the official rows. The worktree
plugin is a peer dependency of this package.

Verify the layer without booting:

```bash
dsh --profile web --dump-config | grep -A2 'pstack'
```

## Quick start

Describe the goal and the check:

```text
/poteto-mode add a --json flag to this command. text output stays byte-identical. verify both.
```

`/poteto-mode` picks a playbook and opens a todo list whose first items are that
playbook's steps. Skills also work directly: `/how`, `/why`, `/architect`,
`/arena`, `/swarm`, `/interrogate`, `/tdd`, `/no-comments`, `/unslop`,
`/technical-writing`, `/sharpen`, `/teach`, and the 24 `principle-*` rules.

## Worktree dependency

pstack requires the DSH worktree plugin. The bundle mounts
`pstack-worktree` and `pstack-tool-worktree` when the official
`@deepseek-ai/dsh-experimental-tool-worktree` bundle is not already in the
profile. When it is, pstack reuses it.

`create_worktree` creates a local Git worktree, switches the calling session's
working directory, and reports the checkout path and branch. It does not fetch
refs, merge, or clean up. A worktree isolates the checkout, not the machine or
the runtime. pstack assumes the plugin is enabled; if it cannot be enabled, the
parallel-writer playbooks are unsupported. There is no hand-made `git worktree`
fallback.

## Delegate

`pstack_subagent` is the one delegation surface:

```text
pstack_subagent(
  description: "port the retry helper",
  prompt: "Port src/retry.ts ... prove it with pnpm test retry",
  agent: "poteto-agent",
  role: "feature, refactoring",
)
```

| Argument                | Meaning                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `description`, `prompt` | Short label and self-contained task. The child does not share this conversation.                      |
| `agent`                 | `poteto-agent` (default), `general`, or `comment-sicko`. This is a prompt preamble, not a DSH preset. |
| `role`, `roleIndex`     | A line from `~/.dsh/pstack-models.md`, or one zero-based entry from a list-valued role.               |
| `cwd`                   | Initial child working directory.                                                                      |
| `agentPreset`           | Present only when the `pstack-subagent` row sets `allowedAgentPresets`.                               |
| `maxDepth`              | Requested depth, clamped to the `pstack-subagent` cap.                                                |

The `pstack-subagent` row also accepts `allowedModels` and
`allowedAgentPresets`. `allowedModels` lists exact `provider/model` routes and
rejects role routes outside it. `allowedAgentPresets` controls whether the model
can select a preset. Neither is a tool argument.

The call returns child ids immediately. Final answers arrive as completion
notices. The adapter adds no child-steering or listing tools. When the profile
mounts `@deepseek-ai/dsh-tool-subagent-control`, use its `send_message` and
`list_agents` for pstack children. Other tools with those names may manage a
different collaboration surface.

## Roles

`/setup-pstack` writes `~/.dsh/pstack-models.md`. One role per line:

```text
# pstack model configuration. One line per role.
# Value: inherit-parent | <provider>/<model> [effort]
feature, refactoring: deepseek-official/deepseek-reasoner high
judgment and prose: inherit-parent
```

A missing line inherits the parent route. The file is read on every delegation,
so edits apply without restarting. Panel roles expand to one child per entry;
`roleIndex` selects one entry from another list-valued role.

## Cursor compatibility

| Cursor                                           | DSH                                                     |
| ------------------------------------------------ | ------------------------------------------------------- |
| `Task` tool                                      | `pstack_subagent`                                       |
| `subagent_type`                                  | `agent`                                                 |
| Model slug                                       | `role` from `~/.dsh/pstack-models.md`                   |
| `readonly` / `run_in_background` / `environment` | Background by default; say "do not edit" in the prompt. |
| `~/.cursor/rules` / `.cursor/skills/`            | `~/.dsh/pstack-models.md` / `.dsh/skills/`              |

Automations, Bugbot, cloud VMs, Custom Modes, `/loop`, and `cursor-team-kit`
are skipped or remapped where DSH has an equivalent. `skills/make-bot-ui` is not
ported because it depends on Cursor Automations.

## Docs

- [pstack guide](assets/docs/guide/README.md)
- [DSH adapter reference](assets/docs/harness/dsh.md)
- [Working decisions](docs/porting/decisions.md)
- [Porting policy](docs/porting/README.md)

## Develop

Requirements: Node 22.19+, pnpm, and Bun for the bundled watcher and
orchestration scripts. Vite+ provides the build, test, lint, and format
toolchain.

```bash
vp install          # install dependencies
git submodule update --init --depth 1
vp run sync         # regenerate assets/ from upstream pstack
vp check            # format, lint, type-check
vp test             # unit tests
vp pack             # build dist/
```

### Repository layout

Source lives in `src/`, rewrite rules in `scripts/adapt.ts`, the generator in
`scripts/sync-upstream.ts`, and generated assets in `assets/`. Tests live in
`tests/`.

`assets/` is generated. Never hand-edit it. Change `scripts/adapt.ts` or the
upstream source, then run `vp run sync`. `docs/porting/` records the policy and
the working decisions.

## License

MIT. The ported skills are MIT, copyright Lauren Tan. See [LICENSE](LICENSE).
