# dsh-pstack

pstack for DeepSeek Harness. Rigorous agent workflows ported from
[`cursor/plugins/pstack`](https://github.com/cursor/plugins/tree/main/pstack).

pstack helps you write less, but higher quality code. `/poteto-mode` reads a
task, picks a playbook, and routes the work through the same skills Lauren Tan
uses at Cursor: investigation, design, implementation, verification, review,
shipping. This package ports those skills to DSH and gives them a native
delegation tool.

Upstream is pinned as a git submodule at `upstream/cursor-plugins`. The DSH
tree under `assets/` is generated from it, so upstream fixes flow through a
repeatable sync instead of a hand fork. The generated tree is committed: it is
what makes a sync reviewable as a `git diff`.

## Install

```bash
dsh plugin --profile web add dsh-pstack
```

Or from a checkout:

```bash
pnpm install
pnpm run build
dsh plugin --profile web add .
```

Restart `dsh web` after install. The bundle patch mounts two rows:

- `pstack` registers the bundled skill provider. Every converted skill appears
  in the session catalog with its Cursor invocation policy preserved:
  `/poteto-mode` and the other skills stay user-invocable. Skills disabled for
  model invocation are not callable through DSH's model-facing `skill` tool.
  This package preserves those flags rather than silently changing upstream
  policy; direct reads of referenced skill files depend on the active file
  tools and path policy.
- `pstack-subagent` registers the `pstack_subagent` tool, the DSH replacement
  for Cursor's `Task` tool.

The tool accepts an optional `agentPreset` to select a DSH preset for one
child; omit it to inherit the parent preset. The pstack `agent` argument still
selects only a prompt preamble. DSH's `create_worktree` is used when present in
the active child toolset; otherwise prepare a Git worktree and pass its path
through `cwd`.

Verify the layer without booting:

```bash
dsh --profile web --dump-config | grep -A2 'pstack'
```

## Use

Start with a real task:

```text
/poteto-mode add a --json flag to this command. text output stays byte-identical. verify both.
```

`/poteto-mode` opens a todo list whose first items are the matched playbook's
steps. Each step names the skill it routes to. The other skills work directly:
`/how`, `/why`, `/architect`, `/arena`, `/swarm`, `/interrogate`, `/tdd`,
`/no-comments`, `/unslop`, `/technical-writing`, `/sharpen`, `/teach`, and the
twenty-four `principle-*` rules.

See the converted [pstack guide](assets/docs/guide/README.md) and the
[DSH adapter reference](assets/docs/harness/dsh.md).

### Configure roles

`/setup-pstack` detects the routes your session can use and writes
`~/.dsh/pstack-models.md`. One role per line:

```text
# pstack model configuration. One line per role.
# Value: inherit-parent | <provider>/<model> [effort]
# budget: large (xhigh)
feature, refactoring: deepseek-official/deepseek-reasoner high
judgment and prose: inherit-parent
```

A missing line means the role inherits the parent chat's route. The tool reads
this file on every delegation, so edits apply without restarting.

### Delegate

`pstack_subagent` is the one delegation surface:

```text
pstack_subagent(
  description: "port the retry helper",
  prompt: "Port src/retry.ts ... prove it with pnpm test retry",
  agent: "poteto-agent",
  role: "feature, refactoring",
)
```

- `agent`: `poteto-agent` (default), `general`, or `comment-sicko`. The tool
  prepends the packaged agent instructions for the first and third. This is a
  pstack prompt choice, not a DSH `agentPreset`.
- `agentPreset`: optional DSH preset for the child. It selects the child's
  tools, skills, and plugins; omit it to inherit the parent preset. Use
  `cordis` only for plugin-development tasks when that preset is available.
- `role`: a line from `~/.dsh/pstack-models.md`. Omit it to inherit the parent
  route. The panel roles `arena runners`, `architect runners`, and
  `interrogate reviewers` expand to one child per entry. Use `roleIndex` to
  select one entry from another multi-route role. Roles are the supported way
  to choose a provider, model, and reasoning effort; the tool does not accept
  raw provider/model overrides.
- `cwd`: optional child working directory.
- `maxDepth`: optional absolute delegation-depth limit; omitted values use the
  DSH subagent setting. DSH counts the root as depth 0, so a depth-1 child
  that spawns a depth-2 worker needs `maxDepth: 2`.
- `roleIndex`: optional zero-based index for selecting one route instead of
  expanding a panel role.

The call returns child ids immediately. The runtime reports final answers in
completion notices. The adapter returns plain-text child ids and does not
expose `outputSchema` or child-steering/listing tools. Use the native DSH
`subagent` tool when a workflow needs those host-specific capabilities.

## What changed from Cursor

| Cursor                                                                   | DSH                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Task` tool                                                              | `pstack_subagent`                                                                                                                                                                          |
| `subagent_type`                                                          | `agent`                                                                                                                                                                                    |
| model slug                                                               | `role` resolved from `~/.dsh/pstack-models.md`                                                                                                                                             |
| `readonly` / `run_in_background` / `environment`                         | Background by default; say "do not edit" in the prompt                                                                                                                                     |
| `~/.cursor/rules/pstack-models.mdc`                                      | `~/.dsh/pstack-models.md`                                                                                                                                                                  |
| `.cursor/skills/`                                                        | `.dsh/skills/`                                                                                                                                                                             |
| Automations, Bugbot, cloud VMs, Custom Modes, `/loop`, `cursor-team-kit` | Marked skipped, or remapped where DSH has an equivalent. Have a writing child call DSH `create_worktree` when available; otherwise prepare a Git worktree and pass its path through `cwd`. |

`skills/make-bot-ui` is not ported: it depends entirely on Cursor Automations.
It is not shipped, in any form. If you need it, read it from the upstream
submodule at `upstream/cursor-plugins/pstack/skills/make-bot-ui/`.

## Develop

Requirements: Node 22.19+, pnpm, and Bun for the bundled watcher and orchestration
scripts. Vite+ provides the build, test, lint, and format toolchain.

```bash
vp install          # install dependencies
git submodule update --init --depth 1
vp run sync         # regenerate assets/ from upstream pstack
vp check            # format, lint, type-check
vp test             # unit tests
vp pack             # build dist/
```

### Repository layout

```text
src/provider.ts          bundled skill provider (ctx.skills)
src/subagent.ts          pstack_subagent tool (ctx.subagents + ctx.tools)
src/roles.ts             ~/.dsh/pstack-models.md parsing and role resolution
src/frontmatter.ts       SKILL.md frontmatter parser
scripts/adapt.ts         upstream-to-DSH rewrite rules
scripts/sync-upstream.ts generator: upstream -> assets/
tests/                   unit tests for provider, roles, and prompt assembly
assets/                  generated: skills, agents, docs (committed)
cordis.patch.yml         the bundle layer this package installs
upstream/cursor-plugins  git submodule, upstream reference only
```

`assets/` is generated. Never hand-edit it. Change `scripts/adapt.ts` or a
skill's upstream source, then run `vp run sync`.

[`docs/porting/`](docs/porting/README.md) is the policy the converter enforces:
translate names, not sentences; awkward grammar is acceptable, changed meaning
is not. It also records why the generated tree is committed rather than ignored.

`vp run sync:check` fails when the committed tree differs from a fresh
conversion and when a rewrite no longer matches its upstream anchor. Run it
before publishing.

## License

MIT. The ported skills are MIT, copyright Lauren Tan; see [LICENSE](LICENSE).
