/**
 * Locating and applying file patches.
 *
 * Every anchor is resolved against the upstream text exactly once, before any
 * replacement lands. The result is a single splice over the original string,
 * so a later patch can never match text an earlier patch inserted.
 */
import type { FilePatch } from "./types.ts";

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchError";
  }
}

export interface PatchMatch {
  readonly patch: FilePatch;
  readonly start: number;
  readonly end: number;
}

interface AnchorMatch {
  readonly start: number;
  readonly end: number;
}

export function locatePatchMatches(
  file: string,
  source: string,
  patches: readonly FilePatch[],
): readonly PatchMatch[] {
  const matches: PatchMatch[] = [];

  for (const patch of patches) {
    if (patch.file !== file) {
      throw new PatchError(`${file}: patch targets "${patch.file}" instead`);
    }
    if (!Number.isInteger(patch.expectedMatches) || patch.expectedMatches < 1) {
      throw new PatchError(`${file}: expectedMatches must be a positive integer`);
    }

    const hits = findAnchorMatches(source, patch.anchor);
    if (hits.length !== patch.expectedMatches) {
      throw new PatchError(
        `${file}: anchor for ${patch.kind} matched ${hits.length} time(s), expected ${patch.expectedMatches}: ${describeAnchor(patch.anchor)}`,
      );
    }
    for (const hit of hits) matches.push({ patch, ...hit });
  }

  const ordered = [...matches].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1] as PatchMatch;
    const current = ordered[index] as PatchMatch;
    if (current.start < previous.end) {
      throw new PatchError(
        `${file}: patches overlap at offset ${current.start} (${previous.patch.kind} and ${current.patch.kind})`,
      );
    }
  }

  return ordered;
}

export function applyFilePatches(
  file: string,
  source: string,
  patches: readonly FilePatch[],
): string {
  const matches = locatePatchMatches(file, source, patches);
  let result = source;

  for (const match of [...matches].reverse()) {
    const replacement = match.patch.kind === "drop" ? "" : match.patch.replacement;
    result = `${result.slice(0, match.start)}${replacement}${result.slice(match.end)}`;
  }

  return result;
}

function findAnchorMatches(text: string, anchor: string | RegExp): readonly AnchorMatch[] {
  if (typeof anchor === "string") {
    if (anchor.length === 0) throw new PatchError("string anchors must not be empty");
    const hits: AnchorMatch[] = [];
    let from = 0;
    for (;;) {
      const start = text.indexOf(anchor, from);
      if (start === -1) return hits;
      hits.push({ start, end: start + anchor.length });
      from = start + anchor.length;
    }
  }

  // A caller may reuse a RegExp, so copy it without lastIndex state.
  const flags = `${anchor.flags.replaceAll("g", "").replaceAll("y", "")}g`;
  const regexp = new RegExp(anchor.source, flags);
  const hits: AnchorMatch[] = [];
  for (const match of text.matchAll(regexp)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (end === start)
      throw new PatchError(`regex anchor matched empty text: ${describeAnchor(anchor)}`);
    hits.push({ start, end });
  }
  return hits;
}

function describeAnchor(anchor: string | RegExp): string {
  if (typeof anchor === "string") {
    const oneLine = anchor.replaceAll("\n", "\\n");
    return JSON.stringify(oneLine.length > 120 ? `${oneLine.slice(0, 120)}...` : oneLine);
  }
  return String(anchor);
}
