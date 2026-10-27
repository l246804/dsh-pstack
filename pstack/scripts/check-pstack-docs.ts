/**
 * `check-pstack-docs`: prove the generated tree still matches the prose that describes it.
 *
 * This is the port of upstream's `scripts/check-pstack-docs.mjs`, adapted to this package.
 * Upstream's version lists the tree's skills, playbooks, and agents, then checks what
 * `README.md` and `docs/guide` say about them: slash commands, relative links
 * and anchors, counts, and model names. The same questions are asked here, with three
 * changes this host forces.
 *
 * **Model names are checked against the role manifest, not against `setup-pstack`.** Upstream
 * greps the skill for a hardcoded slug. This package cannot know which routes a deployment
 * serves, so it ships `inherit-parent` and no slug; a shipped page that names `gpt-*` or
 * `claude-*` is the defect, not a missing row in the skill.
 *
 * **External commands are the host's, not Cursor's.** Upstream's allowlist names Cursor and
 * Claude Code built-ins. Here the list is what DeepSeek Harness actually provides, so a page
 * that tells a reader to run something else fails.
 *
 * **Counts are derived from the generated tree.** A number written down in prose is checked
 * against the directories it counts, which is what makes the README's playbook count a claim
 * rather than a memory.
 *
 * Exits 1 when the docs drift from the tree.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ROOT, PORT_DIRECTORY, OVERLAY_DIRECTORY } from "./root.ts";
import { overlayProblems } from "./overlay.ts";
import { SKILL_ROOTS, VENDORED_SKILLS_ROOT, AUTHORED_SKILLS_ROOT } from "../../src/paths.ts";
import { ROLE_MANIFEST } from "../../src/role-manifest.ts";
import { WORKTREE_ROWS, worktreeRowGuardExpression } from "./worktree-mount.ts";

const PORT = join(ROOT, PORT_DIRECTORY);
const OVERLAY = join(ROOT, OVERLAY_DIRECTORY);
const UPSTREAM = join(ROOT, "upstream/cursor-plugins/pstack");

/**
 * Commands DeepSeek Harness or this package's tool surface provides.
 *
 * Nothing here can verify a harness command, so a name is added only when the harness
 * documents it. A skill of this package is not listed here: the inventory already names
 * every one, so listing one twice would make the gate accept a skill after it was deleted.
 */
const HOST_COMMANDS: ReadonlySet<string> = new Set(["help", "skill"]);

/**
 * Slash commands a page may name that belong to the upstream host.
 *
 * The tree keeps upstream wording, and the adapter document says what each becomes here.
 * `make-bot-ui` is in this group: its skill is not carried, and the guide page that
 * describes it links to the upstream file, which the generator has already repointed.
 */
const UPSTREAM_ONLY: ReadonlySet<string> = new Set([
  "add-plugin",
  "autopilot",
  "create-skill",
  "in-cloud",
  "loop",
  "make-bot-ui",
  "plugin",
]);

/** Skills shipped by another plugin that an upstream page recommends by name. */
const THIRD_PARTY_PLUGINS: ReadonlySet<string> = new Set(["deslop"]);

const SMALL = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(
  " ",
);
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
// "The twenty-three playbooks" claims the whole set. "Three playbooks scale it up" names a
// subset, so it is not checked.
const CLAIM = /\b(?:(all|has|of|ships|the|with) )?(\d+|[a-z]+(?:-[a-z]+)?) (short )?(skills|principles|playbooks|agents)\b/gi;
const SLASH = /(?<=^|[\s`(|"'>])\/(?:pstack:)?([a-z][a-z0-9-]*)(?![\w/<-])/gm;
const LINK = /\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;
const AGENT = /subagent_type: "([^"]+)"/g;
const MODEL_ID = /\b(?:claude-[a-z]+|grok|gpt)-\d(?:[\w.-]*\w)?/g;

function names(directory: string, keep: (path: string) => boolean): readonly string[] {
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => keep(join(directory, name)))
        .sort()
    : [];
}

const isSkill = (path: string): boolean => existsSync(join(path, "SKILL.md"));
const isMarkdown = (path: string): boolean => path.endsWith(".md") && statSync(path).isFile();

/** The tree's inventory, which is what every claim is checked against. */
export interface TreeInventory {
  readonly skills: readonly string[];
  readonly principles: readonly string[];
  readonly commands: readonly string[];
  readonly playbooks: readonly string[];
  readonly agents: readonly string[];
  readonly thirdParty: readonly string[];
}

export function inventory(): TreeInventory {
  const skills = names(join(PORT, "skills"), isSkill);
  const principles = skills.filter((name) => name.startsWith("principle-"));
  const commands = skills.filter((name) => !name.startsWith("principle-"));
  const playbooks = names(join(PORT, "skills", "poteto-mode", "playbooks"), isMarkdown).map((name) =>
    name.slice(0, -3),
  );
  const agents = names(join(PORT, "agents"), isMarkdown).map((name) => name.slice(0, -3));
  // Vendored roots hold one directory per source, each of which holds the skills, so the
  // skill names are one level deeper. Counting the source directories would report the
  // number of repositories rather than the number of skills.
  const thirdParty = [
    ...names(VENDORED_SKILLS_ROOT, (path) => statSync(path).isDirectory()).flatMap((source) =>
      names(join(VENDORED_SKILLS_ROOT, source), isSkill),
    ),
    ...names(AUTHORED_SKILLS_ROOT, isSkill),
  ];
  return { skills, principles, commands, playbooks, agents, thirdParty };
}

/** One problem, with the file and line a reader would find it on. */
export interface DocProblem {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

function toNumber(word: string): number | undefined {
  if (/^\d+$/.test(word)) return Number(word);
  const [tens, unit] = word.toLowerCase().split("-");
  if (unit === undefined && SMALL.includes(tens ?? "")) return SMALL.indexOf(tens ?? "");
  const ones = unit === undefined ? 0 : SMALL.indexOf(unit);
  return TENS.indexOf(tens ?? "") > 1 && ones >= 0 && ones < 10
    ? TENS.indexOf(tens ?? "") * 10 + ones
    : undefined;
}

/** Heading anchors of one Markdown file, in the shape a link would use. */
export function anchors(path: string): ReadonlySet<string> {
  const seen = new Map<string, number>();
  const found = new Set<string>();
  let fenced = false;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (heading === null) continue;
    const plain = (heading[1] ?? "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*]/g, "");
    const slug = plain.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const repeat = seen.get(slug) ?? 0;
    seen.set(slug, repeat + 1);
    found.add(repeat > 0 ? `${slug}-${repeat}` : slug);
  }
  return found;
}

/** The documents under the tree that a reader can follow, plus the tree's README. */
function documents(): readonly string[] {
  const docs = ["README.md"];
  for (const name of names(join(PORT, "docs/guide"), isMarkdown)) docs.push(`docs/guide/${name}`);
  return docs;
}

export interface DocReport {
  readonly inventory: TreeInventory;
  readonly documents: number;
  readonly slashMentions: number;
  readonly links: number;
  readonly problems: readonly DocProblem[];
}

/**
 * Run the whole check.
 *
 * The tree must exist first: this reads the generated output, not the sources, so a
 * checkout that has never built reports that instead of a page of missing files.
 */
export function checkPstackDocs(): DocReport {
  const tree = inventory();
  const problems: DocProblem[] = [];

  if (!existsSync(PORT)) {
    problems.push({ file: PORT_DIRECTORY, line: 0, message: "missing; run `vp run build:port` first" });
    return {
      inventory: tree,
      documents: 0,
      slashMentions: 0,
      links: 0,
      problems,
    };
  }

  for (const problem of overlayProblems(OVERLAY, UPSTREAM)) {
    problems.push({ file: "pstack/overlay", line: 0, message: problem });
  }

  // An absent skill root is not an empty root. The provider tolerates a missing root at
  // runtime, so a package that forgot to copy one still starts and simply offers fewer
  // skills; that is the failure this check exists to catch, and it has to be loud here.
  for (const [label, root] of [
    ["dist/skills/vendored", VENDORED_SKILLS_ROOT],
    ["dist/skills/authored", AUTHORED_SKILLS_ROOT],
  ] as const) {
    if (!existsSync(root)) {
      problems.push({ file: label, line: 0, message: "missing; run `vp run build:port` first" });
    }
  }

  // The worktree guards are `!!js` expressions the loader re-evaluates at every mount
  // decision, and their text is generated so it can be tested as a function and shipped as
  // a string. A hand edit to `cordis.patch.yml` would keep the tests green while the shipped
  // guard said something else, so the file is compared against the generator byte for byte.
  const patch = readFileSync(join(ROOT, "cordis.patch.yml"), "utf8");
  for (const row of WORKTREE_ROWS) {
    const expression = worktreeRowGuardExpression(row);
    if (patch.includes(expression)) continue;
    problems.push({
      file: "cordis.patch.yml",
      line: 0,
      message: `row "${row.id}" does not carry the guard expression pstack/scripts/worktree-mount.ts generates`,
    });
  }

  const files = documents();
  const text = new Map(files.map((doc) => [doc, readFileSync(join(PORT, ...doc.split("/")), "utf8")]));
  const setup = readFileSync(join(PORT, "skills/setup-pstack/SKILL.md"), "utf8");
  const expected: Readonly<Record<string, readonly number[]>> = {
    skills: [tree.skills.length, tree.commands.length],
    principles: [tree.principles.length],
    playbooks: [tree.playbooks.length],
    agents: [tree.agents.length],
  };

  let slashes = 0;
  let links = 0;
  const named = new Map(files.map((doc) => [doc, new Set<string>()]));
  const lineOf = (doc: string, index: number): number =>
    (text.get(doc) ?? "").slice(0, index).split("\n").length;
  const fail = (doc: string, index: number, message: string): void => {
    problems.push({ file: doc, line: lineOf(doc, index), message });
  };

  for (const [doc, body] of text) {
    for (const match of body.matchAll(CLAIM)) {
      const claimed = toNumber(match[2] ?? "");
      const kind = match[3] === undefined ? (match[4] ?? "").toLowerCase() : "principles";
      const allowed = expected[kind];
      if ((match[1] !== undefined || match[3] !== undefined) && claimed !== undefined && allowed !== undefined && !allowed.includes(claimed)) {
        fail(doc, match.index ?? 0, `says "${match[0]}", but the tree has ${allowed.join(" or ")}`);
      }
    }

    for (const match of body.matchAll(SLASH)) {
      slashes += 1;
      const name = match[1] ?? "";
      if (tree.skills.includes(name)) {
        named.get(doc)?.add(name);
        continue;
      }
      if (UPSTREAM_ONLY.has(name)) continue;
      if (tree.thirdParty.includes(name) || HOST_COMMANDS.has(name)) continue;
      if (THIRD_PARTY_PLUGINS.has(name)) continue;
      fail(doc, match.index ?? 0, `names /${name}, which no skill of this package provides`);
    }

    for (const match of body.matchAll(LINK)) {
      const href = match[1] ?? "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      links += 1;
      const [target, anchor] = href.split("#");
      const path =
        target === undefined || target === ""
          ? doc
          : posix.normalize(posix.join(posix.dirname(doc), target)).replace(/\/$/, "");
      const skill = /^skills\/([^/]+)\/SKILL\.md$/.exec(path);
      if (skill !== null) named.get(doc)?.add(skill[1] ?? "");
      if (!existsSync(join(PORT, ...path.split("/")))) {
        fail(doc, match.index ?? 0, `links to ${href}, which does not exist`);
      } else if (anchor !== undefined && anchor !== "" && path.endsWith(".md") && !anchors(join(PORT, ...path.split("/"))).has(anchor)) {
        fail(doc, match.index ?? 0, `links to ${href}, but ${path} has no heading with that anchor`);
      }
    }

    for (const match of body.matchAll(AGENT)) {
      const name = match[1] ?? "";
      if (!tree.agents.includes(name)) {
        fail(doc, match.index ?? 0, `names subagent_type "${name}", which the tree does not ship`);
      }
    }

    // No shipped page may name a model slug. This package cannot know which routes a
    // deployment serves, so a page that hardcodes one is telling a reader to pass a value
    // the tool will refuse.
    for (const match of body.matchAll(MODEL_ID)) {
      fail(doc, match.index ?? 0, `names model ${match[0]}, and no shipped page may hardcode a route`);
    }
  }

  // The tree's README is the index of the tree: every skill, playbook, and agent has a row.
  const readme = text.get("README.md") ?? "";
  for (const skill of tree.skills) {
    if (!readme.includes(`./skills/${skill}/SKILL.md`)) {
      problems.push({ file: "README.md", line: 0, message: `does not list skill ${skill}` });
    }
  }
  for (const playbook of tree.playbooks) {
    if (!readme.includes(`./skills/poteto-mode/playbooks/${playbook}.md`)) {
      problems.push({ file: "README.md", line: 0, message: `does not list playbook ${playbook}` });
    }
  }
  for (const agent of tree.agents) {
    if (!readme.includes(`./agents/${agent}.md`)) {
      problems.push({ file: "README.md", line: 0, message: `does not link agent ${agent}` });
    }
  }

  // Every role a shipped page names has to exist in the manifest, or a reader follows a
  // key that no role line can match.
  const roleKeys = new Set(ROLE_MANIFEST.map((role) => role.key));
  for (const [doc, body] of text) {
    for (const match of body.matchAll(/role: "([^"]+)"/g)) {
      const key = match[1] ?? "";
      if (roleKeys.has(key)) continue;
      fail(doc, match.index ?? 0, `names role "${key}", which the manifest does not have`);
    }
  }

  // `setup-pstack` is the one skill that writes the role file, so it must name the keys.
  for (const role of ROLE_MANIFEST) {
    if (!setup.includes(role.key)) {
      problems.push({
        file: "skills/setup-pstack/SKILL.md",
        line: 0,
        message: `does not name role "${role.key}"`,
      });
    }
  }

  // The three roots the provider loads, so a page can say where skills come from.
  if (SKILL_ROOTS.length === 0) {
    problems.push({ file: "src/paths.ts", line: 0, message: "SKILL_ROOTS is empty" });
  }

  return {
    inventory: tree,
    documents: files.length,
    slashMentions: slashes,
    links,
    problems,
  };
}

/** Run the check and print the report. Returns the process exit code. */
export function main(): number {
  const report = checkPstackDocs();
  const tree = report.inventory;
  console.log(
    `tree: ${tree.skills.length} skills (${tree.commands.length} commands, ${tree.principles.length} principles), ` +
      `${tree.playbooks.length} playbooks, ${tree.agents.length} agents, ${tree.thirdParty.length} third-party skills`,
  );
  console.log(`docs: ${report.documents} files, ${report.slashMentions} slash mentions, ${report.links} relative links`);
  for (const problem of report.problems) {
    console.log(`FAIL ${problem.file}${problem.line > 0 ? `:${problem.line}` : ""} ${problem.message}`);
  }
  console.log(`${report.problems.length} problems`);
  return report.problems.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
