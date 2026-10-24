/**
 * Frontmatter parsing for pstack skills and agents.
 *
 * This is a deliberately small YAML subset, not YAML. It reads the shapes the
 * upstream files use: plain scalars, single and double quotes, folded (`>` and
 * `>-`) and literal (`|` and `|-`) blocks, comments, and blank lines. Nesting
 * and multi-document streams are rejected rather than half-supported.
 */

export interface Frontmatter {
  readonly data: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly disableModelInvocation: boolean;
  readonly userInvocable: boolean;
  readonly whenToUse?: string;
}

export interface AgentFrontmatter {
  readonly name: string;
  readonly description: string;
}

export interface DroppedFrontmatterField {
  readonly file: string;
  readonly field: string;
  readonly value: string;
}

export const SKILL_CONSUMED_FIELDS = [
  "name",
  "description",
  "disable-model-invocation",
  "user-invocable",
  "whenToUse",
] as const;

export const SKILL_DROPPED_FIELDS = ["icon", "color", "paths"] as const;

export const AGENT_CONSUMED_FIELDS = ["name", "description"] as const;

export const AGENT_DROPPED_FIELDS = ["is_background"] as const;

export const MAX_SKILL_NAME_LENGTH = 64;

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontmatterError";
  }
}

export function parseFrontmatter(source: string): Frontmatter {
  const eol = detectEol(source);
  const text = eol === "\r\n" ? source.replaceAll("\r\n", "\n") : source;
  const lines = text.split("\n");

  if (lines[0] !== "---") {
    throw new FrontmatterError('frontmatter: file must start with a "---" line');
  }
  const closing = lines.indexOf("---", 1);
  if (closing === -1) {
    throw new FrontmatterError('frontmatter: missing closing "---" delimiter');
  }

  const data = parseBlock(lines.slice(1, closing));
  const body = lines.slice(closing + 1).join("\n");
  return { data, body: eol === "\r\n" ? body.replaceAll("\n", eol) : body };
}

export function validateSkillFrontmatter(
  data: Readonly<Record<string, string>>,
  source: string,
): SkillFrontmatter {
  rejectUnknownFields(data, source, SKILL_CONSUMED_FIELDS, SKILL_DROPPED_FIELDS);

  const name = readName(data, source);
  const description = readDescription(data, source);
  const whenToUse = data["whenToUse"];
  if (whenToUse !== undefined && whenToUse.trim() === "") {
    throw new FrontmatterError(`${source}: "whenToUse" must not be empty`);
  }

  return {
    name,
    description,
    disableModelInvocation: readBoolean(data, "disable-model-invocation", source, false),
    userInvocable: readBoolean(data, "user-invocable", source, true),
    ...(whenToUse === undefined ? {} : { whenToUse }),
  };
}

export function validateAgentFrontmatter(
  data: Readonly<Record<string, string>>,
  source: string,
): AgentFrontmatter {
  rejectUnknownFields(data, source, AGENT_CONSUMED_FIELDS, AGENT_DROPPED_FIELDS);
  return { name: readName(data, source), description: readDescription(data, source) };
}

export function serializeSkillFrontmatter(data: SkillFrontmatter): string {
  const lines = [
    "---",
    `name: ${formatScalar(data.name)}`,
    `description: ${formatScalar(data.description)}`,
  ];
  if (data.disableModelInvocation) lines.push("disable-model-invocation: true");
  if (!data.userInvocable) lines.push("user-invocable: false");
  if (data.whenToUse !== undefined) lines.push(`whenToUse: ${formatScalar(data.whenToUse)}`);
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

export function serializeAgentFrontmatter(data: AgentFrontmatter): string {
  return [
    "---",
    `name: ${formatScalar(data.name)}`,
    `description: ${formatScalar(data.description)}`,
    "---",
    "",
  ].join("\n");
}

export function skillDroppedFields(
  data: Readonly<Record<string, string>>,
  source: string,
): readonly DroppedFrontmatterField[] {
  return droppedFields(data, source, SKILL_DROPPED_FIELDS);
}

export function agentDroppedFields(
  data: Readonly<Record<string, string>>,
  source: string,
): readonly DroppedFrontmatterField[] {
  return droppedFields(data, source, AGENT_DROPPED_FIELDS);
}

function droppedFields(
  data: Readonly<Record<string, string>>,
  source: string,
  fields: readonly string[],
): readonly DroppedFrontmatterField[] {
  return fields.flatMap((field) => {
    const value = data[field];
    return value === undefined ? [] : [{ file: source, field, value }];
  });
}

function detectEol(source: string): "\n" | "\r\n" {
  if (!source.includes("\r\n")) return "\n";
  const withoutCrlf = source.replaceAll("\r\n", "");
  if (withoutCrlf.includes("\r") || withoutCrlf.includes("\n")) {
    throw new FrontmatterError("frontmatter: mixed line endings are not supported");
  }
  return "\r\n";
}

function parseBlock(lines: readonly string[]): Record<string, string> {
  const data: Record<string, string> = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (trimmed !== line) {
      throw new FrontmatterError(`frontmatter: unexpected indented line "${trimmed}"`);
    }

    const entry = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (entry === null) {
      throw new FrontmatterError(`frontmatter: expected "key: value", got "${line}"`);
    }
    const key = entry[1] as string;
    const rest = entry[2] as string;
    if (rest !== "" && !rest.startsWith(" ")) {
      throw new FrontmatterError(`frontmatter: missing space after "${key}:"`);
    }
    if (Object.hasOwn(data, key)) {
      throw new FrontmatterError(`frontmatter: duplicate key "${key}"`);
    }

    const raw = rest.trim();
    if (raw === ">" || raw === ">-" || raw === "|" || raw === "|-") {
      const block: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const candidate = lines[cursor] as string;
        if (candidate.trim() !== "" && !candidate.startsWith(" ") && !candidate.startsWith("\t"))
          break;
        block.push(candidate);
        cursor += 1;
      }
      while (block.length > 0 && (block.at(-1) as string).trim() === "") block.pop();
      if (block.length === 0) {
        throw new FrontmatterError(`frontmatter: "${key}" has an empty ${raw} block`);
      }
      data[key] = parseBlockScalar(block, raw, key);
      index = cursor - 1;
      continue;
    }

    data[key] = parseScalar(raw, key);
  }

  return data;
}

function parseScalar(raw: string, key: string): string {
  if (raw === "") return "";
  if (raw.startsWith('"')) return parseDoubleQuoted(raw, key);
  if (raw.startsWith("'")) return parseSingleQuoted(raw, key);
  return raw;
}

function parseDoubleQuoted(raw: string, key: string): string {
  if (raw.length < 2 || !raw.endsWith('"')) {
    throw new FrontmatterError(`frontmatter: unterminated double-quoted value for "${key}"`);
  }
  const inner = raw.slice(1, -1);
  let value = "";
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index] as string;
    if (character !== "\\") {
      value += character;
      continue;
    }
    const escaped = inner[(index += 1)];
    if (escaped === '"') value += '"';
    else if (escaped === "\\") value += "\\";
    else if (escaped === "n") value += "\n";
    else
      throw new FrontmatterError(
        `frontmatter: unsupported escape "\\${escaped ?? ""}" in "${key}"`,
      );
  }
  return value;
}

function parseSingleQuoted(raw: string, key: string): string {
  if (raw.length < 2 || !raw.endsWith("'")) {
    throw new FrontmatterError(`frontmatter: unterminated single-quoted value for "${key}"`);
  }
  const inner = raw.slice(1, -1);
  let value = "";
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index] as string;
    if (character !== "'") {
      value += character;
      continue;
    }
    if (inner[index + 1] === "'") {
      value += "'";
      index += 1;
      continue;
    }
    throw new FrontmatterError(`frontmatter: unescaped single quote in "${key}"`);
  }
  return value;
}

function parseBlockScalar(lines: readonly string[], indicator: string, key: string): string {
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => (/^\s*/.exec(line) as RegExpExecArray)[0].length);
  const indent = Math.min(...indents);
  const content = lines.map((line) => (line.trim() === "" ? "" : line.slice(indent)));

  const text = indicator.startsWith("|") ? content.join("\n") : fold(content);
  if (text.trim() === "") {
    throw new FrontmatterError(`frontmatter: "${key}" block is empty`);
  }
  return indicator.endsWith("-") ? text : `${text}\n`;
}

function fold(lines: readonly string[]): string {
  const paragraphs: string[][] = [[]];
  for (const line of lines) {
    if (line === "") paragraphs.push([]);
    else (paragraphs.at(-1) as string[]).push(line);
  }
  return paragraphs.map((paragraph) => paragraph.join(" ")).join("\n");
}

function rejectUnknownFields(
  data: Readonly<Record<string, string>>,
  source: string,
  consumed: readonly string[],
  dropped: readonly string[],
): void {
  const unknown = Object.keys(data).filter(
    (key) => !consumed.includes(key) && !dropped.includes(key),
  );
  if (unknown.length > 0) {
    throw new FrontmatterError(`${source}: unknown frontmatter field(s) ${unknown.join(", ")}`);
  }
}

function readName(data: Readonly<Record<string, string>>, source: string): string {
  const value = data["name"];
  if (value === undefined || value.trim() === "") {
    throw new FrontmatterError(`${source}: missing "name"`);
  }
  if (!SKILL_NAME_PATTERN.test(value)) {
    throw new FrontmatterError(`${source}: "name" must be kebab-case, got "${value}"`);
  }
  if (value.length > MAX_SKILL_NAME_LENGTH) {
    throw new FrontmatterError(
      `${source}: "name" is longer than ${MAX_SKILL_NAME_LENGTH} characters`,
    );
  }
  return value;
}

function readDescription(data: Readonly<Record<string, string>>, source: string): string {
  const value = data["description"];
  if (value === undefined || value.trim() === "") {
    throw new FrontmatterError(`${source}: missing "description"`);
  }
  return value;
}

function readBoolean(
  data: Readonly<Record<string, string>>,
  key: string,
  source: string,
  fallback: boolean,
): boolean {
  const value = data[key];
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new FrontmatterError(`${source}: "${key}" must be true or false, got "${value}"`);
}

function formatScalar(value: string): string {
  return needsQuotes(value) ? `"${escapeDoubleQuoted(value)}"` : value;
}

function needsQuotes(value: string): boolean {
  if (value === "" || value.trim() !== value) return true;
  if (/[\n\r\t]/.test(value)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true;
  return /: | #|:$/.test(value);
}

function escapeDoubleQuoted(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}
