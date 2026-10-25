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
  // -------------------------------------------------------------------------
  // setup-pstack: a dedicated DSH variant, not a path substitution.
  //
  // The upstream skill detects Cursor model slugs and writes a Cursor rule. This
  // port detects child routes through `list_subagent_models`, asks the adapter
  // for reasoning efforts, and writes `$DSH_HOME/pstack-models.md`. The role keys
  // are never restated here: setup reads the generated example, which is built
  // from `scripts/role-manifest.ts`.
  // -------------------------------------------------------------------------
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason:
      "The deliverable is a file `pstack_subagent` reads, not an always-applied Cursor rule.",
    anchor:
      "Detects your available models and writes an always-applied rule that overrides the skill defaults.",
    expectedMatches: 1,
    replacement:
      "Detects the child model routes this deployment serves and writes `$DSH_HOME/pstack-models.md`, which overrides the skill defaults.",
    outputIncludes: ["writes `$DSH_HOME/pstack-models.md`"],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason: "The role policy moved to `$DSH_HOME/pstack-models.md`; nothing else may be written.",
    anchor:
      "Write `~/.cursor/rules/pstack-models.mdc`, an always-applied rule that sets pstack's model per role.",
    expectedMatches: 1,
    replacement:
      "Write `$DSH_HOME/pstack-models.md`, the role file `pstack_subagent` re-reads on every delegation and that sets pstack's model per role.\n\nThat file is the only thing this skill writes. It never touches `package.json`, `cordis.patch.yml`, a native default model, or a credential.",
    outputIncludes: ["It never touches `package.json`, `cordis.patch.yml`, a native default model, or a credential."],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason:
      "Cursor model slugs come from the Task tool; DSH routes and efforts come from the live adapter metadata.",
    anchor:
      "Enumerate the model slugs you can pass to a `Task` subagent in this session. That is the dependable source. If Cursor also exposes a models API or CLI that lists the user's entitled models, prefer it for completeness. If you cannot detect any, ask the user to paste the slugs they have access to. Never write a real slug you have not confirmed is available. The aliases `inherit-parent` and `auto` are always valid even though they are not detected slugs.",
    expectedMatches: 1,
    replacement:
      "Call `list_subagent_models()` with no arguments to list the LLM providers this deployment serves. Call `list_subagent_models({ provider })` to list that provider's models, then `list_subagent_models({ provider, model })` to list the reasoning efforts that exact model supports.\n\nThat adapter metadata is the only dependable source. This deployment decides which routes exist, and only the model's own advertised effort list says whether `max`, `xhigh`, `high`, or `medium` is available. Do not infer an effort ladder from a model id.\n\nWhen `list_subagent_models` is not available in this session, do not invent a route. Either ask the user for a `provider/model` pair they have already confirmed, or write `inherit-parent` for every role and say plainly that the choices are unverified. Never hardcode a model id, never ask for an API key, and never claim a route works because it looks plausible. `inherit-parent` and `auto` always work because they send no route at all.",
    outputIncludes: [
      "Call `list_subagent_models()` with no arguments",
      "write `inherit-parent` for every role and say plainly that the choices are unverified",
    ],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason:
      "The role list is generated from the role manifest, so the skill points at that file instead of restating it.",
    anchor:
      "The default role-to-model mapping is the rule shape shown in step 5 below. If `~/.cursor/rules/pstack-models.mdc` already exists, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.",
    expectedMatches: 1,
    replacement:
      "The role list and the shape of a value come from this package's `../../docs/pstack-models.example.md`. Read that file. It is generated from the role manifest, so it is the list: do not re-derive role names from memory and never add a role the manifest does not name.\n\nIf `$DSH_HOME/pstack-models.md` already exists, read it and treat its `# budget` line and its role values as the current choices, and keep every role the user changed by hand. Otherwise start from the example's `inherit-parent` values. A line whose role is not in the example, such as `how critics`, is from a retired role: list it for the user as retired, then drop it.",
    outputIncludes: [
      "`../../docs/pstack-models.example.md`",
      "list it for the user as retired, then drop it",
    ],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason: "DSH asks the user through `ask_user_question`, and no budget is recorded on a first run.",
    anchor:
      "**(a) Ask for a budget.** Prefer AskQuestion over free text. Offer these four options with these exact labels, and name the current budget when the rule records one. With no rule, say that `large` matches the skill defaults.",
    expectedMatches: 1,
    replacement:
      "**(a) Ask for a budget.** Prefer `ask_user_question` over free text. Offer these four options with these exact labels, and name the current budget when the file records one. With no file, say that no budget is recorded yet and that every role currently inherits the parent route.",
    outputIncludes: ["Prefer `ask_user_question` over free text"],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason:
      "Effort is adapter-owned metadata, not a token at the end of a Cursor slug, so the ladder has to be validated per model.",
    anchor:
      "**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role you changed by family, list, or alias (`inherit-parent`, `auto`). `unlimited`, `large`, `medium`, and `small` set the effort token of every real slug, panel entries included, to `max`, `xhigh`, `high`, or `medium`. The effort token is the last token, or the one before a trailing `fast`, on the ladder `max` > `xhigh` > `high` > `medium` > `low`. If the result is not a detected slug, use the same family's detected slug with the highest effort at or below the target, else mark the role as needing a choice. `inherit-parent` and `auto` do not change. So `unlimited` turns `claude-opus-5-5-xhigh` into `claude-opus-5-5-max`. Grok slugs top out at `xhigh`, so under `unlimited` the fallback puts Grok at `xhigh` and keeps `grok-4.7-xhigh-fast` as it is. `large` keeps both defaults. `small` turns them into `claude-opus-5-5-medium` and `grok-4.7-medium-fast`.",
    expectedMatches: 1,
    replacement:
      "**(b) Apply it.** Keep the route of every role the user set by family, list, or alias (`inherit-parent`, `auto`). Only the effort of a role that already names a route follows the budget. `unlimited`, `large`, `medium`, and `small` target `max`, `xhigh`, `high`, and `medium`.\n\nApply a target only when that model's own `list_subagent_models({ provider, model })` list contains it. When it does not, use the highest effort at or below the target that the model does advertise, and say which role moved. When nothing at or below the target is advertised, mark the role as needing a choice instead of writing an effort the adapter would reject. `inherit-parent` and `auto` never change, because they carry no effort.",
    outputIncludes: [
      "Apply a target only when that model's own",
      "`inherit-parent` and `auto` never change, because they carry no effort.",
    ],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason:
      "Panels expand in `pstack_subagent`, and an unconfigured pool is not a cross-model panel.",
    anchor:
      "**(c) Show the roles and confirm.** Show every role with its model, marking any real slug not in the detected set as needing a choice. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` and `auto` (both mean: this role runs on the parent chat model, which is how Auto users stay on Auto) as the options. Prefer AskQuestion over free text. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose model family differs from the parent's when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.",
    expectedMatches: 1,
    replacement:
      "**(c) Show the roles and confirm.** Show every role with its route, marking any route that does not resolve on this deployment as needing a choice. Also list each line step 2 dropped as retired. Ask whether to accept as-is or change specific roles, offering the confirmed routes plus `inherit-parent` and `auto`, which both mean this role runs on the parent chat model. Prefer `ask_user_question` over free text.\n\nFor the panel roles (`arena runners`, `architect runners`, `interrogate reviewers`) the value is a list, and `pstack_subagent` starts one child per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but `pstack_subagent` starts one child from it, chosen with `roleIndex`. `swarm workers` is the one route every worker uses, and the caller starts each worker itself. Two entries on the same route are not a cross-model panel; say so instead of implying model diversity.",
    outputIncludes: [
      "`pstack_subagent` starts one child per entry",
      "Two entries on the same route are not a cross-model panel",
    ],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason: "Validation moved from detected slugs to served routes and advertised efforts.",
    anchor:
      "Every real slug written must be in the detected set. `inherit-parent` and `auto` always pass. If a chosen real slug is not available, stop and ask again.",
    expectedMatches: 1,
    replacement:
      "Every route written must be one this deployment serves, and every effort must appear in that exact model's advertised list. `inherit-parent` and `auto` always pass. If a chosen route does not resolve, stop and ask again rather than writing it and hoping the first delegation catches it.",
    outputIncludes: ["every effort must appear in that exact model's advertised list"],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason: "The deliverable is a file, not a Cursor rule.",
    anchor: "### 5. Write the rule\n",
    expectedMatches: 1,
    replacement: "### 5. Write the file\n",
    outputIncludes: ["### 5. Write the file"],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason:
      "The written file is the DSH role file, and re-runs converge by reading the old file first.",
    anchor:
      "Write `~/.cursor/rules/pstack-models.mdc` with `alwaysApply: true`, a `# budget` line with the chosen label and its target effort, and one line per role, using the same labels poteto-mode uses. Overwrite the whole file so re-runs stay idempotent. Shape:",
    expectedMatches: 1,
    replacement:
      "Read the old `$DSH_HOME/pstack-models.md` first, keep the user's own edits, name the retired roles you dropped, and confirm before overwriting. Then write the complete file in one pass, so a re-run of this skill produces the same bytes and converges: a `# budget` line naming the chosen label and its target effort, and one line per role, using the exact role keys from the example.",
    outputIncludes: [
      "Then write the complete file in one pass",
      "a re-run of this skill produces the same bytes and converges",
    ],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason:
      "The upstream block is a second literal role list with Cursor slugs. The generated example is the only copy, so the skill points at it instead of restating it.",
    anchor: /```\n---\ndescription: pstack per-role model choices[\s\S]*?\n```\n/,
    expectedMatches: 1,
    replacement:
      "Read `../../docs/pstack-models.example.md` from this package and write the same shape to `$DSH_HOME/pstack-models.md`, replacing each `inherit-parent` with the route the user confirmed. Do not retype the role keys from this skill: the example is generated from the role manifest, and a hand-written copy would drift from the parser.\n",
    outputIncludes: [
      "Do not retype the role keys from this skill",
      "the example is generated from the role manifest",
    ],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason:
      "The change reaches the next delegation, not a new session; a running child keeps the route it started with.",
    anchor:
      "Tell the user the rule was written and that it applies to new sessions. Re-running this skill updates it.",
    expectedMatches: 1,
    replacement:
      "Tell the user the file was written and that it applies to the next delegation, because `pstack_subagent` re-reads it every time. A child that already started keeps the route it started with. Re-running this skill updates the file.",
    outputIncludes: [
      "it applies to the next delegation, because `pstack_subagent` re-reads it every time",
      "A child that already started keeps the route it started with.",
    ],
  },
  {
    kind: "replace",
    file: "skills/setup-pstack/SKILL.md",
    reason: "Both verification generators ship inside this package, so the install-location aside is Cursor text.",
    anchor: "(resolves wherever pstack is installed: workspace, user, or plugin)",
    expectedMatches: 2,
    replacement: "(its `SKILL.md` is in this package's skill resources)",
    outputIncludes: ["(its `SKILL.md` is in this package's skill resources)"],
  },
  // -------------------------------------------------------------------------
  // poteto-agent: Cursor install discovery becomes host injection.
  // -------------------------------------------------------------------------
  {
    kind: "replace",
    file: "agents/poteto-agent.md",
    reason:
      "`generalPurpose` is a Cursor subagent_type; the DSH equivalent this tool accepts is `general`.",
    anchor: "Substituting `generalPurpose` skips that read and drifts.",
    expectedMatches: 1,
    replacement: "Substituting `general` skips that read and drifts.",
    outputIncludes: ["Substituting `general` skips that read and drifts."],
  },
  {
    kind: "replace",
    file: "agents/poteto-agent.md",
    reason: "Every delegation now arrives through `pstack_subagent`, not the Cursor Task tool.",
    anchor: "owns the playbook, the todo list, and every Task spawn.",
    expectedMatches: 1,
    replacement: "owns the playbook, the todo list, and every `pstack_subagent` spawn.",
    outputIncludes: ["every `pstack_subagent` spawn"],
  },
  {
    kind: "replace",
    file: "agents/poteto-agent.md",
    reason:
      "The plugin directory scan and version comparison are Cursor install discovery. The Host injects the absolute path instead, so the child never guesses a plugin version.",
    anchor:
      "Use the absolute path your parent gave you. With no path, before any other work, search `~/.cursor/plugins/` for a file whose path ends in `skills/poteto-mode/SKILL.md`. If more than one file matches, use the copy whose `.cursor-plugin/plugin.json` has the highest `version`. Your skill catalog hides this skill, so a missing catalog entry does not mean pstack is absent. If no such file exists, stop and tell your parent.",
    expectedMatches: 1,
    replacement:
      "`pstack_subagent` injects that absolute path into your brief. Use the path it gave you and read the file there. Your skill catalog also hides this skill, so a missing catalog entry does not mean pstack is absent. If the brief gave no path and you cannot read the file, stop and tell your parent.",
    outputIncludes: [
      "`pstack_subagent` injects that absolute path into your brief.",
      "If the brief gave no path and you cannot read the file, stop and tell your parent.",
    ],
  },
];

export function patchesForFile(file: string): readonly FilePatch[] {
  return FILE_PATCHES.filter((patch) => patch.file === file);
}
