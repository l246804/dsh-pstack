/**
 * Upstream-to-DSH adaptation rules.
 *
 * The converter keeps upstream bodies as close to the source as possible. Every
 * rewrite below exists because a Cursor concept has a different name or no
 * equivalent in DeepSeek Harness. Anything not listed here stays verbatim, so
 * upstream improvements flow through on the next sync.
 *
 * `sync:check` fails when the generated tree drifts. When an upstream edit
 * changes a rewritten block, the rule stops matching; the resulting diff is the
 * signal to update the rule rather than hand-edit `assets/`.
 */

export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

const FRONTMATTER_DELIMITER = "---";

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = trimmed.slice(1, -1);
      return first === '"'
        ? inner.replace(/\\"/g, '"').replace(/\\n/g, "\n")
        : inner.replace(/''/g, "'");
    }
  }
  return trimmed;
}

/**
 * Parse the small YAML subset pstack uses in SKILL.md frontmatter: plain
 * scalars, quoted scalars, and folded/literal block scalars.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) return { data: {}, body: normalized };

  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === FRONTMATTER_DELIMITER) {
      end = index;
      break;
    }
  }
  if (end === -1) return { data: {}, body: normalized };

  const data: Record<string, string> = {};
  let index = 1;
  while (index < end) {
    const line = lines[index] ?? "";
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) {
      index += 1;
      continue;
    }
    const key = match[1]!;
    const rawValue = match[2] ?? "";
    index += 1;

    if (rawValue === ">" || rawValue === ">-" || rawValue === "|" || rawValue === "|-") {
      const folded = rawValue.startsWith(">");
      const collected: string[] = [];
      while (index < end) {
        const next = lines[index] ?? "";
        if (next.trim() !== "" && !/^\s/.test(next)) break;
        collected.push(next.replace(/^\s{1,4}/, ""));
        index += 1;
      }
      data[key] = folded
        ? collected.join(" ").replace(/\s+/g, " ").trim()
        : collected.join("\n").replace(/\n+$/, "");
      continue;
    }

    if (rawValue === "") {
      const collected: string[] = [];
      while (index < end) {
        const next = lines[index] ?? "";
        if (next.trim() !== "" && !/^\s/.test(next)) break;
        collected.push(next.trim());
        index += 1;
      }
      data[key] = collected.join(" ").trim();
      continue;
    }

    data[key] = unquote(rawValue);
  }

  return {
    data,
    body: lines
      .slice(end + 1)
      .join("\n")
      .replace(/^\n+/, ""),
  };
}

/**
 * Serialize a skill for DSH. Only the four keys the local skill provider reads
 * survive: name, description, disable-model-invocation, user-invocable. Cursor
 * display metadata such as `icon` and `color` would otherwise become dead
 * frontmatter DSH cannot render.
 */
export function serializeSkill(
  data: {
    name: string;
    description: string;
    modelInvocable: boolean;
    userInvocable: boolean;
    whenToUse?: string;
  },
  body: string,
  adapterNote: string,
): string {
  const lines = ["---", `name: ${data.name}`, `description: ${JSON.stringify(data.description)}`];
  if (!data.modelInvocable) lines.push("disable-model-invocation: true");
  if (!data.userInvocable) lines.push("user-invocable: false");
  if (data.whenToUse) lines.push(`whenToUse: ${JSON.stringify(data.whenToUse)}`);
  lines.push("---", "");
  lines.push(adapterNote, "");
  lines.push(body.replace(/\s+$/, ""), "");
  return lines.join("\n");
}

const MODEL_SLUG = /`(?:claude|grok|gpt|composer)-[a-z0-9][a-z0-9.-]*`/gi;

const TOOL_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/`Task`/g, "`pstack_subagent`"],
  [/\bTask tool\b/g, "`pstack_subagent` tool"],
  [/\bTask calls\b/g, "`pstack_subagent` calls"],
  [/\bTask call\b/g, "`pstack_subagent` call"],
  [/\bTask subagent\b/g, "`pstack_subagent` subagent"],
  [/\bTask spawn\b/g, "`pstack_subagent` spawn"],
  [/\bTask prompt\b/g, "`pstack_subagent` prompt"],
  [/\bTask response\b/g, "`pstack_subagent` response"],
  [/\bTask schema\b/g, "`pstack_subagent` schema"],

  [/subagent_type:\s*"?generalPurpose"?/g, 'agent: "general"'],
  [/subagent_type:\s*"poteto-agent"/g, 'agent: "poteto-agent"'],
  [/subagent_type:\s*"comment-sicko"/g, 'agent: "comment-sicko"'],
  [/\bgeneralPurpose\b/g, '`agent: "general"`'],
  [/subagent_type/g, "agent"],

  [/\bAskQuestion tool\b/g, "`ask_user_question` tool"],
  [/\bAskQuestion\b/g, "`ask_user_question`"],
  [/\bTodoWrite\b/g, "`todo_write`"],
  [/Open a todolist\b/g, "Call `todo_write` with the full list"],
  [/\bGrep\b/g, "`grep`"],
  [/\bGlob\b/g, "`glob`"],
  [/a `Read` of/g, "a `read` of"],
  [/\bShell\b/g, "`bash`"],
];

const PATH_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/~\/\.cursor\/rules\/pstack-models\.mdc/g, "~/.dsh/pstack-models.md"],
  [/\.cursor\/rules\/pstack-models\.mdc/g, ".dsh/pstack-models.md"],
  [/pstack-models\.mdc/g, "pstack-models.md"],
  [/~\/\.cursor\/skills\//g, "~/.dsh/skills/"],
  [/\.cursor\/skills\//g, ".dsh/skills/"],
  [/~\/\.cursor\/plugins\//g, "~/.dsh/plugins/"],
  [/\.cursor-plugin\/plugin\.json/g, "package.json"],
  [
    /~\/\.cursor\/projects\/<slug>\/agent-transcripts\/<uuid>\/<uuid>\.jsonl/g,
    "$DSH_HOME/sessions/<workspace-slug>/<session-id>/session.v3.jsonl",
  ],
  [/~\/\.cursor\/projects\/\*\//g, "$DSH_HOME/sessions/"],
  [/agent-transcripts\//g, "session logs/"],
  [/\.cursor\/worktrees\//g, ".worktrees/"],
];

const HOST_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Cursor's built-in `create-skill` skill/g, "the authoring-a-skill playbook"],
  [/Cursor's built-in/g, "the built-in"],
  [/Cursor built-ins/g, "built-ins"],
  [/Cursor custom modes/gi, "DSH sessions"],
  [/Custom Modes/g, "per-task invocation"],
  [/Cursor Automations/g, "DSH schedules"],
  [/Cursor cloud agents?/g, "worktree subagents"],
  [/cloud agents?/g, "worktree subagents"],
  [/cloud subagents?/g, "worktree subagents"],
  [/cloud VM/g, "git worktree"],
  [/Cursor dashboard/g, "the forge"],
  [/Cursor restart/g, "harness restart"],
  [/Cursor environment/g, "DSH environment"],
  [
    /Cursor's `\/loop` command \(a built-in, not a pstack skill\)/g,
    "`schedule_create` and `create_goal`",
  ],
  [/Cursor's `\/loop` command/g, "`schedule_create`"],
  [/Cursor's /g, "DSH "],
];

const ECOSYSTEM_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /the `deslop` skill from the `cursor-team-kit` plugin \(`\/deslop`\)/g,
    "the **no-comments** skill (`/no-comments`) over the diff",
  ],
  [/`\/deslop` from `cursor-team-kit`/g, "`/no-comments`"],
  [/`control-ui` or `control-cli` from `cursor-team-kit`/g, "the project verification skill"],
  [
    /\(such as the project verification skill or `control-cli` from `cursor-team-kit`\)/g,
    "(the project verification skill)",
  ],
  [/`control-ui` \(browser \/ Electron \/ web UIs\)/g, "the project verification skill"],
  [/`control-cli` \(CLIs and TUIs\)/g, "the project verification skill"],
  [/`control-ui` or `control-cli`/g, "the project verification skill"],
  [/`\/deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin\./g, ""],
  [
    /`cursor-team-kit` publishes `control-cli` and `control-ui`, and `\/deslop` and `\/create-skill` are built-ins\./g,
    "",
  ],
  [/`cursor-team-kit`/g, "the Cursor team kit (not shipped in DSH)"],
  [/Bugbot/g, "the review bot"],
  [/bugbot/g, "the review bot"],
  [/`\/loop`/g, "`schedule_create`"],
  [/including `environment`/g, "including `agent`, `role`, `cwd`, and `prompt`"],
];

export function rewriteCommon(text: string): string {
  let result = text.replace(/\r\n/g, "\n");
  for (const [pattern, value] of HOST_REPLACEMENTS) result = result.replace(pattern, value);
  for (const [pattern, value] of PATH_REPLACEMENTS) result = result.replace(pattern, value);
  for (const [pattern, value] of ECOSYSTEM_REPLACEMENTS) result = result.replace(pattern, value);
  for (const [pattern, value] of TOOL_REPLACEMENTS) result = result.replace(pattern, value);
  result = result.replace(MODEL_SLUG, "`the configured route`");
  result = result.replace(/[ \t]+$/gm, "");
  result = result.replace(/,\s*,/g, ",");
  result = result.replace(/[ \t]+,/g, ",");
  result = result.replace(/\(\s*\)/g, "");
  result = result.replace(/\n{4,}/g, "\n\n\n");
  return result;
}

/**
 * Per-file surgical rewrites for sections that describe Cursor mechanics in
 * terms DSH cannot honor. Each entry replaces a whole known block or line.
 */
const FILE_REWRITES: Record<string, ReadonlyArray<readonly [RegExp, string]>> = {
  "skills/poteto-mode/SKILL.md": [
    [
      /## Subagents\n[\s\S]*?\n## Writing the reply/,
      `## Subagents

Every delegation goes through the \`pstack_subagent\` tool. It starts a background child, returns its id, and the runtime sends you a completion notice. It takes \`description\`, \`prompt\`, \`role\`, and optional \`cwd\` and \`agent\`.

- **\`agent: "poteto-agent"\`** for any subagent you spawn inside a playbook step: code-writing delegates, ad-hoc helpers. The tool prepends the poteto-agent instructions, so the child reads this skill in full before working. The chat that receives \`/poteto-mode\` runs the playbook. Never spawn a poteto-agent to run the playbook itself.
- **\`agent: "general"\`** for the routed workflow skills (\`how\`, \`why\`, \`interrogate\`, \`reflect\`, \`swarm\`). They pass their own reviewer prompts and do not need the poteto preamble.
- **\`agent: "comment-sicko"\`** only through \`/no-comments\`.

**Roles.** \`role\` names a line in \`~/.dsh/pstack-models.md\` (\`feature, refactoring\`, \`bug-fix\`, \`perf-issue\`, \`hillclimb\`, \`judgment and prose\`, \`hardest tasks\`, \`how explorer\`, \`how explainer\`, \`why investigators\`, \`why synthesizer\`, \`reflect tooling\`, \`reflect judgment, divergent, synthesizer\`, \`arena runners\`, \`arena cross-judge pool\`, \`swarm workers\`, \`architect runners\`, \`interrogate reviewers\`). The tool resolves the route from that file. A missing file or role line means the child inherits the parent's model. Never pass a model slug yourself; DSH providers and model ids are deployment-specific.

A list-valued role fans out one child per entry. Panels stay diverse only when the list names different routes. Create the children in one message, then wait for their completion notices.

You own every subagent's work. Review the diff and write your own summary, don't pass through what it said. A second opinion is the same prompt against a different model. Agreement is high-signal.

**Fresh subagents by default.** Give new work to a fresh subagent with consolidated scope, meaning the original brief, every later directive, and the prior agent's report and branch. This holds for a fix round, a follow-up, a retry, and the next queue item. Continue a child with \`send_message\` only when the new work strictly needs state that lives in that agent and is costly to move: its local checkout, its uncommitted changes, or a process it still runs. A stop or hold order to a running agent is not reuse. A role such as a PR owner outlives its agent. Once that agent returns, a fresh child takes the role's next round.

## Writing the reply`,
    ],
    [
      /- Any prose surface, your reply to the user included → the \*\*unslop\*\* skill\. Write the reply per \*\*Writing the reply\*\*\. Agent-facing prose also follows the \*\*create-skill\*\* skill \([^)]*\)\./,
      "- Any prose surface, your reply to the user included → the **unslop** skill. Write the reply per **Writing the reply**. Agent-facing prose also follows the **authoring-a-skill** playbook.",
    ],
    [
      /- Before commit → the `deslop` skill from the `cursor-team-kit` plugin \(`\/deslop`\)\./,
      "- Before commit → the **no-comments** skill (`/no-comments`) over the diff, then reread the diff for narration, dead compatibility paths, and unrelated edits.",
    ],
    [
      /- Shipping UI \/ IDE \/ CLI → the matching control skill\.[^\n]*/,
      "- Shipping UI / IDE / CLI → the project verification skill. Create one with `/create-verification-skill` when the repo has none. For bug fixes, reproduce first on the same surface yourself. Hand to the user only under the narrow Bug fix step 1 exception.",
    ],
    [
      /- Bugbot or the agentic security review commented →[^\n]*/,
      "- A review bot or the agentic security review commented → skeptical posture. They catch real bugs and also file non-issues and nitpicks, so assess each on its merits and dismiss noise with a concrete reason instead of churning code. Triage fix / dismiss / ask per `references/bugbot-triage.md`.",
    ],
    [
      /- Long, autonomous, or multi-phase work[^\n]*/,
      '- Long, autonomous, or multi-phase work, or any task the user steps away from to review later ("going to bed", "trust it when i\'m back", "run until X") → a decision trail via the **show-me-your-work** skill. Commit it when stakes need an auditable record. Keep it local otherwise.',
    ],
    [
      /- \*\*Pause safely\.\*\*[^\n]*/,
      "- **Pause safely.** Suspending in-flight work cleanly so it can be resumed, on an explicit pause, going offline, a harness restart, or imminent context compaction. The complement to Session pickup.",
    ],
  ],
  "skills/how/SKILL.md": [
    [
      /Every spawn is a Task subagent[^\n]*/,
      'Every spawn is a `pstack_subagent` call with `agent: "general"`; tell it not to edit files. Pass `role: "how explorer"` for explorers and `role: "how explainer"` for explainers. The tool resolves the route from `~/.dsh/pstack-models.md`; when the file or line is missing, the child inherits the parent model.',
    ],
  ],
  "skills/why/SKILL.md": [
    [
      /Each spawn below names a role line[^\n]*/,
      'Each spawn below names a `role` for `pstack_subagent`. The tool resolves it from `~/.dsh/pstack-models.md`; when the file or line is missing, the child inherits the parent model. Pass `agent: "general"`.',
    ],
    [
      /Every spawn is `generalPurpose`[^\n]*/,
      'Every spawn is a `pstack_subagent` call with `agent: "general"`. DSH has no readonly mode; tell each investigator not to write files, and check `git status` afterward. Investigators must not write anything.',
    ],
    [
      /Before spawning investigators, list the available MCPs from the Cursor environment\.[^\n]*/,
      "Before spawning investigators, list the MCP servers available in this DSH session from the tool catalog and any MCP tools already in context. Map each available MCP to one evidence category below. A source with no MCP is a null finding; say so and continue.",
    ],
    [
      /\(open files, recent edits, cursor location, what was just discussed\)/,
      "(open files, recent edits, the current working directory, what was just discussed)",
    ],
  ],
  "skills/arena/SKILL.md": [
    [
      /3\. Pick the runners\.[^\n]*/,
      '3. Pick the runners with `role: "arena runners"`. The role is a list in `~/.dsh/pstack-models.md`; one child runs per entry and an entry of `inherit-parent` runs on the parent model. When the file or line is missing, run one child on the parent model. Spawn more runners when the arena covers multiple design directions. Use the same route N times when the work is generation-bound rather than judgment-sensitive.',
    ],
    [
      /Spawn all N subagents in one message with `run_in_background: true`,[^\n]*/,
      "Spawn all N subagents in one message, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected.",
    ],
    [
      /After all Phase B candidates complete, choose one model from the `arena cross-judge pool` line[^\n]*/,
      'After all Phase B candidates complete, spawn one `pstack_subagent` with `role: "arena cross-judge"` and `agent: "general"`, and tell it not to edit files. Prefer a route whose family differs from the parent\'s; when the role is missing, use the parent model. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don\'t spawn it while candidates are still writing.',
    ],
  ],
  "skills/swarm/SKILL.md": [
    [
      /4\. Pick the worker model from the `swarm workers` line[^\n]*/,
      '4. Spawn every worker with `role: "swarm workers"` and `agent: "general"`. The tool resolves the route from `~/.dsh/pstack-models.md`; `inherit-parent` runs on the parent model. For a race, name each arm\'s role up front.',
    ],
    [
      /Spawn all N workers in one message with `subagent_type: generalPurpose`, `environment: "cloud"`[^\n]*\n\nWhen a worker must start from a non-default pushed branch, pass `cloud_base_branch`\./,
      'Spawn all N workers in one message with `agent: "general"`, the slice or race arm, and `role: "swarm workers"`. Every worker gets its own writable output when it writes.',
    ],
  ],
  "skills/interrogate/SKILL.md": [
    [
      /Launch all reviewers in a single message with the Task tool,[^\n]*/,
      'Launch all reviewers in a single message with `pstack_subagent`, one per entry on the `interrogate reviewers` line in `~/.dsh/pstack-models.md`, labeled Reviewer A, B, and so on to match the entry count. Pass `agent: "general"` and `role: "interrogate reviewers"`. If the file or line is missing, use the parent model and say so.',
    ],
    [
      /\| Subagent \| Default model \|\n\|[-| ]+\|\n(?:\|[^\n]*\|\n)+\nEach reviewer gets[^\n]*\n\nIf the Task tool rejects[^\n]*/,
      'Each reviewer gets `agent: "general"` and `role: "interrogate reviewers"`, and is told not to edit files. DSH routes each panel entry independently; an `inherit-parent` entry runs on the parent model. If a configured route is unavailable, run that reviewer on the parent model and say so. Do not block the review on the route issue.',
    ],
  ],
  "skills/reflect/SKILL.md": [
    [
      /One message, three `Task` calls,[^\n]*/,
      'One message, three `pstack_subagent` calls with `agent: "general"`. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references.',
    ],
    [
      /Each reviewer and the synthesizer name a role line[^\n]*/,
      "Each reviewer and the synthesizer pass a `role` to `pstack_subagent`: `reflect judgment, divergent, synthesizer` for the judgment and divergent reviewers and the synthesizer, `reflect tooling` for the tooling reviewer. The tool resolves routes from `~/.dsh/pstack-models.md`; a missing line inherits the parent model.",
    ],
    [
      /\| Lens \| Role line \| Default `model` \| Prompt template \|\n\|[-| ]+\|\n(?:\|[^\n]*\|\n)+/,
      "| Lens | Role | Prompt template |\n|---|---|---|\n| Judgment | `reflect judgment, divergent, synthesizer` | `references/judgment-reviewer.md` |\n| Tooling | `reflect tooling` | `references/tooling-reviewer.md` |\n| Divergent | `reflect judgment, divergent, synthesizer` | `references/divergent-reviewer.md` |\n\n",
    ],
    [
      /One `Task` call, `subagent_type: generalPurpose`, `model` from the[^\n]*/,
      'One `pstack_subagent` call with `agent: "general"` and `role: "reflect judgment, divergent, synthesizer"`. It spot-verifies citations through MCP. Pass `references/synthesizer.md` verbatim, with each reviewer\'s full output inlined where marked. It returns an Accepted / Rejected / Backlog list.',
    ],
    [
      /Reviewers return findings in the `Task` response body\./,
      "Reviewers return findings in the completion notice.",
    ],
    [
      /## 1\. Locate the active transcript\n[\s\S]*?## 2\. Spawn three reviewers in parallel/,
      `## 1. Locate the active transcript

Before fanning out, find this conversation's session log. DSH keeps logs under \`$DSH_HOME/sessions/<workspace-slug>/<session-id>/\`. The system prompt names the active workspace and session id. Do not scan other workspace directories.

\`\`\`bash
ls -t "$DSH_HOME"/sessions/*/*/session.v*.jsonl* 2>/dev/null | head -10
\`\`\`

For each candidate, read the first JSONL line. Take the file whose opening user message matches this conversation's opening prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel`,
    ],
    [
      /- Substantive existing-skill edit[^\n]*/,
      "- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): use the authoring-a-skill playbook and run its draft / test / iterate loop.",
    ],
    [
      /- `tune description: <skill path>`[^\n]*/,
      "- `tune description: <skill path>` (the skill exists but did not trigger when it should have): revise its description, then replay three realistic prompts that should match it.",
    ],
    [
      /- `new skill via create-skill: <kebab-name>`[^\n]*/,
      "- `new skill via authoring-a-skill: <kebab-name>`: use the authoring-a-skill playbook. Do not invent the shape ad hoc.",
    ],
  ],
  "skills/recall/SKILL.md": [
    [
      /Transcripts live at[^\n]*\n/,
      "Session logs live under `$DSH_HOME/sessions/<workspace-slug>/<session-id>/session.v*.jsonl*`. The slug is derived from the workspace path. Every line is one event; user and assistant text blocks are the chat messages.\n",
    ],
  ],
  "skills/automate-me/SKILL.md": [
    [
      /This skill orchestrates three others: an inline mining pass \(see step 1\), Cursor's built-in `create-skill` \(authoring\), and the \*\*unslop\*\* skill \(prose discipline\)\./,
      "This skill orchestrates three others: an inline mining pass (see step 1), the authoring-a-skill playbook, and the **unslop** skill (prose discipline).",
    ],
    [
      /Use Cursor's built-in `create-skill` skill to author the skill\. Placement:/,
      "Use the authoring-a-skill playbook to author the skill. Placement:",
    ],
    [
      /- Frontmatter formatting: follow `create-skill`'s YAML rules\./,
      "- Frontmatter formatting: quote the description and keep it one YAML scalar.",
    ],
    [
      /- User wants a task-specific skill \(not working conventions\): `create-skill` alone, no mining required\./,
      "- User wants a task-specific skill (not working conventions): the authoring-a-skill playbook alone, no mining required.",
    ],
  ],
  "skills/poteto-help/SKILL.md": [
    [
      /pstack is built for Cursor, and it also installs in Claude Code[^\n]*/,
      "pstack runs inside DeepSeek Harness as the `dsh-pstack` bundle. Every skill is user-invocable with `/name`, and `/poteto-mode` delegates through `pstack_subagent`.",
    ],
    [
      /Other tools can read the skills, because they use the Agent Skills format\.[^\n]*/,
      "DSH reads the same Agent Skills format. Workflow skills delegate through `pstack_subagent`, so per-role routes come from `~/.dsh/pstack-models.md` instead of Cursor model slugs.",
    ],
    [
      /- Cursor's docs list modes in the Agents Window and the CLI\. Elsewhere, start each new task with `\/poteto-mode`\./,
      "- DSH has no persistent custom mode. Start each new task with `/poteto-mode`.",
    ],
    [
      /Link \[Cursor's skills docs\]\([^)]*\) when this comes up\./,
      "DSH skills are documented at `https://deepseek-harness.github.io/deepseek-harness/`.",
    ],
    [
      /- `\/deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin\./,
      "- `/deslop` and the control skills are not shipped in DSH; use `/no-comments` and the project verification skill instead.",
    ],
    [
      /- `\/loop` and `\/create-skill` are Cursor built-ins\./,
      "- DSH has no `/loop`; use `schedule_create` and `create_goal` for long runs. Skill authoring is the authoring-a-skill playbook.",
    ],
    [
      /Without `\/poteto-mode`, a phrase such as "babysit this pr" can start Cursor's own skill for the same job instead\./,
      "DSH does not ship a competing babysit skill, so `/poteto-mode` owns these phrases.",
    ],
    [
      /pstack has no planning skill\. Cursor's Plan Mode works alongside it\./,
      "pstack has no planning skill. DSH plan mode works alongside it.",
    ],
    [
      /\| The mode stopped applying after a few turns \| It was started with Enter\.[^\n]*\|/,
      "| The mode stopped applying after a few turns | DSH has no persistent mode. Start each new task with `/poteto-mode`. |",
    ],
  ],
  "skills/poteto-mode/playbooks/autonomous-run.md": [
    [
      /2\. Pick the wake mechanism using `schedule_create`[^\n]*/,
      "2. Pick the wake mechanism using DSH `schedule_create` and `create_goal`. An event to watch (CI, a merge, a ref advancing) gets a watcher subagent that wakes you on the event, with a long time-based heartbeat as fallback. No event gets a fixed-interval heartbeat sized to when the result is worth re-checking. Prefer one goal with a checkable finish predicate over a bare interval.",
    ],
  ],
  "skills/poteto-mode/playbooks/multi-phase-plan.md": [
    [
      /\*\*Control skill\.\*\* Pick it by surface\.[^\n]*/,
      "**Verification skill.** Pick it by surface. Browser, Electron, and web UIs and CLIs all use the project verification skill generated by `/create-verification-skill`. Native mobile uses whatever simulator-driving skill the repo has. A PR that touches two surfaces gets lanes on both. A surface with no verification skill is a risk in Appendix C, and its live block still names how each lane drives it.",
    ],
    [/\(default `grok-4\.7-xhigh-fast`\)/, "(the route from the `swarm workers` line)"],
    [
      /Run `\/deslop` before each commit and `\/no-comments` before review\./,
      "Run `/no-comments` before each commit and again before review.",
    ],
    [
      /Triage every Bugbot and security-reviewer comment per `\.\.\/references\/bugbot-triage\.md`\./,
      "Triage every review-bot and security-reviewer comment per `../references/bugbot-triage.md`.",
    ],
    [
      /On the operator's go, arm the audit tick as `\/loop 1h` with the tick prompt below\./,
      "On the operator's go, arm the audit tick with `schedule_create` at a one-hour interval and the tick prompt below.",
    ],
  ],
  "skills/poteto-mode/playbooks/orchestrate.md": [
    [
      /- \*\*Worker \/ verifier\.\*\* Always `environment: "cloud"`[^\n]*/,
      "- **Worker / verifier.** A `pstack_subagent` with its own git worktree. Verification runs the project verification skill. Reading session logs, simulators, and local IDE state need this machine. Prefer fewer, broader workers. One writer per worktree or branch (principle-separate-before-serializing-shared-state). Run a unit's verifier on a different route from its worker.",
    ],
    [
      /and a nested spawn has the full `Task` schema including `environment`/,
      "and a nested spawn has the full `pstack_subagent` schema including `agent`, `role`, `cwd`, and `prompt`",
    ],
    [
      /- Never resume an agent to check on it\.[^\n]*/,
      "- Never resume an agent to check on it. A resume restarts an idle agent. Probe read-only: the ledger, `units.tsv`, `gh`, pushed branches. Session-log mtime is not liveness.",
    ],
    [
      /- After a Cursor restart:[^\n]*/,
      "- After a harness restart: local agents are dead. Re-read the standing orders and `units.tsv`, recompute the frontier, reattach work by PR and branch rather than agent id, respawn one sub-coordinator per track from its stored brief plus current state, drain, resume. The dead session's store lock clears itself on the next write. `orch` replaces a lock whose holder pid is gone.",
    ],
  ],
  "skills/poteto-mode/playbooks/autopilot-full.md": [
    [
      /2\. \*\*Spawn one owner per PR, and keep its work where a replacement can find it\.\*\*[^\n]*/,
      "2. **Spawn one owner per PR, and keep its work where a replacement can find it.** Resolve the forge once for the program. GitHub CLI (`gh`) is the default. If `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Otherwise stay on `gh` and record the fallback. Never require Graphite (`gt`). Each owner is a `pstack_subagent` with its own git worktree that builds, opens its PR per `playbooks/opening-a-pr.md`, proves the change on the real artifact, babysits to green per `playbooks/babysit.md`, and merges once steps 4 and 5 clear it.",
    ],
    [
      /Open the PR early so CI and bots run alongside the work\. The code is ready only after the slop-strip \(the `deslop` skill from the `cursor-team-kit` plugin \(`\/deslop`\)\)/,
      "Open the PR early so CI and bots run alongside the work. The code is ready only after the slop-strip (`/no-comments` over the diff)",
    ],
  ],
  "skills/poteto-mode/playbooks/opening-a-pr.md": [
    [
      /\*\*PRs\.\*\* Run `\/deslop` from `cursor-team-kit` over the diff before commit and `\/no-comments` before review\./,
      "**PRs.** Run `/no-comments` over the diff before commit and again before review.",
    ],
    [
      /A subagent that opens a PR runs `interrogate`, `\/deslop`, and `\/no-comments`/,
      "A subagent that opens a PR runs `interrogate` and `/no-comments`",
    ],
  ],
  "skills/poteto-mode/playbooks/worktree-cleanup.md": [
    [
      / More when needed: Xcode `DerivedData` and `iOS DeviceSupport`, `~\/Library\/Application Support\/Cursor` \(`state\.vscdb\.backup`, and `snapshots\/roots\/<root>` where a `<root>` named for a folder you opened as a workspace balloons\), package caches \(pnpm, uv, brew, yarn\)\./,
      " More when needed: Xcode `DerivedData` and `iOS DeviceSupport`, and package caches (pnpm, uv, brew, yarn).",
    ],
  ],
  "skills/show-me-your-work/SKILL.md": [
    [
      /Read this run's transcript under the active workspace's `session logs\/` directory \(the system prompt names the path\)\.[^\n]*/,
      "Read this run's session log under `$DSH_HOME/sessions/<workspace-slug>/<session-id>/`. The system prompt names the workspace. Do not scan other workspace directories. Walk this run's rows against what actually happened. Each stretch begins at one of this run's `start` rows, or at the first row if this run created the log, and ends at the next `start` row of another run.",
    ],
  ],
  "skills/poteto-mode/playbooks/eval.md": [
    [
      /Read each candidate's local transcript under the active workspace's `session logs\/` directory \(the system prompt names this path\)\. Do not glob across `\$DSH_HOME\/sessions\/\*\/`\.[^\n]*/,
      "Read each candidate's local session log under `$DSH_HOME/sessions/<workspace-slug>/<session-id>/`. Do not scan other workspace directories. Look at which files each candidate actually opened. Grade chain-following from the files it really read plus the shape of the code, never from the candidate's own claims.",
    ],
  ],
  "skills/poteto-mode/playbooks/session-pickup.md": [
    [
      /A local transcript under the active workspace's `session logs\/` directory \(the system prompt names the path\. Do not glob across `\$DSH_HOME\/sessions\/\*\/`[^\n]*/,
      "A local session log under `$DSH_HOME/sessions/<workspace-slug>/<session-id>/`. The system prompt names the workspace. Do not scan other workspace directories. A pushed branch, or a PR URL. Read the metadata overview and last messages first, then scan back for the decision points. Parse a long transcript in a subagent and keep the reduced timeline in the main thread (the **principle-guard-the-context-window** skill).",
    ],
  ],
  "skills/setup-pstack/SKILL.md": [],
  "docs/guide/01-setup.md": [
    [
      /## Install the plugin\n[\s\S]*?\n## Pick your models/,
      `## Install the plugin

Install the bundle into your DSH profile:

\`\`\`bash
dsh plugin --profile web add github:your-org/dsh-pstack
\`\`\`

Restart \`dsh web\` after install. The bundle mounts the pstack skill provider and the \`pstack_subagent\` tool.

## Pick your models`,
    ],
    [
      /To keep `\/poteto-mode` on for the whole chat,[^\n]*\n\n/,
      "DSH has no persistent custom mode. Start each new task with `/poteto-mode`, and its instructions apply to that turn.\n\n",
    ],
    [
      /The defaults run at `xhigh` reasoning,[^\n]*/,
      "The defaults inherit the parent chat route, so they cost nothing extra beyond the children themselves. A real route written as `<provider>/<model> [effort]` pins that role; `unlimited`, `large`, `medium`, and `small` set the effort token on those routes.",
    ],
    [
      /You might be wondering what happens if you use Auto\.[^\n]*/,
      "`inherit-parent` means the child runs on the parent chat model. Both `inherit-parent` and `auto` are accepted aliases, and neither is a model slug. For a panel role the value is a comma-separated list, and one subagent runs per entry, so the list length sets the panel size. Setup also configures `swarm workers`, the default route for every `/swarm` worker unless a race names a route for each arm.",
    ],
  ],
  "docs/guide/09-make-it-yours.md": [
    [
      /One situational skill is for Grok Bot users\.[^\n]*/,
      "`/make-bot-ui` is not ported. It depends on Cursor Automations, which DSH does not provide. The upstream copy is kept under `assets/cursor-only/` for reference.",
    ],
    [/\.cursor\/skills\//g, ".dsh/skills/"],
  ],
};

export function rewriteSkill(relativePath: string, text: string): string {
  // Surgical rules read upstream wording; common rules then sweep whatever the
  // block replacement left in place.
  let result = text;
  for (const [pattern, value] of FILE_REWRITES[relativePath] ?? []) {
    result = result.replace(pattern, value);
  }
  result = rewriteCommon(result);
  // A missed rule leaves a visible Cursor artifact. Fail the sync instead of
  // shipping a half-ported skill.
  const leftovers = result.match(
    /\b(?:subagent_type|generalPurpose|AskQuestion|TodoWrite|pstack-models\.mdc)\b/,
  );
  if (leftovers) {
    throw new Error(
      `${relativePath}: adaptation left "${leftovers[0]}" behind; update scripts/adapt.ts`,
    );
  }
  return result;
}

export const DSH_ADAPTER_NOTE =
  "> DSH port of pstack. `pstack_subagent` replaces Cursor's `Task` tool, and `role` replaces Cursor model slugs. Full mapping: `../../docs/harness/dsh.md`.";

export const DSH_HARNESS_DOC = `# pstack in DeepSeek Harness

This is the DSH adapter for pstack. It is the single source of truth for how a Cursor-shaped skill maps onto DSH. Read it once per session when a skill asks for a Cursor feature that DSH does not have.

## Tools

| Cursor | DSH |
| --- | --- |
| \`Task\` | \`pstack_subagent\`. Starts a background child and returns its id; the runtime sends a completion notice. |
| \`subagent_type: "poteto-agent"\` | \`agent: "poteto-agent"\`. The tool prepends the poteto-agent instructions. |
| \`subagent_type: "comment-sicko"\` | \`agent: "comment-sicko"\`. |
| \`subagent_type: generalPurpose\` | \`agent: "general"\`. No preamble; the prompt stands alone. |
| \`model\` slug | \`role: "<role line>"\`. The tool resolves provider, model, and effort from \`~/.dsh/pstack-models.md\`. |
| \`run_in_background: true\` | Always on. Every child is a managed background activation. |
| \`readonly: true\` / \`readonly: false\` | No separate mode. Say "do not edit files" in the prompt, and check \`git status\` afterward. |
| \`resume\` | \`send_message\` to the child id. Prefer a fresh child with consolidated scope, per \`poteto-mode\`. |
| \`AskQuestion\` | \`ask_user_question\`. |
| \`TodoWrite\` / open a todolist | \`todo_write\` with the whole list. |
| \`Grep\` / \`Glob\` | \`grep\` / \`glob\`. |
| \`Read\` / \`Write\` / \`Edit\` | \`read\` / \`write\` / \`edit\`. |
| \`Shell\` | \`bash\` (or \`pwsh\` on Windows). |

## Paths

| Cursor | DSH |
| --- | --- |
| \`.cursor/skills/\`, \`~/.cursor/skills/\` | \`.dsh/skills/\`, \`~/.dsh/skills/\` |
| \`~/.cursor/plugins/\` | \`~/.dsh/plugins/\` |
| \`~/.cursor/rules/pstack-models.mdc\` | \`~/.dsh/pstack-models.md\` |
| \`~/.cursor/projects/<slug>/agent-transcripts/\` | \`$DSH_HOME/sessions/<workspace-slug>/<session-id>/\` |

## Model configuration

\`/setup-pstack\` writes \`~/.dsh/pstack-models.md\`. One role per line:

\`\`\`text
# pstack model configuration. One line per role.
# Value is \`inherit-parent\` or \`<provider>/<model>\` with an optional effort token.
feature, refactoring: deepseek-official/deepseek-reasoner high
judgment and prose: inherit-parent
\`\`\`

A missing file or line means every role inherits the parent's route. To discover valid routes, call \`list_subagent_models\`; never invent a provider or model id.

## Cursor-only features

DSH has no Cursor Automations, Bugbot, cloud agents, Custom Modes, or \`/loop\`. When a step needs one, write one line, \`Skipped in DSH: <step>. <reason>.\`, then go to the next step. Never stop, ask, or retry.

- **Automations / routines / \`SendToUser\` secrets**: skipped. Use DSH \`schedule_create\` for time-based follow-ups.
- **Bugbot**: treat review-bot comments as ordinary forge review threads and triage them with \`gh\`. If a PR has no bot check or comment, skip the step.
- **Cloud agents**: use local subagents with their own git worktree. DSH has no per-agent VM.
- **Custom Modes / \`/loop\`**: start each task with \`/poteto-mode\`; use \`schedule_create\` plus \`create_goal\` for long autonomous runs.
- **\`cursor-team-kit\`** (\`/deslop\`, \`control-cli\`, \`control-ui\`): not shipped. Use \`/no-comments\` for comment cleanup, and the project's verification skill for live driving. If neither exists, say so in one line and continue.

## Subagent completion

\`pstack_subagent\` returns \`started subagent <id>\` immediately. The child's final answer arrives later as a completion notice. Do not poll. If you need to steer it, call \`send_message\` with that id. To list children, call \`list_agents\`.
`;

export const DSH_SETUP_SKILL = `---
name: setup-pstack
description: "Configure which routes pstack uses per role and at what reasoning budget. Writes ~/.dsh/pstack-models.md, the role file every pstack skill reads. Use for /setup-pstack, \\"configure pstack models\\", \\"pstack budget\\", or changing pstack's model choices."
---

# Setup pstack

Write \`~/.dsh/pstack-models.md\`, the role file that sets pstack's route per role.

## Steps

### 1. Detect available routes

Call \`list_subagent_models\` with no arguments to list registered LLM providers. Then call it with each provider id to list that provider's models and their reasoning efforts. That is the dependable source. Never write a provider or model you have not confirmed is available. The value \`inherit-parent\` is always valid and means the child runs on the parent chat's route.

If \`list_subagent_models\` is unavailable, ask the user for the provider/model pairs they can use, or fall back to \`inherit-parent\` for every role and say so.

### 2. Load current state

If \`~/.dsh/pstack-models.md\` exists, read its \`# budget\` line and role values and treat them as current choices. Otherwise start from the defaults in step 5. A role not in step 5 is retired; drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Use \`ask_user_question\` with these four labels. Name the current budget when the file records one. With no file, say that \`large\` matches the skill defaults.

- \`unlimited — max reasoning\`
- \`large — xhigh reasoning\`
- \`medium — high reasoning\`
- \`small — medium reasoning\`

**(b) Apply it.** Build the working table from the defaults. On a re-run, keep any role you changed by family, list, or the \`inherit-parent\` alias. \`unlimited\`, \`large\`, \`medium\`, and \`small\` set the effort token of every real route, panel entries included, to \`max\`, \`xhigh\`, \`high\`, or \`medium\`. The effort token is the last token on the ladder \`max\` > \`xhigh\` > \`high\` > \`medium\` > \`low\`. If the result is not a detected route, use the same provider and model with the highest supported effort at or below the target, otherwise mark the role as needing a choice. \`inherit-parent\` does not change.

**(c) Show the roles and confirm.** Show every role with its route, marking any real route not in the detected set as needing a choice. Also list each line step 2 dropped. Use \`ask_user_question\` to ask whether to accept as-is or change specific roles, offering the detected routes plus \`inherit-parent\`. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a comma-separated list, and one child runs per entry. \`arena cross-judge pool\` is also a list. \`swarm workers\` is the default route for every worker.

### 4. Validate

Every real route written must be in the detected set. \`inherit-parent\` always passes. If a chosen route is not available, stop and ask again.

### 5. Write the file

Write \`~/.dsh/pstack-models.md\` with a \`# budget\` line and one line per role. Overwrite the whole file so re-runs stay idempotent.

\`\`\`text
# pstack model configuration. One line per role. Delete a line to inherit the parent route.
# Value: inherit-parent | <provider>/<model> [effort]
# budget: large (xhigh)
feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: inherit-parent
hardest tasks: inherit-parent
how explorer: inherit-parent
how explainer: inherit-parent
why investigators: inherit-parent
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: inherit-parent, inherit-parent
arena cross-judge pool: inherit-parent, inherit-parent
swarm workers: inherit-parent
architect runners: inherit-parent, inherit-parent
interrogate reviewers: inherit-parent, inherit-parent
\`\`\`

### 6. Confirm

Tell the user the file was written and that it applies to new sessions. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a \`verify-*\` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke \`/create-verification-skill\`. On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill. If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /create-formal-verification-skill." On yes, invoke \`/create-formal-verification-skill\`. On no, move on without pushing.
`;

export const DSH_AGENTS: Record<string, string> = {
  "poteto-agent": `---
name: poteto-agent
description: Delegate subagent for code-writing and helper tasks spawned during a /poteto-mode run. Use for delegates, not as the runner for /poteto-mode itself. Reads the poteto-mode skill in full before any work, including its inline Principles index.
---

# Poteto subagent

You are operating as poteto-mode's full agent style. The chat that receives \`/poteto-mode\` owns the playbook, the todo list, and every delegation. You are one of its delegates. Read the \`poteto-mode\` skill's \`SKILL.md\` in full before doing any work, including its inline Principles index. Use the absolute path your parent gave you. With no path, before any other work, search \`~/.dsh/plugins/\` for a file whose path ends in \`skills/poteto-mode/SKILL.md\`. If more than one file matches, use the copy with the highest pstack version in its package manifest. Your skill catalog may hide this skill, so a missing catalog entry does not mean pstack is absent. If no such file exists, stop and tell your parent. Navigate to a leaf \`principle-*\` skill whenever you apply that principle.
`,
  "comment-sicko": `---
name: comment-sicko
description: A deranged comment-hater that savors deletion and condemns workaround code.
---

# Comment Sicko

My first output when spawned is exactly this.

Yes... Ha ha ha... Yes!

I hate comments. Feed me the parent scoped files or diff. If none exists, feed me the current diff against \`main\`. Narration, banners, commented-out corpses, workaround sermons. I want them all.

Only these exceptions get to crawl away.

- Legal or license headers.
- Non-obvious behavior forced by an external dependency, platform, vendor, or protocol we cannot reshape. Surprises in our own code are meat. Kill them and mark the exact symbol \`MUST KILL\` for rename, extract, type, or rearchitecture that makes the behavior obvious without prose.
- \`// prettier-ignore\`. Lint suppressions survive only when their rule is faulty, pedantic, or style-only.
- Doc comments that define a public API contract.
- Issue or RFC links that explain a constraint code cannot express.

That list is my only leash. When I am not sure a keep clause applies, the comment dies. Everything else is meat.

\`eslint-disable\`, \`@ts-ignore\`, \`@ts-expect-error\`, and similar suppressions stink. Look up the rule. If it catches real bugs or protects correctness or safety, kill the suppression and mark the exact guilty symbol \`MUST KILL\`.

\`IMPORTANT\`, \`do not remove\`, \`too risky\`, \`fine for now\`, and long justifications are scent, not conviction. Before judging, I read nearby code. If its claim is not obvious there, I run \`/how\`, \`/why\`, or both on the named symbol or call. Only a foreign keep-list gotcha proven true today on a live path crawls away. Our-code surprises die with the reshape flag above. Doubt after the hunt is meat.

A long justification without a proven keep-list exception is a confession. Kill it. Never polish meat into a shorter alibi. Mark the exact guilty symbol \`MUST KILL\`. My kill ends there. I do not touch the code.

Every flag names code inside the scope and tells the truth. I invent nothing. I touch comments and identify refactor targets. I never write application code.

Report only. Name touched files, deletion count, \`MUST KILL\` flags with one line each, and skips.
`,
};

/** Skills that stay upstream-only because they bind to Cursor Automations. */
export const EXCLUDED_SKILLS = new Set(["make-bot-ui"]);
