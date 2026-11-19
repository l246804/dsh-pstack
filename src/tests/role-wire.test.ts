import { describe, expect, it } from "vite-plus/test";

import type { CatalogueResult } from "../models.ts";
import { parseRoleConfiguration } from "../roles/role-store.ts";
import { snapshotFromConfiguration } from "../roles/role-editor.ts";
import {
  parseBudgetApplyResult,
  parseCatalogueResult,
  parseRoleFileSnapshot,
  parseSaveRoleRequest,
  parseSaveRoleResult,
  WireTypeError,
  type RoleFileSnapshot,
} from "../roles/role-wire.ts";

const validCatalogue: CatalogueResult = {
  providers: [
    {
      provider: "cpa",
      name: "CPA",
      models: [{ provider: "cpa", id: "model-a", efforts: ["high"] }],
    },
  ],
  truncated: false,
};

function catalogueWithModel(patch: Record<string, unknown>): CatalogueResult {
  const provider = validCatalogue.providers[0]!;
  return {
    ...validCatalogue,
    providers: [{ ...provider, models: [{ ...provider.models[0]!, ...patch }] }],
  };
}

const snapshot: RoleFileSnapshot = {
  path: "/home/user/.dsh/pstack-models.json",
  status: "loaded",
  budget: "large (xhigh)",
  roles: [
    {
      key: "bug-fix",
      shape: "single",
      configured: true,
      routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
      issues: [],
    },
  ],
  issues: [],
  canSave: true,
};

describe("role wire parsers", () => {
  it("accepts an empty route list as a role deletion", () => {
    expect(parseSaveRoleRequest({ key: "bug-fix", routes: [] })).toEqual({
      key: "bug-fix",
      routes: [],
    });
  });

  it("rejects malformed save fields with their paths", () => {
    expect(() => parseSaveRoleRequest({ key: 42, routes: [] })).toThrow(WireTypeError);
    expect(() => parseSaveRoleRequest({ key: "bug-fix", routes: "no" })).toThrow("request.routes");
    expect(() =>
      parseSaveRoleRequest({ key: "bug-fix", routes: [{ kind: "route", provider: "cpa" }] }),
    ).toThrow("request.routes[0]");
  });

  it("round-trips the Host producer's snapshot without losing fields", () => {
    const produced = snapshotFromConfiguration(
      parseRoleConfiguration(
        JSON.stringify({
          version: 2,
          budget: "large (xhigh)",
          roles: {
            "bug-fix": [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
          },
        }),
        snapshot.path,
      ),
    );
    expect(parseRoleFileSnapshot(structuredClone(produced))).toEqual(produced);
  });

  it("round-trips a snapshot and a refused save result", () => {
    expect(parseRoleFileSnapshot(structuredClone(snapshot))).toEqual(snapshot);
    expect(parseSaveRoleResult({ ok: true, snapshot: structuredClone(snapshot) })).toEqual({
      ok: true,
      snapshot,
    });
    expect(parseSaveRoleResult({ ok: false, reason: "unknown provider" })).toEqual({
      ok: false,
      reason: "unknown provider",
    });
    expect(() => parseRoleFileSnapshot({ ...snapshot, roles: "bad" })).toThrow("snapshot");
  });

  it("round-trips a budget result and rejects malformed shapes", () => {
    expect(parseBudgetApplyResult({ ok: true, snapshot: structuredClone(snapshot) })).toEqual({
      ok: true,
      snapshot,
    });
    expect(parseBudgetApplyResult({ ok: false, reason: "budget blocked" })).toEqual({
      ok: false,
      reason: "budget blocked",
    });
    expect(() => parseBudgetApplyResult({ ok: true })).toThrow("snapshot");
    expect(() => parseBudgetApplyResult({ ok: false, reason: 1 })).toThrow("result");
  });

  it("rejects malformed optional snapshot fields instead of dropping them", () => {
    expect(() => parseRoleFileSnapshot({ ...snapshot, reason: 1 })).toThrow("snapshot.reason");
    expect(() => parseRoleFileSnapshot({ ...snapshot, budget: 1 })).toThrow("snapshot.budget");
    expect(() =>
      parseRoleFileSnapshot({
        ...snapshot,
        roles: [{ ...snapshot.roles[0]!, issues: [1] }],
      }),
    ).toThrow("snapshot.roles[0].issues[0]");
  });

  it("rejects malformed optional catalogue fields instead of dropping them", () => {
    expect(() => parseCatalogueResult({ ...validCatalogue, providerFilter: 1 })).toThrow(
      "catalogue.providerFilter",
    );
    expect(() =>
      parseCatalogueResult({
        ...validCatalogue,
        providers: [{ ...validCatalogue.providers[0]!, error: 1 }],
      }),
    ).toThrow("catalogue.providers[0].error");
    for (const field of ["defaultEffort", "error"] as const) {
      expect(() => parseCatalogueResult(catalogueWithModel({ [field]: 1 }))).toThrow(
        `catalogue.providers[0].models[0].${field}`,
      );
    }
  });

  it("parses the model catalogue and rejects a malformed provider list", () => {
    expect(
      parseCatalogueResult({
        providers: [
          {
            provider: "cpa",
            name: "CPA",
            models: [
              {
                provider: "cpa",
                id: "model-a",
                efforts: ["low", "high"],
              },
            ],
          },
        ],
        truncated: false,
        providerFilter: "CPA",
      }),
    ).toMatchObject({ truncated: false, providerFilter: "CPA" });
    expect(() => parseCatalogueResult({ providers: "bad", truncated: false })).toThrow(
      "catalogue.providers",
    );
  });
});
