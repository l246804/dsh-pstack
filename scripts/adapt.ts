/**
 * Upstream-to-DSH adaptation rules.
 *
 * The converter keeps upstream bodies as close to the source as possible. Every
 * rewrite below exists because a Cursor concept has a different name or no
 * equivalent in DeepSeek Harness. Anything not listed here stays verbatim, so
 * upstream improvements flow through on the next sync.
 *
 * Two contracts keep that promise honest:
 *
 * 1. `rename`, `path`, and `indirect` rules are token swaps. Their patterns may
 *    match at most `TOKEN_RULE_MAX_WORDS` words on one line, so a token rule can
 *    never quietly become a paragraph rewrite. Anything larger belongs to an
 *    `approximate`, `drop`, or `host` rule with a written `reason`.
 * 2. Prose cleanup is not a rule. The converter never deletes `()`, doubles, or
 *    commas: that is editing the upstream author's text, and it broke real code
 *    samples (`z.string()` became `z.string`).
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
 * Quote a YAML scalar only when a plain scalar would change meaning. Most
 * upstream descriptions are valid plain scalars; wrapping all of them in quotes
 * added noise to every generated file without changing a byte of meaning.
 */
export function yamlScalar(value: string): string {
  const plain =
    value.length > 0 &&
    !/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(value) &&
    !/:\s| #|\n/.test(value) &&
    !/\s$/.test(value);
  return plain ? value : JSON.stringify(value);
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
  const lines = ["---", `name: ${data.name}`, `description: ${yamlScalar(data.description)}`];
  if (!data.modelInvocable) lines.push("disable-model-invocation: true");
  if (!data.userInvocable) lines.push("user-invocable: false");
  if (data.whenToUse) lines.push(`whenToUse: ${yamlScalar(data.whenToUse)}`);
  lines.push("---", "");
  lines.push(adapterNote, "");
  lines.push(body.replace(/\s+$/, ""), "");
  return lines.join("\n");
}

/**
 * Why a concept needs a rule.
 *
 * - `rename`: the DSH name is a straight substitution.
 * - `path`: a filesystem location moved.
 * - `approximate`: DSH has no equivalent; the text states the closest behavior.
 * - `drop`: the field has no meaning here and is removed.
 * - `indirect`: the value cannot be known at build time and resolves at runtime.
 * - `host`: the surrounding product changed, not an API.
 */
export type RuleKind = "rename" | "path" | "approximate" | "drop" | "indirect" | "host";

/**
 * The widest match a token rule may claim. A rename is a substitution inside a
 * sentence; if a pattern needs more than this, the sentence itself changed and
 * the rule belongs to an `approximate`, `drop`, or `host` concept with a reason.
 */
export const TOKEN_RULE_MAX_WORDS = 12;

/** Rules whose whole job is to swap a name for another name. */
export function isTokenRule(kind: RuleKind): boolean {
  return kind === "rename" || kind === "path" || kind === "indirect";
}

/**
 * One rewrite step.
 *
 * A step is a **token** swap by default: a name for a name, staying on one line.
 * A `[^\n]*` tail is fine — it still edits one line, and a table row or a list
 * item has to be replaced as a unit.
 *
 * A **block** rewrite crosses a line break, which means it rewrites a paragraph
 * rather than a name. It must add the third element, a reason a reviewer can
 * judge, and `check-rewrites.ts` prints it.
 */
export type RewriteStep = readonly [RegExp, string] | readonly [RegExp, string, string];

/** True when a step declares block scope (a third, reason element). */
export function isBlockRewrite(step: RewriteStep): boolean {
  return step.length === 3;
}

export interface RuleDoc {
  /** Which generated table in `assets/docs/harness/dsh.md` this row belongs to. */
  readonly table: "tools" | "paths" | "models" | "host";
  readonly cursor: string;
  readonly dsh: string;
}

/**
 * How completely a rule covers its upstream concept.
 *
 * - `full`: every occurrence is rewritten and a surviving token fails the sync.
 * - `partial`: only the contexts that need translating are rewritten. The term
 *   itself is legitimate DSH prose elsewhere, so a blanket `forbid` would
 *   reject correct output.
 * - `preserved`: the name survives the port on purpose. The rule exists so the
 *   coverage report can say so out loud instead of leaving a silent hole.
 */
export type RuleCoverage = "full" | "partial" | "preserved";

/**
 * One upstream concept, the rewrite it needs, and the tokens that must never
 * survive into `assets/`.
 *
 * `apply` runs in array order and the array itself is ordered: broader rules
 * come last so a specific phrase wins over the generic sweep underneath it.
 * `forbid` is the mechanical half of the contract: `rewriteSkill` fails the
 * sync when any of these tokens is still present after the table ran.
 */
export interface TermRule {
  /** Stable slug used by `--report` and by the coverage matrix. */
  readonly id: string;
  readonly kind: RuleKind;
  /** Upstream spelling this rule claims. Scanned by `--report`. */
  readonly detect: RegExp;
  /** Ordered rewrites. Empty for a concept that only appears in the doc table. */
  readonly apply: ReadonlyArray<RewriteStep>;
  /** Tokens that must not survive this rule. Implies `coverage: "full"`. */
  readonly forbid?: RegExp;
  /**
   * Defaults to `full` when `forbid` is set and `partial` otherwise, so a rule
   * cannot claim full coverage without the mechanical check behind it. Set it
   * explicitly only to explain a deliberate exception.
   */
  readonly coverage?: RuleCoverage;
  /** Why a term is left alone, required when `coverage` is not `full`. */
  readonly reason?: string;
  readonly doc?: RuleDoc;
}

const RULES: readonly TermRule[] = [
  // ---- host: the surrounding product changed -----------------------------
  {
    id: "host/create-skill",
    kind: "host",
    detect: /create-skill/,
    apply: [
      [
        /Use Cursor's built-in `create-skill` skill to author the skill\./g,
        "Use the authoring-a-skill playbook to author the skill.",
      ],
      [/Cursor's built-in `create-skill` skill/g, "the authoring-a-skill playbook"],
      [
        /Cursor's built-in `create-skill` \(authoring\)/g,
        "the authoring-a-skill playbook (authoring)",
      ],
      [/through Cursor's built-in `create-skill` flow/g, "through the authoring-a-skill playbook"],
      [/Cursor's built-in `create-skill`/g, "the authoring-a-skill playbook"],
      [/Cursor's built-in for authoring SKILL\.md files/g, "the pstack authoring-a-skill playbook"],
      [/A `create-skill`-style/g, "An `authoring-a-skill`-style"],
      [/the \*\*create-skill\*\* skill/g, "the **authoring-a-skill** playbook"],
      [/`create-skill`/g, "`authoring-a-skill`"],
      [/create-skill/g, "authoring-a-skill"],
    ],
    forbid: /create-skill/,
    doc: {
      table: "host",
      cursor: "Cursor's built-in `create-skill`",
      dsh: "No built-in authoring skill. Follow the `authoring-a-skill` playbook in `poteto-mode`.",
    },
  },
  {
    id: "host/custom-modes",
    kind: "host",
    detect: /Custom Modes?|Cursor custom modes/,
    apply: [
      [
        /Cursor's docs list Custom Modes in the Agents Window and the CLI\. Elsewhere, start each new task with `\/poteto-mode`\./g,
        "DSH has no persistent mode. Start each new task with `/poteto-mode`.",
      ],
      [
        /- Option\+Enter on Mac or Alt\+Enter on Windows, or Use as Mode from the skill entry, makes it a Custom Mode\. It stays in context every turn until the user exits the mode, and it stays out of casual turns\.\n/g,
        "",
        "The bullet describes a Cursor key binding that creates a Custom Mode; DSH has no persistent mode, so the next bullet states the replacement once.",
      ],
      [
        /Custom Modes are available in the Agents Window and the CLI\./g,
        "DSH has no persistent mode.",
      ],
      [
        /and a Custom Mode keeps `\/poteto-mode` in context on every turn\./g,
        "and `/poteto-mode` applies to that turn.",
      ],
      [/Cursor custom modes/gi, "DSH sessions"],
      [/Custom Modes?/g, "persistent mode"],
    ],
    forbid: /Custom Modes?/,
    doc: {
      table: "host",
      cursor: "Custom Modes",
      dsh: "No persistent mode. Start each task with `/poteto-mode`.",
    },
  },
  {
    id: "host/automations",
    kind: "host",
    // A product name, not an API. The sentences that mention it already say
    // DSH has no equivalent, so renaming the product would only garble them.
    detect: /Cursor Automations/,
    apply: [],
    coverage: "preserved",
    reason:
      "A Cursor product name. Keeping it lets the surrounding sentence say `which DSH does not provide` in plain words.",
    doc: {
      table: "host",
      cursor: "Cursor Automations, routines, `SendToUser` secret requests",
      dsh: "No equivalent. Use `schedule_create` for time-based follow-ups; skip the step with one line.",
    },
  },
  {
    id: "host/cloud",
    kind: "approximate",
    detect: /cloud agent|cloud subagent|cloud VM|environment: "cloud"|in-cloud/,
    apply: [
      [/Cursor cloud agents\b/g, "DSH child sessions"],
      [/Cursor cloud agent\b/g, "a DSH child session"],
      [/cloud subagents\b/g, "pstack subagents"],
      [/cloud subagent\b/g, "pstack subagent"],
      [/cloud agents\b/g, "background child sessions"],
      [/cloud agent\b/g, "background child session"],
    ],
    coverage: "partial",
    reason:
      "DSH child sessions are not isolated machines. Worktree-specific claims are rewritten at the paragraph that makes them; generic cloud-agent references become DSH child sessions.",
    doc: {
      table: "host",
      cursor: '`environment: "cloud"`',
      dsh: "A background `pstack_subagent` child session. The DSH worktree plugin is part of the supported install; have a writing child call `create_worktree` before editing. Child sessions are not separate VMs.",
    },
  },
  {
    id: "host/cloud-base-branch",
    kind: "drop",
    detect: /cloud_base_branch/,
    apply: [[/`cloud_base_branch`/g, "the worker's checkout branch"]],
    forbid: /cloud_base_branch/,
  },
  {
    id: "host/dashboard",
    kind: "host",
    detect: /Cursor dashboard|Cursor restart|Cursor environment/,
    apply: [
      [/Cursor dashboard/g, "the forge web UI"],
      [/Cursor restart/g, "harness restart"],
      [/Cursor environment/g, "the DSH session"],
      // Named product phrases whose possessive is part of the sentence, so the
      // article must survive: a blanket possessive sweep left "replaces
      // built-in babysit skill".
      [/replaces Cursor's built-in babysit skill/g, "replaces the built-in babysit skill"],
      [/Cursor's built-in babysit skill/g, "the built-in babysit skill"],
      // Any other possessive names a Cursor feature the sentences above did not
      // claim. Leaving it alone produces "DSH built-in" or "DSH docs", which is
      // a false statement, so drop only the possessive brand.
      [/Cursor's /g, ""],
    ],
    coverage: "partial",
    reason:
      "Three compound phrases only. A bare `Cursor` survives in product names such as cursor-team-kit, which is deliberate.",
  },
  {
    id: "host/loop",
    kind: "approximate",
    detect: /Cursor's `\/loop`|`\/loop`/,
    apply: [
      [
        /Cursor's `\/loop` command \(a built-in, not a pstack skill\)/g,
        "the `schedule_create` tool",
      ],
      [/Cursor's `\/loop` command/g, "`schedule_create`"],
      [
        /`\/loop` is Cursor's built-in wake mechanism, not a pstack skill\./g,
        "`schedule_create` is a DSH tool, not a pstack skill.",
      ],
      [
        /`\/loop` needs a check that can pass or fail/g,
        "a wake mechanism needs a check that can pass or fail",
      ],
      [/give `\/loop` that predicate/g, "give the wake prompt that predicate"],
      [/gives `\/loop` nothing to check/g, "gives the loop nothing to check"],
      [/"`?\/loop until X`?"/g, '"run until X"'],
      // A prompt the user types is not prose to translate word by word: replace
      // the whole line so the example stays a runnable DSH prompt.
      [
        /\/loop until done\. if you're truly stuck after a few hours, stop and write up why\./g,
        "Arm a `schedule_create` heartbeat for the finish condition. if you're truly stuck after a few hours, stop and write up why.",
      ],
      [/`\/loop 1h`/g, "`schedule_create` at a one-hour interval"],
      [/`\/loop`/g, "`schedule_create`"],
    ],
    forbid: /`\/loop`/,
    doc: {
      table: "host",
      cursor: "`/loop`",
      dsh: "`schedule_create` plus `create_goal` for long autonomous runs.",
    },
  },
  {
    id: "host/cursor-possessive",
    kind: "host",
    // A guard, not a rewrite. Every surviving `Cursor's` names a Cursor feature
    // and needs a targeted rule above; a blanket rule here would produce
    // "DSH built-in", "DSH docs", and other false claims.
    detect: /Cursor's /,
    apply: [],
    forbid: /Cursor's /,
  },

  // ---- paths: the filesystem moved ---------------------------------------
  {
    id: "path/model-rule",
    kind: "path",
    detect: /pstack-models\.mdc/,
    apply: [
      [/~\/\.cursor\/rules\/pstack-models\.mdc/g, "~/.dsh/pstack-models.md"],
      [/\.cursor\/rules\/pstack-models\.mdc/g, ".dsh/pstack-models.md"],
      [/pstack-models\.mdc/g, "pstack-models.md"],
    ],
    forbid: /pstack-models\.mdc/,
    doc: {
      table: "paths",
      cursor: "`~/.cursor/rules/pstack-models.mdc`",
      dsh: "`~/.dsh/pstack-models.md`",
    },
  },
  {
    id: "path/skills",
    kind: "path",
    detect: /\.cursor\/skills\//,
    apply: [
      [/~\/\.cursor\/skills\//g, "~/.dsh/skills/"],
      [/\.cursor\/skills\//g, ".dsh/skills/"],
    ],
    forbid: /\.cursor\/skills\//,
    doc: {
      table: "paths",
      cursor: "`.cursor/skills/`, `~/.cursor/skills/`",
      dsh: "`.dsh/skills/`, `~/.dsh/skills/`",
    },
  },
  {
    id: "path/plugins",
    kind: "path",
    detect: /\.cursor\/plugins\/|\.cursor-plugin/,
    apply: [
      [/~\/\.cursor\/plugins\//g, "$DSH_HOME/profiles/$DSH_PROFILE/node_modules/"],
      [/\.cursor-plugin\/plugin\.json/g, "package.json"],
    ],
    forbid: /\.cursor-plugin/,
    doc: {
      table: "paths",
      cursor: "`~/.cursor/plugins/`, `.cursor-plugin/plugin.json`",
      dsh: "`$DSH_HOME/profiles/$DSH_PROFILE/node_modules/`, `package.json`",
    },
  },
  {
    id: "path/transcripts",
    kind: "path",
    detect: /agent-transcripts/,
    apply: [
      [
        /~\/\.cursor\/projects\/<slug>\/agent-transcripts\/<uuid>\/<uuid>\.jsonl/g,
        "$DSH_HOME/sessions/<workspace-slug>/<session-id>/session.v3.jsonl",
      ],
      [/~\/\.cursor\/projects\/\*\//g, "$DSH_HOME/sessions/"],
      [/agent-transcripts\//g, "session logs/"],
    ],
    forbid: /agent-transcripts/,
    doc: {
      table: "paths",
      cursor: "`~/.cursor/projects/<slug>/agent-transcripts/`",
      dsh: "`$DSH_HOME/sessions/<workspace-slug>/<session-id>/`",
    },
  },
  {
    id: "path/worktrees",
    kind: "path",
    detect: /\.cursor\/worktrees\//,
    apply: [[/\.cursor\/worktrees\//g, ".worktrees/"]],
    forbid: /\.cursor\/worktrees\//,
  },

  // ---- ecosystem: sibling projects that do not ship here -----------------
  {
    id: "ecosystem/deslop",
    kind: "approximate",
    detect: /deslop/,
    apply: [
      // `cursor-team-kit` never ships here, and `/no-comments` covers only the
      // comment half of what `/deslop` did. Name the outcome instead of
      // pretending a narrower skill is a drop-in for it.
      [
        /`\/deslop` ships in the `cursor-team-kit` plugin, not in pstack\. If you don't have it, ask for the same outcome in plain words: /g,
        "No single skill does this here. Ask for the same outcome in plain words: ",
      ],
      [
        /`\/deslop` cleans slop out of the code/g,
        "The pre-commit cleanup removes slop from the code",
      ],
      [
        /the `deslop` skill from the `cursor-team-kit` plugin \(`\/deslop`\)/g,
        "the pre-commit cleanup",
      ],
      [/`\/deslop` from `cursor-team-kit`/g, "the pre-commit cleanup"],
      [/`\/deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin\./g, ""],
      [
        /`cursor-team-kit` publishes `control-cli` and `control-ui`, and `\/deslop` and `\/create-skill` are built-ins\./g,
        "",
      ],
      [/`deslop it`/g, "`strip the slop`"],
      [/`\/deslop`/g, "the pre-commit cleanup"],
    ],
    forbid: /deslop/,
    doc: {
      table: "host",
      cursor: "`/deslop`, `control-cli`, `control-ui` from `cursor-team-kit`",
      dsh: "Not shipped. Ask for the same outcome in plain words: remove narrating comments, unsupported guards, dead compatibility paths, and unrelated edits. `/no-comments` covers the comment half.",
    },
  },
  {
    id: "ecosystem/control",
    kind: "approximate",
    detect: /control-cli|control-ui|control skill/,
    apply: [
      [/`control-ui` or `control-cli` from `cursor-team-kit`/g, "the project verification skill"],
      [
        /\(such as the project verification skill or `control-cli` from `cursor-team-kit`\)/g,
        "(the project verification skill)",
      ],
      [/`control-ui` \(browser \/ Electron \/ web UIs\)/g, "the project verification skill"],
      [/`control-cli` \(CLIs and TUIs\)/g, "the project verification skill"],
      [/`control-ui` or `control-cli`/g, "the project verification skill"],
      // The rest of pstack calls the same surface "control skill". DSH ships
      // one verification-skill generator, so the vocabulary follows it.
      [/\bcontrol skills\b/g, "verification skills"],
      [/\bcontrol skill\b/g, "verification skill"],
      [/\bcontrol surface\b/g, "verification surface"],
    ],
    forbid: /control-cli|control-ui/,
  },
  {
    id: "ecosystem/team-kit",
    kind: "host",
    // A package name, not a Cursor API. It stays verbatim: a DSH user who
    // installs it can still follow the sentence.
    detect: /cursor-team-kit/,
    apply: [],
    coverage: "preserved",
    reason:
      "A package name, not a Cursor API. It stays verbatim so a DSH user who installs it can follow the sentence.",
    doc: {
      table: "host",
      cursor: "`cursor-team-kit`",
      dsh: "Not shipped with pstack. Install it separately, or ask for the same outcome in plain words.",
    },
  },
  {
    id: "ecosystem/bugbot",
    kind: "host",
    // Bugbot comments on forge pull requests, so the name survives the port.
    detect: /Cursor's Bugbot|Bugbot|bugbot/,
    apply: [[/Cursor's Bugbot/g, "Bugbot"]],
    coverage: "partial",
    reason:
      "Bugbot comments arrive on the forge PR, so the name stays usable in DSH prose. Only the Cursor-owned phrasing is rewritten; lowercase `bugbot` is the forge check name in scripts.",
    doc: {
      table: "host",
      cursor: "Bugbot",
      dsh: "Comments arrive as ordinary forge review threads; triage them with `gh`. If a PR has no bot check or comment, skip the step.",
    },
  },
  {
    id: "ecosystem/environment-field",
    kind: "drop",
    detect: /including `environment`/,
    apply: [[/including `environment`/g, "including `agent`, `role`, `cwd`, and `prompt`"]],
    coverage: "partial",
    reason: "One sentence names the removed field; the field name itself is not a token to ban.",
  },

  // ---- tools: the delegated API changed ----------------------------------
  {
    id: "tool/task",
    kind: "rename",
    detect: /`Task`|Task (tool|call|subagent|spawn|prompt|response|schema)/,
    apply: [
      [/`Task`/g, "`pstack_subagent`"],
      [/\bTask tool\b/g, "`pstack_subagent` tool"],
      [/\bTask calls\b/g, "`pstack_subagent` calls"],
      [/\bTask call\b/g, "`pstack_subagent` call"],
      [/\bTask subagent\b/g, "`pstack_subagent` subagent"],
      [/\bTask spawn\b/g, "`pstack_subagent` spawn"],
      [/\bTask prompt\b/g, "`pstack_subagent` prompt"],
      [/\bTask response\b/g, "`pstack_subagent` response"],
      [/\bTask schema\b/g, "`pstack_subagent` schema"],
    ],
    forbid: /`Task`|\bTask (?:tool|call|subagent|spawn|prompt|response|schema)\b/,
    doc: {
      table: "tools",
      cursor: "`Task`",
      dsh: "`pstack_subagent`. Starts a background child and returns its id; the runtime sends a completion notice.",
    },
  },
  {
    id: "tool/subagent-type",
    kind: "rename",
    detect: /subagent_type|generalPurpose/,
    apply: [
      [/subagent_type:\s*"?generalPurpose"?/g, 'agent: "general"'],
      [/subagent_type:\s*"poteto-agent"/g, 'agent: "poteto-agent"'],
      [/subagent_type:\s*"comment-sicko"/g, 'agent: "comment-sicko"'],
      // Not backticked: `agent: "general"` already contains double quotes, and
      // wrapping it in a code span inside YAML frontmatter produces `\\"` noise.
      [/\bgeneralPurpose\b/g, 'agent: "general"'],
      [/subagent_type/g, "agent"],
    ],
    forbid: /subagent_type|generalPurpose/,
    doc: {
      table: "tools",
      cursor: '`subagent_type: "poteto-agent"`',
      dsh: '`agent: "poteto-agent"`. The tool prepends the poteto-agent instructions.',
    },
  },
  {
    id: "tool/subagent-type-general",
    kind: "rename",
    detect: /generalPurpose/,
    apply: [],
    coverage: "partial",
    reason:
      "Enforced by the `tool/subagent-type` forbid pattern, which covers both `subagent_type` and `generalPurpose`. This row carries only the doc-table wording.",
    doc: {
      table: "tools",
      cursor: "`subagent_type: generalPurpose`",
      dsh: '`agent: "general"`. No preamble; the prompt stands alone.',
    },
  },
  {
    id: "tool/subagent-type-comment",
    kind: "rename",
    detect: /comment-sicko/,
    apply: [],
    coverage: "preserved",
    reason:
      "`comment-sicko` is the DSH agent name too. Only the `subagent_type` key around it changes, which `tool/subagent-type` owns.",
    doc: {
      table: "tools",
      cursor: '`subagent_type: "comment-sicko"`',
      dsh: '`agent: "comment-sicko"`.',
    },
  },
  {
    id: "tool/model-slug",
    kind: "indirect",
    detect: /`(?:claude|grok|gpt|composer)-[a-z0-9]/,
    apply: [
      // Concrete upstream examples in prose, where two different slugs would
      // otherwise collapse into the same placeholder and lose their meaning.
      [/`gpt-4` to `gpt-4o` in `encodingForModel`/g, "a model constant in `encodingForModel`"],
      [
        /If the rule or that line is missing, use `claude-opus-5-5-xhigh` and `grok-4\.7-xhigh-fast`\./g,
        "If the rule or that line is missing, one runner inherits the parent model.",
      ],
      [
        /\(default `(?:claude|grok|gpt|composer)-[a-z0-9][a-z0-9.-]*`\)/g,
        "(the configured role route)",
      ],
      [/default `(?:claude|grok|gpt|composer)-[a-z0-9][a-z0-9.-]*`/g, "the configured role route"],
      [/`(?:claude|grok|gpt|composer)-[a-z0-9][a-z0-9.-]*`/gi, "`the configured route`"],
    ],
    forbid: /`(?:claude|grok|gpt|composer)-[a-z0-9]/,
    doc: {
      table: "models",
      cursor: "`model` slug, such as `claude-opus-5-5-xhigh`",
      dsh: '`role: "<role line>"`. The tool resolves provider, model, and effort from `~/.dsh/pstack-models.md` at call time.',
    },
  },
  {
    id: "tool/background",
    kind: "drop",
    detect: /run_in_background/,
    apply: [],
    forbid: /run_in_background/,
    doc: {
      table: "tools",
      cursor: "`run_in_background: true`",
      dsh: "Always on. Every child is a managed background activation.",
    },
  },
  {
    id: "tool/readonly",
    kind: "approximate",
    detect: /readonly: (true|false)/,
    apply: [],
    forbid: /readonly: (?:true|false)/,
    doc: {
      table: "tools",
      cursor: "`readonly: true` / `readonly: false`",
      dsh: 'No separate mode. Say "do not edit files" in the prompt, and check `git status` afterward.',
    },
  },
  {
    id: "tool/resume",
    kind: "approximate",
    detect: /`resume`/,
    apply: [],
    coverage: "partial",
    reason:
      "The word 'resume' is ordinary English in the surrounding playbooks. The field name only appears where a replaced block already names `send_message`.",
    doc: {
      table: "tools",
      cursor: "`resume`",
      dsh: "This bundle has no child-steering tool. Use a fresh child with consolidated scope unless the profile mounts `@deepseek-ai/dsh-tool-subagent-control`.",
    },
  },
  {
    id: "tool/ask",
    kind: "rename",
    detect: /AskQuestion/,
    apply: [
      [/\bAskQuestion tool\b/g, "`ask_user_question` tool"],
      // Backticked form first: otherwise the generic sweep wraps an existing
      // code span and produces a double-backtick artifact.
      [/`AskQuestion`/g, "`ask_user_question`"],
      [/\bAskQuestion\b/g, "`ask_user_question`"],
    ],
    forbid: /AskQuestion/,
    doc: {
      table: "tools",
      cursor: "`AskQuestion`",
      dsh: "`ask_user_question`. In non-interactive runs it is absent, so ask in plain text.",
    },
  },
  {
    id: "tool/todo",
    kind: "rename",
    detect: /TodoWrite/,
    apply: [
      [/`TodoWrite`/g, "`todo_write`"],
      [/\bTodoWrite\b/g, "`todo_write`"],
    ],
    forbid: /TodoWrite/,
    doc: {
      table: "tools",
      cursor: "`TodoWrite`",
      dsh: "`todo_write` with the whole list.",
    },
  },
  {
    id: "host/todolist",
    kind: "host",
    // Cursor's todolist is a UI concept; DSH's `todo_write` takes the list in
    // one call. Rewriting only the verb phrase keeps the rest of each sentence.
    detect: /todolist/,
    apply: [
      [/Open a todolist whose first item is/g, "Call `todo_write` with a list whose first item is"],
      [
        /Open a todolist whose first items are/g,
        "Call `todo_write` with the full list, whose first items are",
      ],
      [/Open a todolist with one entry per phase/g, "Call `todo_write` with one entry per phase"],
      [/Open a todolist/g, "Call `todo_write`"],
      [/\btodolist\b/g, "todo list"],
    ],
    forbid: /todolist/,
  },
  {
    id: "tool/search",
    kind: "rename",
    detect: /\bGrep\b|\bGlob\b/,
    apply: [
      [/`Grep`/g, "`grep`"],
      [/`Glob`/g, "`glob`"],
      [/\bGrep\b/g, "`grep`"],
      [/\bGlob\b/g, "`glob`"],
    ],
    coverage: "partial",
    reason:
      "The capitalized names are Cursor tools. Lowercase `grep` and `glob` are also ordinary prose, so only the capitalized spelling is rewritten.",
    doc: {
      table: "tools",
      cursor: "`Grep` / `Glob`",
      dsh: "`grep` / `glob`.",
    },
  },
  {
    id: "tool/read",
    kind: "rename",
    detect: /a `Read` of/,
    apply: [[/a `Read` of/g, "a `read` of"]],
    coverage: "partial",
    reason:
      "Only the backticked phrase is rewritten; the lowercase tool names are legitimate DSH prose everywhere else.",
    doc: {
      table: "tools",
      cursor: "`Read` / `Write` / `Edit`",
      dsh: "`read` / `write` / `edit`.",
    },
  },
  {
    id: "tool/shell",
    kind: "rename",
    detect: /\bShell\b/,
    apply: [
      [/`Shell`/g, "`bash`"],
      [/\bShell\b/g, "`bash`"],
    ],
    coverage: "partial",
    reason: "Capitalized `Shell` is the Cursor tool; the lowercase word is ordinary English.",
    doc: {
      table: "tools",
      cursor: "`Shell`",
      dsh: "`bash` (or `pwsh` on Windows).",
    },
  },
  {
    id: "tool/file-attachments",
    kind: "drop",
    detect: /file_attachments/,
    apply: [[/`file_attachments`/g, "the paths in the brief"]],
    forbid: /file_attachments/,
  },
];

/**
 * Every concept the upstream Claude Code adapter has to handle, mapped to the
 * rule that owns it here.
 *
 * This list is the checklist, not the implementation: it exists so a term that
 * upstream proved matters cannot quietly lose its rule. `sync:report` fails when
 * a key here names a rule id that no longer exists, or when a rule with entries
 * upstream has no written coverage decision.
 */
export const UPSTREAM_TERMS: ReadonlyArray<{ readonly term: string; readonly rule: string }> = [
  { term: "`Task`", rule: "tool/task" },
  { term: "`AskQuestion`", rule: "tool/ask" },
  { term: "todolist", rule: "host/todolist" },
  { term: "generalPurpose", rule: "tool/subagent-type-general" },
  { term: "poteto-agent", rule: "tool/subagent-type" },
  { term: "comment-sicko", rule: "tool/subagent-type-comment" },
  { term: "`readonly: true`", rule: "tool/readonly" },
  { term: '`environment: "cloud"`', rule: "host/cloud" },
  { term: "cloud_base_branch", rule: "host/cloud-base-branch" },
  { term: "`run_in_background: true`", rule: "tool/background" },
  { term: "`resume`", rule: "tool/resume" },
  { term: "`file_attachments`", rule: "tool/file-attachments" },
  { term: "claude-", rule: "tool/model-slug" },
  { term: "grok-", rule: "tool/model-slug" },
  { term: "gpt-", rule: "tool/model-slug" },
  { term: "inherit-parent", rule: "tool/model-slug" },
  { term: "pstack-models.mdc", rule: "path/model-rule" },
  { term: ".cursor/skills/", rule: "path/skills" },
  { term: "~/.cursor/plugins/", rule: "path/plugins" },
  { term: ".cursor/rules/", rule: "path/model-rule" },
  { term: "agent-transcripts", rule: "path/transcripts" },
  { term: "Cursor-only features", rule: "host/automations" },
];

/** Rules in execution order. `apply` is empty for doc-only concepts. */
export function termRules(): readonly TermRule[] {
  return RULES;
}

/**
 * Refuse a rule table that would rewrite prose while claiming to swap names.
 *
 * A `rename`, `path`, or `indirect` rule is a token substitution. If its
 * pattern spans lines or carries more than `TOKEN_RULE_MAX_WORDS` words, it is
 * really a sentence rewrite: it needs an `approximate`, `drop`, or `host` kind
 * and a written reason. Running at import time means a bad rule fails `sync`
 * before it can mangle a skill.
 */
export function validateRules(rules: readonly TermRule[] = RULES): void {
  for (const rule of rules) {
    if (!isTokenRule(rule.kind)) continue;
    for (const [pattern] of rule.apply) {
      if (pattern.source.includes("\\n")) {
        throw new Error(`rule ${rule.id}: token rules cannot span lines`);
      }
      const words = pattern.source.split(/\s+/).filter(Boolean).length;
      if (words > TOKEN_RULE_MAX_WORDS) {
        throw new Error(
          `rule ${rule.id}: token rule matches ${words} words (limit ${TOKEN_RULE_MAX_WORDS}); ` +
            "move it to an approximate/drop/host rule with a reason",
        );
      }
    }
  }
}

validateRules();

/**
 * Effective coverage for one rule. A `forbid` pattern is what makes a claim
 * mechanically checkable, so claiming `full` without one is a bug in the table.
 */
export function ruleCoverage(rule: TermRule): RuleCoverage {
  if (rule.forbid) return "full";
  const declared = rule.coverage ?? "partial";
  if (declared === "full") {
    throw new Error(
      `rule ${rule.id} claims full coverage but has no forbid pattern; ` +
        "add one, or declare it partial/preserved with a reason",
    );
  }
  return declared;
}

/**
 * Tokens no generated skill or agent may contain. Rules that only describe a
 * concept still contribute their `forbid`, so a rule set cannot silently stop
 * covering a term without failing the sync.
 */
export function forbiddenTerms(): RegExp[] {
  return RULES.flatMap((rule) => (rule.forbid ? [rule.forbid] : []));
}

export function rewriteCommon(text: string): string {
  let result = text.replace(/\r\n/g, "\n");
  for (const rule of RULES) {
    for (const [pattern, value] of rule.apply) result = result.replace(pattern, value);
  }
  // Only whitespace is normalized here. Deleting `()` or collapsing commas is
  // editing the author's text, and it corrupted real samples: `toSQL()` became
  // `toSQL`, `z.string()` became `z.string`.
  result = result.replace(/[ \t]+$/gm, "");
  result = result.replace(/\n{4,}/g, "\n\n\n");
  return result;
}

/**
 * Non-Markdown files that carry host-specific strings.
 *
 * Scripts are copied byte for byte except for these entries. A rewrite here is
 * different from a prose rewrite: the string is an interface, so both sides
 * must move together. `check-plan.mjs` proves it — its `PROGRAM_MARKERS` must
 * match the words the autopilot playbook tells the agent to write, or the
 * validator passes every plan in silence.
 */
const SCRIPT_REWRITES: Record<string, ReadonlyArray<RewriteStep>> = {
  "skills/poteto-mode/scripts/check-plan.mjs": [
    [
      /const PROGRAM_MARKERS = \["git show origin\/main:", "\/loop 1h", "status message"\];/,
      'const PROGRAM_MARKERS = ["git show origin/main:", "schedule_create 1h", "status message"];',
    ],
  ],
  "skills/poteto-mode/scripts/check-plan.test.ts": [
    [
      /\\`git show origin\/main:\\` \/loop 1h status message/,
      "\\`git show origin/main:\\` schedule_create 1h status message",
    ],
  ],
  "skills/poteto-mode/scripts/worktree-audit.sh": [
    [
      /# Transcripts dir: ~\/\.cursor\/projects\/<slugified-repo-path>\/agent-transcripts\.\nslug=\$\(printf '%s' "\$main_wt" \| sed 's#\^\/##; s#\/#-#g'\)\ntranscripts="\$HOME\/\.cursor\/projects\/\$slug\/agent-transcripts"/,
      '# Session logs root: $DSH_HOME/sessions/<workspace-slug>. Every directory level\n# below it is one session id, so a worktree matches when any log under it names\n# the worktree path.\ntranscripts="${DSH_HOME:-$HOME/.dsh}/sessions"',
      "Three lines: a Cursor path comment, the slug computation that builds it, and the assignment. DSH needs a different root and no slug.",
    ],
    [
      /f=\$\(rg -l -e "\$\{wt\}\/" -e "\$\{wt\}\\"" "\$transcripts" 2>\/dev\/null \\\n\t\t\t\| xargs stat -f '%m %N' 2>\/dev\/null \| sort -rn \| head -1\)/,
      'f=$(rg -l -e "${wt}/" -e "${wt}\\"" "$transcripts" 2>/dev/null \\\n\t\t\t| xargs stat -c \'%Y %n\' 2>/dev/null | sort -rn | head -1)',
      "The pipeline uses macOS `stat -f`; DSH targets Linux, where the equivalent is `stat -c`.",
    ],
  ],
};

/**
 * Upstream files that legitimately contain a forbidden token because it names
 * an external system rather than a Cursor concept. Each entry needs a reason:
 * an unexplained exemption is how a real leak slips through.
 */
const SCRIPT_EXEMPTIONS: ReadonlyArray<{
  readonly path: RegExp;
  readonly term: string;
  readonly why: string;
}> = [
  {
    path: /^skills\/poteto-mode\/scripts\/watch-pr\//,
    term: "bugbot",
    why: "`isBugbot` and the `bugbot` check name come from the forge's review-thread data, not from Cursor. Rewriting them breaks the parser.",
  },
];

/** Apply script rewrites for one non-Markdown file, if it has any. */
export function rewriteScript(relativePath: string, text: string): string {
  let result = text;
  for (const step of SCRIPT_REWRITES[relativePath] ?? []) {
    assertRewriteScope(relativePath, step);
    result = result.replace(step[0], step[1]);
  }
  return result;
}

/** One file's surgical rewrites, exposed so a check can prove they still match. */
export interface RewriteSpec {
  readonly path: string;
  readonly rewrites: ReadonlyArray<RewriteStep>;
}

/** Reject a multi-line rewrite that did not declare itself as a block. */
export function assertRewriteScope(path: string, step: RewriteStep): void {
  if (isBlockRewrite(step)) return;
  // `[^\n]` and `[^\s\S]` are line-*local* classes: they keep the match inside
  // one line. Only a bare `\n` or `[\s\S]` can cross lines and rewrite prose.
  const source = step[0].source.replaceAll("[^\\n]", "").replaceAll("[^\\s\\S]", "");
  if (source.includes("\\n") || source.includes("[\\s\\S]")) {
    throw new Error(
      `${path}: rewrite ${step[0].source.slice(0, 60)}… crosses a line break; ` +
        "add a third element explaining why a token swap cannot do it",
    );
  }
}

/** Every Markdown file with surgical rewrites, in declaration order. */
export function fileRewriteSpecs(): RewriteSpec[] {
  return Object.entries(FILE_REWRITES).map(([path, rewrites]) => ({ path, rewrites }));
}

/** Every script with surgical rewrites, in declaration order. */
export function scriptRewriteSpecs(): RewriteSpec[] {
  return Object.entries(SCRIPT_REWRITES).map(([path, rewrites]) => ({ path, rewrites }));
}

/**
 * Check a copied script for Cursor terms. Markdown goes through
 * `rewriteSkill`; scripts are code, so a surviving term is either a missed
 * rewrite or an exemption that needs a written reason.
 */
export function auditScript(relativePath: string, text: string): string[] {
  const problems: string[] = [];
  for (const found of findForbiddenTerms(text)) {
    const exempt = SCRIPT_EXEMPTIONS.some(
      (entry) =>
        entry.path.test(relativePath) && found.match.toLowerCase() === entry.term.toLowerCase(),
    );
    if (exempt) continue;
    const line = text.slice(0, found.index).split("\n").length;
    problems.push(
      `${relativePath}:${line}: "${found.match}" (${found.rule}) has no rule or exemption`,
    );
  }
  return problems;
}

const FILE_REWRITES: Record<string, ReadonlyArray<RewriteStep>> = {
  "skills/poteto-mode/SKILL.md": [
    [
      /## Subagents\n[\s\S]*?\n## Writing the reply/,
      `## Subagents

Every delegation goes through the \`pstack_subagent\` tool. It starts a background child, returns its id, and the runtime sends you a completion notice. It takes \`description\`, \`prompt\`, \`role\`, optional \`cwd\`, \`agent\`, \`agentPreset\`, and \`maxDepth\`. The \`pstack-subagent\` row sets the depth cap; the model may request a lower value, but the tool clamps it to that cap. \`roleIndex\` selects one zero-based route from a list-valued role.

- **\`agent: "poteto-agent"\`** for any subagent you spawn inside a playbook step: code-writing delegates, ad-hoc helpers. The tool prepends the poteto-agent instructions, so the child reads this skill in full before working. The chat that receives \`/poteto-mode\` runs the playbook. Never spawn a poteto-agent to run the playbook itself.
- **\`agent: "general"\`** for the routed workflow skills (\`how\`, \`why\`, \`interrogate\`, \`reflect\`, \`swarm\`). They pass their own reviewer prompts and do not need the poteto preamble.
- **\`agent: "comment-sicko"\`** only through \`/no-comments\`.

**Roles.** \`role\` names a line in \`~/.dsh/pstack-models.md\` (\`feature, refactoring\`, \`bug-fix\`, \`perf-issue\`, \`hillclimb\`, \`judgment and prose\`, \`hardest tasks\`, \`how explorer\`, \`how explainer\`, \`why investigators\`, \`why synthesizer\`, \`reflect tooling\`, \`reflect judgment, divergent, synthesizer\`, \`arena runners\`, \`arena cross-judge pool\`, \`swarm workers\`, \`architect runners\`, \`interrogate reviewers\`). The tool resolves the route from that file. A missing file or role line means the child inherits the parent's model. Never pass a model slug yourself; DSH providers and model ids are deployment-specific.

The \`arena runners\`, \`architect runners\`, and \`interrogate reviewers\` roles fan out one child per entry from a single tool call because those skills define panel semantics. Other list-valued roles select their first entry by default; pass \`roleIndex\` to choose another route without unexpectedly creating more children. Panels stay diverse only when the list names different routes. An unavailable panel route falls back to the parent route with a diagnostic; the other reviewers still run.

\`agent\` selects a pstack prompt preamble. \`agentPreset\` selects the DSH preset that supplies the child's tools, skills, and plugins; the model can select one only when the \`pstack-subagent\` row sets \`allowedAgentPresets\`. A configured \`agentPreset\` value sets the default.

You own every subagent's work. Review the diff and write your own summary, don't pass through what it said. A second opinion is the same prompt against a different model. Agreement is high-signal.

**Fresh subagents by default.** Give new work to a fresh subagent with consolidated scope, meaning the original brief, every later directive, and the prior agent's report and branch. This holds for a fix round, a follow-up, a retry, and the next queue item. This bundle does not add a child-steering tool; continue an existing child only when the profile mounts \`@deepseek-ai/dsh-tool-subagent-control\` and the new work strictly needs state that is costly to move. Otherwise start fresh. A stop or hold order to a running agent is not reuse. A role such as a PR owner outlives its agent. Once that agent returns, a fresh child takes the role's next round.

## Worktrees

The DSH worktree plugin is part of the supported pstack install. Use DSH's \`create_worktree\` before the child writes shared-repository changes. It creates a local Git worktree, checks out a branch, and changes that session's working directory; it does not provide a VM, merge changes, or clean up the worktree. If a child needs a prepared checkout instead, pass its path through \`cwd\`. Worktree file-policy restrictions still apply.

## Writing the reply`,
      "The section documents Cursor's Task fields (`subagent_type`, `model`, `readonly`, `resume`). No token swap can reshape a section whose whole vocabulary is the other API.",
    ],
    [
      /- \*\*Session pickup\.\*\* Resuming or taking over a prior agent's in-flight work from a transcript, cloud-agent URL, or pushed branch\./,
      "- **Session pickup.** Resuming or taking over a prior agent's in-flight work from a transcript, a session log, a PR URL, or a pushed branch.",
    ],
    [
      /the \*\*create-skill\*\* skill \(Cursor's built-in for authoring SKILL\.md files\)/,
      "the **authoring-a-skill** playbook",
    ],
    [
      /the `deslop` skill from the `cursor-team-kit` plugin \(`\/deslop`\)/,
      "the pre-commit cleanup: `/no-comments` over the diff, then reread for narration, dead compatibility paths, and unrelated edits",
    ],
    [
      /the matching control skill\. `cursor-team-kit` publishes `control-cli` \(CLIs and TUIs\) and `control-ui` \(browser \/ Electron \/ web UIs\)\./,
      "the project verification skill.",
    ],
    [
      /Bugbot or the agentic security review commented/,
      "Bugbot or the agentic security review commented",
    ],
    [/"\/loop until X"/, '"run until X"'],
    [/a Cursor restart/, "a harness restart"],
    [/Cursor's built-in babysit skill/, "the built-in babysit skill"],
  ],
  "skills/how/SKILL.md": [
    [
      /Every spawn is a Task subagent with `subagent_type: generalPurpose` and `readonly: true`\./,
      'Every spawn is a `pstack_subagent` call with `agent: "general"`; tell it not to edit files.',
    ],
    [
      /Explorers use the `how explorer` line in the `pstack-models\.mdc` rule \(default `grok-4\.7-xhigh-fast`\), and every explainer uses the `how explainer` line \(default `claude-opus-5-5-xhigh`\)\./,
      'Explorers pass `role: "how explorer"` and every explainer passes `role: "how explainer"`; the tool resolves each from `~/.dsh/pstack-models.md`.',
    ],
    [
      /Set `model` to that line's value, or to the default if the rule or the line is missing\. Leave `model` unset when the value is `auto` or `inherit-parent`\./,
      "When the file or line is missing, the child inherits the parent model.",
    ],
    [
      / If the Task tool rejects a slug, use the default and say so\. If it rejects the default, use the closest valid slug of the same family from its error message\./,
      "",
    ],
    [
      / Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the \*\*poteto-mode\*\* skill\./,
      "",
    ],
  ],
  "skills/why/SKILL.md": [
    [
      /Each spawn below names a role line in the `pstack-models\.mdc` rule and a default\. Set `model` to that line's value, or to the default if the rule or the line is missing\. Leave `model` unset when the value is `auto` or `inherit-parent`\./,
      "Each spawn below names a `role` for `pstack_subagent`; the tool resolves it from `~/.dsh/pstack-models.md`, and a missing line inherits the parent model.",
    ],
    [
      / If the Task tool rejects a slug, use the default and say so\. If it rejects the default, use the closest valid slug of the same family from its error message\./,
      "",
    ],
    [
      / Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the \*\*poteto-mode\*\* skill\./,
      "",
    ],
    [
      /Every spawn is `generalPurpose` with `readonly: false` \(agent mode\)\. \*\*Do not use readonly\/Ask mode\.\*\* It strips MCP access, which disables the MCP-backed investigators and the synthesizer's citation spot-checks\. Investigators still shouldn't write anything\./,
      'Every spawn is a `pstack_subagent` call with `agent: "general"`. DSH has no readonly mode; tell each investigator not to write files, and check `git status` afterward. Investigators must not write anything.',
    ],
    [
      /Before spawning investigators, list the available MCPs from the Cursor environment\. Use the available-tools map when present\. Otherwise inspect the `mcps\/` directory Cursor exposes for enabled MCP servers\./,
      "Before spawning investigators, list the MCP servers available in this DSH session from the tool catalog and any MCP tools already in context.",
      "The sentence names a Cursor-specific MCP discovery mechanism (`mcps/` directory) that does not exist in DSH.",
    ],
    [
      /`model`: the `why investigators` line, default `grok-4\.7-xhigh-fast`\./,
      '`role: "why investigators"`.',
    ],
    [
      /`model`: the `why synthesizer` line, default `claude-opus-5-5-xhigh`\./,
      '`role: "why synthesizer"`.',
    ],
    [/cursor location/, "the current working directory"],
  ],
  "skills/architect/SKILL.md": [
    [
      /Alias and rejected entries follow the runner rules in the \*\*arena\*\* skill's Phase A\./,
      "The arena skill's Phase A covers route selection.",
    ],
    [
      /Run the \*\*arena\*\* skill with the design-sketch task and the Phase A grounding artifacts\. Pass `references\/runner-prompt\.md` as each runner's prompt\./,
      "Run the **arena** skill with the design-sketch task and the Phase A grounding artifacts. Pass `references/runner-prompt.md` as the runner prompt. The tool starts one runner per `architect runners` entry and appends `Panel entry: <i> of <N>`; tell each runner to use that index for its output path.",
    ],
  ],
  "skills/arena/SKILL.md": [
    [
      /3\. Pick the runners\. Use the `arena runners` line in `~\/\.cursor\/rules\/pstack-models\.mdc`\. If the rule or that line is missing, default to one each on `claude-opus-5-5-xhigh` and `grok-4\.7-xhigh-fast`\. An `auto` or `inherit-parent` entry in this line or the cross-judge line means the parent model, so omit `model` for it\. If the Task tool rejects a configured entry, run that seat on its family's default and say so\. Families go by prefix: `claude-\*`, and `grok-\*` with `cursor-grok-\*` and `composer-\*`. A refused `composer-\*` entry runs on `grok-4\.7-xhigh-fast`\. With no family match, use `claude-opus-5-5-xhigh`\. If it rejects a default, use the closest valid slug of the same family from its error message\./,
      '3. Pick the runners with one `pstack_subagent` call using `role: "arena runners"`. The tool starts one child per entry in `~/.dsh/pstack-models.md`; an `inherit-parent` entry runs on the parent model. When the file or line is missing, it starts one child on the parent model.',
      "The runner-selection paragraph is entirely about Cursor model slugs, family fallbacks, and `Task` rejections; DSH delegates all of that to the role file.",
    ],
    [
      /Spawn more runners when the arena covers multiple design directions\. Use the same model N times when the work is generation-bound rather than judgment-sensitive\./,
      "The `arena runners` line's entries set the candidate count; add entries to add runners. Repeat the same route in that line when the work is generation-bound rather than judgment-sensitive.",
    ],
    [
      /Spawn all N subagents in one message with `run_in_background: true`, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected\./,
      "The single `pstack_subagent` call from Phase A starts one child per `arena runners` entry. Put the task, the path to the shared grounding, and an output-path template in the prompt; each child sees its `Panel entry: <i> of <N>` suffix and uses that index for `/tmp/arena-<slug>/candidate-<i>/`. Ask for the artifact and a short rationale naming the alternatives it considered and what it rejected.",
    ],
    [/with `run_in_background: true`, /, ""],
    [
      /a git worktree where possible, otherwise `\/tmp\/arena-<slug>\/candidate-<n>\/`/,
      "a worktree created with DSH `create_worktree` where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`",
    ],
    [
      /After all Phase B candidates complete, choose one model from the `arena cross-judge pool` line in `~\/\.cursor\/rules\/pstack-models\.mdc`\. If the rule or that line is missing, choose from `claude-opus-5-5-xhigh` and `grok-4\.7-xhigh-fast`\. Prefer a different model family from the parent's\. Spawn one readonly judge subagent on that model\./,
      'After all Phase B candidates complete, choose one zero-based entry from `arena cross-judge pool` and spawn one `pstack_subagent` with `role: "arena cross-judge pool"`, that `roleIndex`, and `agent: "general"`. Tell it not to edit files. Prefer a route whose family differs from the parent\'s; when the role is missing, use the parent model.',
      "The judge-selection sentence names a model list, a family rule, and `readonly`; the replacement states the DSH call that carries the same intent.",
    ],
  ],
  "skills/swarm/SKILL.md": [
    [
      /4\. Pick the worker model from the `swarm workers` line in `~\/\.cursor\/rules\/pstack-models\.mdc`\. If the rule or that line is missing, use `grok-4\.7-xhigh-fast`\. For `auto` or `inherit-parent`, omit `model` so the workers run on the parent model\. If the Task tool rejects a slug, use the default and say so\. If it rejects the default, use the closest valid slug of the same family from its error message\. For a model race, name each arm's model up front\./,
      '4. Spawn every worker with `role: "swarm workers"` and `agent: "general"`. The tool resolves the route from `~/.dsh/pstack-models.md`; `inherit-parent` runs on the parent model. For a race, pass a different `roleIndex` per arm when the `swarm workers` line lists multiple routes.',
      "The paragraph is a Cursor model-selection algorithm; the DSH equivalent is one role argument.",
    ],
    [
      / Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the \*\*poteto-mode\*\* skill\./,
      "",
    ],
    [
      /Spawn all N workers in one message with `subagent_type: generalPurpose`, `environment: "cloud"`, `run_in_background: true`, and the step 4 model, left unset for `auto` or `inherit-parent`\. Use `environment: "local"` only when the worker needs access to something on the user's computer\.\n\nWhen a worker must start from a non-default pushed branch, pass `cloud_base_branch`\./,
      'Spawn all N workers in one message with `agent: "general"`, the slice or race arm, and `role: "swarm workers"`. After fetching the selected base, have each writer call DSH `create_worktree` with `from` set to that base.',
      "Two Cursor fields and their fallback rule span a paragraph and a following sentence; the DSH call shape replaces both.",
    ],
  ],
  "skills/interrogate/SKILL.md": [
    [
      /Launch all reviewers in a single message with the Task tool, one per entry on the `interrogate reviewers` line in `~\/\.cursor\/rules\/pstack-models\.mdc`, labeled Reviewer A, B, and so on to match the entry count\. If the rule or that line is missing, use the table defaults\./,
      'Launch reviewers with one `pstack_subagent` call using `agent: "general"` and `role: "interrogate reviewers"`. The tool starts one reviewer per entry on that line and labels each panel entry. If the file or line is missing, it starts one reviewer on the parent model.',
      "The paragraph names the Cursor tool and its model table; the replacement names the DSH tool and role.",
    ],
    [
      /\| Subagent \| Default model \|\n\|[-| ]+\|\n(?:\|[^\n]*\|\n)+\nEach reviewer gets[^\n]*\n\nIf the Task tool rejects[^\n]*/,
      'Each reviewer gets `agent: "general"` and `role: "interrogate reviewers"`, and is told not to edit files. The tool routes each panel entry independently; an `inherit-parent` entry runs on the parent model. If a configured reviewer route is unavailable, that entry falls back to the parent route with a diagnostic, and the remaining reviewers still start.',
      "The table exists only to carry Cursor model defaults; DSH reads the role file instead, so the table and its fallback paragraph go together.",
    ],
  ],
  "skills/poteto-mode/playbooks/shipping.md": [
    [
      /One verifier per PR, each a Cursor cloud agent, runs the change the way a user would with the matching control skill \(such as `control-ui` or `control-cli` from `cursor-team-kit`\), parent against head, and posts `PASS`, `PASS\+NOTES`, or `FAIL` on that PR\./,
      "One verifier per PR runs as a `pstack_subagent` on the `judgment and prose` route, different from the owner's route when the configuration allows it. After fetching the PR head, have it call DSH `create_worktree` with `from` set to that head. It uses the project verification skill, checks parent against head, and posts `PASS`, `PASS+NOTES`, or `FAIL` on that PR.",
      "The sentence assigns isolated cloud machines and Cursor-only control skills; DSH supplies child sessions, local worktrees, and project verification skills.",
    ],
  ],
  "skills/reflect/SKILL.md": [
    [
      /One message, three `Task` calls, `subagent_type: generalPurpose`, agent mode \(`readonly: false`\)\. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references, and readonly strips MCPs\./,
      'One message, three `pstack_subagent` calls with `agent: "general"`. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references.',
      "The sentence lists three Cursor call fields and explains a Cursor-only readonly constraint; the DSH call has neither.",
    ],
    [
      /Each reviewer and the synthesizer name a role line in the `pstack-models\.mdc` rule and a default\. Set `model` to that line's value, or to the default if the rule or the line is missing\. Leave `model` unset when the value is `auto` or `inherit-parent`\. If the Task tool rejects a slug, use the default and say so\. If it rejects the default, use the closest valid slug of the same family from its error message\./,
      "Each reviewer and the synthesizer pass a `role` to `pstack_subagent`: `reflect judgment, divergent, synthesizer` for the judgment and divergent reviewers and the synthesizer, `reflect tooling` for the tooling reviewer. The tool resolves routes from `~/.dsh/pstack-models.md`; a missing line inherits the parent model.",
      "The paragraph is a Cursor model-slug algorithm plus fallback ladder; DSH resolves one role per child.",
    ],
    [
      /\| Lens \| Role line \| Default `model` \| Prompt template \|\n\|[-| ]+\|\n(?:\|[^\n]*\|\n)+/,
      "| Lens | Role | Prompt template |\n|---|---|---|\n| Judgment | `reflect judgment, divergent, synthesizer` | `references/judgment-reviewer.md` |\n| Tooling | `reflect tooling` | `references/tooling-reviewer.md` |\n| Divergent | `reflect judgment, divergent, synthesizer` | `references/divergent-reviewer.md` |\n\n",
      "The table has a Cursor `Default model` column that has no DSH meaning.",
    ],
    [
      /One `Task` call, `subagent_type: generalPurpose`, `model` from the `reflect judgment, divergent, synthesizer` line \(default `claude-opus-5-5-xhigh`\), agent mode \(`readonly: false`\)\. It spot-verifies citations through MCP, and readonly strips MCPs\./,
      'One `pstack_subagent` call with `agent: "general"` and `role: "reflect judgment, divergent, synthesizer"`. It spot-verifies citations through MCP.',
      "The sentence names the Cursor tool, a model slug, and the readonly constraint; all three are Cursor-only.",
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
      "The section is a Cursor transcript layout plus a shell command that only works on that layout; a token swap cannot produce the DSH path or command.",
    ],
    [
      /- Substantive existing-skill edit \(a new section, a new pattern table, more than ~10 lines\): hand to Cursor's built-in `create-skill` skill and run its draft \/ test \/ iterate loop\./,
      "- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): use the authoring-a-skill playbook and run its draft / test / iterate loop.",
    ],
    [
      /- `tune description: <skill path>` \(the skill exists but didn't trigger when it should have\): hand to `create-skill` and run its description-optimization loop\./,
      "- `tune description: <skill path>` (the skill exists but did not trigger when it should have): revise its description, then replay three realistic prompts that should match it.",
    ],
    [
      /- `new skill via create-skill: <kebab-name>`: hand creation to `create-skill`\. Do not invent the shape ad hoc\./,
      "- `new skill via authoring-a-skill: <kebab-name>`: use the authoring-a-skill playbook. Do not invent the shape ad hoc.",
    ],
  ],
  "skills/recall/SKILL.md": [
    [
      /Transcripts live at `~\/\.cursor\/projects\/<slug>\/agent-transcripts\/<uuid>\/<uuid>\.jsonl`, where `<slug>` is the workspace path with the leading slash dropped and each "\/" turned into "-" \(so `\/Users\/you\/proj` becomes `Users-you-proj`\)\. Every line is one chat message\./,
      "Session logs live under `$DSH_HOME/sessions/<workspace-slug>/<session-id>/session.v*.jsonl*`. The slug is derived from the workspace path. Every line is one event; user and assistant text blocks are the chat messages.",
      "The sentence documents a Cursor directory layout and its slug algorithm; DSH uses a different root and file names.",
    ],
  ],
  "skills/automate-me/SKILL.md": [
    [
      /Cursor's built-in `create-skill` \(authoring\)/,
      "the authoring-a-skill playbook (authoring)",
    ],
    [
      /Use Cursor's built-in `create-skill` skill to author the skill\./,
      "Use the authoring-a-skill playbook to author the skill.",
    ],
    [
      /- Frontmatter formatting: follow `create-skill`'s YAML rules\. Keep `description` as one YAML scalar\. Quote it or use `description: >-` with indented continuation lines when punctuation or wrapping requires it\./,
      "- Frontmatter formatting: keep `description` as one YAML scalar. Quote it or use `description: >-` with indented continuation lines when punctuation or wrapping requires it.",
    ],
    [
      /\(not working conventions\): `create-skill` alone/,
      "(not working conventions): the authoring-a-skill playbook alone",
    ],
  ],
  "skills/poteto-help/SKILL.md": [
    [
      /The rule applies to new chats\./,
      "The rule applies to the next `pstack_subagent` call, including in this session.",
    ],
    [
      /The rule from `\/setup-pstack` applies to new chats\. Start one\./,
      "The rule from `/setup-pstack` applies to the next delegation, including in this session.",
    ],
    [
      /\[README\]\(\.\.\/\.\.\/README\.md\)/,
      "[README](../../../README.md)",
      "The generated skill is nested three directories below the package README.",
    ],
    [
      /Install with `\/add-plugin pstack` in chat, or from Customize in the sidebar\./,
      "Install the published package with `dsh plugin --profile web add dsh-pstack`, or use the DSH plugin manager.",
      "The source points to Cursor's plugin installation flow, which DSH does not use.",
    ],
    [
      /Parallel agents overwrote each other \| Give each agent its own worktree, or run them as cloud agents, which each get their own machine\./,
      "Parallel agents overwrote each other | Have each writer call DSH's `create_worktree` before editing; it creates a local Git worktree, not a separate machine.",
      "The original sentence claims each child runs on a separate machine; DSH children share the parent environment.",
    ],
    [
      /\| Build a page whose buttons wake a Grok Bot over a webhook \| \[`\/make-bot-ui`\]\(\.\.\/make-bot-ui\/SKILL\.md\) \|\n/,
      "",
      "The row routes to a skill that is deliberately not ported.",
    ],
    [
      /Link \[Cursor's skills docs\]\([^)]*\) when this comes up\./,
      "DSH skills are documented at `https://deepseek-harness.github.io/deepseek-harness/`.",
    ],
    [
      /This file maps questions to the skills and guide pages that hold the answers\. Those files own the details\. Read the file you route to before you quote it, and trust it when it disagrees with this map\. The links here point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https:\/\/github\.com\/cursor\/plugins\/blob\/main\/pstack\/` followed by its path\./,
      "This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https://github.com/l246804/dsh-pstack/tree/main/assets/skills/` followed by its path.",
      "The upstream link points to Cursor's package; DSH users need the published pstack repository path.",
    ],
    [
      /- `\/deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin\./,
      "- The pre-commit cleanup and the control skills are not shipped in DSH; use `/no-comments` and the project verification skill instead.",
    ],
    [
      /- `\/loop` and `\/create-skill` are Cursor built-ins\./,
      "- DSH has no loop command; use `schedule_create` and `create_goal` for long runs. Skill authoring is the authoring-a-skill playbook.",
    ],
    [
      /pstack is built for Cursor, and it also installs in Claude Code[^\n]*/,
      "pstack runs inside DeepSeek Harness as the `dsh-pstack` bundle. Every skill is user-invocable with `/name`, and `/poteto-mode` delegates through `pstack_subagent`.",
      "The paragraph is a Cursor/Claude Code install guide; neither product is DSH.",
    ],
    [
      /Other tools can read the skills, because they use the Agent Skills format\.[^\n]*/,
      "DSH reads the same Agent Skills format. Workflow skills delegate through `pstack_subagent`, so per-role routes come from `~/.dsh/pstack-models.md` instead of raw provider/model ids.",
      "The paragraph explains why pstack works in other tools and which parts break there; DSH is the only target now.",
    ],
    [
      /mention once that a Custom Mode keeps it on/,
      "mention once that there is no persistent mode in DSH",
    ],
    [
      /Without `\/poteto-mode`, a phrase such as "babysit this pr" can start Cursor's own skill for the same job instead\./,
      "DSH does not ship a competing babysit skill, so `/poteto-mode` owns these phrases.",
    ],
    [/Cursor's Plan Mode works alongside it\./, "DSH plan mode works alongside it."],
    [
      /\| The mode stopped applying after a few turns \| It was started with Enter\.[^\n]*\|/,
      "| The mode stopped applying after a few turns | DSH has no persistent mode. Start each new task with `/poteto-mode`. |",
    ],
  ],
  "skills/poteto-mode/playbooks/autonomous-run.md": [
    [/Cursor's `\/loop` command \(a built-in, not a pstack skill\)/, "the `schedule_create` tool"],
    [
      / Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section\./,
      " Prefer one goal with a checkable finish predicate over a bare interval.",
    ],
    [/use `AskQuestion`\./, "use `ask_user_question`."],
  ],
  "skills/poteto-mode/playbooks/multi-phase-plan.md": [
    [
      /\*\*Control skill\.\*\* Pick it by surface\. Browser, Electron, and web UIs use `control-ui` from `cursor-team-kit`\. CLIs and TUIs use `control-cli` from `cursor-team-kit`\./,
      "**Verification skill.** Pick it by surface. Browser, Electron, and web UIs and CLIs all use the project verification skill generated by `/create-verification-skill`.",
      "The sentence names two external skills by surface; DSH ships one verification-skill generator instead.",
    ],
    [
      /A surface with no control skill is a risk in Appendix C, and its live block still names how each lane drives it\./,
      "A surface with no verification skill is a risk in Appendix C, and its live block still names how each lane drives it.",
    ],
    [/\(default `grok-4\.7-xhigh-fast`\)/, "(the route from the `swarm workers` line)"],
    [
      /Run `\/deslop` before each commit and `\/no-comments` before review\./,
      "Run the pre-commit cleanup before each commit and `/no-comments` before review.",
    ],
    [
      /On the operator's go, arm the audit tick as `\/loop 1h` with the tick prompt below\./,
      "On the operator's go, arm the audit tick with `schedule_create 1h` and the tick prompt below.",
    ],
    [/pstack\/skills\//g, "assets/skills/"],
    [
      /Each live lane runs on its own cloud VM at the PR head\. Drive through `control-ui` or `control-cli` from `cursor-team-kit`\./,
      "Each live lane uses its own worktree at the PR head. After fetching the head, have the child call `create_worktree` with `from` set to that head. Drive through the project verification skill.",
      "The sentence combines the cloud-VM claim with two external skills; both are Cursor-only.",
    ],
  ],
  "skills/poteto-mode/playbooks/orchestrate.md": [
    [
      /- \*\*Worker \/ verifier\.\*\* Always `environment: "cloud"`[^\n]*/,
      "- **Worker / verifier.** A `pstack_subagent` that fetches the assigned base and calls DSH `create_worktree` with `from` set to that base before writing. The tool does not fetch refs for you and isolates the checkout, not the machine. Verification runs the project verification skill. Prefer fewer, broader workers. One writer per worktree or branch (principle-separate-before-serializing-shared-state). Run a unit's verifier on a different route from its worker.",
      'The bullet is built around the Cursor `environment: "cloud"` field and its local fallback; DSH has one worktree shape.',
    ],
    [
      /\(nesting works to depth 3, and a nested spawn has the full Task schema including `environment`\)/,
      "(the root session is depth 0; a track child at depth 1 passes `maxDepth: 2` to start workers at depth 2)",
    ],
    [
      / Probe read-only: the ledger, `units\.tsv`, `gh`, pushed branches, the cloud agent's status in the Cursor dashboard\. Transcript mtime is not liveness\./,
      " Probe read-only: the ledger, `units.tsv`, `gh`, pushed branches, and DSH child completion notices. When the profile mounts `@deepseek-ai/dsh-tool-subagent-control`, `list_agents` lists your direct child sessions; otherwise rely on the child id and completion notices. Session-log mtime is not liveness.",
    ],
    [
      /- After a Cursor restart: local agents are dead, cloud work is not\. Re-read the standing orders and `units\.tsv`, recompute the frontier, reattach cloud work by PR and branch rather than agent id,/,
      "- After a harness restart: re-read the standing orders and `units.tsv`, recompute the frontier, and verify each child's actual session or PR state before reattaching work by PR and branch rather than assuming it stopped or continued,",
    ],
    [
      /Every spawn and every resume carries the standing orders verbatim\./,
      "Every spawn carries the standing orders verbatim.",
    ],
    [
      /Agents are spawned, resumed, and drained only through the Task tool\./,
      "Agents are spawned through `pstack_subagent` and drained through completion notices.",
    ],
    [
      /Paste it verbatim into every spawn and every resume\. Directives decay across resumes,/,
      "Paste it verbatim into every spawn. Directives decay across fresh children,",
    ],
    [
      /Local spawns may reference the standing-orders file by store path\. Verbatim paste is for cloud spawns and every resume\./,
      "Local spawns may reference the standing-orders file by store path. Verbatim paste is for every fresh spawn.",
    ],
    [
      /its spawn budget with the cloud default and the local exception list/,
      "its spawn budget and the local exception list",
    ],
    [
      /Chain rebases run in cloud\. A local rebase at this scale takes the laptop down\./,
      "Chain rebases run in a dedicated worktree and are serialized. A local rebase at this scale still consumes the machine.",
    ],
    [
      /Work that exists only on one VM when that VM dies was never done\./,
      "Work that exists only in one child session when that session ends was never done.",
    ],
    [/Never resume-chain a brief\./, "Never reuse a brief across a respawn."],
    [
      /Never resume an agent to check on it\. A resume restarts an idle agent\./,
      "Never restart an agent to check on it. A fresh child starts without the old child's memory.",
    ],
  ],
  "skills/poteto-mode/playbooks/autopilot-full.md": [
    [
      /Each owner is a Cursor cloud agent that builds,/,
      "Each owner is a `pstack_subagent` that fetches its base and creates a separate local worktree with DSH's `create_worktree` tool before editing. The owner builds,",
    ],
    [
      /The code is ready only after the slop-strip \(the `deslop` skill from the `cursor-team-kit` plugin \(`\/deslop`\)\)/,
      "The code is ready only after the pre-commit cleanup (`/no-comments` over the diff, then a read for narration, dead compatibility paths, and unrelated edits)",
    ],
    [
      /through its control skill \(such as `control-ui` or `control-cli` from `cursor-team-kit`\) or a named driver/,
      "through its verification skill or a named driver",
    ],
    [/Assume the VM dies\./, "Assume the child session can end."],
  ],
  "skills/poteto-mode/playbooks/feature.md": [
    [
      /A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation\./,
      "A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation. When a delegate at depth 1 must fan out once, pass `maxDepth: 2`; DSH counts the root session as depth 0, so the nested worker is depth 2. Otherwise omit it and use the pstack-subagent cap.",
    ],
  ],
  "skills/architect/references/runner-prompt.md": [
    [
      /The working directory is a git worktree when available, otherwise a per-runner subdirectory under the sketch dir\./,
      "The working directory is a worktree created with DSH `create_worktree`, or a per-runner subdirectory under the sketch dir when the orchestrator chooses a directory.",
    ],
  ],
  "skills/poteto-mode/playbooks/hillclimb.md": [
    [
      /fan them to parallel subagents, each in its own worktree/,
      "fan them to parallel subagents, each in its own worktree created with DSH `create_worktree`",
    ],
  ],
  "skills/figure-it-out/SKILL.md": [
    [
      /give each worker its own worktree or branch/,
      "give each worker its own worktree created with DSH `create_worktree`, or its own branch",
    ],
  ],
  "skills/poteto-mode/playbooks/visual-parity.md": [
    [
      /Parallelize across worktrees, one owner per component/,
      "Parallelize across worktrees created with DSH `create_worktree`, one owner per component",
    ],
  ],
  "docs/guide/04-design.md": [
    [
      /each writing to its own worktree or directory/,
      "each writing to its own worktree created with DSH `create_worktree`, or its own directory",
    ],
  ],
  "skills/poteto-mode/playbooks/opening-a-pr.md": [
    [
      /Run `\/deslop` from `cursor-team-kit` over the diff before commit and `\/no-comments` before review\./,
      "Run the pre-commit cleanup over the diff before commit: `/no-comments`, then a read for narration, dead compatibility paths, and unrelated edits. Run `/no-comments` again before review.",
    ],
    [
      /runs `interrogate`, `\/deslop`, and `\/no-comments`/,
      "runs `interrogate`, the pre-commit cleanup, and `/no-comments`",
    ],
    [
      /Multiple `Task` calls on the same branch each get their own worktree, or `git fetch && git reset --hard origin\/<branch>` between them\./,
      "Multiple `pstack_subagent` calls on the same branch share that checkout; give each child its own `cwd` or have each child call DSH `create_worktree` first.",
    ],
  ],
  "skills/poteto-mode/playbooks/worktree-cleanup.md": [
    [
      /a hand-typed `myrepo-worktrees\/x` misses one that lives at `\.cursor\/worktrees\/myrepo\/x`/,
      "a guessed path can miss a worktree outside the current repository directory",
    ],
    [
      /, `~\/Library\/Application Support\/Cursor` \(`state\.vscdb\.backup`, and `snapshots\/roots\/<root>` where a `<root>` named for a folder you opened as a workspace balloons\)/,
      "",
      "The whole clause names Cursor editor cache directories that do not exist under DSH.",
    ],
  ],
  "skills/show-me-your-work/SKILL.md": [
    [
      /Read this run's transcript under the active workspace's `agent-transcripts\/` directory \(the system prompt names the path\)\. Don't glob across `~\/\.cursor\/projects\/\*\/`\. That reads unrelated private chats\./,
      "Read this run's session log under `$DSH_HOME/sessions/<workspace-slug>/<session-id>/`. The system prompt names the workspace. Do not scan other workspace directories.",
      "The sentence names a Cursor directory, its glob guard, and the reason for it; the DSH path is a different shape.",
    ],
    [/ Each stretch of them begins/, " Each stretch begins"],
  ],
  "skills/poteto-mode/playbooks/eval.md": [
    [
      /Read each candidate's local transcript under the active workspace's `agent-transcripts\/` directory \(the system prompt names this path\)\. Do not glob across `~\/\.cursor\/projects\/\*\/`\. That crosses workspace boundaries and reads private chats from unrelated projects\./,
      "Read each candidate's local session log under `$DSH_HOME/sessions/<workspace-slug>/<session-id>/`. Do not scan other workspace directories.",
      "The sentence encodes a Cursor path plus its cross-workspace guard; DSH names one session directory.",
    ],
  ],
  "skills/poteto-mode/playbooks/session-pickup.md": [
    [
      /A local transcript under the active workspace's `agent-transcripts\/` directory \(the system prompt names the path\. Do not glob across `~\/\.cursor\/projects\/\*\/`, that crosses workspace boundaries and reads private chats from unrelated projects\), a cloud-agent URL, or a pushed branch\./,
      "A local session log under `$DSH_HOME/sessions/<workspace-slug>/<session-id>/`. The system prompt names the workspace. Do not scan other workspace directories. A pushed branch, or a PR URL.",
      "The parenthetical documents a Cursor path and its cross-workspace guard; DSH has a single session directory and no cloud-agent URL.",
    ],
    [
      / Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section\./,
      "",
    ],
  ],
  "docs/guide/07-overnight.md": [
    [/an isolated worktree or cloud agent/, "an isolated Git worktree"],
    [
      /A scheduled or event-driven automation removes that step\./,
      "A scheduled follow-up can wake on a timer; event-driven issue intake still needs a separately configured event source.",
    ],
    [
      /A \[Cursor Project\]\(https:\/\/cursor\.com\/blog\/projects\) gives one coordinator agent a persistent thread\. The coordinator doesn't write code\. It directs subagents, which run in the cloud by default, so the work continues when your laptop is closed\./,
      "A long-running coordinator needs one long-lived session. The coordinator doesn't write code. It directs subagents, which run in the background, so the work continues while you are elsewhere.",
      "The paragraph describes a Cursor product feature (Projects and cloud execution); DSH has neither, so the same advice is stated without the product claim.",
    ],
    [/offline or restart Cursor\./g, "offline or restart the harness."],
    [
      /- `\/loop` is Cursor's built-in wake mechanism, not a pstack skill\./,
      "- `schedule_create` is a DSH tool, not a pstack skill.",
    ],
    [
      /Give `\/loop` a predicate that can pass or fail\./,
      "Give the wake prompt a predicate that can pass or fail.",
    ],
    [
      /pstack ships this as a dormant \[automation pack\]\(\.\.\/\.\.\/automations\/benny\/README\.md\) for Slack issue reports\. One automation triages each report\. The other reproduces confirmed bugs and may prepare a small draft fix\. Point an agent at its \[`FOR_AGENTS\.md`\]\(\.\.\/\.\.\/automations\/benny\/FOR_AGENTS\.md\) and name the target repository to set it up\./,
      "DSH's `schedule_create` tool can create a time-based follow-up when that tool is available. It does not subscribe to Slack issue events or run a triage/reproduction pipeline; configure an event source separately if you need event-triggered intake.",
      "The source links to an automation pack that is absent from the generated package; describe only the DSH scheduling capability and its boundary.",
    ],
    [
      /- Give each body of work its own Project, such as a feature, a migration, a perf push, or a tech-debt cleanup\. Several can run side by side\./,
      "- Give each body of work its own worktree and standing-orders entry, such as a feature, a migration, a perf push, or a tech-debt cleanup. Several can run side by side.",
    ],
    [
      /- Drag related chats into the Project, finished ones included\. They become context for every agent in it\./,
      "- Keep related session logs and decision records in the standing orders. They become context for every agent in the program.",
    ],
    [
      /One prompt can carry a whole Project, from research through execution:/,
      "One prompt can carry a whole program, from research through execution:",
    ],
  ],
  "docs/guide/README.md": [
    [
      /and Projects and automations that scale past one agent\./,
      "and scheduled follow-ups that scale past one agent.",
    ],
  ],
  "docs/guide/09-make-it-yours.md": [
    [/## Build a bot UI with `\/make-bot-ui`/, "## One skill is deliberately not ported"],
    [
      /One situational skill is for Grok Bot users\. \[`\/make-bot-ui`\]\(\.\.\/\.\.\/skills\/make-bot-ui\/SKILL\.md\) builds a small page whose buttons wake a bot over a webhook routine\. For example, you could swipe through a review queue and have each swipe ask the bot to act on that item\. A server on your machine holds the webhook's sender key, so the key never reaches the browser or the chat\. The skill also covers exposing the page on Tailscale\./,
      "`/make-bot-ui` is not included because its webhook-triggered automation flow is not provided by this package.",
      "The paragraph is a product walkthrough of a skill that is deliberately not ported.",
    ],
    [/through Cursor's built-in `create-skill` flow/, "through the authoring-a-skill playbook"],
    [
      /routes through Cursor's built-in `create-skill`/,
      "routes through the authoring-a-skill playbook",
    ],
  ],
  "docs/guide/02-poteto-mode.md": [
    [
      /## Give parallel work its own machine[\s\S]*?\n## Leave it running/,
      `## Give parallel work its own worktree

DSH child sessions share the parent's machine and use the parent working directory unless you select another \`cwd\`. A local worktree isolates files and branches, not the machine or runtime.

The DSH worktree plugin is part of the supported pstack install. Ask each writer to fetch its selected base and call \`create_worktree\` with \`from\` set to that base before editing. It creates a local Git worktree and switches that session to the new checkout; it does not fetch refs for you. If a child needs a prepared checkout instead, pass its path as \`cwd\` to \`pstack_subagent\`.

\`\`\`text
/poteto-mode new task. call create_worktree with from=<base> before editing.
\`\`\`

Each task in its own branch and worktree means no agent stomps another's files. Worktrees cost disk and machine resources, so a laptop runs only a handful at once. The [Opening a PR playbook](../../skills/poteto-mode/playbooks/opening-a-pr.md) works from a worktree.

Worktrees accumulate. When disk gets tight, ask:

\`\`\`text
/poteto-mode what's eating my disk? prune the worktrees that are safe to prune.
\`\`\`

The [Worktree cleanup playbook](../../skills/poteto-mode/playbooks/worktree-cleanup.md) classifies every worktree by merge state, uncommitted work, and which chats still touch it. It deletes only what that evidence clears and pauses for your call on anything holding uncommitted work.

## Leave it running`,
      "The source describes isolated cloud machines; DSH worktrees isolate the checkout only, and DSH child sessions share the parent machine.",
    ],
  ],
  "docs/guide/10-recipes-and-pitfalls.md": [
    [
      /Run them as cloud agents, or say "own worktree per attempt"/,
      'Have each writer call DSH\'s `create_worktree` before editing, or say "own worktree per attempt"',
    ],
  ],
  "docs/guide/01-setup.md": [
    [
      /After setup, start a new chat\. The model rule applies to new sessions\./,
      "After setup, the model rule applies to the next delegation, including in this session.",
    ],
    [
      /## Install the plugin\n[\s\S]*?\n## Pick your models/,
      `## Install the plugin

Install the bundle into your DSH profile:

\`\`\`bash
dsh plugin --profile web add dsh-pstack
\`\`\`

Restart \`dsh web\` after install. The bundle mounts the pstack skill provider and the \`pstack_subagent\` tool. It also mounts the DSH worktree plugin when the official bundle is not already enabled.

## Pick your models`,
      "Install the published package by name; users do not need to clone or carry its repository.",
    ],
    [
      /\[`\/setup-pstack`\]\(\.\.\/\.\.\/skills\/setup-pstack\/SKILL\.md\) detects the models you have access to, asks for a reasoning budget,/,
      "[`/setup-pstack`](../../skills/setup-pstack/SKILL.md) uses `list_subagent_models` when the profile exposes it; otherwise it asks for the provider/model pairs you can use. It asks for a reasoning budget,",
    ],
    [
      /A role with no line in the rule keeps the skill's default\./,
      "A role with no line in the rule inherits the parent chat route.",
    ],
    [
      /To keep `\/poteto-mode` on for the whole chat,[^\n]*\n\n/,
      "DSH has no persistent custom mode. Start each new task with `/poteto-mode`, and its instructions apply to that turn.\n\n",
      "The paragraph explains how to keep a Cursor Custom Mode active; DSH has no such mode, so the advice is replaced by the direct statement.",
    ],
    [
      /The defaults run at `xhigh` reasoning,[^\n]*/,
      "The defaults inherit the parent chat route, so they cost nothing extra beyond the children themselves. A real route written as `<provider>/<model> [effort]` pins that role; `unlimited`, `large`, `medium`, and `small` set the effort token on those routes.",
      "The paragraph explains Cursor's per-model reasoning tiers and named defaults.",
    ],
    [
      /You might be wondering what happens if you use Auto\.[^\n]*/,
      "`inherit-parent` means the child runs on the parent chat model. Both `inherit-parent` and `auto` are accepted aliases, and neither is a model slug. For a panel role the value is a comma-separated list, and one subagent runs per entry, so the list length sets the panel size. Setup also configures `swarm workers`, the default route for every `/swarm` worker unless a race names a route for each arm.",
      "The paragraph explains Cursor Auto and model-slug semantics; DSH routes are roles, not slugs.",
    ],
  ],
};

export function rewriteSkill(relativePath: string, text: string): string {
  // Surgical rules read upstream wording; common rules then sweep whatever the
  // block replacement left in place.
  let result = text;
  for (const step of FILE_REWRITES[relativePath] ?? []) {
    assertRewriteScope(relativePath, step);
    result = result.replace(step[0], step[1]);
  }
  result = rewriteCommon(result);
  const leftovers = findForbiddenTerms(result);
  if (leftovers.length > 0) {
    const first = leftovers[0]!;
    const line = result.slice(0, first.index).split("\n").length;
    throw new Error(
      `${relativePath}:${line}: adaptation left "${first.match}" behind ` +
        `(${leftovers.length} offending term${leftovers.length === 1 ? "" : "s"}); ` +
        "add or extend a rule in scripts/adapt.ts",
    );
  }
  return result;
}

export interface ForbiddenMatch {
  readonly rule: string;
  readonly match: string;
  readonly index: number;
}

/**
 * Locate every surviving forbidden term, with the rule that should have caught
 * it. Reporting all of them at once makes a failed sync actionable: one pass
 * shows every gap in the rule table.
 */
export function findForbiddenTerms(text: string): ForbiddenMatch[] {
  const matches: ForbiddenMatch[] = [];
  for (const rule of RULES) {
    if (!rule.forbid) continue;
    const pattern = new RegExp(
      rule.forbid.source,
      rule.forbid.flags.includes("g") ? rule.forbid.flags : `${rule.forbid.flags}g`,
    );
    for (const found of text.matchAll(pattern)) {
      matches.push({ rule: rule.id, match: found[0], index: found.index ?? 0 });
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

export const DSH_ADAPTER_NOTE =
  "> DSH port of pstack. Workflow delegation uses `pstack_subagent`; host-specific tool and preset behavior is documented in `../../docs/harness/dsh.md`.";

/**
 * Render one markdown table from the rules that declare a `doc` row for it.
 * The doc is a projection of the rule table, so a rule cannot exist without its
 * documentation, and the sync fails if the two disagree.
 */
export function renderDocTable(table: RuleDoc["table"], header: string): string {
  const rows = termRules()
    .map((rule) => rule.doc)
    .filter((doc): doc is RuleDoc => doc !== undefined && doc.table === table);
  return [
    `## ${header}`,
    "",
    "| Cursor | DSH |",
    "| --- | --- |",
    ...rows.map((doc) => `| ${doc.cursor} | ${doc.dsh} |`),
  ].join("\n");
}

export const DSH_HARNESS_DOC = `# pstack in DeepSeek Harness

This is the DSH adapter for pstack. It is the single source of truth for how a Cursor-shaped skill maps onto DSH. Read it once per session when a skill asks for a Cursor feature that DSH does not have.

${renderDocTable("tools", "Tools")}

${renderDocTable("paths", "Paths")}

${renderDocTable("models", "Models")}

## Skill visibility

The provider preserves the upstream \`disable-model-invocation\` and \`user-invocable\` flags. A skill with model invocation disabled remains available as a user slash command but is not callable through DSH's model-facing \`skill\` tool. This package does not silently change that policy. The provider exposes each skill's file path and resource base, but opening a referenced file still depends on the active file tools and path policy; do not assume a hidden skill can be invoked by name.

## Role configuration

\`/setup-pstack\` writes \`~/.dsh/pstack-models.md\`. One role per line:

\`\`\`text
# pstack model configuration. One line per role.
# Value is \`inherit-parent\` or \`<provider>/<model>\` with an optional effort token.
feature, refactoring: deepseek-official/deepseek-reasoner high
judgment and prose: inherit-parent
\`\`\`

A missing file or line means every role inherits the parent's route. The tool validates configured provider, model, and effort before starting a child. It also enforces the optional \`allowedModels\` list on the \`pstack-subagent\` row; a role outside that list is rejected before the child starts. The native DSH session \`allowedModels\` policy is not read by this adapter, so set the pstack list when the profile restricts models. The three panel roles expand to one child per entry because their skills define panel behavior; use \`roleIndex\` to select one route from another list-valued role. The shipped defaults are in \`../pstack-models.example.md\`.

${renderDocTable("host", "Cursor-only features")}

## DSH presets and tools

\`agentPreset\` is a DSH activation option that chooses the child's preset (its tools, skills, and plugins); omitting it uses the configured default, or inherits the parent preset when none is set. It is separate from pstack's \`agent\` argument, which selects only a prompt preamble. The model can select a preset only when the \`pstack-subagent\` row sets \`allowedAgentPresets\`; otherwise the parameter is absent. A configured \`agentPreset\` value sets the default. The \`cordis\` preset includes plugin-development skills and inspection/management tools such as \`cordis_inspect_list\`, \`cordis_inspect_query\`, and \`plugin_manager\`; add it to \`allowedAgentPresets\` only for DSH plugin authoring.

pstack declares the DSH worktree plugin as a peer dependency. The bundle mounts \`pstack-worktree\` and \`pstack-tool-worktree\`; when the official \`@deepseek-ai/dsh-experimental-tool-worktree\` bundle is already active, those rows stay disabled and the official rows serve the tool. \`create_worktree\` creates a local Git worktree, switches the calling session's working directory, and reports the checkout path and branch metadata; it does not fetch refs, is not a VM, does not merge changes, and does not clean up. pstack assumes the tool is enabled for parallel writers. File-access policy still controls which paths can be written.

## Subagent completion

\`pstack_subagent\` returns child ids immediately; final answers arrive later as completion notices. Pass \`cwd\` to select an existing working directory and \`agentPreset\` only when the \`pstack-subagent\` row allows presets. The \`pstack-subagent\` row sets \`maxDepth: 2\`; the model may request a lower value, but the tool clamps it to that cap. DSH counts the root session at depth 0, so a depth-1 coordinator can start depth-2 workers. Use a larger configured cap only when the actual tree has that many descendant levels.
`;

export const DSH_SETUP_SKILL = `---
name: setup-pstack
description: "Configure which routes pstack uses per role and at what reasoning budget. Writes ~/.dsh/pstack-models.md, the role file every pstack skill reads. Use for /setup-pstack, \\"configure pstack models\\", \\"pstack budget\\", or changing pstack's model choices."
---

# Setup pstack

Write \`~/.dsh/pstack-models.md\`, the role file that sets pstack's route per role.

## Steps

### 1. Detect available routes

If the active profile exposes \`list_subagent_models\`, call it with no arguments to list registered LLM providers, then call it with each provider id to list that provider's models and their reasoning efforts. That is the dependable source when it is available. Never write a provider or model you have not confirmed is available. The value \`inherit-parent\` is always valid and means the child runs on the parent chat's route.

If \`list_subagent_models\` is unavailable, ask the user for the provider/model pairs they can use, or fall back to \`inherit-parent\` for every role and say so.

### 2. Load current state

If \`~/.dsh/pstack-models.md\` exists, read its \`# budget\` line and role values and treat them as current choices. Otherwise start from the defaults in step 5. A role not in step 5 is retired; drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Use \`ask_user_question\` with these four labels. Name the current budget when the file records one. With no file, say that \`large\` matches the skill defaults.

- \`unlimited — max reasoning\`
- \`large — xhigh reasoning\`
- \`medium — high reasoning\`
- \`small — medium reasoning\`

**(b) Apply it.** Build the working table from the defaults. On a re-run, keep any role you changed by family, list, or the \`inherit-parent\` alias. \`unlimited\`, \`large\`, \`medium\`, and \`small\` set the effort token of every real route, panel entries included, to \`max\`, \`xhigh\`, \`high\`, or \`medium\`. The target effort ladder is \`max\` > \`xhigh\` > \`high\` > \`medium\` > \`low\` > \`minimal\` > \`off\`. If a detected model does not support its target effort, choose the highest supported effort at or below the target. For example, when \`xhigh\` is unavailable but \`high\` is supported, use \`high\`. If no supported effort meets the target, mark the role as needing a choice. \`inherit-parent\` does not change.

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

Tell the user the file was written and that it applies to the next \`pstack_subagent\` call, including in this session. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a \`verify-*\` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke \`/create-verification-skill\`. On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill. If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /create-formal-verification-skill." On yes, invoke \`/create-formal-verification-skill\`. On no, move on without pushing.
`;

export const EXCLUDED_SKILLS = new Set(["make-bot-ui"]);
