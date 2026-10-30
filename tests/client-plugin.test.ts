import { describe, expect, it } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";

import { apply, inject } from "../src/client/index.ts";

type Dictionaries = Record<string, Record<string, string>>;

function translateFrom(dictionaries: Dictionaries | undefined): (key: string) => string {
  return (key) => dictionaries?.["en"]?.[key] ?? key;
}

describe("pstack roles browser half", () => {
  it("mounts the Remote contribution and registers both locale namespaces and slots", async () => {
    const mounts: TypertRemoteContribution[] = [];
    const slots: { name: string; options: Record<string, unknown>; component: unknown }[] = [];
    const effects: string[] = [];
    const registrations = new Map<string, Dictionaries>();

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
        register: (namespace: string, dictionaries: Dictionaries) => {
          registrations.set(namespace, dictionaries);
          return () => {};
        },
        bind: (namespace: string) => translateFrom(registrations.get(namespace)),
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

    expect([...registrations.keys()].sort()).toEqual(["pstackPlugins", "pstackRoles"]);
    const roles = registrations.get("pstackRoles")!;
    const plugins = registrations.get("pstackPlugins")!;
    for (const dictionaries of [roles, plugins]) {
      const enKeys = Object.keys(dictionaries["en"]!).sort();
      expect(Object.keys(dictionaries["zh"]!).sort()).toEqual(enKeys);
      expect(enKeys.length).toBeGreaterThan(0);
      for (const key of enKeys) {
        expect(dictionaries["zh"]![key]).not.toBe("");
      }
    }
    const roleKeys = new Set(Object.keys(roles["en"]!));
    expect(Object.keys(plugins["en"]!).filter((key) => roleKeys.has(key))).toEqual([]);
    expect(roles["en"]!["title"]).toBe("Role model configuration");
    expect(plugins["en"]!["optionalPluginsTitle"]).toBe("Recommended plugins");
    expect(plugins["zh"]!["optionalPluginsTitle"]).toBe("推荐插件");
    expect(effects).toEqual(["pstack-roles.locale", "pstack-plugins.locale"]);

    expect(slots).toHaveLength(2);
    expect(slots[0]!.options).toMatchObject({
      name: "plugins.bundle.config",
      key: "dsh-pstack",
      locale: "pstackRoles",
    });
    expect(slots[1]!.options).toMatchObject({
      name: "plugins.bundle.activation",
      key: "dsh-pstack",
      locale: "pstackPlugins",
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
          readonly pluginsT: (key: string) => string;
        };
      }
    ).inject();
    expect(await configFace.optionalPlugins.listBundles()).toEqual([]);
    expect(await configFace.optionalPlugins.setBundleEnabled("dsh-pstack", true)).toEqual({
      application: "applied",
    });
    expect(configFace.pluginsT("optionalPluginsTitle")).toBe("Recommended plugins");
    expect(typeof dispose).toBe("function");
  });
});
