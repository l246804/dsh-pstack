import { describe, expect, it } from "vite-plus/test";
import type { TypertClientRemote } from "@deepseek-ai/dsh-typert-protocol";

import { pstackRolesHostContribution, pstackRolesRemote } from "../src/roles/role-remote.ts";

describe("pstack role Remote contribution", () => {
  it("registers strict Host invocations for every Gateway endpoint", () => {
    expect(pstackRolesHostContribution.face).toBe("host");
    expect(pstackRolesHostContribution.package).toBe(pstackRolesRemote.package);
    expect(
      pstackRolesHostContribution.invocations.map(
        (descriptor) => descriptor.namespace + "/" + descriptor.method,
      ),
    ).toEqual([
      "pstackRoles/status",
      "pstackRoles/catalogue",
      "pstackRoles/save",
      "pstackRoles/budget",
      "pstackPotetoMode/status",
      "pstackPotetoMode/setEnabled",
      "pstackPotetoMode/getDefault",
      "pstackPotetoMode/setDefault",
      "pstackPotetoMode/getAgentTeamDefault",
      "pstackPotetoMode/setAgentTeamDefault",
      "pstackPotetoMode/scanLegacySessions",
      "pstackPotetoMode/queueLegacyRepair",
      "pstackPotetoMode/consumeLegacyRepairResult",
    ]);
    for (const descriptor of pstackRolesHostContribution.invocations) {
      expect(["pstackRoles", "pstackPotetoMode"]).toContain(descriptor.service);
      expect(descriptor.invocation.kind).toBe("direct");
    }
  });

  it("declares status, catalogue, save, and budget with strict result decoders", () => {
    expect(pstackRolesRemote.descriptors.map((descriptor) => descriptor.method)).toEqual([
      "status",
      "catalogue",
      "save",
      "budget",
    ]);
    for (const descriptor of pstackRolesRemote.descriptors) {
      expect(descriptor.result.mode).toBe("strict");
      if (descriptor.result.mode === "strict") expect(descriptor.result.decode).toBeDefined();
    }
  });

  it("rejects a malformed save request before invocation", () => {
    const save = pstackRolesRemote.methods["pstackRoles/save"]!;
    const codec = save.parameters[0]!.codec;
    if (codec.mode !== "strict") throw new Error("expected a strict codec");
    expect(() => codec.create().parse({ key: 42, routes: [] })).toThrow("request.key");
    expect(() =>
      save
        .input()
        .create()
        .parse({ request: { key: 42, routes: [] } }),
    ).toThrow("request.key");
  });

  it("decodes named input and forwards the request and signal", async () => {
    const save = pstackRolesRemote.methods["pstackRoles/save"]!;
    const request = { key: "bug-fix", routes: [] };
    expect(save.input().create().parse({ request })).toEqual({ request });

    const signal = new AbortController().signal;
    const calls: unknown[][] = [];
    const remote = {
      pstackRoles: {
        save: async (...args: unknown[]) => {
          calls.push(args);
          return { ok: true as const, value: { ok: false as const, reason: "not used" } };
        },
      },
    } as unknown as TypertClientRemote;
    await save.invoke(remote, { request }, signal);
    expect(calls).toEqual([[request, signal]]);
  });
});
