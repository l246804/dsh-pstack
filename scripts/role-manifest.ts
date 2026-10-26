/**
 * The one pstack role manifest.
 *
 * Every consumer of the role vocabulary reads this module: `src/roles.ts` for
 * exact lookup and panel classification, `src/models.ts` for value shapes,
 * `scripts/build-assets.ts` for the generated example file, and the
 * `setup-pstack` skill text, which points at that example instead of listing the
 * roles again. A second literal role list anywhere is a bug.
 *
 * Keys are matched exactly after normalization. Commas are part of some keys
 * (`feature, refactoring`), so nothing here may be split on a comma.
 *
 * This module has no Node imports: the Host bundle imports it directly.
 */

/** Whether a role holds one route or a comma-separated list of routes. */
export type RoleValueShape = "single" | "list";

export interface RoleSpec {
  /** Exact key as written in the role file. Commas belong to the key. */
  readonly key: string;
  readonly shape: RoleValueShape;
  /**
   * A list role that automatically starts one child per entry. Only the three
   * panel roles set this; every other list role selects one entry.
   */
  readonly autoPanel: boolean;
  /** Skills and playbooks that read this role. */
  readonly consumers: readonly string[];
  readonly summary: string;
}

/** File name the role policy lives under inside `$DSH_HOME`. */
export const PSTACK_MODELS_FILENAME = "pstack-models.md";

/** Asset path, relative to `assets/`, of the generated shape reference. */
export const PSTACK_MODELS_EXAMPLE_PATH = "docs/pstack-models.example.md";

/** Values that resolve to "send no `agentOptions` and inherit the parent route". */
export const INHERIT_PARENT_ALIASES: readonly string[] = ["inherit-parent", "auto"];

export const ROLE_MANIFEST: readonly RoleSpec[] = [
  {
    key: "feature, refactoring",
    shape: "single",
    autoPanel: false,
    consumers: ["poteto-mode/playbooks/feature.md", "poteto-mode/playbooks/refactoring.md"],
    summary:
      "One route for both code playbooks. The comma joins two playbook names into a single key.",
  },
  {
    key: "bug-fix",
    shape: "single",
    autoPanel: false,
    consumers: ["poteto-mode/playbooks/bug-fix.md"],
    summary: "Implementation route for the bug-fix playbook.",
  },
  {
    key: "perf-issue",
    shape: "single",
    autoPanel: false,
    consumers: ["poteto-mode/playbooks/perf-issue.md"],
    summary: "Implementation route for the perf-issue playbook.",
  },
  {
    key: "hillclimb",
    shape: "single",
    autoPanel: false,
    consumers: ["poteto-mode/playbooks/hillclimb.md"],
    summary: "Implementation route for the hillclimb playbook.",
  },
  {
    key: "judgment and prose",
    shape: "single",
    autoPanel: false,
    consumers: ["poteto-mode/SKILL.md", "unslop", "technical-writing"],
    summary: "Route for prose work and vague-instruction judgment calls.",
  },
  {
    key: "hardest tasks",
    shape: "single",
    autoPanel: false,
    consumers: ["poteto-mode/SKILL.md"],
    summary: "Route for the strongest judgment model on cross-cutting or subtle work.",
  },
  {
    key: "how explorer",
    shape: "single",
    autoPanel: false,
    consumers: ["how/SKILL.md", "how/references/explorer-prompt.md"],
    summary: "Route for each how explorer child.",
  },
  {
    key: "how explainer",
    shape: "single",
    autoPanel: false,
    consumers: ["how/SKILL.md", "how/references/explainer-prompt.md"],
    summary: "Route for the single how explainer child.",
  },
  {
    key: "why investigators",
    shape: "single",
    autoPanel: false,
    consumers: ["why/SKILL.md", "why/references/investigator-prompt.md"],
    summary: "Route for each why investigator child.",
  },
  {
    key: "why synthesizer",
    shape: "single",
    autoPanel: false,
    consumers: ["why/SKILL.md", "why/references/synthesizer-prompt.md"],
    summary: "Route for the why synthesis child.",
  },
  {
    key: "reflect tooling",
    shape: "single",
    autoPanel: false,
    consumers: ["reflect/SKILL.md", "reflect/references/tooling-reviewer.md"],
    summary: "Route for the reflect tooling reviewer.",
  },
  {
    key: "reflect judgment, divergent, synthesizer",
    shape: "single",
    autoPanel: false,
    consumers: [
      "reflect/SKILL.md",
      "reflect/references/judgment-reviewer.md",
      "reflect/references/divergent-reviewer.md",
      "reflect/references/synthesizer.md",
    ],
    summary:
      "One shared route for the judgment reviewer, the divergent reviewer, and the synthesizer. The commas belong to the key.",
  },
  {
    key: "arena runners",
    shape: "list",
    autoPanel: true,
    consumers: ["arena/SKILL.md"],
    summary: "Panel: one arena child per entry, all started together.",
  },
  {
    key: "arena cross-judge pool",
    shape: "list",
    autoPanel: false,
    consumers: ["arena/SKILL.md"],
    summary:
      "A pool arena picks one entry from, preferring a model family unlike the parent's. Not fanned out automatically.",
  },
  {
    key: "swarm workers",
    shape: "list",
    autoPanel: false,
    consumers: ["swarm/SKILL.md", "poteto-mode/playbooks/multi-phase-plan.md"],
    summary:
      "One default route for every worker. A race gives each arm another entry through `roleIndex`, and the caller still starts one worker per call.",
  },
  {
    key: "architect runners",
    shape: "list",
    autoPanel: true,
    consumers: ["architect/SKILL.md"],
    summary: "Panel: one architect child per entry, all started together.",
  },
  {
    key: "interrogate reviewers",
    shape: "list",
    autoPanel: true,
    consumers: ["interrogate/SKILL.md"],
    summary: "Panel: one interrogate reviewer per entry, all started together.",
  },
];

/** Every exact role key, in manifest order. */
export const ROLE_KEYS: readonly string[] = ROLE_MANIFEST.map((role) => role.key);

/** Keys whose list value expands to one child per entry automatically. */
export const AUTO_PANEL_ROLE_KEYS: readonly string[] = ROLE_MANIFEST.filter(
  (role) => role.autoPanel,
).map((role) => role.key);

/** The four setup-pstack budget tiers and the effort each one targets. */
export interface BudgetTier {
  readonly label: string;
  /** Target effort token; the model's supported list decides whether it applies. */
  readonly effort: string;
  readonly description: string;
}

export const BUDGET_TIERS: readonly BudgetTier[] = [
  { label: "unlimited", effort: "max", description: "max reasoning" },
  { label: "large", effort: "xhigh", description: "xhigh reasoning" },
  { label: "medium", effort: "high", description: "high reasoning" },
  { label: "small", effort: "medium", description: "medium reasoning" },
];

/** Exact manifest lookup. Callers normalize the key first. */
export function findRoleSpec(key: string): RoleSpec | undefined {
  return ROLE_MANIFEST.find((role) => role.key === key);
}

/**
 * Render the role-file shape reference shipped as a generated asset.
 *
 * The output is itself a valid role file: every explanatory line is a `#` comment,
 * so copying it verbatim yields a working policy where every role inherits the
 * parent route. That is what makes `/setup-pstack` safe to re-run and makes the
 * example a convergence baseline rather than prose that happens to look like one.
 *
 * The defaults are `inherit-parent` for every role because this package cannot
 * know which routes a deployment serves. `setup-pstack` replaces them with routes
 * the user confirmed, never with a model id guessed here.
 */
export function renderPstackModelsExample(): string {
  const roles = ROLE_MANIFEST.map((role) => `${role.key}: inherit-parent`);
  return [
    "# pstack per-role model configuration",
    "#",
    "# `/setup-pstack` writes this file to `$DSH_HOME/pstack-models.md`. `pstack_subagent`",
    "# re-reads it on every delegation, so an edit reaches the next child and never a child",
    "# that already started.",
    "#",
    "# One line per role. The key must match a role in the manifest exactly, commas",
    "# included. Delete a line to inherit the parent route for that role.",
    "#",
    "# Value forms:",
    "#",
    "# - `inherit-parent` or `auto` sends no `agentOptions`, so the child runs on the parent",
    "#   route.",
    "# - `<provider>/<model>` is an exact route. It splits at the first `/`: the",
    "#   provider is the text before it and the model is everything after it, so",
    "#   `gateway/vendor-a/model-x` is provider `gateway` with model",
    "#   `vendor-a/model-x`. No segment may be empty.",
    "# - `<provider>/<model> [effort]` sets the reasoning effort that role *starts* at.",
    "#   It is a baseline and a floor, not a verdict: a caller raises or lowers it per",
    "#   delegation with `reasoningEffort`, and a running child can change its own with",
    "#   `set_reasoning_effort`. The effort must appear in that model's supported effort",
    "#   list. This package assumes no ladder of its own, so it never invents a token",
    "#   and reports the real ones whenever it refuses one.",
    "#",
    "# `arena runners`, `architect runners`, and `interrogate reviewers` are panels: the",
    "# value is a comma-separated list and one child starts per entry. Two entries on the",
    "# same route are not a cross-model review, and `pstack_subagent` says so in its",
    "# result.",
    "#",
    "# `arena cross-judge pool` is a list too, but it is not fanned out; pass `roleIndex` to",
    "# choose the entry. `swarm workers` is a list as well: its first entry is the default",
    "# route for every worker, `roleIndex` gives one race arm a different entry, and the",
    "# caller still starts each worker itself.",
    "#",
    "# The defaults below are `inherit-parent` because no route is confirmed yet. Replace",
    "# them with routes your own deployment serves.",
    "#",
    "# budget: none (unset)",
    ...roles,
    "",
  ].join("\n");
}
