export type RewritingPatchKind = "rename" | "path" | "replace";

interface PatchTarget {
  /** Asset-relative POSIX path, identical to the upstream-relative path. */
  readonly file: string;
  readonly reason: string;
  readonly anchor: string | RegExp;
  readonly expectedMatches: number;
  /** Fragments that must survive in the final generated text. */
  readonly outputIncludes?: readonly string[];
}

export interface RewritingPatch extends PatchTarget {
  readonly kind: RewritingPatchKind;
  readonly replacement: string;
}

export interface DropPatch extends PatchTarget {
  readonly kind: "drop";
}

export type FilePatch = RewritingPatch | DropPatch;

export interface SkillExclusion {
  readonly kind: "exclude";
  readonly skill: string;
  readonly reason: string;
}

export const PATCH_SCOPES = ["skills/", "agents/", "docs/guide/"] as const;

export const EXCLUDED_SKILLS: readonly SkillExclusion[] = [
  {
    kind: "exclude",
    skill: "make-bot-ui",
    reason:
      "The skill targets Cursor's Grok Bot webhook and Tailscale flow, and this port has no equivalent host feature.",
  },
];

/**
 * Skills that get the shared DSH pointer. The set is data, not a default for
 * every skill. Most entries carry Cursor/Claude host vocabulary; the two
 * overrides need DSH-specific routing and frontmatter handling.
 */
export const INTRO_SKILLS: Readonly<Record<string, string>> = {
  architect: "Cursor Task, model, and worktree vocabulary.",
  arena: "Cursor Task, model, and cloud-run vocabulary.",
  "automate-me": "Cursor transcript paths and create-skill flow.",
  "blast-radius": "Cross-skill reads need DSH resource paths.",
  "create-formal-verification-skill": "Bare verification-skill routes need DSH path loading.",
  "create-verification-skill": "Cursor project-skill paths and control skills.",
  "figure-it-out": "Cursor Task, todolist, and worktree vocabulary.",
  how: "Cursor Task, model, and readonly vocabulary.",
  interrogate: "Cursor Task and model-panel vocabulary.",
  "maintain-formal-verification-skill": "Bare verification-skill routes need DSH path loading.",
  "maintain-verification-skill": "Cursor Task/readonly vocabulary and verification-skill paths.",
  "no-comments": "Cursor Task and comment-sicko subagent vocabulary.",
  "poteto-help": "Cursor install, model-rule, and Custom Mode text.",
  "poteto-mode": "Cursor Task, model, and Custom Mode text.",
  "principle-prove-it-works": "References show-me-your-work and needs DSH verification wording.",
  recall: "Cursor transcript paths and session history.",
  reflect: "Cursor Task and transcript vocabulary.",
  "setup-pstack": "Cursor model-rule and model-slug text.",
  "show-me-your-work": "Cursor transcript and review-model text.",
  swarm: "Cursor Task, cloud, and model vocabulary.",
  teach: "Runs how and why, and needs the DSH image fallback.",
  "technical-writing": "References unslop by name and needs DSH path loading.",
  "typescript-best-practices": "The paths auto-trigger has no DSH equivalent.",
  why: "Cursor Task, model, and MCP discovery vocabulary.",
};

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
    kind: "replace",
    file: "skills/blast-radius/SKILL.md",
    reason: "The why skill must be loaded through its DSH resource path, not a bare Cursor route.",
    anchor: "Use `why` step 2 to pull the PR and commits.",
    expectedMatches: 1,
    replacement:
      "Read the `why` skill's `SKILL.md` at its absolute resource path, then use step 2 to pull the PR and commits.",
    outputIncludes: ["`why` skill's `SKILL.md` at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/blast-radius/SKILL.md",
    reason:
      "The arena skill must be loaded through its DSH resource path, not a bare Cursor route.",
    anchor: "For a big or wide change, run it as an `arena`.",
    expectedMatches: 1,
    replacement:
      "For a big or wide change, read the `arena` skill's `SKILL.md` at its absolute resource path and run it.",
    outputIncludes: ["`arena` skill's `SKILL.md` at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/blast-radius/SKILL.md",
    reason:
      "The unslop skill must be loaded through its DSH resource path, not a bare Cursor route.",
    anchor: "Write it through `unslop`, cite real code",
    expectedMatches: 1,
    replacement:
      "Read the `unslop` skill's `SKILL.md` at its absolute resource path, apply it, cite real code",
    outputIncludes: ["`unslop` skill's `SKILL.md` at its absolute resource path"],
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
