---
name: how
description: Use for "how does X work", code walkthroughs before changing something, and placement / ownership / layering questions ("where should this live", "which package owns this", "is this the right layer"). Explains subsystem architecture, runtime flow, onboarding mental models. Use why for motivation.
disable-model-invocation: true
---

# How

> DSH port of pstack. `pstack_subagent` replaces Cursor's Task tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

Every spawn is a `pstack_subagent` call with `agent: "general"` and `role: "how explorer"` or `role: "how explainer"`. Read that role's route from `$DSH_HOME/pstack-models.md`; the tool re-reads the file on every delegation, and a role the file does not name inherits the parent route. Never invent a model id: this package cannot know which routes a deployment serves. An effort is different, because the target model advertises its own list and `pstack_subagent` checks your value against it and names the real values when it refuses, so predict no ladder beyond that. Explorers are read-only by instruction, not by sandbox, so state the no-write rule in each brief and check `git status` after the child reports. Read the Subagents section of the `poteto-mode` skill at its absolute resource path before you spawn anything. Start from the level the role line names, raise it for hard work and lower it for routine work by passing `reasoningEffort`; a child that cannot call `set_reasoning_effort` keeps the level you gave it.

## 1. Assess complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): no explorers. Start one explainer child with `references/explainer-prompt.md` and no explorer findings; it explores and explains in one pass. Go to step 4.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): go to step 2.

When in doubt, take the simple path.

## 2. Explore (complex only)

Decompose the question into 2 to 4 angles, each a distinct slice of the subsystem. Start every explorer as one batch of `pstack_subagent` calls, each with `references/explorer-prompt.md` and its angle filled in. Each call returns a child id and the report arrives as a completion notice, so nothing polls: move on once the notices are in.

## 3. Synthesize (complex only)

Once all explorers have returned, start one explainer child with `references/explainer-prompt.md` and every explorer's findings filled in. Starting it earlier drops whatever had not reported yet.

## 4. Present

Present the explainer's output. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite it.

## Output format

The explanation uses the sections defined in `references/explainer-prompt.md`, dropping any that do not apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.
