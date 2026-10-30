import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { OPTIONAL_PLUGINS, recommendedBundleNames } from "../src/internal/optional-plugins.ts";
import {
  dismissGuidance,
  enableRecommendedPlugins,
  GUIDANCE_DISMISSED_KEY,
  guidanceDismissed,
  optionalPluginRows,
  optionalPluginStatus,
  remainingRecommendedCount,
  type BundleSnapshot,
  type GuidanceStorage,
} from "../src/client/optional-plugins-state.ts";

const docUrl = new URL("../pstack/harness/docs/harness/dsh.md", import.meta.url);

function documentedRows(): Map<string, string[]> {
  const text = readFileSync(docUrl, "utf8");
  const rows = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    const match = /^\|\s*(OPT-\d{2})\s*\|(.*)\|$/.exec(line.trim());
    if (match === null) continue;
    rows.set(
      match[1]!,
      [...match[2]!.matchAll(/`(@[A-Za-z0-9@/._-]+)`/g)].map((entry) => entry[1]!),
    );
  }
  return rows;
}

function bundle(name: string, overrides: Partial<BundleSnapshot> = {}): BundleSnapshot {
  return {
    name,
    availability: "installation",
    enabled: false,
    installed: false,
    optional: true,
    ...overrides,
  };
}

function memoryStorage(): GuidanceStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("optional plugin catalogue", () => {
  it("matches every OPT row and package in the harness adapter", () => {
    const documented = documentedRows();
    expect(OPTIONAL_PLUGINS.map((plugin) => plugin.id)).toEqual([...documented.keys()]);
    for (const plugin of OPTIONAL_PLUGINS) {
      expect(plugin.packages, plugin.id).toEqual(documented.get(plugin.id));
    }
  });

  it("names every catalogue package in both READMEs", () => {
    const english = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const chinese = readFileSync(new URL("../README.zh.md", import.meta.url), "utf8");
    for (const plugin of OPTIONAL_PLUGINS) {
      for (const packageName of plugin.packages) {
        expect(english, `${plugin.id} ${packageName}`).toContain(packageName);
        expect(chinese, `${plugin.id} ${packageName}`).toContain(packageName);
      }
    }
  });

  it("keeps the default recommendation in documented order", () => {
    expect(recommendedBundleNames()).toEqual([
      "@deepseek-ai/dsh-experimental-tool-worktree",
      "@deepseek-ai/dsh-experimental-session-search",
    ]);
    expect(
      OPTIONAL_PLUGINS.filter((plugin) => plugin.recommended).map((plugin) => plugin.id),
    ).toEqual(["OPT-01", "OPT-06"]);
    expect(OPTIONAL_PLUGINS.find((plugin) => plugin.id === "OPT-02")?.suggested).toBe(true);
    expect(OPTIONAL_PLUGINS.find((plugin) => plugin.id === "OPT-08")?.switchable).toBe(false);
  });
});

describe("optional plugin status", () => {
  it("maps enabled, off, missing, platform, and error facts", () => {
    expect(optionalPluginStatus(undefined)).toBe("missing");
    expect(optionalPluginStatus(bundle("a", { enabled: true }))).toBe("enabled");
    expect(optionalPluginStatus(bundle("a"))).toBe("off");
    expect(optionalPluginStatus(bundle("a", { availability: "missing" }))).toBe("missing");
    expect(optionalPluginStatus(bundle("a", { error: { code: "unsupported-platform" } }))).toBe(
      "unsupported-platform",
    );
    expect(
      optionalPluginStatus(bundle("a", { error: { code: "operation-error", diagnostic: "boom" } })),
    ).toBe("error");
  });

  it("only offers switches to bundle rows that are off or on", () => {
    const rows = optionalPluginRows([
      bundle("@deepseek-ai/dsh-experimental-tool-worktree", { enabled: true }),
      bundle("@deepseek-ai/dsh-experimental-forge-bundle"),
      bundle("@deepseek-ai/dsh-experimental-cua-bundle", {
        error: { code: "unsupported-platform" },
      }),
    ]);
    const byId = new Map(rows.map((row) => [row.definition.id, row]));
    expect(byId.get("OPT-01")?.canToggle).toBe(true);
    expect(byId.get("OPT-02")?.canToggle).toBe(true);
    expect(byId.get("OPT-03")?.canToggle).toBe(false);
    expect(byId.get("OPT-04")?.canToggle).toBe(false);
    expect(byId.get("OPT-08")?.canToggle).toBe(false);
  });

  it("counts the default recommendation still off for activation guidance", () => {
    const rows = optionalPluginRows([
      bundle("@deepseek-ai/dsh-experimental-tool-worktree"),
      bundle("@deepseek-ai/dsh-experimental-session-search", { enabled: true }),
    ]);
    expect(remainingRecommendedCount(rows)).toBe(1);
    expect(remainingRecommendedCount(optionalPluginRows([]))).toBe(2);
  });
});

describe("enable recommended plugins", () => {
  it("enables the default set sequentially and summarizes outcomes", async () => {
    const calls: string[] = [];
    const rows = optionalPluginRows([
      bundle("@deepseek-ai/dsh-experimental-tool-worktree"),
      bundle("@deepseek-ai/dsh-experimental-session-search"),
    ]);
    const summary = await enableRecommendedPlugins(
      {
        setBundleEnabled: async (name) => {
          calls.push(name);
          return { application: "applied" };
        },
      },
      rows,
    );
    expect(calls).toEqual([
      "@deepseek-ai/dsh-experimental-tool-worktree",
      "@deepseek-ai/dsh-experimental-session-search",
    ]);
    expect(summary).toMatchObject({ applied: 2, restartRequired: 0, failed: 0, skipped: 0 });
    expect(summary.outcomes.map((outcome) => outcome.id)).toEqual(["OPT-01", "OPT-06"]);
  });

  it("continues after one failure and reports it", async () => {
    const calls: string[] = [];
    const rows = optionalPluginRows([
      bundle("@deepseek-ai/dsh-experimental-tool-worktree"),
      bundle("@deepseek-ai/dsh-experimental-session-search"),
    ]);
    const summary = await enableRecommendedPlugins(
      {
        setBundleEnabled: async (name) => {
          calls.push(name);
          if (name.includes("tool-worktree")) throw new Error("no permission");
          return { application: "restart-required" };
        },
      },
      rows,
    );
    expect(calls).toHaveLength(2);
    expect(summary).toMatchObject({ applied: 0, restartRequired: 1, failed: 1, skipped: 0 });
    expect(summary.outcomes.map((outcome) => outcome.application)).toEqual([
      "error",
      "restart-required",
    ]);
  });

  it("skips a recommended bundle the Host does not list", async () => {
    const calls: string[] = [];
    const rows = optionalPluginRows([bundle("@deepseek-ai/dsh-experimental-tool-worktree")]);
    const summary = await enableRecommendedPlugins(
      {
        setBundleEnabled: async (name) => {
          calls.push(name);
          return { application: "applied" };
        },
      },
      rows,
    );
    expect(calls).toEqual(["@deepseek-ai/dsh-experimental-tool-worktree"]);
    expect(summary).toMatchObject({ applied: 1, failed: 0, skipped: 1 });
  });
});

describe("activation guidance storage", () => {
  it("dismisses once and keeps the marker", () => {
    const storage = memoryStorage();
    expect(guidanceDismissed(storage)).toBe(false);
    dismissGuidance(storage);
    expect(storage.values.get(GUIDANCE_DISMISSED_KEY)).toBe("1");
    expect(guidanceDismissed(storage)).toBe(true);
  });

  it("treats unavailable storage as not dismissed", () => {
    expect(guidanceDismissed(undefined)).toBe(false);
    expect(() => dismissGuidance(undefined)).not.toThrow();
  });
});
