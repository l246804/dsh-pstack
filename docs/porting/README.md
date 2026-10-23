# Porting pstack to DSH

This is the policy behind `scripts/adapt.ts`. Read it before adding a rule or
touching a generated skill.

## The one rule

**Translate names, not sentences.**

A skill is upstream prose. Upstream owns the wording: its examples, its
emphases, its jokes, its section order. The port owns only the concepts DSH does
not have. Anything that is not a Cursor concept stays byte-identical, so every
upstream improvement flows through the next sync.

## Decide the change class first

| Upstream says                                            | Change class | Allowed shape                           |
| -------------------------------------------------------- | ------------ | --------------------------------------- |
| A tool, path, field, or model slug with a DSH equivalent | token swap   | a name for a name, inside one line      |
| A Cursor feature DSH lacks                               | replacement  | a sentence that states the DSH behavior |
| A concept that no longer exists at all                   | drop         | delete the clause, or say it is skipped |

The first class must never become a paragraph edit. The third must say what
happens instead; it must never leave a dangling sentence.

## Minimal vs. correct

This is the line a reviewer should hold:

- **Grammar that is merely awkward is acceptable.** A missing article, a plural
  that reads oddly, a sentence that is a little clunky: leave it. It does not
  change what an agent will do, and rewriting it is how a port starts drifting.
- **A changed meaning is a bug and must be fixed.** If the rewrite makes the
  sentence claim something false, drop a constraint, or lose a step, the port is
  wrong even when the prose reads better.

Examples of the second kind, all real and all fixed here:

- `Cursor Automations` → `DSH schedules`: the sentence then said "DSH schedules,
  which DSH does not provide". DSH has `schedule_create`; the claim was false.
- `cloud agents` → `worktree subagents` applied to both singular and plural, so
  a sentence read "a [worktree subagents]". Nothing false, but it signalled the
  rule had no idea what it was touching.
- `gpt-4` → `gpt-4o` became `the configured route` → `the configured route`,
  which turned a concrete example into nonsense.
- Two different model slugs in one sentence both became the same placeholder,
  collapsing the contrast the sentence existed to make.
- `Custom Modes` was rewritten to `persistent mode` in one bullet while the
  bullet above still told the user to create a Custom Mode. Same section, two
  contradictory instructions.

## Verify DSH behavior before adapting

Do not infer a DSH capability from a similarly named tool, a profile package,
or the upstream workflow. Confirm the behavior in the target DSH version and
active profile before changing instructions. Prefer evidence in this order:

1. The public DSH API or implementation establishes the contract.
2. The active profile configuration establishes which extension is installed
   and enabled for that session.
3. A runtime invocation establishes the observed behavior and any policy or
   permission boundary.

Record profile- or version-specific observations as such. A tool present in a
profile is not necessarily present in every child session: its preset may
provide a different toolset, and file-access policy can still restrict paths.
Keep confirmed capability descriptions and limitations in
[`assets/docs/harness/dsh.md`](../../assets/docs/harness/dsh.md), then make
skills refer to those facts without promising more.

When adapting a workflow, preserve its outcome and safety constraints, not
merely its tool names. In particular:

- A DSH child session is not a cloud VM. A Git worktree isolates a checkout and
  branch, not the machine, ports, or runtime.
- pstack requires the DSH worktree plugin. The bundle declares
  `@deepseek-ai/dsh-experimental-worktree` and
  `@deepseek-ai/dsh-experimental-tool-worktree` as peer dependencies and mounts
  their rows when the official bundle is absent. Select/fetch the intended base
  explicitly; do not present worktree creation, fetching, merging, or cleanup
  as automatic when it is not.
- Treat `agentPreset` as an explicit DSH preset choice, separate from pstack's
  prompt-style `agent`; expose it to the model only through the
  `pstack-subagent` row's `allowedAgentPresets` list. Omit the preset to inherit
  the parent, and do not switch every child to a specialized preset just to gain
  one capability.
- DSH counts the root session as depth 0. The `pstack-subagent` row sets the
  absolute depth cap; the model may request a lower value, never a higher one.
  Do not copy a fixed limit into every delegation.
- pstack enforces its own `allowedModels` list on the `pstack-subagent` row. It
  does not read the native DSH session `allowedModels` policy.
- Preserve upstream skill invocation flags. `disable-model-invocation` blocks
  model-facing `skill` calls, not a user's explicit slash invocation.
  Referenced-file reading is a separate operation and depends on the active
  tools and path policy; never assume it is an invocation workaround.
- Describe only automation triggers DSH actually provides. A timer-based
  schedule is not an event subscription or a replacement for an upstream
  event-driven pipeline.

Normal installation uses the published `dsh-pstack` package. A source checkout
and the upstream submodule are development inputs for regenerating and
reviewing `assets/`, not installation prerequisites.

## Writing a rule

Every rule answers three questions in its declaration:

1. `kind`: why does this need a rule at all? `rename`, `path`, `indirect` are
   token swaps. `approximate`, `drop`, `host` may rewrite a sentence.
2. `apply`: what is the smallest match that carries the concept? Prefer the
   name. Widen only when the name alone would produce a false sentence.
3. `forbid` / `coverage` / `reason`: how do we prove it ran, and if it is not
   full coverage, why not?

Two mechanical checks enforce this:

- `validateRules()` rejects a token rule whose pattern spans a line break.
  A `rename` that needs a paragraph is a lie about its own scope.
- `assertRewriteScope()` rejects a file rewrite that crosses a line break
  without a written reason as its third element.

A block rewrite is not forbidden. It is allowed when the section is entirely
about the other API, such as `poteto-mode`'s Subagents section or `reflect`'s
transcript discovery. It must say so in one sentence, and `check-rewrites.ts`
prints every block rewrite with its reason so a reviewer can audit them all.

## Never do these

- Do not "clean up" the author's text. Deleting empty parens, collapsing commas,
  or normalizing punctuation across the whole document is not translation. It
  broke real code samples: `z.string()` became `z.string`, `toSQL()` became
  `toSQL`.
- Do not rewrite a sentence just because a token inside it changed. Find the
  smallest span that carries the concept and replace only that span.
- Do not use a blanket possessive sweep. `Cursor's X` can be a product name, a
  feature, or a sentence subject; a global rule produced "DSH built-in" and "DSH
  docs", both false.
- Do not leave a rule that no longer matches upstream. `check-rewrites.ts` fails
  the sync; update the pattern, do not delete the check.

## Quoting and frontmatter

Descriptions are written as plain YAML scalars unless a plain scalar would
change meaning (leading indicator characters, `: `, ` #`, or a newline). Quoting
every description added diff noise to every generated file without changing a
byte of meaning.

## Working loop

```bash
vp run sync        # regenerate assets/
vp run sync:check  # anchors, tree drift, concept coverage
vp test            # schema and provider tests
vp check           # lint and types
```

`assets/` is committed. Review the `git diff` of `assets/` as part of the
change. If the diff shows changes outside the concepts you touched, the rules
are too broad; narrow them before committing.
