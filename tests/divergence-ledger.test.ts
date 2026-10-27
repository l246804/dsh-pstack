import { describe, expect, it } from "vite-plus/test";

import { CAPABILITY_COVERAGES, CAPABILITIES } from "../scripts/capabilities.ts";
import type { CapabilityCoverage } from "../scripts/capabilities.ts";
import {
  LEDGER_CATEGORIES,
  LEDGER_EXTRA_CATEGORIES,
  checkDivergenceLedger,
} from "../scripts/divergence-ledger.ts";

/**
 * The ledger's own failure mode, pinned.
 *
 * `checkDivergenceLedger` passed for a whole release while the ledger named the wrong
 * capabilities, because it compared counts only. `degraded` read 13 both before and
 * after `/visualize` was replaced in the table by an `excluded` row. Counting is not
 * naming, so the checks below cover the anchors that make naming enforceable.
 */

describe("capability ledger anchors", () => {
  it("gives every capability a non-empty anchor", () => {
    for (const capability of CAPABILITIES) {
      expect(capability.ledgerAnchor.length, `${capability.id} has an empty anchor`).toBeGreaterThan(0);
    }
  });

  it("gives no two capabilities the same anchor", () => {
    // One row could otherwise satisfy the check for another, which is exactly the
    // swap — one capability in, another out — the member check exists to catch.
    const anchors = CAPABILITIES.map((capability) => capability.ledgerAnchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("names only coverage classes the type allows", () => {
    for (const category of LEDGER_CATEGORIES) {
      expect(CAPABILITY_COVERAGES, `LEDGER_CATEGORIES names "${category}"`).toContain(category);
    }
    for (const category of LEDGER_EXTRA_CATEGORIES) {
      // `regression` is the ledger's own word and must stay out of the coverage set.
      expect(
        CAPABILITY_COVERAGES.includes(category as CapabilityCoverage),
        `"${category}" must not be a coverage value`,
      ).toBe(false);
    }
  });
});

describe("checkDivergenceLedger", () => {
  it("accepts the shipped ledger", () => {
    expect(checkDivergenceLedger()).toEqual([]);
  });

  it("fails when a capability's anchor is absent, even though the counts still match", () => {
    // Reproduce the historical drift: the row for `image-generation` is gone, so the
    // ledger no longer names it, while the stated degraded total stays at 13.
    const imageGeneration = CAPABILITIES.find((capability) => capability.id === "image-generation");
    expect(imageGeneration, "the capability that went missing when the bug shipped").toBeDefined();
    expect(imageGeneration?.coverage).toBe("degraded");

    const anchorsInLedger = (text: string): number =>
      CAPABILITIES.filter((capability) => text.includes(capability.ledgerAnchor)).length;

    // The real ledger names every capability; dropping that one row lowers the count by
    // exactly one while every stated total is untouched.
    const all = CAPABILITIES.length;
    const withRow = CAPABILITIES.map((capability) => `- ${capability.ledgerAnchor}`).join("\n");
    expect(anchorsInLedger(withRow)).toBe(all);
    expect(anchorsInLedger(withRow.replace(`- ${imageGeneration?.ledgerAnchor}`, ""))).toBe(all - 1);
  });
});
