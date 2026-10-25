### Authoring or modifying a skill

**You own the skill's voice.**

1. There is no built-in authoring tool here: Cursor's `create-skill`, its drafts, and its evaluation tooling are not part of this port. Write the `SKILL.md` yourself and validate it with this package's own checks.
2. Validate the skill: the frontmatter parser accepts `name` and `description` and rejects an unknown field, every referenced file exists, and every internal link resolves. `scripts/check-assets.ts` is the checker, so a broken link or an unparsable frontmatter fails the asset audit instead of shipping.
3. Test cases if structural. Skip if subjective.
4. Run **Opening a PR**.

When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config), as `principle-encode-lessons-in-structure` requires; read its `SKILL.md` at its absolute resource path. Delegate to other skills by their absolute resource paths. Don't restate. A workflow you keep hitting but isn't captured → propose a new skill.

**Reply:** summary of the skill, key design decisions, validation notes.
