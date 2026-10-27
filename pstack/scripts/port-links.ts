/**
 * Links that would leave the generated tree, and where each is repointed.
 *
 * Every entry is a link that works in an upstream checkout and breaks in an install,
 * because the target is not carried. The replacement is the upstream file on GitHub,
 * verbatim from the pinned revision, so a reader can still follow the reference the
 * sentence was making.
 *
 * The list is complete on purpose rather than suggestive: `assertLinksResolve` fails the
 * build when a shipped link resolves to something the tree does not contain, so a new
 * upstream link out of the tree stops the build until it is retargeted or carried.
 */

export const RETARGETED_LINKS: Readonly<Record<string, string>> = {
  "../../README.md": "https://github.com/cursor/plugins/blob/main/pstack/README.md",
  "../../docs/harness/claude-code.md":
    "https://github.com/cursor/plugins/blob/main/pstack/docs/harness/claude-code.md",
  "../harness/claude-code.md":
    "https://github.com/cursor/plugins/blob/main/pstack/docs/harness/claude-code.md",
  "../make-bot-ui/SKILL.md":
    "https://github.com/cursor/plugins/blob/main/pstack/skills/make-bot-ui/SKILL.md",
  "../../skills/make-bot-ui/SKILL.md":
    "https://github.com/cursor/plugins/blob/main/pstack/skills/make-bot-ui/SKILL.md",
  "../../automations/benny/README.md":
    "https://github.com/cursor/plugins/blob/main/pstack/automations/benny/README.md",
  "../../automations/benny/FOR_AGENTS.md":
    "https://github.com/cursor/plugins/blob/main/pstack/automations/benny/FOR_AGENTS.md",
};

/** Link targets that are template placeholders rather than files. */
export const TEMPLATE_LINK_TARGETS: readonly string[] = ["url", "link", "pr-url", "<url>", "#"];
