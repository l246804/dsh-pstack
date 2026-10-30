import { describe, expect, it } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";

import { apply, inject } from "../src/client/index.ts";
import { SUPPORTED_LOCALES } from "../src/client/i18n.ts";
import { catalogs as rolesCatalogs } from "../src/client/locales.ts";
import { catalogs as pluginsCatalogs } from "../src/client/optional-plugins-locales.ts";

type Dictionaries = Record<string, Record<string, string>>;

function translateFrom(dictionaries: Dictionaries | undefined): (key: string) => string {
  return (key) => dictionaries?.[SUPPORTED_LOCALES[0]]?.[key] ?? key;
}

describe("pstack roles browser half", () => {
  it("mounts the Remote contribution and registers both locale namespaces and slots", async () => {
    const mounts: TypertRemoteContribution[] = [];
    const slots: { name: string; options: Record<string, unknown>; component: unknown }[] = [];
    const effects: string[] = [];
    const registrations = new Map<string, Dictionaries>();

    const slotsMock = {
      inject: (name: string, callback: () => void) => {
        expect(["plugins.detail.actions", "plugins.bundle.activation"]).toContain(name);
        callback();
      },
      register: (options: Record<string, unknown>, component: unknown) => {
        slots.push({ name: String(options["name"]), options, component });
        return () => {};
      },
    };
    const pstackRolesNamespace = {
      status: async () => ({ ok: true, value: {} }),
      catalogue: async () => ({ ok: true, value: {} }),
      save: async () => ({ ok: true, value: {} }),
    };

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
      inject: (deps: string[], callback: (scope: unknown) => void) => {
        expect(deps).toEqual(["remote.pstackRoles"]);
        callback({ remote: { pstackRoles: pstackRolesNamespace }, slots: slotsMock });
        return () => {};
      },
      slots: slotsMock,
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
    const baseLocale = SUPPORTED_LOCALES[0];
    for (const dictionaries of [roles, plugins]) {
      const baseKeys = Object.keys(dictionaries[baseLocale]!).sort();
      expect(baseKeys.length).toBeGreaterThan(0);
      for (const locale of SUPPORTED_LOCALES) {
        expect(Object.keys(dictionaries[locale]!).sort()).toEqual(baseKeys);
        for (const key of baseKeys) {
          expect(dictionaries[locale]![key]).not.toBe("");
        }
      }
    }
    const roleKeys = new Set(Object.keys(roles[baseLocale]!));
    expect(Object.keys(plugins[baseLocale]!).filter((key) => roleKeys.has(key))).toEqual([]);
    for (const locale of SUPPORTED_LOCALES) {
      expect(roles[locale]!["title"]).toBe(rolesCatalogs[locale].title);
      expect(plugins[locale]!["optionalPluginsTitle"]).toBe(
        pluginsCatalogs[locale].optionalPluginsTitle,
      );
    }
    expect(effects).toEqual(["pstack-roles.locale", "pstack-plugins.locale"]);

    expect(slots).toHaveLength(2);
    expect(slots[0]!.options).toMatchObject({
      name: "plugins.detail.actions",
      id: "dsh-pstack",
      locale: "pstackPlugins",
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
          readonly rolesT: (key: string) => string;
        };
      }
    ).inject();
    expect(await configFace.optionalPlugins.listBundles()).toEqual([]);
    expect(await configFace.optionalPlugins.setBundleEnabled("dsh-pstack", true)).toEqual({
      application: "applied",
    });
    expect(configFace.rolesT("title")).toBe(rolesCatalogs[baseLocale].title);
    expect(typeof dispose).toBe("function");
  });
});
