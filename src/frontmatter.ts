/**
 * The pstack SKILL.md frontmatter subset: plain scalars, quoted scalars, and
 * folded or literal block scalars. Kept dependency-free so the plugin can be
 * imported at boot before any optional parser is available.
 */

export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

const DELIMITER = "---";

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = trimmed.slice(1, -1);
      return first === '"'
        ? inner.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\")
        : inner.replace(/''/g, "'");
    }
  }
  return trimmed;
}

export function parseFrontmatter(source: string): Frontmatter {
  const normalized = source.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== DELIMITER) return { data: {}, body: normalized };

  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === DELIMITER) {
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
