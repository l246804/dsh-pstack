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

/**
 * Files unit 4 rewrote to DSH semantics.
 *
 * `check-assets` scans exactly these generated bodies for unmapped Cursor fields.
 * The list is deliberately per file: other skills still carry Cursor vocabulary
 * until their own unit patches them, and a tree-wide ban would fail on text this
 * unit does not own.
 */
export const UNIT4_PATCHED_FILES: readonly string[] = [
  "skills/how/SKILL.md",
  "skills/why/SKILL.md",
  "skills/architect/SKILL.md",
  "skills/arena/SKILL.md",
  "skills/swarm/SKILL.md",
  "skills/interrogate/SKILL.md",
  "skills/no-comments/SKILL.md",
  "skills/figure-it-out/SKILL.md",
  "skills/poteto-help/SKILL.md",
  "skills/poteto-mode/playbooks/investigation.md",
  "skills/poteto-mode/playbooks/bug-fix.md",
  "skills/poteto-mode/playbooks/perf-issue.md",
  "skills/poteto-mode/playbooks/runtime-forensics.md",
  "skills/poteto-mode/playbooks/trace-forensics.md",
  "skills/poteto-mode/playbooks/feature.md",
  "skills/poteto-mode/playbooks/refactoring.md",
  "skills/poteto-mode/playbooks/prototype.md",
  "skills/poteto-mode/playbooks/authoring-a-skill.md",
  "skills/poteto-mode/playbooks/opening-a-pr.md",
];

/**
 * Cursor fields and paths that have no DSH equivalent.
 *
 * A unit-4 file may still name Cursor as a product where the sentence is about
 * Cursor's own behavior. What it may not do is spell a field or a path this port
 * has no replacement for, because a reader would try it and the host would reject
 * the call.
 */
export const FORBIDDEN_CURSOR_FIELDS: readonly string[] = [
  "subagent_type",
  "run_in_background",
  "readonly: true",
  "readonly: false",
  "cloud_base_branch",
  "file_attachments",
  'environment: "cloud"',
  'environment: "local"',
  "pstack-models.mdc",
  "AskQuestion",
  "TodoWrite",
  "always-applied rule",
];

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
    reason:
      "The linked document is the DSH mapping, and the Cursor/Claude install paragraph describes hosts this build is not.",
    anchor:
      "pstack is built for Cursor, and it also installs in Claude Code with `/plugin marketplace add cursor/plugins`, then `/plugin install pstack@cursor-plugins`. There, each command takes a `pstack:` prefix, such as `/pstack:poteto-mode`. The [Claude Code adapter](../../docs/harness/claude-code.md) maps the Cursor names, and a step that needs a Cursor-only feature, such as Bugbot or Automations, is skipped with a one-line note.\n\nOther tools can read the skills, because they use the Agent Skills format. But most workflow skills, including `/poteto-mode`, `/how`, `/why`, and `/teach`, spawn Cursor subagents with per-role models, and Custom Modes and `/loop` are Cursor features, so those parts may not work there.",
    expectedMatches: 1,
    replacement:
      "This tree is the DSH build of pstack. The Cursor and Claude Code variants are upstream documents and are not shipped here. The [DSH harness mapping](../../docs/harness/dsh.md) maps the Cursor names onto this host, and a step that needs a capability this port does not have is reported at the step that needs it, not silently skipped.\n\nEvery workflow skill here runs through this package's bundled skill provider, and the skills that delegate start `pstack_subagent` children whose routes come from `$DSH_HOME/pstack-models.md`. There is no Custom Mode and no `/loop`; start each task with `/poteto-mode`, and treat a multi-hour run as something you supervise in the same Session.",
    outputIncludes: [
      "[DSH harness mapping](../../docs/harness/dsh.md)",
      "There is no Custom Mode and no `/loop`",
    ],
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
  // Unit 4: the workflow skills. Every spawn becomes a `pstack_subagent` call,
  // every role becomes an exact manifest key, and every cross-skill route becomes
  // a read at the skill's absolute resource path, because the model catalog hides
  // these skills. Cursor-only fields are dropped rather than renamed.
  // -------------------------------------------------------------------------
  {
    kind: "replace",
    file: "skills/how/SKILL.md",
    reason:
      "Cursor's Task spawn, `readonly: true`, and model slugs are replaced by a real `pstack_subagent` call whose route comes from the role file.",
    anchor:
      "Every spawn is a Task subagent with `subagent_type: generalPurpose` and `readonly: true`. Explorers use the `how explorer` line in the `pstack-models.mdc` rule (default `grok-4.7-xhigh-fast`), and every explainer uses the `how explainer` line (default `claude-opus-5-5-xhigh`). Set `model` to that line's value, or to the default if the rule or the line is missing. Leave `model` unset when the value is `auto` or `inherit-parent`. If the Task tool rejects a slug, use the default and say so. If it rejects the default, use the closest valid slug of the same family from its error message. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the **poteto-mode** skill.",
    expectedMatches: 1,
    replacement:
      'Every spawn is a `pstack_subagent` call with `agent: "general"` and `role: "how explorer"` or `role: "how explainer"`. Read that role\'s route from `$DSH_HOME/pstack-models.md`; the tool re-reads the file on every delegation, and a role the file does not name inherits the parent route. Never invent a model id or an effort: this package cannot know which routes a deployment serves. Explorers are read-only by instruction, not by sandbox, so state the no-write rule in each brief and check `git status` after the child reports. Read the Subagents section of the `poteto-mode` skill at its absolute resource path before you spawn anything.',
    outputIncludes: [
      '`pstack_subagent` call with `agent: "general"`',
      "Read that role's route from `$DSH_HOME/pstack-models.md`",
      "Explorers are read-only by instruction, not by sandbox",
    ],
  },
  {
    kind: "replace",
    file: "skills/how/SKILL.md",
    reason: "One explainer is one activation, not a Cursor spawn.",
    anchor:
      "no explorers. Spawn one explainer that explores and explains in one pass, built from `references/explainer-prompt.md` without the explorer-findings section. Go to step 4.",
    expectedMatches: 1,
    replacement:
      "no explorers. Start one explainer child with `references/explainer-prompt.md` and no explorer findings; it explores and explains in one pass. Go to step 4.",
    outputIncludes: ["Start one explainer child"],
  },
  {
    kind: "replace",
    file: "skills/how/SKILL.md",
    reason:
      "There is no batch spawn field; parallel explorers are several tool calls in one batch, and results arrive as completion notices.",
    anchor:
      "Decompose the question into 2 to 4 angles, each a distinct slice of the subsystem. Spawn all explorers in a single message, each with `references/explorer-prompt.md` and its angle filled in.",
    expectedMatches: 1,
    replacement:
      "Decompose the question into 2 to 4 angles, each a distinct slice of the subsystem. Start every explorer as one batch of `pstack_subagent` calls, each with `references/explorer-prompt.md` and its angle filled in. Each call returns a child id and the report arrives as a completion notice, so nothing polls: move on once the notices are in.",
    outputIncludes: [
      "one batch of `pstack_subagent` calls",
      "the report arrives as a completion notice, so nothing polls",
    ],
  },
  {
    kind: "replace",
    file: "skills/how/SKILL.md",
    reason:
      "Starting the explainer before the last explorer reports would synthesize partial evidence, which the upstream sequencing forbids.",
    anchor:
      "Once all explorers have returned, spawn one explainer with `references/explainer-prompt.md` and every explorer's findings filled in.",
    expectedMatches: 1,
    replacement:
      "Once all explorers have returned, start one explainer child with `references/explainer-prompt.md` and every explorer's findings filled in. Starting it earlier drops whatever had not reported yet.",
    outputIncludes: ["Starting it earlier drops whatever had not reported yet."],
  },
  {
    kind: "replace",
    file: "skills/why/SKILL.md",
    reason:
      "Cursor's rule file and slug fallback become the DSH role file, whose missing role means the parent route rather than a guessed model.",
    anchor:
      "Each spawn below names a role line in the `pstack-models.mdc` rule and a default. Set `model` to that line's value, or to the default if the rule or the line is missing. Leave `model` unset when the value is `auto` or `inherit-parent`. If the Task tool rejects a slug, use the default and say so. If it rejects the default, use the closest valid slug of the same family from its error message. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the **poteto-mode** skill.",
    expectedMatches: 1,
    replacement:
      'Each spawn below names a role key. `pstack_subagent` reads the route from `$DSH_HOME/pstack-models.md` on every delegation, and a role the file does not name inherits the parent route. Never invent a model id or an effort: this package cannot know which routes a deployment serves. Read the Subagents section of the `poteto-mode` skill at its absolute resource path before you spawn anything.',
    outputIncludes: [
      "Each spawn below names a role key.",
      "a role the file does not name inherits the parent route",
    ],
  },
  {
    kind: "replace",
    file: "skills/why/SKILL.md",
    reason:
      "`readonly: false` is removed, but the MCP requirement it protected survives: a write-free preset could strip the evidence sources.",
    anchor:
      "Every spawn is `generalPurpose` with `readonly: false` (agent mode). **Do not use readonly/Ask mode.** It strips MCP access, which disables the MCP-backed investigators and the synthesizer's citation spot-checks. Investigators still shouldn't write anything.",
    expectedMatches: 1,
    replacement:
      'Every spawn is `agent: "general"` with a brief that forbids writes. **Do not swap in a narrower preset or tool set.** A narrower set can drop MCP tools, which disables the MCP-backed investigators and the synthesizer\'s citation spot-checks. Investigators still must not write anything, and each brief says so; that rule is an instruction, not a sandbox, so check `git status` before believing a report.',
    outputIncludes: [
      "Do not swap in a narrower preset or tool set.",
      "that rule is an instruction, not a sandbox",
    ],
  },
  {
    kind: "replace",
    file: "skills/why/SKILL.md",
    reason:
      "Cursor's MCP directory does not exist here; the only dependable availability signal is the session's own tool list.",
    anchor:
      "Before spawning investigators, list the available MCPs from the Cursor environment. Use the available-tools map when present. Otherwise inspect the `mcps/` directory Cursor exposes for enabled MCP servers.",
    expectedMatches: 1,
    replacement:
      "Before spawning investigators, list the tools this Session actually has, and treat an MCP as available only when its own tools appear in that list. The DSH harness exposes no MCP directory to inspect, and this port does not read one: an MCP that is absent from the tool list is a recorded gap, never a guess.",
    outputIncludes: [
      "treat an MCP as available only when its own tools appear in that list",
      "is a recorded gap, never a guess",
    ],
  },
  {
    kind: "replace",
    file: "skills/why/SKILL.md",
    reason:
      "Cursor's Task `model:` parameter becomes the `why investigators` role, and the fan-out gains the rule that nothing polls a child.",
    anchor:
      "Spawn one investigator per category that has a matching MCP, all in a single message so they run concurrently, each owning exactly one tool or MCP. Don't ask one agent to cover multiple MCPs. `model`: the `why investigators` line, default `grok-4.7-xhigh-fast`.",
    expectedMatches: 1,
    replacement:
      'Spawn one investigator per category that has a matching MCP, all in one batch of `pstack_subagent` calls so they start together, each owning exactly one tool or MCP. Don\'t ask one agent to cover multiple MCPs. Use `role: "why investigators"`. Each call returns a child id and the reports arrive as completion notices, so nothing polls and the synthesizer waits for every investigator that was started.',
    outputIncludes: [
      'Use `role: "why investigators"`',
      "the synthesizer waits for every investigator that was started",
    ],
  },
  {
    kind: "replace",
    file: "skills/why/SKILL.md",
    reason: "The synthesizer route is a role key, not a Cursor model slug.",
    anchor: "Spawn one synthesizer. `model`: the `why synthesizer` line, default `claude-opus-5-5-xhigh`. It gets:",
    expectedMatches: 1,
    replacement: 'Spawn one synthesizer with `role: "why synthesizer"`. It gets:',
    outputIncludes: ['`role: "why synthesizer"`'],
  },
  {
    kind: "replace",
    file: "skills/why/SKILL.md",
    reason: "The companion skill has to be loaded by path, because the catalog hides it.",
    anchor:
      "Investigate the motivation and intent behind code. The companion `how` skill answers what the code does and how it works. `why` answers what forces led to its shape.",
    expectedMatches: 1,
    replacement:
      "Investigate the motivation and intent behind code. The companion `how` skill answers what the code does and how it works; read its `SKILL.md` at its absolute resource path when you need it. `why` answers what forces led to its shape.",
    outputIncludes: ["read its `SKILL.md` at its absolute resource path when you need it"],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason: "The phase list is a `todo_write` list in this host.",
    anchor: "Open a todolist with one entry per phase before starting.",
    expectedMatches: 1,
    replacement: "Open a `todo_write` list with one entry per phase before starting.",
    outputIncludes: ["Open a `todo_write` list with one entry per phase"],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason: "`how` and `why` are loaded by absolute resource path, not by a bare Cursor route.",
    anchor:
      "Build a real mental model of every system the new code touches. Run the **how** skill over the relevant subsystems. Naming a file isn't grounding. Produce the architectural explanation `how` prescribes. If the design redefines ownership or layering, also run the **why** skill on the existing shape so the rationale becomes a constraint, not a guess.",
    expectedMatches: 1,
    replacement:
      "Build a real mental model of every system the new code touches. Read the `how` skill's `SKILL.md` at its absolute resource path and run it over the relevant subsystems. Naming a file isn't grounding. Produce the architectural explanation `how` prescribes. If the design redefines ownership or layering, read the `why` skill's `SKILL.md` at its absolute resource path and run it on the existing shape, so the rationale becomes a constraint, not a guess.",
    outputIncludes: [
      "Read the `how` skill's `SKILL.md` at its absolute resource path and run it",
      "read the `why` skill's `SKILL.md` at its absolute resource path",
    ],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason: "Arena is reached through its resource path, and the panel it runs is `architect runners`.",
    anchor:
      "Run the **arena** skill with the design-sketch task and the Phase A grounding artifacts. Pass `references/runner-prompt.md` as each runner's prompt.",
    expectedMatches: 1,
    replacement:
      "Read the `arena` skill's `SKILL.md` at its absolute resource path and run it with the design-sketch task and the Phase A grounding artifacts. Pass `references/runner-prompt.md` as each runner's prompt.",
    outputIncludes: ["Read the `arena` skill's `SKILL.md` at its absolute resource path and run it"],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason:
      "Cursor's runner line and family fallback become the `architect runners` panel, which must not be confused with `arena runners`, plus the isolation rule that two children may not share one parent checkout.",
    anchor:
      "Take the runners from the `architect runners` line in the `pstack-models.mdc` rule, in place of the `arena runners` line. If the rule or that line is missing, use `claude-opus-5-5-xhigh` and `grok-4.7-xhigh-fast`. Alias and rejected entries follow the runner rules in the **arena** skill's Phase A.",
    expectedMatches: 1,
    replacement:
      'Use `role: "architect runners"` in place of the `arena runners` role. That role is a panel, so one `pstack_subagent` call starts one runner per entry and reports every child id with the route it actually got. A role the file does not name inherits the parent route; an entry whose route does not resolve fails that runner and names the role file, while the remaining entries still start and the result records the degradation. Two entries on the same route are two sketches from one model, not a multi-model sketch, and the result says so. Each runner needs its own checkout: the child calls `create_worktree` in its own Session, or you create the checkouts one at a time and pass each absolute `path` as that child\'s `cwd`, because two children writing in one parent checkout is not isolation.',
    outputIncludes: [
      'Use `role: "architect runners"` in place of the `arena runners` role',
      "Two entries on the same route are two sketches from one model",
      "two children writing in one parent checkout is not isolation",
    ],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason: "The principle skill has to be read by path instead of cited as a bare name.",
    anchor:
      "Design it twice. Require at least two structurally distinct candidates before synthesis, even when the first looks sufficient. This is the **exhaust-the-design-space** principle skill made concrete. Whole-shape alternatives, not point fixes inside one shape.",
    expectedMatches: 1,
    replacement:
      "Design it twice. Require at least two structurally distinct candidates before synthesis, even when the first looks sufficient. This is `principle-exhaust-the-design-space` made concrete; read its `SKILL.md` at its absolute resource path. Whole-shape alternatives, not point fixes inside one shape.",
    outputIncludes: ["`principle-exhaust-the-design-space` made concrete; read its `SKILL.md`"],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason:
      "A checkpoint has to ask the user through the host question tool, and it may not assume approval when nobody answers.",
    anchor:
      'Opt in to a checkpoint when the invoker explicitly asks: "/architect with checkpoint," "stop and show me before implementing," or similar. Then surface the synthesized design and pause for sign-off.',
    expectedMatches: 1,
    replacement:
      'Opt in to a checkpoint when the invoker explicitly asks: "/architect with checkpoint," "stop and show me before implementing," or similar. Then surface the synthesized design and pause for sign-off, using `ask_user_question` when there is a real choice. With no answerer, stop and report the design instead of assuming approval.',
    outputIncludes: [
      "using `ask_user_question` when there is a real choice",
      "With no answerer, stop and report the design instead of assuming approval.",
    ],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason: "Three principle skills and `interrogate` are loaded by path, not by bare Cursor names.",
    anchor:
      'The synthesis can ship as its own commit either way, as the "scaffold first" mode of the **foundational-thinking** principle skill. Planned and scoped breakage during fill-in is fine, per the **outcome-oriented-execution** principle skill. For adversarial pressure on the design before implementing, run the **interrogate** skill on the synthesized sketch.',
    expectedMatches: 1,
    replacement:
      'The synthesis can ship as its own commit either way, as the "scaffold first" mode of `principle-foundational-thinking`. Planned and scoped breakage during fill-in is fine, per `principle-outcome-oriented-execution`. Read either `SKILL.md` at its absolute resource path. For adversarial pressure on the design before implementing, read the `interrogate` skill\'s `SKILL.md` at its absolute resource path and run it on the synthesized sketch.',
    outputIncludes: [
      "`principle-foundational-thinking`",
      "read the `interrogate` skill's `SKILL.md` at its absolute resource path",
    ],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason: "Two principle skills are named without a route the model can load.",
    anchor:
      "If implementation keeps producing friction the sketch can't absorb, throw the sketch out. Don't bolt fixes onto a wrong design, per the **redesign-from-first-principles** and **fix-root-causes** principle skills.",
    expectedMatches: 1,
    replacement:
      "If implementation keeps producing friction the sketch can't absorb, throw the sketch out. Don't bolt fixes onto a wrong design: read `principle-redesign-from-first-principles` and `principle-fix-root-causes` at their absolute resource paths.",
    outputIncludes: [
      "read `principle-redesign-from-first-principles` and `principle-fix-root-causes` at their absolute resource paths",
    ],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason: "The scrap loop re-enters `how`, which is a path read here.",
    anchor: "1. Re-run the **how** skill over what's been built.",
    expectedMatches: 1,
    replacement:
      "1. Read the `how` skill's `SKILL.md` at its absolute resource path and re-run it over what's been built.",
    outputIncludes: ["Read the `how` skill's `SKILL.md` at its absolute resource path and re-run it"],
  },
  {
    kind: "replace",
    file: "skills/architect/SKILL.md",
    reason: "The subtract principle is cited as a bare skill name.",
    anchor:
      "3. Subtract before adding, per the **subtract-before-you-add** principle skill. The new sketch should be smaller than the old one before it grows.",
    expectedMatches: 1,
    replacement:
      "3. Subtract before adding, as `principle-subtract-before-you-add` requires; read its `SKILL.md` at its absolute resource path. The new sketch should be smaller than the old one before it grows.",
    outputIncludes: ["as `principle-subtract-before-you-add` requires"],
  },
  {
    kind: "replace",
    file: "skills/arena/SKILL.md",
    reason: "The phase list is a `todo_write` list in this host.",
    anchor:
      "Open a todolist with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.",
    expectedMatches: 1,
    replacement:
      "Open a `todo_write` list with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.",
    outputIncludes: ["Open a `todo_write` list with one entry per phase"],
  },
  {
    kind: "replace",
    file: "skills/arena/SKILL.md",
    reason:
      "Cursor's runner line, slug-family fallback, and `model` parameter become the `arena runners` panel with per-entry routes and an honest same-route diagnosis.",
    anchor:
      "3. Pick the runners. Use the `arena runners` line in `~/.cursor/rules/pstack-models.mdc`. If the rule or that line is missing, default to one each on `claude-opus-5-5-xhigh` and `grok-4.7-xhigh-fast`. An `auto` or `inherit-parent` entry in this line or the cross-judge line means the parent model, so omit `model` for it. If the Task tool rejects a configured entry, run that seat on its family's default and say so. Families go by prefix: `claude-*`, and `grok-*` with `cursor-grok-*` and `composer-*`. A refused `composer-*` entry runs on `grok-4.7-xhigh-fast`. With no family match, use `claude-opus-5-5-xhigh`. If it rejects a default, use the closest valid slug of the same family from its error message. Spawn more runners when the arena covers multiple design directions. Use the same model N times when the work is generation-bound rather than judgment-sensitive. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the **poteto-mode** skill.",
    expectedMatches: 1,
    replacement:
      '3. Pick the runners. Use `role: "arena runners"`: that role is a panel, so one `pstack_subagent` call starts one child per entry in the role file and the result lists every child id with the route it actually got. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first. An entry the file does not name inherits the parent route. An entry whose route does not resolve fails that seat and names the role file; the remaining seats still start and the result records the degradation. Two entries on the same route give you two attempts from one model, not a cross-model arena, and the result says so. Add entries when the arena covers multiple design directions, and repeat one route when the work is generation-bound rather than judgment-sensitive.',
    outputIncludes: [
      'Use `role: "arena runners"`',
      "the result lists every child id with the route it actually got",
      "not a cross-model arena, and the result says so",
    ],
  },
  {
    kind: "replace",
    file: "skills/arena/SKILL.md",
    reason:
      "A worktree is created by the child through `create_worktree` or prepared by the parent; the port cannot promise more isolation than a checkout and branch.",
    anchor:
      "4. Give each candidate its own output location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per the **separate-before-serializing-shared-state** principle skill.",
    expectedMatches: 1,
    replacement:
      "4. Give each candidate its own output location. The child calls `create_worktree({ name })` in its own Session and writes there, or you create the checkouts one at a time first and pass each absolute `path` as that child's `cwd`; `create_worktree` returns the path, branch, pinned commit, and repository root. That isolation covers the working directory and branch only, so ports, credentials, running services, and caches still collide. A scratch directory outside the repository is the fallback when Git isolation is not wanted. This is `principle-separate-before-serializing-shared-state`; read its `SKILL.md` at its absolute resource path.",
    outputIncludes: [
      "The child calls `create_worktree({ name })` in its own Session",
      "That isolation covers the working directory and branch only",
    ],
  },
  {
    kind: "replace",
    file: "skills/arena/SKILL.md",
    reason:
      "`run_in_background` does not exist: a child is a managed activation, and the caller never polls.",
    anchor:
      "Spawn all N subagents in one message with `run_in_background: true`, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected.",
    expectedMatches: 1,
    replacement:
      "Start all N subagents in one batch of `pstack_subagent` calls, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected. A child is a managed activation, so there is no background flag and nothing polls: each result arrives as a completion notice. A brief that needs a read-only candidate still has to say so, because the tool enforces no such mode.",
    outputIncludes: [
      "one batch of `pstack_subagent` calls",
      "there is no background flag and nothing polls",
    ],
  },
  {
    kind: "replace",
    file: "skills/arena/SKILL.md",
    reason:
      "`resume` is not a field here: a live child keeps its state through `send_message`, and anything else starts fresh.",
    anchor: "If a candidate produces no output, proceed with N-1 and note the dropout.",
    expectedMatches: 1,
    replacement:
      "If a candidate produces no output, proceed with N-1 and note the dropout. To keep a live candidate's local state, such as its checkout, uncommitted edits, or a running process, send it another instruction with `send_message`; that returns an acceptance, not an answer, and the reply still arrives as the child's own completion notice. Otherwise start a fresh child, because a settled child is never silently resumed.",
    outputIncludes: [
      "send it another instruction with `send_message`",
      "a settled child is never silently resumed",
    ],
  },
  {
    kind: "replace",
    file: "skills/arena/SKILL.md",
    reason:
      "The cross-judge is one entry chosen from a list role with `roleIndex`, and the same-route case has to be stated rather than implied.",
    anchor:
      "After all Phase B candidates complete, choose one model from the `arena cross-judge pool` line in `~/.cursor/rules/pstack-models.mdc`. If the rule or that line is missing, choose from `claude-opus-5-5-xhigh` and `grok-4.7-xhigh-fast`. Prefer a different model family from the parent's. Spawn one readonly judge subagent on that model. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don't spawn it while candidates are still writing.",
    expectedMatches: 1,
    replacement:
      'After all Phase B candidates complete, choose one entry from `role: "arena cross-judge pool"` with `roleIndex`. That role is a list but is not fanned out: one call starts one judge on the entry you picked. Prefer a route whose provider and model family differ from the parent\'s, and when you cannot confirm a different family, say plainly that the cross-judge is the same model reviewing itself. Start it with a brief that forbids writes and tells it to check `git status` instead of claiming it wrote nothing. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don\'t start it while candidates are still writing.',
    outputIncludes: [
      '`role: "arena cross-judge pool"` with `roleIndex`',
      "the cross-judge is the same model reviewing itself",
    ],
  },
  {
    kind: "replace",
    file: "skills/arena/SKILL.md",
    reason: "The Laziness Protocol is a skill this host hides from the catalog.",
    anchor:
      "Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.",
    expectedMatches: 1,
    replacement:
      "Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per `principle-laziness-protocol`; read its `SKILL.md` at its absolute resource path.",
    outputIncludes: ["per `principle-laziness-protocol`; read its `SKILL.md`"],
  },
  {
    kind: "replace",
    file: "skills/arena/SKILL.md",
    reason: "The graft principle is cited as a bare skill name.",
    anchor:
      "Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.",
    expectedMatches: 1,
    replacement:
      "Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, as `principle-redesign-from-first-principles` requires; read its `SKILL.md` at its absolute resource path, so the result stays coherent under one mental model. Don't paste mechanically.",
    outputIncludes: ["as `principle-redesign-from-first-principles` requires"],
  },
  {
    kind: "replace",
    file: "skills/arena/SKILL.md",
    reason: "The verification principle is cited as a bare skill name.",
    anchor:
      "Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.",
    expectedMatches: 1,
    replacement:
      "Verify the synthesized artifact like any other output, as `principle-prove-it-works` requires; read its `SKILL.md` at its absolute resource path. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.",
    outputIncludes: ["as `principle-prove-it-works` requires"],
  },
  {
    kind: "replace",
    file: "skills/swarm/SKILL.md",
    reason: "The phase list is a `todo_write` list in this host.",
    anchor: "Open a todolist with one entry per phase before launching anything.",
    expectedMatches: 1,
    replacement: "Open a `todo_write` list with one entry per phase before launching anything.",
    outputIncludes: ["Open a `todo_write` list with one entry per phase"],
  },
  {
    kind: "replace",
    file: "skills/swarm/SKILL.md",
    reason:
      "Cursor's worker model line becomes the single-route `swarm workers` role, and a model race has to name a distinct route per arm instead of hoping one route is several models.",
    anchor:
      "4. Pick the worker model from the `swarm workers` line in `~/.cursor/rules/pstack-models.mdc`. If the rule or that line is missing, use `grok-4.7-xhigh-fast`. For `auto` or `inherit-parent`, omit `model` so the workers run on the parent model. If the Task tool rejects a slug, use the default and say so. If it rejects the default, use the closest valid slug of the same family from its error message. For a model race, name each arm's model up front. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the **poteto-mode** skill.",
    expectedMatches: 1,
    replacement:
      '4. Pick the worker route. Use `role: "swarm workers"` for every worker: that role is one route, not a panel, so you start each worker yourself with one `pstack_subagent` call each. A role the file does not name inherits the parent route. Never invent a model id. For a model race, give each arm its own configured entry instead of the single `swarm workers` route: pass `role: "arena runners"` with a distinct `roleIndex` per arm, so each arm\'s route shows up in the result rather than being implied. Two arms on one route are not a race between models, and the result says so. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first.',
    outputIncludes: [
      'Use `role: "swarm workers"` for every worker',
      'pass `role: "arena runners"` with a distinct `roleIndex` per arm',
      "Two arms on one route are not a race between models",
    ],
  },
  {
    kind: "replace",
    file: "skills/swarm/SKILL.md",
    reason: "A writing worker needs its own checkout, and the port states what that isolation does not cover.",
    anchor:
      "5. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.",
    expectedMatches: 1,
    replacement:
      "5. Give each worker its own writable output when it writes: the worker calls `create_worktree({ name })` in its own Session, or you create the checkouts one at a time and pass each absolute `path` as that worker's `cwd`. Two workers in one checkout are not isolated, and the parallel writes will collide on shared files. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.",
    outputIncludes: [
      "the worker calls `create_worktree({ name })` in its own Session",
      "Two workers in one checkout are not isolated",
    ],
  },
  {
    kind: "replace",
    file: "skills/swarm/SKILL.md",
    reason:
      "`subagent_type`, `environment: \"cloud\"`, and `run_in_background` do not exist; every worker is a local activation.",
    anchor:
      'Spawn all N workers in one message with `subagent_type: generalPurpose`, `environment: "cloud"`, `run_in_background: true`, and the step 4 model, left unset for `auto` or `inherit-parent`. Use `environment: "local"` only when the worker needs access to something on the user\'s computer.',
    expectedMatches: 1,
    replacement:
      'Start all N workers in one batch of `pstack_subagent` calls with `agent: "general"` and the step 4 role. A worker is a managed activation, so there is no background flag and nothing polls: each result arrives as a completion notice. Every worker runs locally as a child of this Session; there is no cloud environment, no VM, and no per-arm machine.',
    outputIncludes: [
      'one batch of `pstack_subagent` calls with `agent: "general"`',
      "there is no cloud environment, no VM, and no per-arm machine",
    ],
  },
  {
    kind: "replace",
    file: "skills/swarm/SKILL.md",
    reason:
      "`cloud_base_branch` becomes a local revision: the checkout is created from a local ref and a remote-only branch has to be fetched first.",
    anchor: "When a worker must start from a non-default pushed branch, pass `cloud_base_branch`.",
    expectedMatches: 1,
    replacement:
      "When a worker must start from a branch other than the current one, make that branch reachable locally and start the checkout from it: the worker calls `create_worktree({ name, from })` with a local revision, or you create the checkout yourself and pass its absolute `path` as the worker's `cwd`. Creation does not fetch, so a branch that only exists on a remote has to be fetched first; a missing local revision fails instead of silently branching off the current commit.",
    outputIncludes: [
      "the worker calls `create_worktree({ name, from })` with a local revision",
      "Creation does not fetch",
    ],
  },
  {
    kind: "replace",
    file: "skills/interrogate/SKILL.md",
    reason:
      "Model diversity is the whole mechanism, so a same-route panel has to be named as one model reviewing twice.",
    anchor:
      "Spawn one reviewer per configured model to adversarially review code changes. The adversarial signal comes from model diversity, not assigned personas. The deliverable is a synthesized verdict. Do NOT auto-apply changes.",
    expectedMatches: 1,
    replacement:
      "Spawn one reviewer per configured route to adversarially review code changes. The adversarial signal comes from model diversity, not assigned personas; when two entries resolve to the same route, say plainly that the review is one model reading the diff twice, because that is what it is. The deliverable is a synthesized verdict. Do NOT auto-apply changes.",
    outputIncludes: ["say plainly that the review is one model reading the diff twice"],
  },
  {
    kind: "replace",
    file: "skills/interrogate/SKILL.md",
    reason:
      "The reviewer line becomes the `interrogate reviewers` panel, which expands one child per entry and reports each actual route.",
    anchor:
      "Launch all reviewers in a single message with the Task tool, one per entry on the `interrogate reviewers` line in `~/.cursor/rules/pstack-models.mdc`, labeled Reviewer A, B, and so on to match the entry count. If the rule or that line is missing, use the table defaults.",
    expectedMatches: 1,
    replacement:
      'Launch all reviewers in one batch of `pstack_subagent` calls with `role: "interrogate reviewers"`. That role is a panel, so one call starts one child per entry in the role file and the result lists every child id with its actual route; label them Reviewer A, B, and so on to match the entry count. A role the file does not name inherits the parent route, and that is not a different model.',
    outputIncludes: [
      '`role: "interrogate reviewers"`',
      "the result lists every child id with its actual route",
      "that is not a different model",
    ],
  },
  {
    kind: "drop",
    file: "skills/interrogate/SKILL.md",
    reason:
      "The default model table lists Cursor slugs this port may not hardcode; the panel entries are the only route source now.",
    anchor:
      "| Subagent | Default model |\n|----------|---------------|\n| Reviewer A | `claude-opus-5-5-xhigh` |\n| Reviewer B | `grok-4.7-xhigh-fast` |\n\n",
    expectedMatches: 1,
    outputIncludes: ["Each reviewer gets `agent: \"general\"`"],
  },
  {
    kind: "replace",
    file: "skills/interrogate/SKILL.md",
    reason:
      "`subagent_type` and `readonly: true` are removed, and the no-write rule they implied becomes an explicit instruction plus a diff check.",
    anchor:
      "Each reviewer gets `subagent_type: generalPurpose`, `readonly: true`, and `model` set to its configured entry, or its table default when there is no configured line. Omit `model` for an `auto` or `inherit-parent` entry, so that reviewer runs on the parent model.",
    expectedMatches: 1,
    replacement:
      'Each reviewer gets `agent: "general"` and a brief that forbids writes: it may read the diff and run read-only commands, and it must not edit files. That rule is an instruction, not a sandbox, so check `git status` before and after instead of trusting the report. The route comes from the panel entry, and the tool reports the route each reviewer actually got.',
    outputIncludes: [
      'Each reviewer gets `agent: "general"` and a brief that forbids writes',
      "check `git status` before and after instead of trusting the report",
    ],
  },
  {
    kind: "replace",
    file: "skills/interrogate/SKILL.md",
    reason:
      "A rejected Cursor slug and its family fallback become a named role-file failure that must not take the whole review down.",
    anchor:
      "If the Task tool rejects a configured entry, run that reviewer on its family's table default and say so. Families go by prefix: `claude-*`, and `grok-*` with `cursor-grok-*` and `composer-*`. A refused `composer-*` entry runs on Reviewer B's default. With no family match, use Reviewer A's default. If it rejects a table default, spawn with the closest equivalent from the valid slugs in its error message (prefer the same family and reasoning tier), and open a separate PR to update the default table. Do not block the review on the slug issue. Never treat an alias entry as a rejected slug or apply either fallback to it.",
    expectedMatches: 1,
    replacement:
      "If an entry's route does not resolve, that reviewer does not start: the error names the role file and the bad line, which is the actionable fix. The remaining entries still start, and the report records each reviewer that was skipped and why. Do not substitute a route the user did not configure, and do not let one bad entry stop the review.",
    outputIncludes: [
      "the error names the role file and the bad line, which is the actionable fix",
      "the report records each reviewer that was skipped and why",
    ],
  },
  {
    kind: "replace",
    file: "skills/interrogate/SKILL.md",
    reason: "`poteto-mode` is reachable only by its absolute resource path.",
    anchor:
      "Read `references/reviewer-prompt.md` and fill in the same template for every reviewer with the stated intent, the diff or file contents, the rubric from `references/rubric.md`, and the code-quality lens from `references/code-quality-review.md`. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the **poteto-mode** skill.",
    expectedMatches: 1,
    replacement:
      "Read `references/reviewer-prompt.md` and fill in the same template for every reviewer with the stated intent, the diff or file contents, the rubric from `references/rubric.md`, and the code-quality lens from `references/code-quality-review.md`. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first.",
    outputIncludes: ["Read the Subagents section of the `poteto-mode` skill at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/interrogate/SKILL.md",
    reason:
      "Independent agreement only means something across routes; a same-route panel shares its blind spots and must not be reported as confirmation.",
    anchor:
      "As results come back, build a unified picture. Parse every reviewer's findings. Merge findings that describe the same issue differently, and note which models raised each one. Findings two or more models raised independently are the highest signal. Read a lone model's finding, but weight it accordingly. Note disagreements. If one model flags something and another explicitly says the opposite, that is context for the verdict.",
    expectedMatches: 1,
    replacement:
      "As results come back, build a unified picture. Parse every reviewer's findings. Merge findings that describe the same issue differently, and note which route raised each one. Findings two or more reviewers raised are the highest signal only when their routes differ: reviewers on one route share the same blind spots, and the report says so instead of calling the overlap independent confirmation. Read a lone reviewer's finding, but weight it accordingly. Note disagreements. If one reviewer flags something and another explicitly says the opposite, that is context for the verdict.",
    outputIncludes: [
      "are the highest signal only when their routes differ",
      "the report says so instead of calling the overlap independent confirmation",
    ],
  },
  {
    kind: "replace",
    file: "skills/no-comments/SKILL.md",
    reason:
      "`Task` with `subagent_type: \"comment-sicko\"` is the one agent type whose Host-injected preamble carries the persona.",
    anchor:
      '1. Spawn `Task` with `subagent_type: "comment-sicko"`. Pass the scope. Pick each subagent\'s reasoning level and fast or standard speed for the job, per the Subagents section of the **poteto-mode** skill. Do not restate its rules.',
    expectedMatches: 1,
    replacement:
      '1. Call `pstack_subagent` with `agent: "comment-sicko"` and the scope in the brief. That agent type is the only way to get Comment Sicko\'s persona, because the Host injects its preamble; a `general` child would lose it, and a missing preamble stops the call instead of degrading. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first. Do not restate its rules.',
    outputIncludes: [
      'Call `pstack_subagent` with `agent: "comment-sicko"`',
      "a missing preamble stops the call instead of degrading",
    ],
  },
  {
    kind: "replace",
    file: "skills/no-comments/SKILL.md",
    reason: "`/how` and `/why` are hidden from the catalog and have to be read by path.",
    anchor:
      "Before accepting thin `IMPORTANT` or `do not remove` kills or keeps, run `/how` or `/why` on their symbol. If a kill is ambiguous, do not restore. If a keep is refuted or still ambiguous, delete it. Revert and rerun one rejected report with the failure named. Reject a second, report it open, and fail `/no-comments`.",
    expectedMatches: 1,
    replacement:
      "Before accepting thin `IMPORTANT` or `do not remove` kills or keeps, read the `how` or `why` skill's `SKILL.md` at its absolute resource path and run it on their symbol. If a kill is ambiguous, do not restore. If a keep is refuted or still ambiguous, delete it. Revert and rerun one rejected report with the failure named. Reject a second, report it open, and fail this skill with the reason.",
    outputIncludes: [
      "read the `how` or `why` skill's `SKILL.md` at its absolute resource path",
      "fail this skill with the reason",
    ],
  },
  {
    kind: "replace",
    file: "skills/no-comments/SKILL.md",
    reason: "`/architect` is hidden from the catalog and has to be read by path.",
    anchor:
      "3. Fix trivial accepted flags directly by deleting a dead path, dropping a parameter, or using the real API. If any fix needs a shape, run `/architect` once for the accepted set and surrounding code. Stop at the sketch. Architect shapes. Step 4 implements.",
    expectedMatches: 1,
    replacement:
      "3. Fix trivial accepted flags directly by deleting a dead path, dropping a parameter, or using the real API. If any fix needs a shape, read the `architect` skill's `SKILL.md` at its absolute resource path and run it once for the accepted set and surrounding code. Stop at the sketch. Architect shapes. Step 4 implements.",
    outputIncludes: ["read the `architect` skill's `SKILL.md` at its absolute resource path and run it once"],
  },
  {
    kind: "replace",
    file: "skills/no-comments/SKILL.md",
    reason: "Two principle skills are cited as bare names.",
    anchor:
      "4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. The **principle-fix-root-causes** and **principle-redesign-from-first-principles** skills guide intent only. Neither authorizes widening the fence nor fixing instances outside it. Never bolt on symptom guards.",
    expectedMatches: 1,
    replacement:
      "4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. `principle-fix-root-causes` and `principle-redesign-from-first-principles` guide intent only; read either `SKILL.md` at its absolute resource path. Neither authorizes widening the fence nor fixing instances outside it. Never bolt on symptom guards.",
    outputIncludes: ["read either `SKILL.md` at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/no-comments/SKILL.md",
    reason:
      "Interactive approval is `ask_user_question` here, and an unattended run needs the caller's approval because nobody can answer.",
    anchor:
      "5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint. Wait for interactive approval. Unattended and eval require caller pre-approval. If approved, encode then delete. Otherwise delete, report the constraint open, and sketch out-of-scope work.",
    expectedMatches: 1,
    replacement:
      "5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint. Ask through `ask_user_question` and wait for the answer. An unattended run and the eval playbook need the caller's approval up front, because nobody can answer. If approved, encode then delete. Otherwise delete, report the constraint open, and sketch out-of-scope work.",
    outputIncludes: [
      "Ask through `ask_user_question` and wait for the answer",
      "the eval playbook need the caller's approval up front, because nobody can answer",
    ],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason: "The phase list is a `todo_write` list, and `poteto-mode` is read by path.",
    anchor:
      "Open a todolist whose first item is to read the Principles section of the **poteto-mode** skill. Then add the phases below as todos.",
    expectedMatches: 1,
    replacement:
      "Open a `todo_write` list whose first item is to read the Principles section of the `poteto-mode` skill, at its absolute resource path. Then add the phases below as items.",
    outputIncludes: ["read the Principles section of the `poteto-mode` skill, at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason: "The done-predicate principle is cited as a bare skill name.",
    anchor: "- The definition of done as a falsifiable predicate (the **prove-it-works** principle skill).",
    expectedMatches: 1,
    replacement:
      "- The definition of done as a falsifiable predicate, as `principle-prove-it-works` requires; read its `SKILL.md` at its absolute resource path.",
    outputIncludes: ["as `principle-prove-it-works` requires"],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason:
      "The checkpoint is a host question, and the never-block principle is a path read.",
    anchor:
      "Present the framing and tradeoffs before committing to a long run. Reversible work proceeds (the **never-block-on-the-human** principle skill), but a multi-hour run earns one checkpoint.",
    expectedMatches: 1,
    replacement:
      "Present the framing and tradeoffs before committing to a long run. Reversible work proceeds, as `principle-never-block-on-the-human` requires; read its `SKILL.md` at its absolute resource path. A multi-hour run earns one checkpoint, asked through `ask_user_question`.",
    outputIncludes: ["A multi-hour run earns one checkpoint, asked through `ask_user_question`"],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason: "The foundational-thinking principle is cited as a bare skill name.",
    anchor:
      "Decompose into atomic, independently-landable units. Sequence riskiest-unknown-first. Scaffold and verification come before features (the **foundational-thinking** principle skill).",
    expectedMatches: 1,
    replacement:
      "Decompose into atomic, independently-landable units. Sequence riskiest-unknown-first. Scaffold and verification come before features, as `principle-foundational-thinking` requires; read its `SKILL.md` at its absolute resource path.",
    outputIncludes: ["as `principle-foundational-thinking` requires"],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason: "`architect` runs `arena`, and both are loaded by path plus a principle read.",
    anchor:
      "- For one-way-door design decisions, run the **architect** skill (it runs **arena**). Skip it for mechanical work whose shape is already concrete. A second arena over a settled design is over-engineering (the **laziness-protocol** principle skill).",
    expectedMatches: 1,
    replacement:
      "- For one-way-door design decisions, read the `architect` skill's `SKILL.md` at its absolute resource path and run it; it runs `arena` in turn. Skip it for mechanical work whose shape is already concrete. A second arena over a settled design is over-engineering, per `principle-laziness-protocol`.",
    outputIncludes: [
      "read the `architect` skill's `SKILL.md` at its absolute resource path and run it",
      "per `principle-laziness-protocol`",
    ],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason:
      "Fan-out isolation is a real worktree checkout, not a branch hint, and the principle is a path read.",
    anchor:
      "- Decide what fans out. Parallelize only across seams, and give each worker its own worktree or branch (the **separate-before-serializing-shared-state** principle skill). Don't over-fan. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the **poteto-mode** skill.",
    expectedMatches: 1,
    replacement:
      "- Decide what fans out. Parallelize only across seams, and give each worker its own checkout: the worker calls `create_worktree` in its own Session, or you create the checkouts one at a time and pass each absolute `path` as that worker's `cwd`. Read `principle-separate-before-serializing-shared-state` at its absolute resource path. Don't over-fan. Read the Subagents section of the `poteto-mode` skill at its absolute resource path before you spawn anyone.",
    outputIncludes: [
      "the worker calls `create_worktree` in its own Session",
      "Read the Subagents section of the `poteto-mode` skill at its absolute resource path",
    ],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason: "The designed steps join the `todo_write` list.",
    anchor:
      "Then execute the design. Add its steps to the todolist as concrete items between the Phase C and Phase D entries.",
    expectedMatches: 1,
    replacement:
      "Then execute the design. Add its steps to the `todo_write` list as concrete items between the Phase C and Phase D entries.",
    outputIncludes: ["Add its steps to the `todo_write` list as concrete items"],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason: "The unit-sequencing principle is cited as a bare skill name.",
    anchor:
      "Each unit is an experiment. State the hypothesis, make the smallest change, measure against the predicate on the real artifact, keep it if it advanced, revert it if it didn't. Apply the **sequence-verifiable-units** principle skill, verifying each unit before starting the next instead of batching checks at the end.",
    expectedMatches: 1,
    replacement:
      "Each unit is an experiment. State the hypothesis, make the smallest change, measure against the predicate on the real artifact, keep it if it advanced, revert it if it didn't. Read `principle-sequence-verifiable-units` at its absolute resource path and verify each unit before starting the next instead of batching checks at the end.",
    outputIncludes: ["Read `principle-sequence-verifiable-units` at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason:
      "A judge has to be its own child reading the artifact, not the worker's own report.",
    anchor:
      "- Pair delegated work with a judge. If a worker games the gate, reset and harden the contract. If the gate itself is wrong, fix the gate in its own change rather than routing around it.",
    expectedMatches: 1,
    replacement:
      "- Pair delegated work with a judge: a second `pstack_subagent` child that reads the same artifact and the same predicate, never the worker's own report. If a worker games the gate, reset and harden the contract. If the gate itself is wrong, fix the gate in its own change rather than routing around it.",
    outputIncludes: ["a second `pstack_subagent` child that reads the same artifact"],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason:
      "`show-me-your-work` is a path read, and its session-audit step needs the history tool this unit does not ship.",
    anchor:
      "Log the run via the **show-me-your-work** skill. figure-it-out's work is usually ambitious enough to commit the trail so the reviewer can read it in the PR. The trail plus the diff is what lets the human come back and trust the work.",
    expectedMatches: 1,
    replacement:
      "Log the run as the `show-me-your-work` skill prescribes; read its `SKILL.md` at its absolute resource path. Its session-audit step needs the restricted history tool, which this package does not ship yet, so keep the decision trail inside the repository and report that part of the audit as unverified. figure-it-out's work is usually ambitious enough to commit the trail so the reviewer can read it in the PR. The trail plus the diff is what lets the human come back and trust the work.",
    outputIncludes: [
      "read its `SKILL.md` at its absolute resource path",
      "report that part of the audit as unverified",
    ],
  },
  {
    kind: "replace",
    file: "skills/figure-it-out/SKILL.md",
    reason: "The lesson-encoding principle is cited as a bare skill name.",
    anchor:
      "Check the whole against the Phase A predicate on the real product, not just the harness. Encode any recurring correction as a gate, a lint rule, a check, or a script (the **encode-lessons-in-structure** principle skill).",
    expectedMatches: 1,
    replacement:
      "Check the whole against the Phase A predicate on the real product, not just the harness. Encode any recurring correction as a gate, a lint rule, a check, or a script, as `principle-encode-lessons-in-structure` requires; read its `SKILL.md` at its absolute resource path.",
    outputIncludes: ["as `principle-encode-lessons-in-structure` requires"],
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
  // -------------------------------------------------------------------------
  // Unit 4: the ten playbooks. A playbook is read by `poteto-mode`, so the same
  // rules apply: bare skill names become path reads, `Task` becomes
  // `pstack_subagent`, a role name replaces a model slug, and a capability the
  // port does not ship is removed instead of promised.
  // -------------------------------------------------------------------------
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/investigation.md",
    reason: "`how` and `why` are hidden from the catalog, so they are read by absolute resource path.",
    anchor: "1. Route through the **how** skill. For motivation questions, also route through the **why** skill.",
    expectedMatches: 1,
    replacement:
      "1. Read the `how` skill's `SKILL.md` at its absolute resource path and route through it. For motivation questions, read the `why` skill's `SKILL.md` at its absolute resource path too.",
    outputIncludes: ["Read the `how` skill's `SKILL.md` at its absolute resource path and route through it."],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/investigation.md",
    reason: "`unslop` is hidden from the catalog and is read by path.",
    anchor: "4. Apply the **unslop** skill to the reply.",
    expectedMatches: 1,
    replacement:
      "4. Read the `unslop` skill's `SKILL.md` at its absolute resource path and apply it to the reply.",
    outputIncludes: ["Read the `unslop` skill's `SKILL.md` at its absolute resource path and apply it"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/bug-fix.md",
    reason: "`poteto-mode` is reachable only by its absolute resource path.",
    anchor:
      "**You own this task. Plan, review, verify.** Delegate investigation and the fix to subagents, stay in the lead. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section.",
    expectedMatches: 1,
    replacement:
      "**You own this task. Plan, review, verify.** Delegate investigation and the fix to `pstack_subagent` children, stay in the lead. Read the Subagents section of the `poteto-mode` skill at its absolute resource path before the first spawn.",
    outputIncludes: ["Read the Subagents section of the `poteto-mode` skill at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/bug-fix.md",
    reason:
      "The control surface is a project artifact, and a missing one is a reported gap rather than a reason to read source instead.",
    anchor:
      "1. Reproduce it yourself on the matching surface via the control skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.",
    expectedMatches: 1,
    replacement:
      "1. Reproduce it yourself on the matching surface, through the control path the `poteto-mode` Non-negotiables section names, even when a debug or instrumentation protocol says to ask the user to reproduce. That path is a real project driver or verification skill; when the project has none, report the surface as unreachable instead of treating a unit test as reproduction. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.",
    outputIncludes: [
      "when the project has none, report the surface as unreachable instead of treating a unit test as reproduction",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/bug-fix.md",
    reason:
      "Bare skill names become path reads, and `/loop` has no equivalent here, so a long hunt keeps its evidence loop instead of naming a command the host does not have.",
    anchor:
      "Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Cursor's `/loop` command. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.",
    expectedMatches: 1,
    replacement:
      "Seed them by reading the `how` skill over the affected subsystem and the `why` skill for regression history, each at its absolute resource path. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. A long or stubborn hunt stays in this Session: keep the hypothesis list current and re-read your own instrumentation output, because automatic continuation is not available in this port yet. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.",
    outputIncludes: [
      "each at its absolute resource path",
      "because automatic continuation is not available in this port yet",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/bug-fix.md",
    reason:
      "The fix child is a `poteto-agent` on the `bug-fix` role, and `architect` is a path read.",
    anchor:
      "3. Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default `grok-4.7-xhigh-fast`) with a specific scope.",
    expectedMatches: 1,
    replacement:
      '3. Plan the fix. If it crosses a function boundary, read the `architect` skill\'s `SKILL.md` at its absolute resource path and run it first. Delegate implementation to a `pstack_subagent` child with `agent: "poteto-agent"` and `role: "bug-fix"`, naming a specific scope; a role the file does not name inherits the parent route, and a route that does not resolve fails the call with the role file named.',
    outputIncludes: [
      '`agent: "poteto-agent"` and `role: "bug-fix"`',
      "a route that does not resolve fails the call with the role file named",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/bug-fix.md",
    reason: "The `tdd` skill is hidden from the catalog and is read by path.",
    anchor:
      "   This is the canonical **sequence-verifiable-units** principle skill, the failing test first and the fix on top.",
    expectedMatches: 1,
    replacement:
      "   This is the canonical `principle-sequence-verifiable-units` move, the failing test first and the fix on top; read that skill's `SKILL.md` at its absolute resource path.",
    outputIncludes: ["This is the canonical `principle-sequence-verifiable-units` move"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/bug-fix.md",
    reason: "`Opening a PR` is a playbook file, so it is read from its resource path.",
    anchor: "6. Run **Opening a PR**.",
    expectedMatches: 1,
    replacement:
      "6. Read `playbooks/opening-a-pr.md` next to this file and run it.",
    outputIncludes: ["Read `playbooks/opening-a-pr.md` next to this file and run it."],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/bug-fix.md",
    reason: "`tdd` is a path read, not a slash route.",
    anchor:
      "5. Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path.",
    expectedMatches: 1,
    replacement:
      "5. Stage the commits so the failing repro lands before the fix in git history. Read the `tdd` skill's `SKILL.md` at its absolute resource path for the failing-test-first cadence when the bug has a cheap local test path.",
    outputIncludes: ["Read the `tdd` skill's `SKILL.md` at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/perf-issue.md",
    reason:
      "The control surface is a project artifact, and `benchmark-checklist` is read by path.",
    anchor:
      "1. Capture a baseline trace via the matching control skill. Vet the baseline, and each later number, with the **benchmark-checklist** skill.",
    expectedMatches: 1,
    replacement:
      "1. Capture a baseline trace through the matching project control path. With no real profiler or trace tool in the project, report the measurement as missing instead of substituting a unit test. Vet the baseline, and each later number, with the `benchmark-checklist` skill, read at its absolute resource path.",
    outputIncludes: [
      "With no real profiler or trace tool in the project, report the measurement as missing",
      "read at its absolute resource path",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/perf-issue.md",
    reason: "`how` is a path read.",
    anchor: "2. `how` to ground hypotheses. Don't claim a perf ceiling without running it first.",
    expectedMatches: 1,
    replacement:
      "2. Read the `how` skill's `SKILL.md` at its absolute resource path and use it to ground hypotheses. Don't claim a perf ceiling without running it first.",
    outputIncludes: ["Read the `how` skill's `SKILL.md` at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/perf-issue.md",
    reason: "The implementation child is a `poteto-agent` on the `perf-issue` role; `architect` is a path read.",
    anchor:
      "3. Plan the fix from the trace. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured perf-issue model (default `grok-4.7-xhigh-fast`). Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section. Review the diff. Capture a post-fix trace.",
    expectedMatches: 1,
    replacement:
      '3. Plan the fix from the trace. If it crosses a function boundary, read the `architect` skill\'s `SKILL.md` at its absolute resource path and run it first. Delegate implementation to a `pstack_subagent` child with `agent: "poteto-agent"` and `role: "perf-issue"`. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first. Review the diff. Capture a post-fix trace.',
    outputIncludes: [
      '`agent: "poteto-agent"` and `role: "perf-issue"`',
      "Review the diff. Capture a post-fix trace.",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/perf-issue.md",
    reason: "The unit-sequencing principle is a path read.",
    anchor:
      "   Apply the **sequence-verifiable-units** principle skill, verifying each attempt before trying the next.",
    expectedMatches: 1,
    replacement:
      "   Apply `principle-sequence-verifiable-units`, read at its absolute resource path, verifying each attempt before trying the next.",
    outputIncludes: ["Apply `principle-sequence-verifiable-units`, read at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/perf-issue.md",
    reason: "`Opening a PR` is a playbook file read from its resource path.",
    anchor: "6. Run **Opening a PR**.",
    expectedMatches: 1,
    replacement: "6. Read `playbooks/opening-a-pr.md` next to this file and run it.",
    outputIncludes: ["Read `playbooks/opening-a-pr.md` next to this file and run it."],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/perf-issue.md",
    reason:
      "The hillclimb playbook is not ported yet, so the pointer names the gap instead of routing into unadapted text.",
    anchor:
      "For sustained improvement against a metric rather than a one-off fix, use the Hillclimb playbook (`playbooks/hillclimb.md`).",
    expectedMatches: 1,
    replacement:
      "For sustained improvement against a metric rather than a one-off fix, the Hillclimb playbook is not ported to this harness yet (`playbooks/hillclimb.md` still carries Cursor wording). Keep this playbook's measurement discipline and record the metric per iteration until that playbook lands.",
    outputIncludes: ["the Hillclimb playbook is not ported to this harness yet"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/runtime-forensics.md",
    reason: "A live artifact needs a real interface, and a missing one is a reported gap.",
    anchor:
      "1. Capture the live signal on the matching surface via the control skill: a CPU profile for a spinning process, a heap snapshot for a leak, a CDP trace for a visual glitch. A real artifact, not a guess.",
    expectedMatches: 1,
    replacement:
      "1. Capture the live signal on the matching surface: a CPU profile for a spinning process, a heap snapshot for a leak, a CDP trace for a visual glitch. A real artifact, not a guess, and only through an interface this Session actually has; when no live CPU, heap, or CDP interface is reachable, report that gap instead of reasoning from source and calling it forensics.",
    outputIncludes: [
      "when no live CPU, heap, or CDP interface is reachable, report that gap instead of reasoning from source",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/runtime-forensics.md",
    reason: "The parse child is a `pstack_subagent` call, and the principle is a path read.",
    anchor:
      "2. Reduce the artifact to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a GC root, the loop firing without input. Parse large artifacts in a subagent (the **guard-the-context-window** principle skill), keep the reduced finding in the main thread. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section.",
    expectedMatches: 1,
    replacement:
      '2. Reduce the artifact to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a GC root, the loop firing without input. Parse large artifacts in a `pstack_subagent` child with `agent: "general"` and a brief that forbids writes, as `principle-guard-the-context-window` requires; read that skill\'s `SKILL.md` at its absolute resource path. Keep the reduced finding in the main thread. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first.',
    outputIncludes: [
      'Parse large artifacts in a `pstack_subagent` child with `agent: "general"`',
      "Keep the reduced finding in the main thread.",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/runtime-forensics.md",
    reason:
      "Proving a mechanism needs a live injection point; the sentence must not promise CDP where none exists.",
    anchor:
      "3. Prove the mechanism before believing it. Inject instrumentation via CDP eval on the running process, or hotfix the live code without reloading, to confirm the hypothesis cheaply.",
    expectedMatches: 1,
    replacement:
      "3. Prove the mechanism before believing it. Inject instrumentation through a live interface the process actually exposes, such as CDP eval on a running browser target, or hotfix the live code without reloading, to confirm the hypothesis cheaply. With no such interface, mark the mechanism as unproven rather than confirmed.",
    outputIncludes: ["With no such interface, mark the mechanism as unproven rather than confirmed."],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/trace-forensics.md",
    reason: "The sibling playbook is a file read from its resource path.",
    anchor: "Distinct from **Runtime forensics**, which instruments the live process.",
    expectedMatches: 1,
    replacement:
      "Distinct from Runtime forensics (`playbooks/runtime-forensics.md`), which instruments the live process.",
    outputIncludes: ["Distinct from Runtime forensics (`playbooks/runtime-forensics.md`)"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/trace-forensics.md",
    reason: "The parse child is a `pstack_subagent` call, and the principle is a path read.",
    anchor:
      "1. Identify the format and load it with the right tool. Parse large artifacts in a subagent (the **principle-guard-the-context-window** skill) and keep the reduced finding in the main thread. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section.",
    expectedMatches: 1,
    replacement:
      '1. Identify the format and load it with the right tool. Parse large artifacts in a `pstack_subagent` child with `agent: "general"` and a brief that forbids writes, as `principle-guard-the-context-window` requires; read that skill\'s `SKILL.md` at its absolute resource path. Keep the reduced finding in the main thread. Read the Subagents section of the `poteto-mode` skill at its absolute resource path first.',
    outputIncludes: [
      'Parse large artifacts in a `pstack_subagent` child with `agent: "general"`',
      "Keep the reduced finding in the main thread.",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/feature.md",
    reason: "`how` and `architect` are path reads.",
    anchor: "1. `how` over the affected subsystem.\n2. `architect` for parallel design exploration.",
    expectedMatches: 1,
    replacement:
      "1. Read the `how` skill's `SKILL.md` at its absolute resource path and run it over the affected subsystem.\n2. Read the `architect` skill's `SKILL.md` at its absolute resource path and run it for parallel design exploration.",
    outputIncludes: ["Read the `architect` skill's `SKILL.md` at its absolute resource path and run it"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/feature.md",
    reason: "The throughput checkpoint is four `todo_write` items in this host.",
    anchor: "3. Write the throughput checkpoint as four todo items.",
    expectedMatches: 1,
    replacement: "3. Write the throughput checkpoint as four `todo_write` items.",
    outputIncludes: ["Write the throughput checkpoint as four `todo_write` items."],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/feature.md",
    reason: "The shared-state principle is a path read.",
    anchor:
      "   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.",
    expectedMatches: 1,
    replacement:
      "   - **Shared mutable state.** Default to splitting the target, as `principle-separate-before-serializing-shared-state` requires; read its `SKILL.md` at its absolute resource path. Serialize only for real invariants.",
    outputIncludes: ["as `principle-separate-before-serializing-shared-state` requires"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/feature.md",
    reason:
      "The implementation child is a `poteto-agent` on the `feature, refactoring` role, arena is a path read, and the nesting rule has to stay true without a spawn-capable child.",
    anchor:
      "4. Delegate code-writing to a subagent using your configured feature model (default `grok-4.7-xhigh-fast`) with a specific scope (file paths, named data shape and its organizing structure per **principle-model-the-domain**, a state machine over scattered booleans, a table/registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, and success criteria). Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section. When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), delegate via the **arena** skill instead so the runners surface the alternatives and the cross-judge guards the pick. Mandatory: no skip-with-reason escape, and Laziness Protocol does not override it (the gain is review separation, not lines saved). A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation.",
    expectedMatches: 1,
    replacement:
      '4. Delegate code-writing to a `pstack_subagent` child with `agent: "poteto-agent"` and `role: "feature, refactoring"`, and a specific scope: file paths, the named data shape and its organizing structure as `principle-model-the-domain` requires (read that `SKILL.md` at its absolute resource path), a state machine over scattered booleans, a table or registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, plus success criteria. Read the Subagents section of the `poteto-mode` skill at its absolute resource path before the spawn. When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), read the `arena` skill\'s `SKILL.md` at its absolute resource path and delegate through it, so the runners surface the alternatives and the cross-judge guards the pick. Mandatory: no skip-with-reason escape, and `principle-laziness-protocol` does not override it (the gain is review separation, not lines saved). A child that cannot spawn satisfies this by owning the diff directly with the same review separation.',
    outputIncludes: [
      '`agent: "poteto-agent"` and `role: "feature, refactoring"`',
      "A child that cannot spawn satisfies this by owning the diff directly with the same review separation.",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/feature.md",
    reason: "Both principles and the PR playbook are path reads.",
    anchor:
      "   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.\n7. If the design is contested, `interrogate` before shipping.\n8. Run **Opening a PR**.",
    expectedMatches: 1,
    replacement:
      "   Apply `principle-sequence-verifiable-units`, read at its absolute resource path, building, verifying, and committing each small unit before the next.\n7. If the design is contested, read the `interrogate` skill's `SKILL.md` at its absolute resource path and run it before shipping.\n8. Read `playbooks/opening-a-pr.md` next to this file and run it.",
    outputIncludes: [
      "Apply `principle-sequence-verifiable-units`, read at its absolute resource path",
      "Read `playbooks/opening-a-pr.md` next to this file and run it.",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/refactoring.md",
    reason: "`figure-it-out` is hidden from the catalog and has to be read by path.",
    anchor:
      "If the cleanup reveals a missing feature or a real bug, split it out and ship the structural change first against the pinned contract. A redesign is allowed, but name it and route to Feature. Large or cross-cutting structural work belongs to the **figure-it-out** skill. This playbook is the focused-to-medium change.",
    expectedMatches: 1,
    replacement:
      "If the cleanup reveals a missing feature or a real bug, split it out and ship the structural change first against the pinned contract. A redesign is allowed, but name it and route to Feature. Large or cross-cutting structural work belongs to the `figure-it-out` skill, read at its absolute resource path. This playbook is the focused-to-medium change.",
    outputIncludes: ["belongs to the `figure-it-out` skill, read at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/refactoring.md",
    reason:
      "`how` is a path read, and a characterization pin has to exist before any structure moves.",
    anchor:
      "1. Pin the behavior contract first. Run the **how** skill over the affected subsystem to learn the contract, then write a characterization test, snapshot, or equivalence harness that captures current behavior before any structure moves. If the area has no coverage, write the pin before touching structure. Type check and lint are not a pin.",
    expectedMatches: 1,
    replacement:
      "1. Pin the behavior contract first. Read the `how` skill's `SKILL.md` at its absolute resource path and run it over the affected subsystem to learn the contract, then write a characterization test, snapshot, or equivalence harness that captures current behavior before any structure moves. If the area has no coverage, write the pin before touching structure. Type check and lint are not a pin, and neither is a green build.",
    outputIncludes: ["Type check and lint are not a pin, and neither is a green build."],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/refactoring.md",
    reason: "Two principles are cited as bare names.",
    anchor:
      "2. Name the structure the code is missing per **principle-model-the-domain**. Boring code stays when the shape is already clear and local. The reshape must delete branches or invalid states, not add indirection.",
    expectedMatches: 1,
    replacement:
      "2. Name the structure the code is missing, as `principle-model-the-domain` requires; read its `SKILL.md` at its absolute resource path. Boring code stays when the shape is already clear and local. The reshape must delete branches or invalid states, not add indirection.",
    outputIncludes: ["as `principle-model-the-domain` requires"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/refactoring.md",
    reason: "Three principles are cited as bare names, and `architect` is a path read.",
    anchor:
      "3. Name the target shape. State what the module layout, types, and call graph should be if built today (**principle-foundational-thinking**, **principle-redesign-from-first-principles**). If the target crosses a function boundary, run the **architect** skill for parallel design exploration of the shape before the move.",
    expectedMatches: 1,
    replacement:
      "3. Name the target shape. State what the module layout, types, and call graph should be if built today, per `principle-foundational-thinking` and `principle-redesign-from-first-principles`, each read at its absolute resource path. If the target crosses a function boundary, read the `architect` skill's `SKILL.md` at its absolute resource path and run it for parallel design exploration of the shape before the move.",
    outputIncludes: ["each read at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/refactoring.md",
    reason: "The subtract and laziness principles are cited as bare names.",
    anchor:
      "4. Subtract before you add. Delete dead code, collapse one-caller wrappers, drop redundant validators, and remove orphan references before introducing the new shape (**principle-subtract-before-you-add**). The smallest change that reaches the target shape ships (**principle-laziness-protocol**). A speculative cleanup that \"might help\" gets reverted.",
    expectedMatches: 1,
    replacement:
      "4. Subtract before you add. Delete dead code, collapse one-caller wrappers, drop redundant validators, and remove orphan references before introducing the new shape, as `principle-subtract-before-you-add` requires. The smallest change that reaches the target shape ships, per `principle-laziness-protocol`, read at its absolute resource path. A speculative cleanup that \"might help\" gets reverted.",
    outputIncludes: ["as `principle-subtract-before-you-add` requires"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/refactoring.md",
    reason:
      "The mechanical-edit child is a `poteto-agent` on the shared role, and the migrate-then-delete principle is a path read.",
    anchor:
      "5. Move in small behavior-preserving steps, each keeping the pin green. For API reshapes, migrate every caller and delete the old API in the same wave (**principle-migrate-callers-then-delete-legacy-apis**). No compatibility shims, no parallel old-and-new paths. Spot-check every rename against the actual files. Renames silently miss usages in strings, prose, and back-references. Delegate the mechanical edits to a subagent using your configured refactoring model (default `grok-4.7-xhigh-fast`) with a specific scope (file paths, the names being moved, the behavior to hold). Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section.",
    expectedMatches: 1,
    replacement:
      '5. Move in small behavior-preserving steps, each keeping the pin green. For API reshapes, migrate every caller and delete the old API in the same wave, as `principle-migrate-callers-then-delete-legacy-apis` requires; read its `SKILL.md` at its absolute resource path. No compatibility shims, no parallel old-and-new paths. Spot-check every rename against the actual files. Renames silently miss usages in strings, prose, and back-references. Delegate the mechanical edits to a `pstack_subagent` child with `agent: "poteto-agent"` and `role: "feature, refactoring"`, with a specific scope (file paths, the names being moved, the behavior to hold). Read the Subagents section of the `poteto-mode` skill at its absolute resource path first.',
    outputIncludes: [
      '`agent: "poteto-agent"` and `role: "feature, refactoring"`',
      "as `principle-migrate-callers-then-delete-legacy-apis` requires",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/refactoring.md",
    reason: "The prove-it-works principle is a path read, and the control path is a real project driver.",
    anchor:
      "6. Prove behavior is unchanged on the real artifact, not \"it compiles\" (**principle-prove-it-works**). For larger reshapes, run an equivalence check: a script that diffs old-vs-new outputs, a recorded baseline replayed against the new code, or a smoke run on the matching surface via the relevant control skill.",
    expectedMatches: 1,
    replacement:
      "6. Prove behavior is unchanged on the real artifact, not \"it compiles\", as `principle-prove-it-works` requires; read its `SKILL.md` at its absolute resource path. For larger reshapes, run an equivalence check: a script that diffs old-vs-new outputs, a recorded baseline replayed against the new code, or a smoke run on the matching surface through the project's real driver. With no driver, report the surface check as unproven.",
    outputIncludes: ["With no driver, report the surface check as unproven."],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/refactoring.md",
    reason: "The reader-load and sequencing principles plus the PR playbook are path reads.",
    anchor:
      "7. Confirm the change is worth keeping. The success measure is reduced reader load (**principle-minimize-reader-load**). If the diff does not lower reader load somewhere, revert it.\n8. Rebase into small ordered commits. A subtraction commit, then the reshape, then any follow-on cleanup. Shape them with the **sequence-verifiable-units** principle skill, so each behavior-preserving slice stays green before the next. Run **Opening a PR**.",
    expectedMatches: 1,
    replacement:
      "7. Confirm the change is worth keeping. The success measure is reduced reader load, per `principle-minimize-reader-load`, read at its absolute resource path. If the diff does not lower reader load somewhere, revert it.\n8. Rebase into small ordered commits. A subtraction commit, then the reshape, then any follow-on cleanup. Shape them with `principle-sequence-verifiable-units`, so each behavior-preserving slice stays green before the next. Read `playbooks/opening-a-pr.md` next to this file and run it.",
    outputIncludes: ["Read `playbooks/opening-a-pr.md` next to this file and run it."],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/prototype.md",
    reason: "The Laziness Protocol and the proof bar are named without a loadable route.",
    anchor:
      "The one playbook where the Laziness Protocol's \"smallest change\" and the verification bar invert. Speed over polish, code quality does not matter, no planning. The rigor is in picking the right design cheaply. Propose variations the user didn't ask for, throw an approach away and try another.",
    expectedMatches: 1,
    replacement:
      "The one playbook where `principle-laziness-protocol`'s \"smallest change\" and the verification bar invert. Speed over polish, code quality does not matter, no planning. The rigor is in picking the right design cheaply. Propose variations the user didn't ask for, throw an approach away and try another.",
    outputIncludes: ["`principle-laziness-protocol`'s \"smallest change\""],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/prototype.md",
    reason: "The exhaust-the-design principle is cited as a bare name.",
    anchor:
      "4. When comparing alternatives, build them behind one switcher (buttons or a keypress), each variant labeled. This is the **exhaust-the-design-space** principle skill made cheap.",
    expectedMatches: 1,
    replacement:
      "4. When comparing alternatives, build them behind one switcher (buttons or a keypress), each variant labeled. This is `principle-exhaust-the-design-space` made cheap; read its `SKILL.md` at its absolute resource path.",
    outputIncludes: ["This is `principle-exhaust-the-design-space` made cheap"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/prototype.md",
    reason:
      "Screenshots come from the project's own control path or an existing artifact, never from a capture step that does not exist.",
    anchor:
      "5. Verify on the matching surface. For a visual decision, screenshot each variant via the control skill and drive the interaction. For a behavioral or timing decision, observe the thing you are deciding by logging the timing, printing the output, or watching the render. The observation is the test here, not an assertion.",
    expectedMatches: 1,
    replacement:
      "5. Verify on the matching surface. For a visual decision, capture each variant with the project's real browser or rendering path and drive the interaction; with no such path, say the visual comparison is unproven rather than describing what it would look like. For a behavioral or timing decision, observe the thing you are deciding by logging the timing, printing the output, or watching the render. The observation is the test here, not an assertion.",
    outputIncludes: ["with no such path, say the visual comparison is unproven"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/prototype.md",
    reason: "`Feature` is a sibling playbook and `architect` is a skill, both path reads.",
    anchor:
      "6. Present alternatives, tradeoffs, and a recommendation. The output is the decision plus the throwaway artifact, not shippable code. Hand the chosen direction to **Feature** (or `architect` for the shape) for the real build.",
    expectedMatches: 1,
    replacement:
      "6. Present alternatives, tradeoffs, and a recommendation. The output is the decision plus the throwaway artifact, not shippable code. Hand the chosen direction to the Feature playbook (`playbooks/feature.md`), or to the `architect` skill at its absolute resource path when the shape is still open, for the real build.",
    outputIncludes: ["or to the `architect` skill at its absolute resource path"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/authoring-a-skill.md",
    reason:
      "Cursor's built-in `create-skill` has no DSH counterpart, so the playbook names the validators this package actually runs.",
    anchor: "1. Use the **create-skill** skill (Cursor's built-in for authoring SKILL.md files).",
    expectedMatches: 1,
    replacement:
      "1. There is no built-in authoring tool here: Cursor's `create-skill`, its drafts, and its evaluation tooling are not part of this port. Write the `SKILL.md` yourself and validate it with this package's own checks.",
    outputIncludes: [
      "Cursor's `create-skill`, its drafts, and its evaluation tooling are not part of this port",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/authoring-a-skill.md",
    reason: "The validation step names the checks that actually run, including the frontmatter and link audit.",
    anchor:
      "2. Validate the skill: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve.",
    expectedMatches: 1,
    replacement:
      "2. Validate the skill: the frontmatter parser accepts `name` and `description` and rejects an unknown field, every referenced file exists, and every internal link resolves. `scripts/check-assets.ts` is the checker, so a broken link or an unparsable frontmatter fails the asset audit instead of shipping.",
    outputIncludes: [
      "`scripts/check-assets.ts` is the checker, so a broken link or an unparsable frontmatter fails the asset audit",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/authoring-a-skill.md",
    reason: "The encode-lessons principle is cited as a bare name, and cross-skill delegation is a path read.",
    anchor:
      "When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config) per the **encode-lessons-in-structure** principle skill. Delegate to other skills by path. Don't restate. A workflow you keep hitting but isn't captured → propose a new skill.",
    expectedMatches: 1,
    replacement:
      "When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config), as `principle-encode-lessons-in-structure` requires; read its `SKILL.md` at its absolute resource path. Delegate to other skills by their absolute resource paths. Don't restate. A workflow you keep hitting but isn't captured → propose a new skill.",
    outputIncludes: ["Delegate to other skills by their absolute resource paths."],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/opening-a-pr.md",
    reason:
      "`Task` children get their own checkouts through `create_worktree` or an explicit `cwd`; the Cursor fetch-and-reset workaround is not how this host isolates a child.",
    anchor:
      "**Worktree.** Work from a git worktree off main. Subagents inherit it. Multiple `Task` calls on the same branch each get their own worktree, or `git fetch && git reset --hard origin/<branch>` between them. Dirty branch with unrelated work: patch out, fresh worktree, apply. Snarled worktree: reset from main, redo minimally.",
    expectedMatches: 1,
    replacement:
      "**Worktree.** Work from a checkout that is not the branch other work is using: call `create_worktree({ name, from })` and it returns the path, branch, pinned commit, and repository root, then leave with `working_directory({ cd })`. A child does not inherit your checkout; give each writer its own `create_worktree` call or pass a prepared absolute `path` as that child's `cwd`. Creation is from a local revision and copies no uncommitted files, so commit first and fetch before you depend on a remote branch. Dirty branch with unrelated work: commit or patch it out, create the checkout, apply. Snarled worktree: create a fresh checkout from the base and redo minimally. This isolates the directory and branch only, not ports, credentials, or running services.",
    outputIncludes: [
      "A child does not inherit your checkout",
      "Creation is from a local revision and copies no uncommitted files",
      "This isolates the directory and branch only, not ports, credentials, or running services.",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/opening-a-pr.md",
    reason:
      "`/deslop` and `/technical-writing` are not slash routes here; the no-comments skill and the writing skills are read by path.",
    anchor:
      "**PRs.** Run `/deslop` from `cursor-team-kit` over the diff before commit and `/no-comments` before review. Write every PR title, description, and commit body with `/technical-writing` (every layer except Diátaxis, and apply the STE vocabulary rules: one word per action, keep articles, a plain verb over `-ing` where one works), then apply `/unslop`.",
    expectedMatches: 1,
    replacement:
      "**PRs.** `/deslop` ships in Cursor's `cursor-team-kit` and has no counterpart here: read the diff once for narrative comments, unjustified guards, dead compatibility paths, and unrelated edits, then read the `no-comments` skill's `SKILL.md` at its absolute resource path and run it before review. Write every PR title, description, and commit body with the `technical-writing` skill (every layer except Diátaxis, and apply the STE vocabulary rules: one word per action, keep articles, a plain verb over `-ing` where one works), then apply the `unslop` skill; read both at their absolute resource paths.",
    outputIncludes: [
      "`/deslop` ships in Cursor's `cursor-team-kit` and has no counterpart here",
      "read both at their absolute resource paths",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/opening-a-pr.md",
    reason:
      "There is no built-in PR tool in this host, so the rule that depends on one has to say what actually runs.",
    anchor:
      "**Built-in PR tool.** When the run provides a built-in PR tool, create, edit, retarget, and mark ready through it, never through a forge CLI. A CLI-made PR misses what the tool tracks. Use the resolved forge for everything the tool does not cover, and for every PR operation when the run has no such tool.",
    expectedMatches: 1,
    replacement:
      "**Built-in PR tool.** This host provides no built-in PR tool, so every PR operation goes through the resolved forge CLI. If a future deployment does provide one, use it for create, edit, retarget, and ready, because a CLI-made PR misses what such a tool tracks.",
    outputIncludes: [
      "This host provides no built-in PR tool, so every PR operation goes through the resolved forge CLI.",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/opening-a-pr.md",
    reason: "The readiness rule refers to a tool that does not exist here.",
    anchor:
      "**Readiness.** Open every PR ready, never as a draft. A built-in PR tool can default to draft, so set `draft: false` on every creation call through it. With Origin, pass `--status open`. With `gh`, omit `--draft`. If a PR still opens as a draft, mark it ready through the PR tool, or run `origin pr ready <number>` or `gh pr ready <number>` according to the resolved forge. Run `origin pr view <number>` or `gh pr view <number>` before you refer to PR status.",
    expectedMatches: 1,
    replacement:
      "**Readiness.** Open every PR ready, never as a draft. With Origin, pass `--status open`. With `gh`, omit `--draft`. If a PR still opens as a draft, run `origin pr ready <number>` or `gh pr ready <number>` according to the resolved forge. Run `origin pr view <number>` or `gh pr view <number>` before you refer to PR status.",
    outputIncludes: ["If a PR still opens as a draft, run `origin pr ready <number>`"],
  },
  {
    kind: "replace",
    file: "skills/poteto-mode/playbooks/opening-a-pr.md",
    reason:
      "Babysitting needs a watcher this port does not ship, so opening a PR must not promise one.",
    anchor:
      "**Babysit.** Opening a PR does not start a babysit. Post the URL and keep building. Finish the phase or stack first. Run a separate babysit pass only when the user asks for one after the whole stack exists. A babysit for each new PR stalls the build and spends checks on commits later waves restart. Push back when feedback drifts from intent.",
    expectedMatches: 1,
    replacement:
      "**Babysit.** Opening a PR does not start a babysit. Post the URL and keep building. Finish the phase or stack first. The babysit playbook is not ported to this harness yet, so a later pass means reading that playbook's `SKILL.md` at its absolute resource path and running the parts its own text marks as available. A babysit for each new PR stalls the build and spends checks on commits later waves restart. Push back when feedback drifts from intent.",
    outputIncludes: ["The babysit playbook is not ported to this harness yet"],
  },
  // -------------------------------------------------------------------------
  // poteto-help: the page that must describe only what this build ships.
  // -------------------------------------------------------------------------
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "A Custom Mode does not exist here, so the helper stops promising that the mode persists.",
    anchor:
      'A message that asks for work, such as "use pstack to fix this bug", is not a help question. Read [`poteto-mode`](../poteto-mode/SKILL.md), do the work under it, and mention once that a Custom Mode keeps it on.',
    expectedMatches: 1,
    replacement:
      'A message that asks for work, such as "use pstack to fix this bug", is not a help question. Read [`poteto-mode`](../poteto-mode/SKILL.md), do the work under it, and mention once that each new task has to start with `/poteto-mode` again.',
    outputIncludes: ["each new task has to start with `/poteto-mode` again"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "The links resolve inside this package, not inside a Cursor plugin install.",
    anchor:
      "This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https://github.com/cursor/plugins/blob/main/pstack/` followed by its path.",
    expectedMatches: 1,
    replacement:
      "This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here are relative paths inside this package, so give the user the path itself and say when a page describes upstream behavior this port has not implemented.",
    outputIncludes: ["The links here are relative paths inside this package"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "There is no per-role default model here: an unconfigured role inherits the parent route.",
    anchor:
      "- Later: answer their question, and add one line saying every role keeps its default model until they run `/setup-pstack`.",
    expectedMatches: 1,
    replacement:
      "- Later: answer their question, and add one line saying every role keeps inheriting the parent route until they run `/setup-pstack`.",
    outputIncludes: ["every role keeps inheriting the parent route until they run `/setup-pstack`"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "The role file replaced the Cursor rule, and a missing role inherits the parent route.",
    anchor:
      "- No `~/.cursor/rules/pstack-models.mdc` means `/setup-pstack` hasn't run for this user, so every role uses its default model.",
    expectedMatches: 1,
    replacement:
      "- No `$DSH_HOME/pstack-models.md` means `/setup-pstack` hasn't run for this user, so every role inherits the parent route.",
    outputIncludes: ["`$DSH_HOME/pstack-models.md` means `/setup-pstack` hasn't run"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "A missing role file means inheritance, not a Cursor default model.",
    anchor:
      "When the model rule is missing and it matters, ask whether the user wants to pick a model for each role and a reasoning budget now.",
    expectedMatches: 1,
    replacement:
      "When the role file is missing and it matters, ask whether the user wants to pick a route for each role and a reasoning budget now.",
    outputIncludes: ["When the role file is missing and it matters"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "The role file replaces the always-applied rule, and it applies from the next delegation.",
    anchor:
      "1. Install with `/add-plugin pstack` in chat, or from Customize in the sidebar.\n2. Run [`/setup-pstack`](../setup-pstack/SKILL.md). It asks for a reasoning budget, maps a model to each role, and writes a rule. The rule applies to new chats. Then it offers once each to generate a verification skill and a formal verification skill for the project, unless the project already has one.",
    expectedMatches: 1,
    replacement:
      "1. Install the bundle into the profile you use: `dsh plugin --profile <profile> add dsh-pstack`, then enable the bundle when DSH asks, and start a new Session if it says the change needs one.\n2. Run [`/setup-pstack`](../setup-pstack/SKILL.md). It asks for a reasoning budget, maps a route to each role, and writes `$DSH_HOME/pstack-models.md`. That file applies from the next delegation on, because `pstack_subagent` re-reads it every time. It then offers once each to generate a verification skill and a formal verification skill for the project, unless the project already has one; both generators ship in this package.",
    outputIncludes: [
      "`dsh plugin --profile <profile> add dsh-pstack`",
      "That file applies from the next delegation on",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "Only one bundled skill is model-invocable, so the install description has to say what actually loads.",
    anchor:
      "Installing changes nothing until the user invokes a skill. Only `/setup-pstack` loads from the user's words.",
    expectedMatches: 1,
    replacement:
      "Enabling the bundle adds the skill catalog and the `pstack_subagent` tool; nothing runs until the user invokes a skill. Only `/setup-pstack` loads from the user's words.",
    outputIncludes: ["Only `/setup-pstack` loads from the user's words."],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "`inherit-parent` means the parent route, not Cursor's Auto.",
    anchor:
      "A role set to `auto` or `inherit-parent` runs on the chat's model, which saves tokens when the chat runs on Auto or a cheaper model.",
    expectedMatches: 1,
    replacement:
      "A role set to `inherit-parent` or `auto` runs on the parent route, so it spends nothing extra on a second model.",
    outputIncludes: ["runs on the parent route, so it spends nothing extra on a second model"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason:
      "There is no Custom Mode, no mode shortcut, and no second way to give a child the orchestration preamble.",
    anchor:
      "Whether `/poteto-mode` stays on depends on how the user starts it:\n\n- Enter on `/poteto-mode` attaches the skill to one message. It fades as the chat moves on.\n- Option+Enter on Mac or Alt+Enter on Windows, or Use as Mode from the skill entry, makes it a Custom Mode. It stays in context every turn until the user exits the mode, and it stays out of casual turns.\n- Cursor's docs list Custom Modes in the Agents Window and the CLI. Elsewhere, start each new task with `/poteto-mode`.\n\nLink [Cursor's skills docs](https://cursor.com/docs/skills) when this comes up. Mid-chat, \"new task\" makes the mode match a fresh playbook. `/poteto-mode` already uses `poteto-agent` for the subagents its playbook steps spawn. To get the same style from a subagent of your own, spawn it with `subagent_type: \"poteto-agent\"`.",
    expectedMatches: 1,
    replacement:
      "`/poteto-mode` has no persistent mode in this host, so every new task starts by invoking it again:\n\n- Invoking `/poteto-mode` attaches the skill to the current task. A later task does not inherit it.\n- There is no Custom Mode and no keyboard shortcut that keeps it on, because this host has neither. Start each task with `/poteto-mode`.\n- A subagent of your own gets the orchestration style only as a `pstack_subagent` child with `agent: \"poteto-agent\"`, because the tool injects that preamble; `agent: \"general\"` does not.",
    outputIncludes: [
      "`/poteto-mode` has no persistent mode in this host",
      'only as a `pstack_subagent` child with `agent: "poteto-agent"`',
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "Swarm workers are local children, not cloud machines.",
    anchor:
      "| Run parallel checks over slices, or race workers, as cloud agents | [`/swarm`](../swarm/SKILL.md) |",
    expectedMatches: 1,
    replacement:
      "| Run parallel checks over slices, or race workers, as local child Sessions | [`/swarm`](../swarm/SKILL.md) |",
    outputIncludes: ["as local child Sessions"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason:
      "Several skills in the table depend on the history tool this build does not ship, so the map has to say which ones are unverified.",
    anchor:
      "If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.",
    expectedMatches: 1,
    replacement:
      "If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.\n\nThese skills ship their text but depend on a capability this build does not have yet, so treat them as unverified: `/recall`, `/reflect`, `/automate-me`, `/show-me-your-work`, the Eval playbook, Session pickup, and Worktree cleanup. A session-history tool and the remaining long-running playbooks arrive in later units.",
    outputIncludes: [
      "so treat them as unverified: `/recall`, `/reflect`, `/automate-me`, `/show-me-your-work`",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "`/loop`, `cursor-team-kit`, and Cursor's `create-skill` are not available here.",
    anchor:
      "- `/deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin.\n- `/loop` and `/create-skill` are Cursor built-ins.\n- pstack has no `/orchestrate` skill. Orchestrate is a `/poteto-mode` playbook. If the slash menu shows `/orchestrate`, another plugin provides it.",
    expectedMatches: 1,
    replacement:
      "- `/deslop`, `control-cli`, and `control-ui` ship in Cursor's `cursor-team-kit` plugin and are not ported. Read the diff once yourself, and use a project verification skill when one exists.\n- `/loop` and `/create-skill` are Cursor built-ins. This port has neither: a long run stays in one Session, and skill authoring goes through the authoring playbook.\n- pstack has no `/orchestrate` skill. Orchestrate is a `/poteto-mode` playbook, and that playbook is not ported to this harness yet.",
    outputIncludes: ["This port has neither: a long run stays in one Session"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason:
      "Only ten playbooks are ported, so the router must name them and stop implying the rest run here.",
    anchor:
      'Without `/poteto-mode`, a phrase such as "babysit this pr" can start Cursor\'s own skill for the same job instead. The Playbooks section of [`poteto-mode`](../poteto-mode/SKILL.md) lists every playbook and when it applies. [Guide page 6](../../docs/guide/06-verify-and-ship.md) covers opening, babysitting, and landing a PR.',
    expectedMatches: 1,
    replacement:
      'The ported playbooks are Investigation, Bug fix, Perf issue, Runtime forensics, Trace forensics, Feature, Refactoring, Prototype, Authoring a skill, and Opening a PR. Hillclimb, Visual parity, Shipping, Babysit, Eval, Orchestrate, the two Autopilot playbooks, Session pickup, Pause safely, Multi-phase plan, and Worktree cleanup still carry Cursor wording and are not ported yet, so name that gap instead of routing into them. The Playbooks section of [`poteto-mode`](../poteto-mode/SKILL.md) lists every playbook and when it applies. [Guide page 6](../../docs/guide/06-verify-and-ship.md) covers opening, babysitting, and landing a PR.',
    outputIncludes: [
      "The ported playbooks are Investigation, Bug fix, Perf issue, Runtime forensics, Trace forensics, Feature, Refactoring, Prototype, Authoring a skill, and Opening a PR.",
      "still carry Cursor wording and are not ported yet",
    ],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "A role choice reaches the next delegation, not a new chat.",
    anchor:
      "| A new model choice had no effect | The rule from `/setup-pstack` applies to new chats. Start one. |",
    expectedMatches: 1,
    replacement:
      "| A new model choice had no effect | The file from `/setup-pstack` applies to the next delegation. A child that already started keeps the route it started with. |",
    outputIncludes: ["applies to the next delegation"],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "There is no cloud machine, and a shared checkout is not isolation.",
    anchor:
      "| Parallel agents overwrote each other | Give each agent its own worktree, or run them as cloud agents, which each get their own machine. |",
    expectedMatches: 1,
    replacement:
      "| Parallel agents overwrote each other | Give each writer its own `create_worktree` checkout and pass its absolute path as that child's `cwd`. There is no cloud machine, and a shared checkout is not isolation. |",
    outputIncludes: ["There is no cloud machine, and a shared checkout is not isolation."],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason: "`/loop` does not exist here, so an overnight run is a supervised Session.",
    anchor:
      "| An overnight run moved but finished nothing | `/loop` needs a check that can pass or fail, not a duration. See [guide page 7](../../docs/guide/07-overnight.md). |",
    expectedMatches: 1,
    replacement:
      "| An overnight run moved but finished nothing | The run needs a check that can pass or fail, not a duration. This host has no `/loop`, so an overnight run is a supervised Session. See [guide page 7](../../docs/guide/07-overnight.md). |",
    outputIncludes: ["This host has no `/loop`, so an overnight run is a supervised Session."],
  },
  {
    kind: "replace",
    file: "skills/poteto-help/SKILL.md",
    reason:
      "`/automate-me` and `/reflect` depend on the history tool, and the eval playbook is not ported.",
    anchor:
      "- [`/automate-me`](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/poteto-mode`.\n- [`/reflect`](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.\n- `/poteto-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.",
    expectedMatches: 1,
    replacement:
      "- [`/automate-me`](../automate-me/SKILL.md) and [`/reflect`](../reflect/SKILL.md) keep their text, but both read session history through a restricted tool this build does not have yet, so treat them as unverified until the history unit lands.\n- `/poteto-mode write a skill for <workflow>` runs the authoring playbook, which is ported; validate the result with this package's asset check, because there is no built-in drafting or evaluation tool. The eval playbook is not ported yet.",
    outputIncludes: [
      "treat them as unverified until the history unit lands",
      "validate the result with this package's asset check",
    ],
  },
];

export function patchesForFile(file: string): readonly FilePatch[] {
  return FILE_PATCHES.filter((patch) => patch.file === file);
}
