/** Pure transformation of the pinned upstream files into the native baseline. */
import { posix } from "node:path";

const ADAPTER_TREE = "docs/harness/dsh.md";
const INJECTION = `In DeepSeek Harness, read [the DSH adapter](../../${ADAPTER_TREE}) once per session before you follow this skill. It maps the Cursor names in pstack skills to DeepSeek Harness.`;
const GITHUB = "https://github.com/cursor/plugins";
const LINK = /\]\(([^)\s]+)\)/g;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface TreeFile {
  bytes: Buffer;
  executable: boolean;
}

interface SkillClass {
  terms: Set<string>;
  wrap: boolean;
  name?: string;
}

const TERMS: { key: string; re: RegExp }[] = [
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

function classify(
  source: ReadonlyMap<string, TreeFile>,
  skills: readonly string[],
  skill: string,
): SkillClass {
  const dir = `skills/${skill}/`;
  const others = skills.filter((name) => name !== skill).join("|");
  const route = new RegExp(
    `the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``,
    "g",
  );
  const linksToSkill = (line: string, name: string) => line.includes(`(../${name}/`);
  const namesBareSkill = (line: string) =>
    [...line.matchAll(route)].some(
      ({ groups }) => !linksToSkill(line, groups?.bold ?? groups?.command ?? ""),
    );
  const terms = new Set<string>();
  for (const path of [...source.keys()].filter(
    (path) => path.startsWith(dir) && path.endsWith(".md"),
  )) {
    const text = source.get(path)!.bytes.toString("utf8");
    for (const term of TERMS) if (term.re.test(text)) terms.add(term.key);
    if (text.split("\n").some(namesBareSkill)) terms.add(ROUTE_KEY);
  }
  const text = source.get(`${dir}SKILL.md`)!.bytes.toString("utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const name = frontmatter
    .match(/^name:(.*)$/m)?.[1]
    ?.trim()
    .replace(/^(["'])(.*)\1$/, "$2");
  return { terms, wrap: terms.size > 0 && /^# /m.test(text), name };
}

function has(files: ReadonlyMap<string, TreeFile>, path: string): boolean {
  return files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`));
}

export function renderPstack(
  source: ReadonlyMap<string, TreeFile>,
  adapterText: string,
): { files: Map<string, TreeFile>; skillCount: number; wrappedCount: number } {
  const skills = [...source.keys()].flatMap((path) => {
    const match = /^skills\/([^/]+)\/SKILL\.md$/.exec(path);
    return match ? [match[1]!] : [];
  });
  const classes = new Map(skills.map((skill) => [skill, classify(source, skills, skill)]));
  const problems: string[] = [];
  for (const [skill, { terms, wrap, name }] of classes) {
    if (terms.size > 0 && !wrap)
      problems.push(`skills/${skill}/SKILL.md uses Cursor names but has no H1`);
    if (name !== skill)
      problems.push(
        `skills/${skill}/SKILL.md has name ${JSON.stringify(name ?? "")}, not its folder name ${skill}`,
      );
    if (!SKILL_NAME.test(skill) || skill.length > 64)
      problems.push(`skills/${skill} is not a valid kebab-case folder name`);
  }

  if (problems.length > 0) throw new Error(problems.join("\n"));
  const copies = [...source].filter(
    ([path]) =>
      /^(skills|agents|docs\/guide)\//.test(path) ||
      ["README.md", "plugin.json", "LICENSE"].includes(path),
  );
  const files = new Map(copies.map(([path, entry]) => [path, { ...entry }]));
  files.set(ADAPTER_TREE, { bytes: Buffer.from(adapterText), executable: false });
  for (const [skill, { wrap }] of classes) {
    const entry = files.get(`skills/${skill}/SKILL.md`)!;
    if (wrap)
      entry.bytes = Buffer.from(
        entry.bytes.toString("utf8").replace(/^(# .*)\n+/m, `$1\n\n${INJECTION}\n\n`),
      );
  }
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    const text = entry.bytes.toString("utf8").replace(LINK, (link, href: string) => {
      const local = href.replace(/[#?].*/, "");
      if (!local || /^[a-z][a-z0-9+.-]*:/i.test(local)) return link;
      const target = posix.join(posix.dirname(path), local).replace(/\/$/, "");
      if (target.split("/")[0] === ".." || !has(source, target) || has(files, target)) return link;
      const kind = source.has(target) ? "blob" : "tree";
      return `](${GITHUB}/${kind}/main/pstack/${target}${href.slice(href.search(/[#?]|$/))})`;
    });
    entry.bytes = Buffer.from(text);
  }
  return {
    files,
    skillCount: skills.length,
    wrappedCount: [...classes.values()].filter(({ wrap }) => wrap).length,
  };
}
