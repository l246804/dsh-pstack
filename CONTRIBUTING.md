# Contributing to dsh-pstack

dsh-pstack ports the pstack workflows to DeepSeek Harness. This file covers what a change has to satisfy before a maintainer merges it.

## Before you start

- Read `AGENTS.md` at the repository root, then the `AGENTS.md` in the directory you are changing, if that directory has one. Each directory document carries the rules for that directory.
- Decisions under `docs/decisions/` bind the implementation. `docs/decisions/AGENTS.md` explains how to find the records that match your paths, and an accepted record outranks a preference.
- Put throwaway files in `.tmp/`. Do not commit them.

## Setup

Install the dependencies with `pnpm install`. The CI workflow pins the Node and pnpm versions, and `package.json` declares the supported Node range. The first install needs network access because it syncs the vendored skills.

## Check your change

```sh
pnpm run ci
```

The pull request check runs this command, so run it before you push.

## Pull requests

- Keep one concern per pull request, including the documentation needed for that change.
- Commit messages follow Conventional Commits. A breaking change uses the `type!:` form, for example `feat!: ...`.
- Documentation has several localized versions. When you change a document, update every localized version of that document in the same pull request.
- Release notes are authored in an agent session under `changes/AGENTS.md`. Releases, version bumps, and tags are maintainer-only.
- Describe how you verified the change. A test run, a reproduced failure, or a screenshot of the real UI all count. "Works locally" does not.

## Review

A maintainer merges a pull request after its check passes. When a change picks one design over another with a real tradeoff, expect a question about the alternative you rejected. That is what the records under `docs/decisions/` are for.

## Licensing

There is no CLA. Contributions are accepted under the MIT license in `LICENSE`. Bundled upstream material and vendored skills keep their own licenses, so check the source project before copying its text or code.
