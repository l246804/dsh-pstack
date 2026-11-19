import { createHash } from "node:crypto";

/** The subset of a native gap entry the scenario contract depends on. */
export interface LockedGap {
  id: string;
  description?: string;
  status: string;
}

export interface GapLock {
  gaps: Record<string, string>;
}

/** Stable fingerprint of a gap's identity and text. Status is lifecycle, not contract. */
export function gapDigest(gap: LockedGap): string {
  return createHash("sha256")
    .update(`${gap.id}\n${gap.description ?? ""}`)
    .digest("hex");
}

/** Only confirmed gaps drive scenarios, so only they are locked. */
export function expectedGapLock(gaps: readonly LockedGap[]): GapLock {
  const entries = gaps
    .filter((gap) => gap.status === "confirmed")
    .map((gap) => [gap.id, gapDigest(gap)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return { gaps: Object.fromEntries(entries) };
}

/**
 * Cross-check the committed lock against the current gap list. A missing,
 * stale, or orphaned entry means the scenario side may no longer match the
 * gap it was written for, so every problem names the next action.
 */
export function gapLockProblems(gaps: readonly LockedGap[], lock: GapLock): string[] {
  const problems: string[] = [];
  const expected = expectedGapLock(gaps).gaps;
  const known = new Set(gaps.map((gap) => gap.id));
  const statusById = new Map(gaps.map((gap) => [gap.id, gap.status]));

  for (const [id, digest] of Object.entries(expected)) {
    const locked = lock.gaps[id];
    if (locked === undefined) {
      problems.push(
        `confirmed gap ${id} has no gap-lock entry; review or add its scenario, then run vp run playground:gap-lock -- --write`,
      );
    } else if (locked !== digest) {
      problems.push(
        `gap ${id} changed; review its scenarios against the new description, then run vp run playground:gap-lock -- --write`,
      );
    }
  }
  for (const id of Object.keys(lock.gaps)) {
    if (!known.has(id)) {
      problems.push(`gap-lock has an entry for unknown gap ${id}; remove it`);
    } else if (statusById.get(id) !== "confirmed") {
      problems.push(
        `gap-lock has an entry for non-confirmed gap ${id} (status ${statusById.get(id)}); remove its scenarios and rerun --write`,
      );
    }
  }
  return problems;
}
