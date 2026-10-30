import { describe, expect, it } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";

import { apply, inject } from "../src/client/index.ts";

describe("pstack roles browser half", () => {
  it("mounts the Remote contribution and registers the bundle configuration page", async () => {
    const mounts: TypertRemoteContribution[] = [];
    const slots: { options: Record<string, unknown>; component: unknown }[] = [];
    const effects: string[] = [];
    let languageDictionaries: Record<string, Record<string, string>> | undefined;

    const ctx = {
      remote: {
        $mount: async (contribution: TypertRemoteContribution) => {
          mounts.push(contribution);
          return async () => {};
        },
      },
      locale: {
        register: (_ns: string, dictionaries: Record<string, Record<string, string>>) => {
          languageDictionaries = dictionaries;
          return () => {};
        },
      },
      effect: (callback: () => unknown, label: string) => {
        effects.push(label);
        return callback();
      },
      slots: {
        inject: (name: string, callback: () => void) => {
          expect(name).toBe("plugins.bundle.config");
          callback();
        },
        register: (options: Record<string, unknown>, component: unknown) => {
          slots.push({ options, component });
          return () => {};
        },
      },
    } as unknown as Context;

    const dispose = await apply(ctx);

    expect(inject).toEqual(["remote", "slots", "locale"]);
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.package).toBe("dsh-pstack");
    expect(mounts[0]!.descriptors.map((descriptor) => descriptor.method)).toEqual([
      "status",
      "catalogue",
      "save",
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.options).toMatchObject({
      name: "plugins.bundle.config",
      key: "dsh-pstack",
      locale: "pstackRoles",
    });
    expect(typeof slots[0]!.component).toBe("function");
    expect(Object.keys(languageDictionaries ?? {}).sort()).toEqual(["en", "zh"]);
    expect(effects).toContain("pstack-roles.locale");
    expect(typeof dispose).toBe("function");
  });
});
