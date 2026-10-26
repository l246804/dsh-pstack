---
name: interrogate
description: Use for "interrogate", "adversarial review", "multi-model review", "challenge this", "stress test this code", "find blind spots", or "tear this apart". Multiple LLM reviewers challenge changes from independent angles.
disable-model-invocation: true
---

# Interrogate

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

Spawn one reviewer per configured route to adversarially review code changes. The adversarial signal comes from model diversity, not assigned personas; when two entries resolve to the same route, say plainly that the review is one model reading the diff twice, because that is what it is. The deliverable is a synthesized verdict. Do NOT auto-apply changes.

## Step 1, Scope

Identify what to review from context:

- If the user points at specific files or a diff, use that.
- If on a feature branch, run `git diff main...HEAD` (or the appropriate base branch) for the full changeset.
- If the user's message references recent work, gather the relevant files.

Package the diff or file contents with any surrounding context files the reviewers need to understand the code.

## Step 2, Intent

Before spawning reviewers, state the intent in one clear paragraph from the user's message, commit messages, the PR description if one exists, and the code. If you're unsure about the intent, ask the user before proceeding.

## Step 3, Spawn Reviewers

Launch all reviewers in one batch of `pstack_subagent` calls with `role: "interrogate reviewers"`. That role is a panel, so one call starts one child per entry in the role file and the result lists every child id with its actual route; label them Reviewer A, B, and so on to match the entry count. A role the file does not name inherits the parent route, and that is not a different model.

Each reviewer gets `agent: "general"` and a brief that forbids writes: it may read the diff and run read-only commands, and it must not edit files. That rule is an instruction, not a sandbox, so check `git status` before and after instead of trusting the report. The route comes from the panel entry, and the tool reports the route each reviewer actually got.

If an entry's route does not resolve, that reviewer does not start: the error names the role file and the bad line, which is the actionable fix. The remaining entries still start, and the report records each reviewer that was skipped and why. Do not substitute a route the user did not configure, and do not let one bad entry stop the review.

Read `references/reviewer-prompt.md` and fill in the same template for every reviewer with the stated intent, the diff or file contents, the rubric from `references/rubric.md`, and the code-quality lens from `references/code-quality-review.md`. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first. Start from the level the role line names, raise it for hard work and lower it for routine work by passing `reasoningEffort`; a child that cannot call `set_reasoning_effort` keeps the level you gave it.

## Step 4, Synthesize

As results come back, build a unified picture. Parse every reviewer's findings. Merge findings that describe the same issue differently, and note which route raised each one. Findings two or more reviewers raised are the highest signal only when their routes differ: reviewers on one route share the same blind spots, and the report says so instead of calling the overlap independent confirmation. Read a lone reviewer's finding, but weight it accordingly. Note disagreements. If one reviewer flags something and another explicitly says the opposite, that is context for the verdict.

## Step 5, Lead Judgment

You are the lead reviewer, a pragmatic senior engineer, not a neutral aggregator. Read `references/lead-judgment.md` for the full framework. Put every finding in one of four buckets, with the model(s) that raised it and a one-line rationale.

- **Act on**. Real issues affecting correctness, security, or maintainability given the actual goals. They would block a real PR.
- **Consider**. Legitimate, but you're not sure they outweigh the cost of addressing them now. Worth the user's attention.
- **Noted**. Technically valid but not actionable. Context-dependent, premature optimization, or low-impact at this stage.
- **Dismissed**. Wrong, nitpicky, or missing context, with a brief reason.

## Output Format

### Intent
> [The stated intent paragraph from Step 2]

### Reviewers
- Reviewer [label]: [model name], [N findings] (one bullet per reviewer)

### Act On
[Each: description, which models raised it, why it matters.]

### Consider
[Each: description, which models raised it, the tradeoff.]

### Noted
[Brief list.]

### Dismissed
[Each with a brief rationale.]

### Agreement Map
[Where models agreed and diverged, and what that pattern tells us.]
