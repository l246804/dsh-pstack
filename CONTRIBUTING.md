# Contributing to dsh-pstack

dsh-pstack ports the pstack workflows to DeepSeek Harness. This file covers what a change has to satisfy before a maintainer merges it.

## Before you start

- Read `AGENTS.md` at the repository root, then the `AGENTS.md` in the directory you are changing. Each directory document carries the rules for that directory.
- Decisions under `docs/decisions/` bind the implementation. `docs/decisions/AGENTS.md` explains how to find the records that match your paths, and an accepted record outranks a preference.
- Put throwaway files in `.tmp/`. Do not commit them.

## Setup

Install the dependencies with `pnpm install`. The `engines` field in `package.json` and the CI workflow pin the Node and pnpm versions this repository builds with. The first install needs network access because `prepare` syncs the vendored skills.

## Check your change

```sh
pnpm run ci
```

This is the command the pull request check runs. A green local run means a green pull request check.

## Pull requests

- Keep one concern per pull request. A documentation fix and a behavior change are two pull requests.
- Commit messages follow Conventional Commits. A breaking change uses the `type!:` form, for example `feat!: ...`.
- Documentation ships per locale. A change to `README.md` needs the same change in `README.zh.md`.
- Do not edit generated release notes, bump the version, or create a tag. Releases are maintainer-only.
- Describe how you verified the change. A test run, a reproduced failure, or a screenshot of the real UI all count. "Works locally" does not.

## Review

A maintainer merges a pull request after its check passes. When a change picks one design over another, expect a question about the alternative you rejected. That is what the records under `docs/decisions/` are for.

## Licensing

There is no CLA. Contributions are accepted under the MIT license in `LICENSE`. Bundled upstream material and vendored skills keep their own licenses, so check the source project before copying text or code from one.
