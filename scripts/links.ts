/**
 * Local-link scanning for generated Markdown.
 *
 * Links inside fenced code blocks are examples, not references. External
 * schemes and pure anchors are skipped. A bare token such as `url` in a prompt
 * template is a placeholder, reported but not failed. Everything else must
 * resolve, and a directory counts as present.
 */
import { posix } from "node:path";

export interface MarkdownLink {
  readonly line: number;
  readonly target: string;
}

export interface LinkPlaceholder {
  readonly file: string;
  readonly line: number;
  readonly target: string;
}

export interface LinkProblem {
  readonly file: string;
  readonly line: number;
  readonly target: string;
  readonly resolved: string;
  readonly reason: "missing" | "outside-repository";
}

export interface LinkReport {
  readonly checked: number;
  readonly skipped: number;
  readonly placeholders: readonly LinkPlaceholder[];
  readonly problems: readonly LinkProblem[];
}

export interface MarkdownFile {
  /** Repository-relative POSIX path. */
  readonly file: string;
  readonly text: string;
}

export function scanMarkdownLinks(text: string): readonly MarkdownLink[] {
  const links: MarkdownLink[] = [];
  let inFence = false;

  text.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    for (const match of line.matchAll(pattern)) {
      links.push({ line: index + 1, target: match[1] as string });
    }
  });

  return links;
}

export function checkLinks(
  files: readonly MarkdownFile[],
  exists: (repositoryRelativePath: string) => boolean,
): LinkReport {
  const placeholders: LinkPlaceholder[] = [];
  const problems: LinkProblem[] = [];
  let checked = 0;
  let skipped = 0;

  for (const { file, text } of files) {
    for (const link of scanMarkdownLinks(text)) {
      const target = link.target.replace(/^<|>$/g, "").split("#").at(0)?.split("?")[0] ?? "";
      if (target === "" || /^(?:https?:|mailto:|tel:)/.test(target)) {
        skipped += 1;
        continue;
      }
      if (!target.includes("/") && !target.includes(".")) {
        placeholders.push({ file, line: link.line, target });
        continue;
      }

      checked += 1;
      const resolved = posix.normalize(posix.join(posix.dirname(file), target));
      if (resolved.startsWith("../") || resolved === "..") {
        problems.push({ file, line: link.line, target, resolved, reason: "outside-repository" });
      } else if (!exists(resolved)) {
        problems.push({ file, line: link.line, target, resolved, reason: "missing" });
      }
    }
  }

  return { checked, skipped, placeholders, problems };
}
