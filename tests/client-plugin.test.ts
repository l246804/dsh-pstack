import { describe, expect, it } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";

import { apply, inject } from "../src/client/index.ts";

describe("pstack roles browser half", () => {
  it("mounts the Remote contribution and registers the bundle page and activation guidance", async () => {
    const mounts: TypertRemoteContribution[] = [];
    const slots: { name: string; options: Record<string, unknown>; component: unknown }[] = [];
    const effects: string[] = [];
    let languageDictionaries: Record<string, Record<string, string>> | undefined;

    const ctx = {
      remote: {
        $mount: async (contribution: TypertRemoteContribution) => {
          mounts.push(contribution);
          return async () => {};
        },
        pluginManager: {
          listBundles: async () => ({ ok: true, value: [] }),
          setBundleEnabled: async () => ({ ok: true, value: { application: "applied" } }),
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
          expect(["plugins.bundle.config", "plugins.bundle.activation"]).toContain(name);
          callback();
        },
        register: (options: Record<string, unknown>, component: unknown) => {
          slots.push({ name: String(options["name"]), options, component });
          return () => {};
        },
      },
    } as unknown as Context;

    const dispose = await apply(ctx);

    expect(inject).toEqual(["remote", "slots", "locale", "remote.pluginManager"]);
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.package).toBe("dsh-pstack");
    expect(mounts[0]!.descriptors.map((descriptor) => descriptor.method)).toEqual([
      "status",
      "catalogue",
      "save",
    ]);
    expect(slots).toHaveLength(2);
    expect(slots[0]!.options).toMatchObject({
      name: "plugins.bundle.config",
      key: "dsh-pstack",
      locale: "pstackRoles",
    });
    expect(slots[1]!.options).toMatchObject({
      name: "plugins.bundle.activation",
      key: "dsh-pstack",
      locale: "pstackRoles",
    });
    expect(typeof slots[0]!.component).toBe("function");
    expect(typeof slots[1]!.component).toBe("function");
    const configFace = (
      slots[0]!.options as {
        readonly inject: () => {
          readonly optionalPlugins: {
            listBundles: () => Promise<readonly unknown[]>;
            setBundleEnabled: (name: string, enabled: boolean) => Promise<unknown>;
          };
        };
      }
    ).inject();
    expect(await configFace.optionalPlugins.listBundles()).toEqual([]);
    expect(await configFace.optionalPlugins.setBundleEnabled("dsh-pstack", true)).toEqual({
      application: "applied",
    });
    expect(Object.keys(languageDictionaries ?? {}).sort()).toEqual(["en", "zh"]);
    expect(languageDictionaries?.["en"]?.["optionalPluginsTitle"]).toBe("Recommended plugins");
    expect(languageDictionaries?.["zh"]?.["optionalPluginsTitle"]).toBe("推荐插件");
    expect(effects).toContain("pstack-roles.locale");
    expect(typeof dispose).toBe("function");
  });
});
