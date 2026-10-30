import { describe, expect, it } from "vite-plus/test";

import {
  appendRoute,
  draftIssues,
  draftsFromSnapshot,
  effortChoices,
  formatRoute,
  inheritRoute,
  modelChoices,
  removeRoute,
  replaceRoute,
  sameRoutes,
} from "../src/client/state.ts";
import { parseRoleConfiguration } from "../src/internal/role-config.ts";
import { snapshotFromConfiguration } from "../src/internal/role-editor.ts";
import type { CatalogueResult } from "../src/models.ts";

const catalogue: CatalogueResult = {
  truncated: false,
  providers: [
    {
      provider: "cpa",
      name: "CPA",
      models: [{ route: "cpa/model-a", id: "model-a", name: "Model A", efforts: ["low", "high"] }],
    },
  ],
};

describe("role page draft state", () => {
  it("formats inherit aliases and explicit routes exactly as the role file writes them", () => {
    expect(formatRoute(inheritRoute())).toBe("inherit-parent");
    expect(formatRoute(inheritRoute("auto"))).toBe("auto");
    expect(formatRoute({ kind: "route", provider: "cpa", model: "model-a", effort: "high" })).toBe(
      "cpa/model-a [high]",
    );
    expect(formatRoute({ kind: "route", provider: "cpa", model: "model-a" })).toBe("cpa/model-a");
  });

  it("falls back to inherit-parent for every unconfigured role", () => {
    const snapshot = snapshotFromConfiguration({
      status: "missing",
      path: "/tmp/pstack-models.mdc",
    });
    const drafts = draftsFromSnapshot(snapshot);
    expect(Object.keys(drafts)).toHaveLength(17);
    expect(drafts["bug-fix"]).toEqual([{ kind: "inherit", alias: "inherit-parent" }]);
  });

  it("adds and removes list routes without ever emptying the list", () => {
    expect(appendRoute([{ kind: "inherit", alias: "auto" }])).toEqual([
      { kind: "inherit", alias: "auto" },
      { kind: "inherit", alias: "inherit-parent" },
    ]);
    expect(removeRoute([{ kind: "inherit", alias: "auto" }], 0)).toEqual([
      { kind: "inherit", alias: "auto" },
    ]);
    expect(
      removeRoute(
        [
          { kind: "route", provider: "cpa", model: "model-a" },
          { kind: "route", provider: "cpa", model: "model-b" },
        ],
        0,
      ),
    ).toEqual([{ kind: "route", provider: "cpa", model: "model-b" }]);
  });

  it("replaces one route by index and compares route lists structurally", () => {
    const original = [{ kind: "route", provider: "cpa", model: "model-a" }] as const;
    const next = replaceRoute(original, 0, {
      kind: "route",
      provider: "cpa",
      model: "model-a",
      effort: "high",
    });
    expect(next).toEqual([{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }]);
    expect(sameRoutes(original, [{ kind: "route", provider: "cpa", model: "model-a" }])).toBe(true);
    expect(sameRoutes(original, next)).toBe(false);
  });

  it("limits single roles to one route and list roles to at least one", () => {
    const configuration = parseRoleConfiguration(
      "arena runners: cpa/model-a\nfeature, refactoring: cpa/model-a\n",
      "/tmp/pstack-models.mdc",
    );
    const snapshot = snapshotFromConfiguration(configuration);
    const single = snapshot.roles.find((role) => role.key === "feature, refactoring")!;
    const list = snapshot.roles.find((role) => role.key === "arena runners")!;
    expect(draftIssues(single, [])).toEqual(["keep at least one route"]);
    expect(
      draftIssues(single, [
        { kind: "route", provider: "cpa", model: "model-a" },
        { kind: "route", provider: "cpa", model: "model-a" },
      ]),
    ).toEqual(["a single-route role needs exactly one route"]);
    expect(draftIssues(list, [{ kind: "inherit", alias: "auto" }])).toEqual([]);
  });

  it("reads model and effort choices from the live catalogue", () => {
    expect(modelChoices(catalogue, "cpa").map((model) => model.id)).toEqual(["model-a"]);
    expect(effortChoices(catalogue, "cpa", "model-a")).toEqual(["low", "high"]);
    expect(modelChoices(catalogue, "missing")).toEqual([]);
  });
});
