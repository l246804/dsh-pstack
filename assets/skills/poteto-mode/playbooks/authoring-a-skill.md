### Authoring or modifying a skill

**You own the skill's voice.**

1. Read the `writing-for-agents` skill's `SKILL.md` at its absolute resource path before drafting, and its `SKILL-MECHANICS.md` when the document is a skill. It is the vendored reference for writing what an agent reads: context pointers, the information hierarchy, completion criteria, leading words, and pruning. Cursor's built-in drafter and its evaluation tooling are not part of this port, so you write the file yourself.
2. Validate the skill: the frontmatter parser accepts `name` and `description` and rejects an unknown field, every referenced file exists, and every internal link resolves. `scripts/check-assets.ts` runs these checks over this package's own `assets/` tree. A skill you write in a project's `.dsh/skills/` is outside that tree, so nothing validates it automatically: check those four things yourself before declaring the skill done, and do not claim a check ran on it.
3. Test cases if structural. Skip if subjective.
4. Run **Opening a PR**.

When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config), as `principle-encode-lessons-in-structure` requires; read its `SKILL.md` at its absolute resource path. Delegate to other skills by their absolute resource paths. Don't restate. A workflow you keep hitting but isn't captured → propose a new skill.

**Reply:** summary of the skill, key design decisions, validation notes.
