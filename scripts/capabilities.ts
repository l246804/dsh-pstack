/**
 * The capability table behind `assets/docs/harness/dsh.md`.
 *
 * One row per upstream concept the port has to answer for. `coverage` says what
 * happens to it; anything other than `mapped` carries a reason and the unit that
 * delivers it, so a deferred promise cannot be mistaken for shipped behavior.
 */
import { GENERATED_HARNESS_DOC } from "./asset-paths.ts";

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
    coverage: "deferred",
    reason: "The tool is built in the delegation unit; the ship-date text still describes Task.",
    unit: "3",
  },
  {
    id: "subagent-general",
    kind: "tool",
    cursor: "`subagent_type: generalPurpose`",
    dsh: '`agent: "general"`',
    coverage: "deferred",
    reason: "Agent presets arrive with the delegation unit.",
    unit: "3",
  },
  {
    id: "subagent-poteto",
    kind: "tool",
    cursor: "`subagent_type: poteto-agent`",
    dsh: '`agent: "poteto-agent"`, with the preamble injected by the tool',
    coverage: "deferred",
    reason: "The preamble injection is part of the delegation unit.",
    unit: "3",
  },
  {
    id: "subagent-comment-sicko",
    kind: "tool",
    cursor: "`comment-sicko` subagent",
    dsh: '`agent: "comment-sicko"`, kept read-only',
    coverage: "deferred",
    reason: "The comment-review child needs the delegation unit before it can run.",
    unit: "3",
  },
  {
    id: "background-field",
    kind: "tool",
    cursor: "`run_in_background: true`",
    dsh: "field removed; children start as activations",
    detect: "run_in_background",
    coverage: "deferred",
    reason: "Field removal lands with the delegation text patches.",
    unit: "3",
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
    coverage: "deferred",
    reason: "The continuation policy is delivered with the delegation unit.",
    unit: "3",
  },
  {
    id: "attachments",
    kind: "tool",
    cursor: "`file_attachments`",
    dsh: "real paths listed in the brief",
    coverage: "deferred",
    reason: "Attachment handling is rewritten together with the delegation text.",
    unit: "3",
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
    dsh: "the authoring playbook plus DSH validation",
    coverage: "degraded",
    reason: "No Cursor drafting, evaluation, or optimization tool is claimed.",
    unit: "4",
  },
  {
    id: "skill-by-name",
    kind: "tool",
    cursor: "`/name` or the named skill",
    dsh: "read the skill through its absolute resource path",
    coverage: "deferred",
    reason: "Absolute resource paths come from the pack that also ships the provider unit.",
    unit: "2",
  },
  {
    id: "model-route",
    kind: "model",
    cursor: "model slug, reasoning effort, `fast`",
    dsh: "`role` resolved from `$DSH_HOME/pstack-models.md`",
    coverage: "deferred",
    reason: "Route resolution belongs to the role unit; no model id is hardcoded in the assets.",
    unit: "3",
  },
  {
    id: "models-rule",
    kind: "path",
    cursor: "`~/.cursor/rules/pstack-models.mdc`",
    dsh: "`$DSH_HOME/pstack-models.md`, read for each new delegation",
    detect: "pstack-models.mdc",
    coverage: "deferred",
    reason: "Reading the role file is part of the role unit.",
    unit: "3",
  },
  {
    id: "project-skills",
    kind: "path",
    cursor: "`.cursor/skills`, `~/.cursor/skills`",
    dsh: "`.dsh/skills/<name>/SKILL.md`, `$DSH_HOME/skills`",
    detect: ".cursor/skills",
    coverage: "deferred",
    reason: "Skill registration and lookup ship with the provider unit.",
    unit: "2",
  },
  {
    id: "plugin-location",
    kind: "path",
    cursor: "`~/.cursor/plugins`, `.cursor-plugin`",
    dsh: "absolute resource paths inside this package",
    detect: ".cursor/plugins",
    coverage: "deferred",
    reason: "The package resolves its own resource root in the provider unit.",
    unit: "2",
  },
  {
    id: "transcripts",
    kind: "path",
    cursor: "`~/.cursor/projects/.../agent-transcripts`",
    dsh: "restricted `sessionQuery` reads",
    detect: "agent-transcripts",
    coverage: "deferred",
    reason: "The history unit owns the query path and its permissions.",
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
      "Automatic attachment by file glob has no equivalent, so `typescript-best-practices` stays an explicit invocation.",
    unit: "not planned",
  },
  {
    id: "custom-mode",
    kind: "host",
    cursor: "Custom Mode",
    dsh: "an explicit `/poteto-mode` on each new task",
    coverage: "degraded",
    reason: "No persistent mode or keyboard shortcut is simulated.",
    unit: "4",
  },
  {
    id: "loop",
    kind: "host",
    cursor: "`/loop`",
    dsh: "`create_goal`, plus `schedule_create` where a timed input fits",
    detect: "/loop",
    coverage: "deferred",
    reason: "Goal and schedule integration lands with the long-running workflows.",
    unit: "6",
  },
  {
    id: "automations",
    kind: "host",
    cursor: "Cursor Automations, `update_state`, `SendToUser`",
    dsh: "not mapped; routine-style automation is excluded",
    coverage: "excluded",
    reason: "`schedule_create` is not a webhook routine, and secrets are not requested.",
    unit: "5",
  },
  {
    id: "cloud-agent",
    kind: "host",
    cursor: "cloud agent, `cloud_base_branch`, dashboard",
    dsh: "a local child with real completion state and worktree isolation",
    coverage: "degraded",
    reason: "No VM, cross-device resume, or dashboard is promised.",
    unit: "3",
  },
  {
    id: "deslop",
    kind: "host",
    cursor: "`deslop`",
    dsh: "`/no-comments` plus one read-through of the diff",
    detect: "deslop",
    coverage: "degraded",
    reason: "It is not the same skill under a new name.",
    unit: "4",
  },
  {
    id: "control-ui",
    kind: "host",
    cursor: "`control-ui`, `control-cli`",
    dsh: "a project verification skill or an existing driver",
    detect: "control-ui",
    coverage: "degraded",
    reason: "Without a driver the verification result stays unproven.",
    unit: "4",
  },
  {
    id: "bugbot",
    kind: "host",
    cursor: "Bugbot",
    dsh: "triage of review comments already on a pull request",
    detect: "Bugbot",
    coverage: "preserved",
    reason: "Starting or configuring Bugbot is out of scope for the first release.",
    unit: "4",
  },
  {
    id: "pr-tool",
    kind: "host",
    cursor: "built-in pull request tool",
    dsh: "resolved `gh`, or an `origin` CLI that is actually available",
    coverage: "degraded",
    reason: "A forge path has to be resolved before the shipping steps can run.",
    unit: "4",
  },
  {
    id: "image-generation",
    kind: "host",
    cursor: "image generation, `/visualize`",
    dsh: "Mermaid, existing screenshots, or a real renderer",
    coverage: "degraded",
    reason: "No image is fabricated when none can be rendered.",
    unit: "4",
  },
  {
    id: "worktree",
    kind: "host",
    cursor: "worktree isolation",
    dsh: "the official worktree integration",
    coverage: "deferred",
    reason: "Parallel-write playbooks need it before they can run.",
    unit: "4",
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
    "> This package currently ships static assets only. Runtime capabilities arrive with later units.",
    "> The tables below are the target contract, not proof that a capability is installed in a profile.",
    "",
    `Generated from \`scripts/capabilities.ts\` into \`assets/${GENERATED_HARNESS_DOC}\`. Edit the table, not this file.`,
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
