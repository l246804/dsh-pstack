# Generated assets are committed

`assets/` is generated from `upstream/cursor-plugins/pstack` by
`scripts/sync-upstream.ts`. It is committed to the repository.

## Why

A sync changes skill prose an agent will later follow. Reviewing that change
means reading the diff, and a `git diff` is the only diff a reviewer actually
looks at. Hiding the generated tree behind `.gitignore` moves that review to a
manual step: generate before, move the pointer, generate after, diff two
directories. Nobody does that on a normal commit, and the change that matters
goes unreviewed.

The committed tree is also the baseline `sync:check` compares against. With no
committed tree, a clean clone has nothing to compare and the check has to treat
"missing" as fine, which is exactly the state a hand edit can hide in.

## What "generated" still means

`assets/` is never hand-edited. Every change comes from one of three inputs:

- the `upstream/cursor-plugins` submodule pointer
- `scripts/adapt.ts`, which holds the rewrite rules
- `scripts/sync-upstream.ts`, which decides which files are copied and how

When any of them changes, run `vp run sync` and commit the pointer, the rule or
generator change, and the regenerated tree together. Committing one without the
others is a lie about which source produced the tree.

## What enforces it

`vp run sync:check` regenerates in memory and compares against the committed
tree. Any difference fails the check, whether it is a hand edit, a stale tree,
a missing file, or an unexpected extra file.

`check-rewrites.ts` proves every surgical pattern still matches its upstream
anchor, so an upstream sentence that moved cannot silently stop being
translated. `report-coverage.ts` proves every concept the port claims has a rule
behind it.

## The cost

The tree is large relative to its input, and every sync produces a diff whose
volume is mostly regeneration. That is the price of reviewability, and it is
worth paying: the alternative is a skill an agent follows that nobody read.

## What not to do

Do not add `assets/` to `.gitignore`, and do not make `build` or `test` depend
on generating it. Both make the committed baseline disappear and turn a
reviewable change into an invisible one.
