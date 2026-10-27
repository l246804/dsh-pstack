import { describe, expect, it } from "vite-plus/test";

import {
  AUDIT_CONTEXT,
  AUDIT_CONTEXT_NAME,
  AUDIT_CONTEXT_TEXT,
  AUDIT_DIRECTORY,
  registerAuditContext,
} from "../src/audit-context.ts";
import { apply } from "../src/index.ts";
import type { SkillProvider, SkillProviderControl } from "../src/provider.ts";

/**
 * The placement rule, and the promise it must not overstate.
 *
 * Upstream tells the model where its store is through the system prompt. This host
 * has no store, so the port states a repository directory instead. The risk is that
 * the sentence quietly grows into a durability claim the host cannot back — the same
 * shape as the effort regression recorded in `docs/upstream-divergences.md`, where a
 * capability was weakened by wording rather than by a code change.
 */

function fakeHost() {
  const registered: string[] = [];
  const disposers: string[] = [];
  return {
    registered,
    disposers,
    host: {
      skills: {
        registerProvider(create: (control: SkillProviderControl) => SkillProvider) {
          void create;
          return () => {};
        },
      },
      systemPrompt: {
        context(contribution: { name: string }) {
          registered.push(contribution.name);
          return () => {
            disposers.push(contribution.name);
          };
        },
      },
    },
  };
}

describe("audit context contribution", () => {
  it("names the ignored audit directory", () => {
    expect(AUDIT_DIRECTORY).toBe(".audit");
    expect(AUDIT_CONTEXT_TEXT).toContain("`.audit/`");
  });

  it("is required, so it survives optional runtime context being switched off", () => {
    expect(AUDIT_CONTEXT.required).toBe(true);
  });

  it("keeps the plugin name in the registry key", () => {
    // The host throws on a duplicate name inside one layer, so an unprefixed key
    // would collide with any other plugin that also wants to say where files go.
    expect(AUDIT_CONTEXT_NAME.startsWith("pstack:")).toBe(true);
  });

  it("does not claim the directory outlives the session", () => {
    // The files persist on disk; nothing resumes from them on its own. A sentence
    // that implies otherwise is the defect this assertion exists to prevent.
    expect(AUDIT_CONTEXT_TEXT).toContain("nothing resumes from that directory on its own");
  });

  it("keeps the trail out of version control by default", () => {
    expect(AUDIT_CONTEXT_TEXT).toContain("stays out of version control");
  });
});

describe("registerAuditContext", () => {
  it("registers when the host has a prompt registry", () => {
    const { registered, host } = fakeHost();
    expect(registerAuditContext(host)).toBe(true);
    expect(registered).toEqual([AUDIT_CONTEXT_NAME]);
  });

  it("reports false instead of throwing when the host has none", () => {
    // A tool-only composition still gets every skill and tool; it loses one
    // sentence, and refusing to start over that would be the worse outcome.
    expect(registerAuditContext({})).toBe(false);
  });

  it("wires through plugin activation", () => {
    const { registered, host } = fakeHost();
    apply(host, {});
    expect(registered).toEqual([AUDIT_CONTEXT_NAME]);
  });
});
