import { describe, expect, it } from "vite-plus/test";

import { CAPABILITIES, detectableCapabilities, renderHarnessDoc } from "../scripts/capabilities.ts";

describe("capability table", () => {
  it("has unique ids and covers the host surface named by the design", () => {
    const ids = CAPABILITIES.map((capability) => capability.id);

    expect(ids.length).toBeGreaterThanOrEqual(17);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "task-spawn",
        "model-route",
        "models-rule",
        "project-skills",
        "transcripts",
        "custom-mode",
        "loop",
        "automations",
        "cloud-agent",
        "worktree",
        "make-bot-ui",
      ]),
    );
  });

  it("requires a reason and delivery unit for every non-mapped row", () => {
    for (const capability of CAPABILITIES) {
      if (capability.coverage === "mapped") continue;
      expect(capability.reason.trim().length, capability.id).toBeGreaterThan(0);
      expect(capability.unit.trim().length, capability.id).toBeGreaterThan(0);
    }
  });

  it("records the unsupported paths trigger without promising a later unit", () => {
    const paths = CAPABILITIES.find((capability) => capability.id === "skill-paths-field");

    expect(paths?.coverage).toBe("degraded");
    if (paths?.coverage === "mapped") throw new Error("expected an unmapped row");
    expect(paths?.unit).toBe("not planned");
    expect(paths?.reason).toContain("explicit invocation");
  });

  it("keeps table cells single-line and pipe-free", () => {
    for (const capability of CAPABILITIES) {
      for (const value of [capability.cursor, capability.dsh, capability.note ?? ""]) {
        expect(value, capability.id).not.toContain("\n");
        expect(value, capability.id).not.toContain("|");
      }
    }
  });

  it("renders a target-contract document, not an installed-capability claim", () => {
    const doc = renderHarnessDoc();

    expect(doc).toContain("# DSH harness mapping");
    expect(doc).toContain("ships static assets only");
    expect(doc).toContain("target contract");
    expect(doc).toContain("`pstack_subagent`");
    expect(doc).toContain("`/make-bot-ui`");
    expect(doc).toContain("not planned");
    expect(renderHarnessDoc()).toBe(doc);
  });

  it("exposes the literal tokens used by the audit", () => {
    expect(detectableCapabilities().map((capability) => capability.detect)).toEqual(
      expect.arrayContaining(["run_in_background", "pstack-models.mdc", "/loop", "Bugbot"]),
    );
  });
});
