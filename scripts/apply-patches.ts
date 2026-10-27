import { statSync } from "node:fs";
import { join, posix } from "node:path";

import { PATCH_SCOPES } from "./patches.ts";
import type { FilePatch } from "./patches.ts";

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

export function validatePatchTargets(
  patches: readonly FilePatch[],
  upstreamRoot: string,
): void {
  for (const patch of patches) {
    if (patch.file !== posix.normalize(patch.file) || patch.file.includes("\\")) {
      throw new PatchError(`${patch.file}: patch target must be a normalized POSIX path`);
    }
    if (!PATCH_SCOPES.some((prefix) => patch.file.startsWith(prefix))) {
      throw new PatchError(`${patch.file}: patch target is outside ${PATCH_SCOPES.join(", ")}`);
    }
    if (!isRegularFile(join(upstreamRoot, patch.file))) {
      throw new PatchError(`${patch.file}: upstream target is not a regular file`);
    }
  }
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

/**
 * Assert that a `replace` patch's promised fragments are evidence of the replacement.
 *
 * `outputIncludes` means "the text this patch introduces", not "text somewhere in the
 * file". The old check ran on the whole rendered output, so a fragment that upstream
 * already contains made the assertion true no matter what the patch did: changing a
 * `replace` back to its own anchor still passed. Measured before this function
 * existed: 4 of 320 `replace` patches declared fragments that were already in the
 * upstream source.
 *
 * Only `replace` patches are checked for two reasons:
 *
 * 1. A `drop` has no replacement to introduce anything. Its `outputIncludes`
 *    legitimately describes *surviving* content ("this row's neighbour is still
 *    there"), and no fragment of that kind can be absent from upstream. The half that
 *    proves a drop is `assertDropLanded`, which requires the removed span to be gone.
 * 2. `path` and `reflow` patches rewrite in place, so the same argument applies.
 *
 * For a `replace`, both conditions have to hold: the fragment must not already be
 * upstream, and it must appear inside this patch's own `replacement`.
 */
export function assertPatchOutputIsEvidence(
  file: string,
  patch: FilePatch,
  source: string,
): void {
  if (patch.kind !== "replace") return;
  for (const fragment of patch.outputIncludes ?? []) {
    if (source.includes(fragment)) {
      throw new PatchError(
        `${file}: outputIncludes ${JSON.stringify(fragment)} already exists upstream, so it ` +
          `proves nothing; assert a fragment the replacement introduces`,
      );
    }
    if (!patch.replacement.includes(fragment)) {
      throw new PatchError(
        `${file}: outputIncludes ${JSON.stringify(fragment)} is not part of this patch's ` +
          `replacement, so the patch cannot have introduced it`,
      );
    }
  }
}

/**
 * Assert that a `drop` patch really removed the span it matched.
 *
 * The general `outputIncludes` check cannot prove this: it only asks whether the
 * promise text is present, and a drop that removes nothing leaves every other
 * fragment untouched. This re-locates the anchor in the *source*, takes the exact
 * dropped text, and requires it to be absent from the output.
 */
/**
 * Assert that every deletion a patch promises really happened.
 *
 * A `drop` patch is the only shape, now that the prose patches are gone. The check the
 * review found missing still stands: a drop whose replacement was changed to equal its
 * anchor left the section in the tree while every gate passed, because the only
 * assertion was "this text still appears somewhere".
 */
export function assertDropLanded(
  file: string,
  patches: readonly FilePatch[],
  source: string,
  output: string,
): void {
  // Anchors are located against the original source, so the spans are the exact
  // bytes the patch was supposed to delete.
  const matches = locatePatchMatches(file, source, patches);
  for (const match of matches) {
    if (match.patch.kind === "drop") {
      const dropped = source.slice(match.start, match.end);
      if (dropped === "") continue;
      if (output.includes(dropped)) {
        throw new PatchError(
          `${file}: drop patch did not remove its span; the output still contains ` +
            `${JSON.stringify(dropped.slice(0, 80))}`,
        );
      }
      continue;
    }
  }
}

export function assertPatchOutput(
  file: string,
  patches: readonly FilePatch[],
  output: string,
): void {
  for (const patch of patches) {
    for (const fragment of patch.outputIncludes ?? []) {
      if (!output.includes(fragment)) {
        throw new PatchError(`${file}: generated output is missing ${JSON.stringify(fragment)}`);
      }
    }
  }
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

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
