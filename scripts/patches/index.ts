import type { FilePatch, SkillExclusion } from "./types.ts";

/** Skills whose upstream behavior has no DSH host feature behind it. */
export const EXCLUDED_SKILLS: readonly SkillExclusion[] = [
  {
    kind: "exclude",
    skill: "make-bot-ui",
    reason:
      "The skill targets Cursor's Grok Bot webhook and Tailscale flow, and this port has no equivalent host feature.",
  },
];

export const FILE_PATCHES: readonly FilePatch[] = [
  {
    kind: "drop",
    file: "skills/poteto-help/SKILL.md",
    reason: "make-bot-ui is excluded from the port, so this row would link to a missing skill.",
    anchor:
      "| Build a page whose buttons wake a Grok Bot over a webhook | [`/make-bot-ui`](../make-bot-ui/SKILL.md) |\n",
    expectedMatches: 1,
    outputIncludes: ["| Find their way around pstack | `/poteto-help` |"],
  },
  {
    kind: "path",
    file: "skills/poteto-help/SKILL.md",
    reason:
      "The asset tree is one level below the repository root, so the README sits three levels up.",
    anchor: "../../README.md",
    expectedMatches: 1,
    replacement: "../../../README.md",
    outputIncludes: ["[README](../../../README.md)"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "The linked document is the DSH mapping, so the label must name that document.",
    anchor: "The [Claude Code adapter](../../docs/harness/claude-code.md)",
    expectedMatches: 1,
    replacement: "The [DSH harness mapping](../../docs/harness/dsh.md)",
    outputIncludes: ["[DSH harness mapping](../../docs/harness/dsh.md)"],
  },
  {
    kind: "drop",
    file: "docs/guide/09-make-it-yours.md",
    reason:
      "The make-bot-ui skill is excluded, so its guide section is dropped and the pitfall that follows stays.",
    anchor: /^## Build a bot UI with `\/make-bot-ui`\n\n[^\n]+\n\n/m,
    expectedMatches: 1,
    outputIncludes: ["**Pitfall:** don't edit a skill mid-task"],
  },
  {
    kind: "drop",
    file: "docs/guide/07-overnight.md",
    reason:
      "Automation packs are not copied into the package, so the pointer paragraph is dropped and the rest stays.",
    anchor:
      /^pstack ships this as a dormant \[automation pack\]\(\.\.\/\.\.\/automations\/benny\/README\.md\)[^\n]*\n\n/m,
    expectedMatches: 1,
    outputIncludes: ["**Pitfall:** a duration is not a finish condition."],
  },
  {
    kind: "replace",
    file: "docs/guide/01-setup.md",
    reason: "The linked document is the DSH mapping, so the label must name that document.",
    anchor: "The [Claude Code adapter](../harness/claude-code.md)",
    expectedMatches: 1,
    replacement: "The [DSH harness mapping](../harness/dsh.md)",
    outputIncludes: ["[DSH harness mapping](../harness/dsh.md)"],
  },
];

export function patchesForFile(file: string): readonly FilePatch[] {
  return FILE_PATCHES.filter((patch) => patch.file === file);
}
