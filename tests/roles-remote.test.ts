import { describe, expect, it } from "vite-plus/test";

import {
  pstackRolesRemote,
  parseCatalogue,
  parseRoleFileSnapshot,
  parseSaveRoleRequest,
  parseSaveRoleResult,
} from "../src/remote.ts";

describe("pstack role Remote contribution", () => {
  it("declares the three strict endpoints the page mounts", () => {
    expect(pstackRolesRemote.package).toBe("dsh-pstack");
    expect(
      pstackRolesRemote.descriptors.map(
        (descriptor) => `${descriptor.namespace}/${descriptor.method}`,
      ),
    ).toEqual(["pstackRoles/status", "pstackRoles/catalogue", "pstackRoles/save"]);
    for (const descriptor of pstackRolesRemote.descriptors) {
      expect(descriptor.service).toBe("pstackRoles");
      expect(descriptor.invocation).toEqual({ kind: "direct" });
      expect(descriptor.result.mode).toBe("strict");
      for (const parameter of descriptor.parameters) expect(parameter.codec.mode).toBe("strict");
    }
    const save = pstackRolesRemote.descriptors.find((descriptor) => descriptor.method === "save");
    expect(save?.parameters.map((parameter) => parameter.wire)).toEqual(["request"]);
    expect(save?.cancellation).toEqual({ parameter: "signal" });
  });

  it("parses role save requests and rejects a malformed route", () => {
    expect(
      parseSaveRoleRequest({
        key: "arena runners",
        routes: [
          { kind: "inherit", alias: "auto" },
          { kind: "route", provider: "cpa", model: "model-a", effort: "high" },
        ],
      }),
    ).toEqual({
      key: "arena runners",
      routes: [
        { kind: "inherit", alias: "auto" },
        { kind: "route", provider: "cpa", model: "model-a", effort: "high" },
      ],
    });
    expect(() =>
      parseSaveRoleRequest({ key: "bug-fix", routes: [{ kind: "route", provider: "cpa" }] }),
    ).toThrow(/model must be a non-empty string/);
    expect(() =>
      parseSaveRoleRequest({ key: "bug-fix", routes: [{ kind: "inherit", alias: "parent" }] }),
    ).toThrow(/inherit-parent/);
  });

  it("parses a snapshot and a refused save result", () => {
    const snapshot = parseRoleFileSnapshot({
      path: "/tmp/pstack-models.mdc",
      status: "loaded",
      budget: "small",
      roles: [
        {
          key: "bug-fix",
          shape: "single",
          configured: true,
          line: 2,
          routes: [{ kind: "route", provider: "cpa", model: "model-a" }],
          issues: [],
        },
      ],
      issues: [{ line: 3, message: "unknown role" }],
      canSave: true,
    });
    expect(snapshot.roles[0]!.key).toBe("bug-fix");
    expect(parseSaveRoleResult({ ok: false, reason: "nope" })).toEqual({
      ok: false,
      reason: "nope",
    });
    expect(parseSaveRoleResult({ ok: true, snapshot })).toEqual({ ok: true, snapshot });
  });

  it("parses the live catalogue shape the page consumes", () => {
    expect(
      parseCatalogue({
        truncated: false,
        providers: [
          {
            provider: "cpa",
            name: "CPA",
            models: [{ route: "cpa/model-a", id: "model-a", name: "Model A", efforts: ["high"] }],
          },
        ],
      }).providers[0]!.models[0]!.efforts,
    ).toEqual(["high"]);
  });
});
