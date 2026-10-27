/**
 * Keep the upstream divergence ledger true to the code it describes.
 *
 * `docs/upstream-divergences.md` is the one document a maintainer reads before
 * syncing upstream. Nothing else can decide whether it is still accurate, because
 * accuracy there is a judgement about upstream text. What a check *can* pin is the set
 * of facts the ledger claims: the counts and names it quotes, and the mapping rows it
 * summarizes. Those come from this repository, so a change that invalidates a number
 * in the ledger fails here instead of leaving a stale table for the next reader.
 *
 * This is the same failure the ledger exists to prevent, one level up: the port once
 * lost a capability while every gate stayed green because no gate asserted the
 * capability was there. A ledger nothing re-reads rots the same way.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CAPABILITIES } from "./capabilities.ts";
import { ROOT } from "./build-assets.ts";

/** Repository-relative path of the ledger. */
export const LEDGER_PATH = "docs/upstream-divergences.md";

/** The category names the ledger's rule table must define. */
export const LEDGER_CATEGORIES: readonly string[] = [
  "mapped",
  "degraded",
  "preserved",
  "excluded",
  "deferred",
];

/**
 * Category names the ledger's rule table must define that are not `coverage` values.
 *
 * `regression` is the ledger's own vocabulary for "the host could support this and the
 * port dropped it". `capabilities.ts` cannot express it, because a regression is never
 * an acceptable resting state.
 */
export const LEDGER_EXTRA_CATEGORIES: readonly string[] = ["regression"];

export interface LedgerProblem {
  readonly message: string;
}

/**
 * Assert the ledger exists, defines every category, and quotes the real numbers.
 *
 * The counts are derived from the same modules the generator reads, so a new
 * capability row or a new excluded skill fails the ledger until it is updated. Only
 * numbers the ledger actually states are checked; the point is that a maintainer
 * cannot update the code and leave the ledger describing the previous tree.
 */
export function checkDivergenceLedger(): readonly string[] {
  const path = join(ROOT, LEDGER_PATH);
  if (!existsSync(path)) {
    return [
      `${LEDGER_PATH}: missing. It lists every difference from upstream, and a sync must update it.`,
    ];
  }

  const text = readFileSync(path, "utf8");
  const problems: string[] = [];

  for (const category of LEDGER_CATEGORIES) {
    if (!text.includes(`\`${category}\``)) {
      problems.push(
        `${LEDGER_PATH}: does not define the \`${category}\` category, so a row using it has no stated meaning`,
      );
    }
  }

  for (const category of LEDGER_EXTRA_CATEGORIES) {
    if (!text.includes(`\`${category}\``)) {
      problems.push(
        `${LEDGER_PATH}: does not define the \`${category}\` category, so a row using it has no stated meaning`,
      );
    }
  }

  const mapped = CAPABILITIES.filter((entry) => entry.coverage === "mapped").length;
  const degraded = CAPABILITIES.filter((entry) => entry.coverage === "degraded").length;
  const excluded = CAPABILITIES.filter((entry) => entry.coverage === "excluded").length;

  // The ledger states these three counts, and restating a count is what makes it go
  // stale, so the check requires the current one rather than trusting a reader. The
  // match tolerates the counter word the ledger uses between the number and the
  // category name, because "17 mapped rows" and "17 条 `mapped`" are the same claim.
  for (const [label, count] of [
    ["mapped", mapped],
    ["degraded", degraded],
    ["excluded", excluded],
  ] as const) {
    const stated = new RegExp(`\\b${count}\\b[^\\n]{0,8}?\`${label}\``);
    if (!stated.test(text)) {
      problems.push(
        `${LEDGER_PATH}: does not state the current \`${label}\` count (${count}) from scripts/capabilities.ts; update the ledger's capability section`,
      );
    }
  }

  // The excluded skill is named in the ledger, so excluding another one has to reach it.
  const excludedSkills = CAPABILITIES.filter((entry) => entry.coverage === "excluded").map(
    (entry) => entry.cursor,
  );
  for (const cursor of excludedSkills) {
    const name = /`([a-z0-9-]+)`/.exec(cursor)?.[1];
    if (name !== undefined && !text.includes(`\`${name}\``)) {
      problems.push(
        `${LEDGER_PATH}: an excluded capability (\`${name}\`) is not named in the ledger, so a reader cannot see it is not carried`,
      );
    }
  }

  problems.push(...checkLedgerMembers(text));

  return problems;
}

/**
 * Assert the ledger still names every capability, not just the right number of them.
 *
 * The count check above cannot see a swap. It once passed while `/visualize` was absent
 * from the ledger's degraded table and an `excluded` row (`Cursor Automations`) was
 * listed there in its place: 13 rows, still 13. Quoting a total is not the same claim as
 * naming the members, and only the second one survives an edit that trades one row for
 * another.
 *
 * Each row carries a `ledgerAnchor` for this purpose rather than a mechanically derived
 * name. Deriving one from `cursor` was tried and rejected: the field is upstream prose
 * (`built-in pull request tool`), so the derived anchor matches nothing and reports a
 * drift that is not there.
 */
function checkLedgerMembers(text: string): readonly string[] {
  const problems: string[] = [];
  for (const capability of CAPABILITIES) {
    if (!text.includes(capability.ledgerAnchor)) {
      problems.push(
        `${LEDGER_PATH}: the ${capability.coverage} capability "${capability.id}" is not named; ` +
          `the ledger's member list is missing ${JSON.stringify(capability.ledgerAnchor)}`,
      );
    }
  }
  return problems;
}
