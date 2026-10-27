/**
 * This host's adapter document, and the gate that keeps it complete.
 *
 * The shipped tree is upstream pstack text. A skill says `Task`, `readonly: true`, and
 * `~/.cursor/rules/pstack-models.mdc`, because that is what upstream says. The
 * translation lives in one hand-written file, `pstack/docs/harness/dsh.md`, which the
 * generator copies into the tree unchanged and is the only place a DSH difference is
 * written down.
 *
 * That shape is upstream's own: its Claude Code tree keeps pstack phrasing verbatim and
 * ships one adapter file, `pstack/docs/harness/claude-code.md`. What this module adds is
 * the part a hand-written document cannot do for itself. It derives, from the text that
 * actually ships, which names the document has to answer for. Add a skill that says
 * `/loop` and the build fails until the document has a `/loop` row.
 *
 * A hand-maintained list of differences cannot do that, and this repository has the
 * receipts. Two successive ledgers (`capabilities.ts` with generated tables, then
 * `docs/upstream-divergences.md` with counts and member anchors) both drifted from the
 * tree while every check stayed green, because each one checked what someone had written
 * down instead of what the skills actually say. Deriving the requirement from usage
 * removes the thing that could drift.
 *
 * The match is a *table row*, not a substring of the document. A substring check passes
 * on an incidental mention in a paragraph, which is exactly how a row gets deleted while
 * the gate stays green; that was measured here before this rule was written.
 */

/** The document, as a source file in this repository and as a shipped asset. */
export const ADAPTER_SOURCE = "docs/harness/dsh.md";
export const ADAPTER_ASSET = "docs/harness/dsh.md";

/**
 * A name upstream pstack text uses that this host spells differently.
 *
 * `key` names the concept in a failure message. `rowToken` is the text that has to
 * appear inside a table row for the concept to count as answered. The two are separate
 * so a row may write `` `subagent_type: "generalPurpose"` `` without failing for its
 * punctuation, which makes this a check on coverage rather than on formatting.
 */
export interface AdapterTerm {
  readonly key: string;
  /** What finds the concept in shipped prose. */
  readonly pattern: RegExp;
  /** The text a table row must contain once the document has answered for the concept. */
  readonly rowToken: string;
  /** What a reader loses by not finding a row, said in one clause. */
  readonly cost: string;
}

export const ADAPTER_TERMS: readonly AdapterTerm[] = [
  {
    key: "Task",
    pattern: /`Task`|\bTask (?:tool|subagent|call)\b|\bTask subagents?\b/,
    // Backticks, not the bare word: a models row that says "if the Task tool rejects a
    // slug" mentions Task without answering what a spawn becomes, and accepting it
    // would let the real row be deleted while the gate stayed green.
    rowToken: "`Task`",
    cost: "a spawn step becomes an unnamed tool call",
  },
  {
    key: "subagent_type",
    pattern: /subagent_type/,
    rowToken: "subagent_type",
    cost: "the child's kind is passed as a field that does not exist",
  },
  {
    key: "generalPurpose",
    pattern: /generalPurpose/,
    rowToken: "generalPurpose",
    cost: "a plain child is requested by a Cursor enum value",
  },
  {
    key: "poteto-agent",
    pattern: /poteto-agent/,
    rowToken: "poteto-agent",
    cost: "the delegate kind the playbooks spawn is unnamed",
  },
  {
    key: "comment-sicko",
    pattern: /comment-sicko/,
    rowToken: "comment-sicko",
    cost: "the read-only reviewer has no carried kind",
  },
  {
    key: "readonly",
    pattern: /readonly: (?:true|false)|`readonly`/,
    rowToken: "readonly",
    cost: "a reader assumes a no-write child is enforced rather than instructed",
  },
  {
    key: "run_in_background",
    pattern: /run_in_background/,
    rowToken: "run_in_background",
    cost: "a caller passes a flag no schema accepts",
  },
  {
    key: "environment",
    pattern: /environment: "(?:cloud|local)"/,
    rowToken: "environment",
    cost: "the isolation field is passed through",
  },
  {
    key: "cloud_base_branch",
    pattern: /cloud_base_branch/,
    rowToken: "cloud_base_branch",
    cost: "a branch is passed as a field that does not exist",
  },
  {
    key: "file_attachments",
    pattern: /file_attachments/,
    rowToken: "file_attachments",
    cost: "attachments are requested as a parameter",
  },
  {
    key: "resume",
    pattern: /`resume`/,
    // Backticks again: the agent-store row contains the word "resumes" in prose, and a
    // bare substring match would let the spawn-behaviour row be deleted undetected.
    rowToken: "`resume`",
    cost: "a caller polls or resumes something this host never resumes",
  },
  {
    key: "AskQuestion",
    pattern: /AskQuestion/,
    rowToken: "AskQuestion",
    cost: "the question tool is called by a name no schema has",
  },
  {
    key: "todolist",
    pattern: /\btodo ?list\b/i,
    rowToken: "todolist",
    cost: "the step list is opened with the wrong tool",
  },
  {
    key: "inherit-parent",
    pattern: /inherit-parent/,
    rowToken: "inherit-parent",
    cost: "a role value is read as a model id",
  },
  {
    key: "pstack-models.mdc",
    pattern: /pstack-models\.mdc/,
    rowToken: "pstack-models.mdc",
    cost: "a reader writes a rules file nothing reads",
  },
  {
    key: "model slugs",
    pattern: /\bclaude-[a-z]+-\d|\bgrok-\d|\bgpt-\d/,
    rowToken: "model slug",
    cost: "a hardcoded slug is passed where a role belongs",
  },
  {
    key: ".cursor/skills",
    pattern: /\.cursor\/skills/,
    rowToken: ".cursor/skills",
    cost: "a generated project skill is written where nothing scans",
  },
  {
    key: ".cursor/plugins",
    pattern: /\.cursor\/plugins|\.cursor-plugin/,
    rowToken: ".cursor/plugins",
    cost: "a resource is looked up in another host's install tree",
  },
  {
    key: ".cursor/rules",
    pattern: /\.cursor\/rules|always-applied rule/,
    rowToken: ".cursor/rules",
    cost: "a rule file is written for a loader that is not here",
  },
  {
    key: "agent-transcripts",
    pattern: /agent-transcripts|\.cursor\/projects/,
    rowToken: "agent-transcripts",
    cost: "a session is read from a directory that does not exist",
  },
  {
    key: "agent store",
    pattern: /agent store/i,
    rowToken: "agent store",
    cost: "working files land outside the repository",
  },
  {
    key: "/loop",
    pattern: /`\/loop`|\/loop \d/,
    rowToken: "/loop",
    cost: "a cadence is armed with a command this host does not have",
  },
  {
    key: "Custom Mode",
    pattern: /Custom Mode/,
    rowToken: "Custom Mode",
    cost: "a reader believes a skill stays in context",
  },
  {
    key: "/visualize",
    pattern: /`\/visualize`/,
    rowToken: "/visualize",
    cost: "a figure is promised from a renderer that is not here",
  },
  {
    key: "cursor-team-kit",
    pattern: /cursor-team-kit/,
    rowToken: "cursor-team-kit",
    cost: "a step waits for a plugin that cannot be installed",
  },
  {
    key: "control-ui",
    pattern: /\bcontrol-ui\b|\bcontrol-cli\b/,
    rowToken: "control-ui",
    cost: "a surface check is claimed with no driver",
  },
  {
    key: "deslop",
    pattern: /`\/deslop`|\bdeslop\b/,
    rowToken: "deslop",
    cost: "a commit gate is skipped without saying so",
  },
  {
    key: "create-skill",
    pattern: /`create-skill`/,
    rowToken: "create-skill",
    cost: "skill authoring waits for a built-in that does not exist",
  },
  {
    key: "Bugbot",
    pattern: /Bugbot/,
    rowToken: "Bugbot",
    cost: "a review wait never ends",
  },
  {
    key: "Automations",
    // Upstream writes this four ways: "Bugbot or Automations", "automation pack",
    // "scheduled automation", "Projects and automations". The bare lowercase word is not
    // matched, because it is also ordinary English ("browser automation"), and a row
    // demanded by a sentence that is not about Cursor teaches a reader to ignore the gate.
    pattern: /\bAutomations?\b|automation pack|scheduled (?:or event-driven )?automation/,
    rowToken: "Automations",
    cost: "a routine is created against an ingress that is absent",
  },
  {
    key: "cloud agent",
    pattern: /[Cc]loud [Aa]gent|[Cc]loud subagent|`\/in-cloud`/,
    rowToken: "cloud agent",
    cost: "a run waits for a machine that is never provisioned",
  },
  {
    key: "built-in PR tool",
    pattern: /built-in PR tool/,
    rowToken: "built-in PR tool",
    cost: "the PR step calls a tool that is not here",
  },
  {
    key: "bun",
    pattern: /\bbun\b/,
    rowToken: "`bun`",
    cost: "a script is run through a runtime the profile does not have",
  },
  {
    key: "scripts/log.sh",
    pattern: /scripts\/log\.sh/,
    rowToken: "scripts/log.sh",
    cost: "the decision-log helper is invoked as a shell script",
  },
  {
    key: "scripts/worktree-audit.sh",
    pattern: /scripts\/worktree-audit\.sh/,
    rowToken: "scripts/worktree-audit.sh",
    cost: "the worktree audit is invoked as a shell script",
  },
  {
    key: "check-plan.mjs",
    pattern: /check-plan\.mjs/,
    rowToken: "check-plan.mjs",
    cost: "the plan check is run with a path and an interpreter",
  },
  {
    key: "MCP",
    pattern: /\bMCP\b/,
    rowToken: "MCP",
    cost: "a toolset is narrowed on the assumption that MCP is a directory",
  },
  {
    key: "Projects",
    pattern: /\bProjects\b/,
    rowToken: "Projects",
    cost: "a reader looks for a container this host does not have",
  },
  {
    key: "cross-skill route",
    pattern: /the \*\*[a-z][a-z-]+\*\* skill|`\/[a-z][a-z-]+`/,
    rowToken: "absolute resource path",
    cost: "a routed skill is never actually read",
  },
];

/**
 * The line injected under the H1 of every skill that names one of these.
 *
 * Upstream's Claude Code tree injects a two-sentence pointer into 23 of its 56 skills
 * and leaves the rest alone. This is the same line, aimed at this host, and it is the
 * whole mechanism by which a reader learns the mapping exists: without it a skill body
 * is read as literal instruction and `Task` is called as a tool.
 */
export const ADAPTER_POINTER =
  "> DSH port of pstack. The skills keep upstream wording. In DeepSeek Harness, read [the DSH adapter](../../docs/harness/dsh.md) once per session and map each Cursor name with its tables. If a Cursor field has no row there, drop it and say so; never pass a field this host's schema rejects.";

/** Keys of every term `text` uses. */
export function termsUsedIn(text: string): readonly string[] {
  return ADAPTER_TERMS.filter((term) => term.pattern.test(text)).map((term) => term.key);
}

/** The terms the shipped prose requires a row for, in table order. */
export function requiredAdapterTerms(texts: readonly string[]): readonly AdapterTerm[] {
  const used = new Set<string>();
  for (const text of texts) for (const key of termsUsedIn(text)) used.add(key);
  return ADAPTER_TERMS.filter((term) => used.has(term.key));
}

/** The row names the document must carry, for a failure message or a test. */
export function requiredAdapterRows(texts: readonly string[]): readonly string[] {
  return requiredAdapterTerms(texts).map((term) => term.key);
}

/** Lines of a Markdown table body, excluding the header separator. */
export function tableRows(document: string): readonly string[] {
  return document
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line) && line.trim() !== "|");
}

/**
 * Assert the document answers every name the shipped prose uses.
 *
 * The message names the term's cost as well as the term, because "missing row for
 * `readonly`" reads like a formatting nit and "a no-write child is enforced rather than
 * instructed" reads like the defect it is.
 */
export function checkAdapterDoc(document: string, texts: readonly string[]): readonly string[] {
  const problems: string[] = [];
  const required = requiredAdapterTerms(texts);

  if (required.length === 0) {
    problems.push(
      `${ADAPTER_SOURCE}: no shipped prose uses a Cursor name, so this gate has nothing to enforce and its term table has gone stale`,
    );
    return problems;
  }

  const rows = tableRows(document);
  for (const term of required) {
    if (rows.some((row) => row.includes(term.rowToken))) continue;
    problems.push(
      `${ADAPTER_SOURCE}: must carry a \`${term.key}\` table row; shipped prose uses it, and with no row ${term.cost}`,
    );
  }

  // The document has to state the rule that makes it a mapping and not a summary: a
  // reader who does not know what to do with an unmapped name will invent one.
  if (!/drop it and say so/i.test(document)) {
    problems.push(
      `${ADAPTER_SOURCE}: must state what a reader does with a Cursor name that has no row, or the absent case silently becomes a guess`,
    );
  }

  return problems;
}
