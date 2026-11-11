#!/usr/bin/env node
// Generate root pstack/ from the pinned upstream pstack tree and port/dsh.md.
// Root pstack/ is written only by this script; hand-written content lives in
// port/, plugin sources, tests, or upstream/cursor-plugins.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "upstream/cursor-plugins/pstack");
const ADAPTER_SOURCE = "port/dsh.md";
const ADAPTER_TREE = "docs/harness/dsh.md";
const OUT = join(ROOT, "pstack");
const COMMAND = "vpx port/generate.mjs";
const GITHUB = "https://github.com/cursor/plugins";
const LINK = /\]\(([^)\s]+)\)/g;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INSTALL = "dsh plugin --profile web add dsh-pstack";

const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: '`environment: "cloud"`', re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "claude-", re: /\bclaude-[a-z]+-\d/ },
  { key: "grok-", re: /\bgrok-\d/ },
  { key: "gpt-", re: /\bgpt-\d/ },
  { key: "inherit-parent", re: /inherit-parent/ },
  { key: "pstack-models.mdc", re: /pstack-models\.mdc/ },
  { key: ".cursor/skills/", re: /\.cursor\/skills/ },
  { key: "~/.cursor/plugins/", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: ".cursor/rules/", re: /\.cursor\/rules|always-applied rule/ },
  { key: "agent-transcripts", re: /agent-transcripts|\.cursor\/projects/ },
  { key: "Custom Mode", re: /Custom Modes?/i },
  {
    key: "Cursor-only features",
    re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent|built-in PR tool/,
  },
];
const ROUTE_KEY = "Run another pstack skill";

// Upstream pstack is written for Cursor and ships a verbatim copy to Claude Code.
// Its install block, command-prefix note, role-file path, and adapter link are
// wrong for DeepSeek Harness and mislead DSH users. Each rule maps one Claude
// Code passage to its DSH counterpart. The table drives one pass over every
// copied Markdown file, so no `if` decides per file. A rule that stops matching
// its upstream passage leaves the passage in place, which the unmapped scan
// reports instead of dropping silently.
export const CLAUDE_CODE_REPLACEMENTS = [
  // Claude Code install fence in README: /plugin marketplace add + /plugin install.
  {
    name: "install-fence",
    match:
      /in claude code:\n\n```bash\n\/plugin marketplace add cursor\/plugins\n\/plugin install pstack@cursor-plugins\n```/g,
    replace: `in DeepSeek Harness:\n\n\`\`\`bash\n${INSTALL}\n\`\`\``,
  },
  // The Claude Code marketplace auto-update note has no DSH counterpart.
  {
    name: "install-auto-update",
    match: /^claude code leaves auto-update off[^\n]*\n\n/gm,
    replace: "",
  },
  // The Claude Code harness-tree build note has no DSH counterpart.
  {
    name: "install-generated-copy",
    match: /^claude code installs a generated copy[^\n]*\n\n/gm,
    replace: "",
  },
  // Inline two-command install phrase (poteto-help, 01-setup).
  {
    name: "install-inline",
    match:
      /`\/plugin marketplace add cursor\/plugins`, then `\/plugin install pstack@cursor-plugins`/g,
    replace: `\`${INSTALL}\``,
  },
  // README command-prefix sentence.
  {
    name: "prefix-readme",
    match:
      /claude code prefixes plugin commands and agents, so `\/poteto-mode` is `\/pstack:poteto-mode`\./,
    replace:
      "in DeepSeek Harness, commands keep their plain names with no prefix, so `/poteto-mode` stays `/poteto-mode`.",
  },
  // 01-setup command-prefix clause.
  {
    name: "prefix-guide",
    match:
      /Claude Code prefixes plugin commands, so each command in this guide takes a `pstack:` prefix there, such as `\/pstack:setup-pstack`/,
    replace:
      "DeepSeek Harness adds no command prefix, so each command in this guide keeps its plain name, such as `/setup-pstack`",
  },
  // poteto-help command-prefix sentence.
  {
    name: "prefix-help",
    match: /There, each command takes a `pstack:` prefix, such as `\/pstack:poteto-mode`\./,
    replace: "Commands keep their plain names there, such as `/poteto-mode`.",
  },
  // README setup-pstack sentence: command prefix plus the role-file path.
  {
    name: "setup-writes-readme",
    match:
      /in claude code, `\/pstack:setup-pstack` writes your model choices to `~\/\.claude\/rules\/pstack-models\.md`/,
    replace: "`/setup-pstack` writes your model choices to `$DSH_HOME/pstack-models.mdc`",
  },
  // Claude Code adapter link label.
  {
    name: "adapter-label",
    match: /[Cc]laude [Cc]ode adapter/g,
    replace: "DSH adapter",
  },
  // Claude Code adapter file name in links (README, poteto-help, 01-setup).
  {
    name: "adapter-file",
    match: /claude-code\.md/g,
    replace: "dsh.md",
  },
  // Claude Code role-file path.
  {
    name: "rules-path",
    match: /~\/\.claude\/rules\/pstack-models\.md/g,
    replace: "$DSH_HOME/pstack-models.mdc",
  },
  // Any remaining `/pstack:<name>` command prefix becomes `/<name>`.
  {
    name: "command-prefix",
    match: /\/pstack:([a-z0-9-]+)/g,
    replace: "/$1",
  },
  // Any remaining "Claude Code" name becomes "DeepSeek Harness".
  {
    name: "claude-code-name",
    match: /[Cc]laude [Cc]ode/g,
    replace: "DeepSeek Harness",
  },
];

// Residual markers that must not survive in a generated Markdown file. The scan
// keeps the matched text and reports it rather than rewriting it blindly.
export const CLAUDE_CODE_MARKERS = [
  {
    label: "install command",
    re: /\/plugin (?:marketplace add cursor\/plugins|install pstack@cursor-plugins)/,
  },
  { label: "claude rules path", re: /~\/\.claude\// },
  { label: "claude-code adapter", re: /claude-code\.md/ },
  { label: "command prefix", re: /\/pstack:[a-z0-9-]/ },
  { label: "claude code", re: /\bclaude code\b/i },
];

export function applyClaudeCodeReplacements(text) {
  return CLAUDE_CODE_REPLACEMENTS.reduce(
    (output, rule) => output.replace(rule.match, rule.replace),
    text,
  );
}

export function findUnmappedClaudeCode(text) {
  const hits = [];
  text.split("\n").forEach((line, index) => {
    for (const marker of CLAUDE_CODE_MARKERS) {
      if (marker.re.test(line))
        hits.push({ line: index + 1, label: marker.label, text: line.trim() });
    }
  });
  return hits;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function file(path) {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

function classify(skill, skills) {
  const dir = join(SOURCE, "skills", skill);
  const others = skills.filter((name) => name !== skill).join("|");
  const route = new RegExp(
    `the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``,
    "g",
  );
  const linksToSkill = (line, name) => line.includes(`(../${name}/`);
  const namesBareSkill = (line) =>
    [...line.matchAll(route)].some(
      ({ groups }) => !linksToSkill(line, groups.bold ?? groups.command),
    );
  const terms = new Set();
  for (const path of walk(dir).filter((path) => path.endsWith(".md"))) {
    const text = readFileSync(path, "utf8");
    for (const term of TERMS) if (term.re.test(text)) terms.add(term.key);
    if (text.split("\n").some(namesBareSkill)) terms.add(ROUTE_KEY);
  }
  const text = readFileSync(join(dir, "SKILL.md"), "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const name = frontmatter
    .match(/^name:(.*)$/m)?.[1]
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2");
  return { terms, wrap: terms.size > 0 && /^# /m.test(text), name };
}

function targetPath(from, href) {
  const target = href.replace(/[#?].*/, "");
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const path = posix.join(posix.dirname(from), target).replace(/\/$/, "");
  return existsSync(join(SOURCE, path)) ? path : undefined;
}

function has(files, path) {
  return files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`));
}

function render(classes, adapterText) {
  const copies = [
    ...walk(join(SOURCE, "skills")).map((path) => relative(SOURCE, path)),
    ...walk(join(SOURCE, "agents")).map((path) => relative(SOURCE, path)),
    ...walk(join(SOURCE, "docs/guide")).map((path) => relative(SOURCE, path)),
    "README.md",
    "plugin.json",
  ];
  const files = new Map(copies.map((path) => [path, file(join(SOURCE, path))]));
  files.set(ADAPTER_TREE, { bytes: Buffer.from(adapterText), executable: false });
  const line =
    `In DeepSeek Harness, read [the DSH adapter](../../${ADAPTER_TREE}) once per session before you follow this skill. ` +
    "It maps the Cursor names in pstack skills to DeepSeek Harness.";
  for (const [skill, { wrap }] of classes) {
    const path = `skills/${skill}/SKILL.md`;
    const text = files.get(path).bytes.toString("utf8");
    if (wrap) files.get(path).bytes = Buffer.from(text.replace(/^(# .*)\n+/m, `$1\n\n${line}\n\n`));
  }
  files.set("LICENSE", file(join(SOURCE, "LICENSE")));
  let replaced = 0;
  for (const [path, entry] of files) {
    if (!path.endsWith(".md") || path === ADAPTER_TREE) continue;
    const text = entry.bytes.toString("utf8");
    const mapped = applyClaudeCodeReplacements(text);
    if (mapped !== text) replaced += 1;
    entry.bytes = Buffer.from(mapped);
  }
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    const text = entry.bytes.toString("utf8").replace(LINK, (link, href) => {
      const target = targetPath(path, href);
      if (!target || target.split("/")[0] === ".." || has(files, target)) return link;
      const kind = statSync(join(SOURCE, target)).isDirectory() ? "tree" : "blob";
      return `](${GITHUB}/${kind}/main/pstack/${target}${href.slice(href.search(/[#?]|$/))})`;
    });
    entry.bytes = Buffer.from(text);
  }
  return { files, replaced };
}

function main() {
  const skills = readdirSync(join(SOURCE, "skills")).filter((name) =>
    existsSync(join(SOURCE, "skills", name, "SKILL.md")),
  );

  const classes = new Map(skills.map((skill) => [skill, classify(skill, skills)]));
  const problems = [];
  const users = new Map();
  for (const [skill, { terms, wrap, name }] of classes) {
    if (terms.size > 0 && !wrap)
      problems.push(`skills/${skill}/SKILL.md uses Cursor names but has no H1`);
    if (name !== skill)
      problems.push(
        `skills/${skill}/SKILL.md has name ${JSON.stringify(name ?? "")}, not its folder name ${skill}`,
      );
    if (!SKILL_NAME.test(skill) || skill.length > 64)
      problems.push(`skills/${skill} is not a valid kebab-case folder name`);
    for (const key of terms) users.set(key, [...(users.get(key) ?? []), skill]);
  }
  const adapterText = readFileSync(join(ROOT, ADAPTER_SOURCE), "utf8");
  const optionalSection = adapterText.split("## Optional plugins")[1]?.split("\n## ")[0];
  if (optionalSection !== undefined) {
    const rows = optionalSection.split("\n").filter((line) => line.startsWith("|"));
    const header = rows[0]?.split("|").map((cell) => cell.trim());
    if (header?.[1] !== "Plugin packages") {
      problems.push("port/dsh.md optional plugin table must use the Plugin packages column");
    }
    for (const row of rows.slice(2)) {
      const first = row.split("|")[1]?.trim() ?? "";
      if (!first.startsWith("`@deepseek-ai/")) {
        problems.push("port/dsh.md optional plugin table must use package names as row keys");
        break;
      }
    }
  }
  for (const [key, using] of users) {
    if (!adapterText.includes(key))
      problems.push(`port/dsh.md has no row for ${key}, used by ${using.join(", ")}`);
  }
  for (const problem of problems) console.log(`FAIL ${problem}`);
  if (problems.length > 0) process.exit(1);

  const { files: rendered, replaced } = render(classes, adapterText);
  const dangling = [];
  for (const [path, entry] of rendered) {
    if (!path.endsWith(".md")) continue;
    for (const [, href] of entry.bytes.toString("utf8").matchAll(LINK)) {
      const target = targetPath(path, href);
      if (target && !has(rendered, target))
        dangling.push(`pstack/${path} links to ${href}, which is not in the tree`);
    }
  }
  for (const link of dangling) console.log(`FAIL ${link}`);
  if (dangling.length > 0) process.exit(1);

  for (const [path, entry] of rendered) {
    if (!path.endsWith(".md") || path === ADAPTER_TREE) continue;
    for (const hit of findUnmappedClaudeCode(entry.bytes.toString("utf8"))) {
      console.log(`UNMAPPED pstack/${path}:${hit.line} [${hit.label}] ${hit.text}`);
    }
  }

  if (process.argv.includes("--check")) {
    const onDisk = new Map(
      existsSync(OUT) ? walk(OUT).map((path) => [relative(OUT, path), file(path)]) : [],
    );
    const drifted = [...new Set([...rendered.keys(), ...onDisk.keys()])]
      .sort((left, right) => left.localeCompare(right))
      .filter((path) => {
        const [want, have] = [rendered.get(path), onDisk.get(path)];
        return (
          !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable
        );
      });
    for (const path of drifted.slice(0, 20)) console.log(`pstack/${path}`);
    if (drifted.length > 0) {
      console.log(`pstack is out of date. Run \`${COMMAND}\` and commit the result.`);
      process.exit(1);
    }
    console.log("pstack is up to date.");
  } else {
    rmSync(OUT, { recursive: true, force: true });
    for (const [path, { bytes, executable }] of rendered) {
      mkdirSync(dirname(join(OUT, path)), { recursive: true });
      writeFileSync(join(OUT, path), bytes);
      chmodSync(join(OUT, path), executable ? 0o755 : 0o644);
    }
    const wrapped = [...classes.values()].filter(({ wrap }) => wrap).length;
    console.log(`${skills.length} skills, ${wrapped} SKILL.md files with the adapter line`);
    console.log(`${replaced} Markdown files had Claude Code copy replaced`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
