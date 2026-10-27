/**
 * The four mechanical transforms a ported file can receive.
 *
 * Nothing here decides what a file means. Each function answers a question that can be
 * asked of the bytes alone, which is what keeps a regeneration from needing judgement:
 *
 * 1. **Narrow the frontmatter.** Upstream declares `icon`, `color`, `paths`, and
 *    `is_background`; no DSH loader reads them, so shipping them would be a field a model
 *    could believe it had set.
 * 2. **Repoint a link that leaves the tree**, through `RETARGETED_LINKS`.
 * 3. **Insert the adapter pointer** under the H1 of a skill whose prose uses a Cursor
 *    name. Upstream's own Claude Code tree does exactly this.
 * 4. **Copy** everything else byte for byte.
 *
 * A fifth transform would be a generator that rewrites tool names and capability
 * sentences in prose. This repository ran that and spent 322 anchors keeping it honest;
 * `docs/decisions/2026-10-27-upstream-text-plus-adapter.md` records why it stopped.
 */

import {
  parseFrontmatter,
  serializeAgentFrontmatter,
  serializeSkillFrontmatter,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} from "../../src/frontmatter.ts";
import { ADAPTER_POINTER, termsUsedIn } from "./adapter.ts";
import { RETARGETED_LINKS } from "./port-links.ts";

/** Repoint every link listed in `RETARGETED_LINKS`, leaving the anchor alone. */
export function retargetLinks(text: string): string {
  return text.replace(/\]\(([^)\s]+)\)/g, (whole, href: string) => {
    const replacement = RETARGETED_LINKS[href];
    return replacement === undefined ? whole : `](${replacement})`;
  });
}

/**
 * Insert the adapter pointer under a body's H1.
 *
 * A skill that needs the pointer and has no H1 is a build error rather than a skill
 * shipped without it, because the pointer is what tells a reader that the wording is
 * upstream's and the translation exists.
 */
export function insertAdapterPointer(body: string, file: string): string {
  if (body.includes(ADAPTER_POINTER)) {
    throw new Error(`${file}: body already carries the adapter pointer`);
  }
  const heading = /^# .+$/m.exec(body);
  if (heading === null) {
    throw new Error(`${file}: uses a Cursor name but has no H1 for the adapter pointer`);
  }
  const headingEnd = heading.index + heading[0].length;
  const rest = body.slice(headingEnd);
  const tail =
    rest === "" || rest.startsWith("\n\n")
      ? rest
      : rest.startsWith("\n")
        ? `\n${rest.slice(1)}`
        : `\n\n${rest}`;
  return `${body.slice(0, headingEnd)}\n\n${ADAPTER_POINTER}${tail}`;
}

/** Render one skill body: narrowed frontmatter, the pointer when needed, repointed links. */
export function renderSkill(text: string, file: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = eol === "\r\n" ? text.replaceAll("\r\n", "\n") : text;
  const { data, body } = parseFrontmatter(normalized);
  const frontmatter = validateSkillFrontmatter(data, file);
  const renderedBody = termsUsedIn(body).length > 0 ? insertAdapterPointer(body, file) : body;
  const rendered = `${serializeSkillFrontmatter(frontmatter)}${retargetLinks(renderedBody)}`;
  return eol === "\r\n" ? rendered.replaceAll("\n", "\r\n") : rendered;
}

/** Render one agent preamble: narrowed frontmatter and repointed links. */
export function renderAgent(text: string, file: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = eol === "\r\n" ? text.replaceAll("\r\n", "\n") : text;
  const { data, body } = parseFrontmatter(normalized);
  const frontmatter = validateAgentFrontmatter(data, file);
  const rendered = `${serializeAgentFrontmatter(frontmatter)}${retargetLinks(body)}`;
  return eol === "\r\n" ? rendered.replaceAll("\n", "\r\n") : rendered;
}

/** Which transform a skill's `SKILL.md` needs, for the check and the report. */
export type SkillCategory = "copy" | "pointer" | "stripped";

export function classifySkill(text: string, file: string): SkillCategory {
  const { data, body } = parseFrontmatter(text);
  if (termsUsedIn(body).length > 0) return "pointer";
  const rendered = renderSkill(text, file);
  const original = Object.keys(data).sort();
  const shipped = Object.keys(parseFrontmatter(rendered).data).sort();
  return original.length === shipped.length ? "copy" : "stripped";
}
