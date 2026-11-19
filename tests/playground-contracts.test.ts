import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { parseConfig } from "../playground/runner/lib/config.ts";
import { loadProviderPlan } from "../playground/runner/lib/provider.ts";
import {
  gapCoverageProblems,
  type CoverageGap,
  type GapCoverageScenario,
} from "../playground/scripts/lib/coverage.ts";
import {
  expectedGapLock,
  gapLockProblems,
  type GapLock,
  type LockedGap,
} from "../playground/scripts/lib/gap-lock.ts";
import { environments, scenariosById } from "../playground/runner/scenario/index.ts";

function gaps(): CoverageGap[] {
  const text = readFileSync(new URL("../native/gaps.json", import.meta.url), "utf8");
  return (JSON.parse(text) as { gaps: CoverageGap[] }).gaps;
}

type GapFile = { path: string; gaps: string[] };
type GapEntry = CoverageGap & { description?: string };

function gapDocument(): { gaps: GapEntry[]; files: GapFile[] } {
  const text = readFileSync(new URL("../native/gaps.json", import.meta.url), "utf8");
  return JSON.parse(text) as { gaps: GapEntry[]; files: GapFile[] };
}

function gapLock(): GapLock {
  const text = readFileSync(
    new URL("../playground/scenarios/gap-lock.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(text) as GapLock;
}

function walkMarkdown(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return walkMarkdown(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

/** Every markdown file under the generated tree, as package-relative paths. */
function treeMarkdown(): string[] {
  const nativeRoot = fileURLToPath(new URL("../native", import.meta.url));
  return ["skills", "agents", "docs/guide"]
    .flatMap((dir) => walkMarkdown(join(nativeRoot, "pstack", dir)))
    .map((path) => relative(nativeRoot, path).split(sep).join("/"));
}

/** Answer documents may back a gap's DSH side; they are not upstream skill files. */
const ANSWER_SOURCES = new Set(["dsh.md", "dsh-evidence.md"]);

describe("native gap enumeration", () => {
  const document = gapDocument();
  const gapIds = new Set(document.gaps.map((gap) => gap.id));
  const enumerated = new Set(document.files.map((file) => file.path));

  it("enumerates every markdown file of the generated tree, no more, no less", () => {
    expect([...enumerated].sort()).toEqual(treeMarkdown().sort());
  });

  it("keeps every file gap id inside the gap list", () => {
    const unknown = document.files.flatMap((file) =>
      file.gaps.filter((id) => !gapIds.has(id)).map((id) => `${file.path}:${id}`),
    );
    expect(unknown).toEqual([]);
  });

  it("cites every gap source from the enumerated tree or the answer documents", () => {
    const dangling = document.gaps.flatMap((gap) =>
      (gap.sources ?? [])
        .filter((source) => {
          const path = source.replace(/[#?].*/, "");
          return !enumerated.has(path) && !ANSWER_SOURCES.has(path);
        })
        .map((source) => `${gap.id}:${source}`),
    );
    expect(dangling).toEqual([]);
  });

  it("grounds every gap in at least one enumerated tree file", () => {
    const ungrounded = document.gaps
      .filter((gap) =>
        (gap.sources ?? []).every((source) => !enumerated.has(source.replace(/[#?].*/, ""))),
      )
      .map((gap) => gap.id);
    expect(ungrounded).toEqual([]);
  });
});

function scenarios(): GapCoverageScenario[] {
  return [...scenariosById.values()].map((scenario) => ({
    id: scenario.id,
    kind: scenario.kind,
    capability: scenario.capability,
    gap: scenario.gap,
    treatments: scenario.treatments,
  }));
}

function config(provider = "provider-a", model = "model-a", effort = "low") {
  return {
    testModel: { provider, model, effort },
    providers: {
      "provider-a": {
        kind: "pi-ai",
        apiKey: "secret-a",
        apiKeyEnv: "PROVIDER_A_KEY",
        models: [{ id: "model-a", reasoningEfforts: { low: "low", high: "high" } }],
      },
      "provider-b": {
        kind: "pi-ai",
        apiKey: "secret-b",
        apiKeyEnv: "PROVIDER_B_KEY",
        models: [{ id: "model-b", reasoningEfforts: { medium: "medium" } }],
      },
    },
  };
}

describe("playground configuration", () => {
  it.each([
    ["provider-a", "model-a", "high"],
    ["provider-b", "model-b", "medium"],
  ])("selects an allowed target %s/%s[%s]", (provider, model, effort) => {
    expect(loadProviderPlan(parseConfig(config(provider, model, effort))).main).toMatchObject({
      provider,
      model,
      effort,
    });
  });

  it.each([
    ["unknown-provider", "model-a", "low"],
    ["provider-a", "unknown-model", "low"],
    ["provider-b", "model-b", "low"],
  ])("rejects a target outside the allowance %s/%s[%s]", (provider, model, effort) => {
    expect(() => loadProviderPlan(parseConfig(config(provider, model, effort)))).toThrow(
      /testModel/,
    );
  });

  it("uses the existing bare model ids in the provider allowlist", () => {
    expect(
      loadProviderPlan(parseConfig(config())).routes.some((route) => route.model === "model-a"),
    ).toBe(true);
  });

  it("accepts role model routes that resolve against the provider allowlist", () => {
    const parsed = parseConfig({
      ...config(),
      roleModels: {
        "bug-fix": { provider: "provider-a", model: "model-a", effort: "low" },
      },
    });
    expect(parsed.roleModels?.["bug-fix"]).toEqual({
      provider: "provider-a",
      model: "model-a",
      effort: "low",
    });
  });

  it("accepts a managed or CDP browser config and rejects CDP without a URL", () => {
    expect(
      parseConfig({ ...config(), browser: { mode: "managed", headed: true } }).browser,
    ).toEqual({ mode: "managed", headed: true });
    expect(
      parseConfig({ ...config(), browser: { mode: "cdp", cdpUrl: "http://127.0.0.1:9222" } })
        .browser,
    ).toEqual({ mode: "cdp", cdpUrl: "http://127.0.0.1:9222" });
    expect(() => parseConfig({ ...config(), browser: { mode: "cdp" } })).toThrow(/browser\.cdpUrl/);
  });

  it("accepts DeepSeek API-key and account provider kinds", () => {
    expect(() =>
      parseConfig({
        ...config(),
        testModel: { provider: "deepseek-official", model: "deepseek-flash", effort: "high" },
        providers: {
          "deepseek-official": {
            kind: "deepseek-api-key",
            apiKey: "secret",
            models: [{ id: "deepseek-flash", reasoningEfforts: { high: "high" } }],
          },
        },
      }),
    ).not.toThrow();
    expect(() =>
      parseConfig({
        ...config(),
        testModel: { provider: "deepseek-account", model: "deepseek-flash", effort: "high" },
        providers: { "deepseek-account": { kind: "deepseek-account", modelOverrides: {} } },
      }),
    ).not.toThrow();
  });
});

describe("playground environments", () => {
  it("declares complete plugin environments instead of host inheritance", () => {
    for (const environment of environments) {
      expect(environment.id).not.toBe("");
      expect(new Set(environment.enabledPluginPackages).size).toBe(
        environment.enabledPluginPackages.length,
      );
    }
  });
});

describe("gapCoverageProblems", () => {
  const scenario = (
    id: string,
    kind?: string,
    gap?: string,
    treatments?: readonly string[],
    capability?: string,
  ): GapCoverageScenario => ({ id, kind, gap, treatments, capability });

  it("allows an empty gap list and empty scenarios", () => {
    expect(gapCoverageProblems([], [])).toEqual([]);
  });

  it("reports no problems for the real gaps and gap scenarios", () => {
    expect(gapCoverageProblems(scenarios(), gaps())).toEqual([]);
  });

  it("requires every confirmed gap to have a gap scenario", () => {
    expect(gapCoverageProblems([], [{ id: "gap-a", status: "confirmed" }])).toEqual([
      "confirmed gap gap-a has no gap scenario; add one under playground/scenarios/probes or revert the status",
    ]);
  });

  it("rejects scenarios that point at a gap which is not confirmed", () => {
    expect(
      gapCoverageProblems(
        [scenario("probe-a", "gap", "gap-a", ["native", "adapted"], "gap-a")],
        [{ id: "gap-a", status: "proposed" }],
      ),
    ).toContain(
      "gap scenario probe-a references gap gap-a with status proposed; delete the scenario or restore the gap to confirmed",
    );
  });

  it("requires a gap scenario capability to be its gap id", () => {
    expect(
      gapCoverageProblems(
        [scenario("probe-a", "gap", "gap-a", ["native", "adapted"], "capability-a")],
        [{ id: "gap-a", status: "confirmed" }],
      ),
    ).toContain("gap scenario probe-a must use its gap id as capability (gap-a), not capability-a");
  });

  it("reports gap scenarios without a gap or with an unknown gap", () => {
    expect(
      gapCoverageProblems([scenario("probe-a", "gap")], [{ id: "gap-a", status: "confirmed" }]),
    ).toEqual(expect.arrayContaining(["gap scenario probe-a has no gap id"]));
    expect(
      gapCoverageProblems(
        [scenario("probe-a", "gap", "gap-x", ["native", "adapted"])],
        [{ id: "gap-a", status: "confirmed" }],
      ),
    ).toEqual(
      expect.arrayContaining([
        "gap scenario probe-a references unknown gap gap-x",
        "confirmed gap gap-a has no gap scenario; add one under playground/scenarios/probes or revert the status",
      ]),
    );
  });

  it("requires a gap scenario to run in both treatments and a regression to have no gap", () => {
    expect(
      gapCoverageProblems(
        [scenario("probe-a", "gap", "gap-a", ["adapted"])],
        [{ id: "gap-a", status: "confirmed" }],
      ),
    ).toContain("gap scenario probe-a must run in both native and adapted");
    expect(
      gapCoverageProblems(
        [scenario("probe-r", "regression", "gap-a")],
        [{ id: "gap-a", status: "confirmed" }],
      ),
    ).toContain("regression scenario probe-r must not declare a gap");
  });

  it("reports a scenario without a kind", () => {
    expect(gapCoverageProblems([scenario("probe-a")], [])).toContain(
      "scenario probe-a has no kind",
    );
  });
});

describe("gap lock", () => {
  const gap = (id: string, status = "confirmed", description = "a behavior"): LockedGap => ({
    id,
    status,
    description,
  });

  it("matches the committed lock to the current confirmed gaps", () => {
    expect(gapLockProblems(gapDocument().gaps, gapLock())).toEqual([]);
  });

  it("reports a confirmed gap without a lock entry", () => {
    expect(gapLockProblems([gap("gap-a")], { gaps: {} })).toEqual([
      "confirmed gap gap-a has no gap-lock entry; review or add its scenario, then run vp run playground:gap-lock -- --write",
    ]);
  });

  it("reports a changed description", () => {
    const lock = expectedGapLock([gap("gap-a", "confirmed", "old text")]);
    expect(gapLockProblems([gap("gap-a", "confirmed", "new text")], lock)).toEqual([
      "gap gap-a changed; review its scenarios against the new description, then run vp run playground:gap-lock -- --write",
    ]);
  });

  it("reports orphaned and non-confirmed lock entries", () => {
    const lock = expectedGapLock([gap("gap-a")]);
    expect(gapLockProblems([], { gaps: { "gap-x": "digest" } })).toEqual([
      "gap-lock has an entry for unknown gap gap-x; remove it",
    ]);
    expect(gapLockProblems([gap("gap-a", "refuted")], lock)).toEqual([
      "gap-lock has an entry for non-confirmed gap gap-a (status refuted); remove its scenarios and rerun --write",
    ]);
  });
});
