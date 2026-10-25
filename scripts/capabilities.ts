/**
 * The capability table behind `assets/docs/harness/dsh.md`.
 *
 * One row per upstream concept the port has to answer for. `coverage` says what
 * happens to it; anything other than `mapped` carries a reason and the unit that
 * delivers it, so a deferred promise cannot be mistaken for shipped behavior.
 */
export const HARNESS_DOC_PATH = "docs/harness/dsh.md";

/**
 * Scope line rendered into the harness document.
 *
 * It names what this tree actually ships and keeps the later units marked as
 * promises. `check-assets` asserts the generated document keeps this exact
 * sentence, so the disclaimer cannot drift away from the implementation.
 */
export const HARNESS_DOC_SCOPE_LINE =
  "> This package ships its static assets, one bundled skill provider, the `pstack_subagent` delegation tool, the ported workflow skills and playbooks, restricted read-only history through `pstack_history`, the official worktree integration mounted on demand, and a long-running-workflow pass that maps automatic goals, reminder heartbeats, and local watchers onto the host tools that actually exist.";

export type CapabilityKind = "tool" | "path" | "model" | "host";

export type CapabilityCoverage = "mapped" | "degraded" | "preserved" | "excluded" | "deferred";

interface CapabilityBase {
  readonly id: string;
  readonly kind: CapabilityKind;
  readonly cursor: string;
  readonly dsh: string;
  readonly detect?: string;
  readonly note?: string;
}

export interface MappedCapability extends CapabilityBase {
  readonly coverage: "mapped";
}

export interface UnmappedCapability extends CapabilityBase {
  readonly coverage: "degraded" | "preserved" | "excluded" | "deferred";
  readonly reason: string;
  /** Delivery unit from the design's implementation order. */
  readonly unit: string;
}

export type Capability = MappedCapability | UnmappedCapability;

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "task-spawn",
    kind: "tool",
    cursor: "`Task` spawn",
    dsh: "`pstack_subagent`, which returns a child id and reports by completion notice",
    coverage: "mapped",
    note: "Every call starts a managed activation and returns the child id; the result arrives as a completion notice, so nothing polls. A panel role starts one child per configured entry and reports a partial start instead of rolling back.",
  },
  {
    id: "subagent-general",
    kind: "tool",
    cursor: "`subagent_type: generalPurpose`",
    dsh: '`agent: "general"`',
    coverage: "mapped",
    note: "A plain child with no injected preamble. `agent` accepts only the three pstack kinds, never a DSH agent preset id.",
  },
  {
    id: "subagent-poteto",
    kind: "tool",
    cursor: "`subagent_type: poteto-agent`",
    dsh: '`agent: "poteto-agent"`, with the preamble injected by the tool',
    coverage: "mapped",
    note: "The preamble is read from the packaged asset at an absolute path and the `poteto-mode` instructions path is injected into the brief. A missing preamble blocks that agent type instead of degrading to a plain child.",
  },
  {
    id: "subagent-comment-sicko",
    kind: "tool",
    cursor: "`comment-sicko` subagent",
    dsh: '`agent: "comment-sicko"`, briefed read-only',
    coverage: "degraded",
    reason:
      "The persona preamble is injected, but the no-write rule is brief text rather than a sandbox, so a reviewer's scope still has to be checked.",
    unit: "3",
  },
  {
    id: "background-field",
    kind: "tool",
    cursor: "`run_in_background: true`",
    dsh: "field removed; children start as activations",
    detect: "run_in_background",
    coverage: "mapped",
    note: "`pstack_subagent` takes no background flag: every child is a managed activation and reports through a completion notice.",
  },
  {
    id: "readonly-field",
    kind: "tool",
    cursor: "`readonly: true` and `readonly: false`",
    dsh: "a no-write constraint in the brief; the field is removed",
    coverage: "degraded",
    reason: "Prose is not a sandbox, so a read-only child has to be checked rather than enforced.",
    unit: "3",
  },
  {
    id: "resume",
    kind: "tool",
    cursor: "`resume`",
    dsh: "a fresh child; `send_message` only when state is expensive to move",
    coverage: "mapped",
    note: "`pstack_subagent` always starts a fresh child. `send_message` continues a live one; a settled child is never silently resumed.",
  },
  {
    id: "attachments",
    kind: "tool",
    cursor: "`file_attachments`",
    dsh: "real paths listed in the brief",
    coverage: "mapped",
    note: "The brief carries real paths; no invented attachment argument exists in the tool schema.",
  },
  {
    id: "askquestion",
    kind: "tool",
    cursor: "`AskQuestion`",
    dsh: "`ask_user_question` with `multi_select`",
    coverage: "mapped",
  },
  {
    id: "todolist",
    kind: "tool",
    cursor: "`TodoWrite`",
    dsh: "`todo_write` with the full list; a skipped step stays in `content`",
    coverage: "mapped",
  },
  {
    id: "file-tools",
    kind: "tool",
    cursor: "`Grep`, `Glob`, `Read`, `Shell`",
    dsh: "`grep`, `glob`, `read`, `bash`",
    coverage: "mapped",
  },
  {
    id: "create-skill",
    kind: "tool",
    cursor: "built-in `create-skill`",
    dsh: "the authoring playbook plus this package's frontmatter, link, and structure checks",
    coverage: "degraded",
    reason:
      "No Cursor drafting, evaluation, or optimization tool is claimed; the playbook points at the validators this package actually runs.",
    unit: "4",
  },
  {
    id: "skill-by-name",
    kind: "tool",
    cursor: "`/name` or the named skill",
    dsh: "the `skill` tool for model-invocable skills, `/name` for the rest",
    coverage: "mapped",
    note: "The bundled provider lists all 55 skills and loads each body from its absolute path; only `setup-pstack` stays model-invocable, exactly as upstream declares.",
  },
  {
    id: "model-route",
    kind: "model",
    cursor: "model slug, reasoning effort, `fast`",
    dsh: "`role` resolved from `$DSH_HOME/pstack-models.md`",
    coverage: "mapped",
    note: "A role value is `inherit-parent`, `auto`, `<provider>/<model>`, or `<provider>/<model> [effort]`. The effort is validated against the live adapter metadata before a child starts; no model id is hardcoded in the assets.",
  },
  {
    id: "models-rule",
    kind: "path",
    cursor: "`~/.cursor/rules/pstack-models.mdc`",
    dsh: "`$DSH_HOME/pstack-models.md`, read for each new delegation",
    detect: "pstack-models",
    coverage: "mapped",
    note: "`/setup-pstack` writes the file and `pstack_subagent` re-reads it on every delegation. An unreadable file is an error, not an empty configuration.",
  },
  {
    id: "project-skills",
    kind: "path",
    cursor: "`.cursor/skills`, `~/.cursor/skills`",
    dsh: "`assets/skills/<name>/SKILL.md` inside this package",
    detect: ".cursor/skills",
    coverage: "mapped",
    note: "Skills ship inside the package and are read in place; nothing is copied into `$DSH_HOME/skills`, and no directory is watched.",
  },
  {
    id: "plugin-location",
    kind: "path",
    cursor: "`~/.cursor/plugins`, `.cursor-plugin`",
    dsh: "absolute resource paths inside this package",
    detect: ".cursor/plugins",
    coverage: "mapped",
    note: "Each candidate carries its own skill directory as the resource base, so `references/` and `scripts/` resolve next to `SKILL.md`.",
  },
  {
    id: "transcripts",
    kind: "path",
    cursor: "`~/.cursor/projects/.../agent-transcripts`",
    dsh: "`pstack_history`, a restricted read of raw `sessionQuery` events",
    detect: "agent-transcripts",
    coverage: "degraded",
    reason:
      "The tool pages one fixed observation of the calling session or a reviewable direct child, inside the caller's workspace; there is no transcript directory to read, no arbitrary session id, and no descendant traversal. A cold read from persistence cannot separate the stored log from the read-time interrupted-turn closers rc.3 appends, so per-event provenance is reported undeterminable and a full transcript audit stays unfinished for those sessions. The live/prepared split, pagination, and lease release are unit-tested; no real profile read has run yet.",
    unit: "5",
  },
  {
    id: "agent-store",
    kind: "path",
    cursor: "agent store",
    dsh: "`.audit/<task-slug>/` or a directory the user names",
    coverage: "mapped",
  },
  {
    id: "skill-paths-field",
    kind: "host",
    cursor: "`paths:` auto-attach globs in SKILL.md",
    dsh: "not consumed; skills load by explicit invocation",
    coverage: "degraded",
    reason:
      "Automatic attachment by file glob has no equivalent, so `typescript-best-practices` is explicit-invocation only and its body says so. The frontmatter field is dropped from the generated skill rather than shipped as a no-op.",
    unit: "not planned",
  },
  {
    id: "custom-mode",
    kind: "host",
    cursor: "Custom Mode",
    dsh: "an explicit `/poteto-mode` on each new task",
    coverage: "degraded",
    reason:
      "No persistent mode or keyboard shortcut exists. The ported skills say so at the step where a mode would have applied.",
    unit: "4",
  },
  {
    id: "loop",
    kind: "host",
    cursor: "`/loop`",
    dsh: "`create_goal` for automatic continuation, plus `schedule_create` only as a timed heartbeat",
    detect: "/loop",
    coverage: "degraded",
    reason:
      "There is no command to type and no event subscription. The goal carries a predicate across rounds, and its round driver is a separate host package that a profile may not mount, so a goal can be created while nothing continues on its own. A reminder only delivers a follow-up into the session that created it, refuses a delegated caller, and cannot watch a PR or CI. The event half is a background job whose settlement wakes the session, or a poll the text calls a poll. Nothing here has been exercised on a real profile.",
    unit: "6",
  },
  {
    id: "automations",
    kind: "host",
    cursor: "Cursor Automations, `update_state`, `SendToUser`",
    dsh: "not mapped; routine-style automation is excluded",
    coverage: "excluded",
    reason:
      "`automate-me` ships, but it drafts a `-mode` skill from authorized history and opens a PR; it does not create a webhook routine, request a secret, or wake an agent. `schedule_create` is not a webhook routine, it refuses a delegated caller, and no secret is ever requested.",
    unit: "5",
  },
  {
    id: "cloud-agent",
    kind: "host",
    cursor: "cloud agent, `cloud_base_branch`, dashboard",
    dsh: "a local child with a real `cwd`, started from a local branch or a prepared checkout",
    coverage: "degraded",
    reason:
      "No VM, cross-device resume, dashboard, or cloud liveness check is promised, and the long-running playbooks now say so in the step that used one. Isolation is the official worktree checkout, which does not cover ports, credentials, or services, and every child ends with the host process.",
    unit: "3",
  },
  {
    id: "deslop",
    kind: "host",
    cursor: "`deslop`",
    dsh: "`/no-comments` plus one read-through of the diff",
    detect: "deslop",
    coverage: "degraded",
    reason: "It is not the same skill under a new name; the diff read-through replaces the plugin.",
    unit: "4",
  },
  {
    id: "control-ui",
    kind: "host",
    cursor: "`control-ui`, `control-cli`",
    dsh: "a project verification skill or an existing driver",
    detect: "control-ui",
    coverage: "degraded",
    reason:
      "Without a driver the verification result stays unproven, and reading source is not accepted as a substitute.",
    unit: "4",
  },
  {
    id: "bugbot",
    kind: "host",
    cursor: "Bugbot",
    dsh: "triage of review comments already on a pull request",
    detect: "Bugbot",
    coverage: "preserved",
    reason: "Starting or configuring Bugbot is out of scope; existing review threads are read as ordinary data.",
    unit: "4",
  },
  {
    id: "pr-tool",
    kind: "host",
    cursor: "built-in pull request tool",
    dsh: "resolved `gh`, or an `origin` CLI that is actually available",
    coverage: "degraded",
    reason: "A forge path has to be resolved before the shipping steps can run; there is no built-in PR tool.",
    unit: "4",
  },
  {
    id: "image-generation",
    kind: "host",
    cursor: "image generation, `/visualize`",
    dsh: "Mermaid, existing screenshots, or a real renderer",
    coverage: "degraded",
    reason: "No image is fabricated when none can be rendered, and a read-only capture stays read-only.",
    unit: "4",
  },
  {
    id: "worktree",
    kind: "host",
    cursor: "worktree isolation",
    dsh: "the official worktree rows, mounted by this bundle when the profile lacks them",
    coverage: "mapped",
    note: "Two rows mount on demand inside the composed profile and are skipped when an equivalent row is already enabled, so the `worktrees` service is provided exactly once. Isolation covers the working directory and branch only: not ports, network, credentials, caches, or services. The four profile paths are not yet verified at runtime.",
  },
  {
    id: "make-bot-ui",
    kind: "host",
    cursor: "the `/make-bot-ui` skill",
    dsh: "excluded from the port",
    detect: "/make-bot-ui",
    coverage: "excluded",
    reason:
      "It targets Cursor's Grok Bot webhook and Tailscale flow, and there is no equivalent host feature.",
    unit: "1",
  },
];

/** Literal tokens the audit counts in the generated tree. Candidates only. */
export function detectableCapabilities(): readonly (Capability & { readonly detect: string })[] {
  return CAPABILITIES.filter(
    (capability): capability is Capability & { readonly detect: string } =>
      capability.detect !== undefined,
  );
}

export function renderHarnessDoc(capabilities: readonly Capability[] = CAPABILITIES): string {
  const tools = capabilities.filter((capability) => capability.kind === "tool");
  const surfaces = capabilities.filter((capability) => capability.kind !== "tool");

  return [
    "# DSH harness mapping",
    "",
    HARNESS_DOC_SCOPE_LINE,
    "> The tables below are the target contract, not proof that a capability is installed in a profile.",
    "",
    `Generated from \`scripts/capabilities.ts\` into \`assets/${HARNESS_DOC_PATH}\`. Edit the table, not this file.`,
    "",
    "## Coverage",
    "",
    "- `mapped`: DSH has a direct equivalent, and the port keeps the upstream intent.",
    "- `degraded`: DSH has a partial equivalent, and the row states what is lost.",
    "- `preserved`: the upstream behavior stays as written, inside its narrower scope.",
    "- `excluded`: the feature is not carried, and every skill that needs it is adapted.",
    "- `deferred`: a later unit delivers it, and `Unit` names that unit.",
    "",
    "A row without `mapped` carries a reason and a delivery unit. A numeric unit names when the",
    "capability lands; `not planned` marks a gap this port does not close. Neither is evidence",
    "about this tree.",
    "",
    "## Tools and fields",
    "",
    renderTable(tools),
    "",
    "## Paths, models, and host features",
    "",
    renderTable(surfaces),
    "",
  ].join("\n");
}

function renderTable(capabilities: readonly Capability[]): string {
  const rows = capabilities.map((capability) => {
    const unit = capability.coverage === "mapped" ? "-" : capability.unit;
    const note = capability.note ?? (capability.coverage === "mapped" ? "" : capability.reason);
    return `| ${capability.cursor} | ${capability.dsh} | ${capability.coverage} | ${unit} | ${note} |`;
  });
  return [
    "| Upstream | DSH | Coverage | Unit | Note |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
