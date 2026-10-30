/**
 * Browser half of dsh-pstack: the role model configuration page and the
 * recommended optional plugins on the Plugins → dsh-pstack bundle detail.
 *
 * The browser bundle is loaded by `dsh-client-modules` as a classic script and
 * registers the page through the `plugins.bundle.config` slot and the one-time
 * guidance through `plugins.bundle.activation`. Its Remote contribution is
 * hand-written in `../remote.ts`; no Typert generation chain is required at
 * build time.
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-gateway/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type { PstackRolesLocaleKey } from "./locales.ts";
import type { PstackPluginsLocaleKey } from "./optional-plugins-locales.ts";

import { pstackRolesRemote, type PstackRolesNamespace } from "../remote.ts";
import { OptionalPluginsActivation } from "./OptionalPluginsPage.tsx";
import { PstackBundleConfigPage } from "./PstackBundleConfigPage.tsx";
import type { PstackRolesApi } from "./RoleSettingsPage.tsx";
import type { BundleChange, BundleSnapshot, OptionalPluginsApi } from "./optional-plugins-state.ts";
import { NS as ROLES_NS, catalogs as rolesCatalogs } from "./locales.ts";
import { NS as PLUGINS_NS, catalogs as pluginsCatalogs } from "./optional-plugins-locales.ts";

/** The public `pluginManager` Remote methods this page reads, in the Gateway's result envelope. */
interface PluginManagerRemote {
  listBundles(): Promise<
    | { readonly ok: true; readonly value: readonly BundleSnapshot[] }
    | { readonly ok: false; readonly error: unknown }
  >;
  setBundleEnabled(
    name: string,
    enabled: boolean,
  ): Promise<
    | { readonly ok: true; readonly value: BundleChange }
    | { readonly ok: false; readonly error: unknown }
  >;
}

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** dsh-pstack role model configuration page copy. */
    pstackRoles: PstackRolesLocaleKey;
    /** dsh-pstack recommended optional plugins page copy. */
    pstackPlugins: PstackPluginsLocaleKey;
  }
}

/** Browser services this plugin needs before `apply` runs. */
export const inject = ["remote", "slots", "locale", "remote.pluginManager"];

/** Mount the Remote contribution and register the bundle page and activation guidance. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  // `remote.<namespace>` only exists after this plugin mounts the contribution,
  // so it cannot live in the top-level `inject` list (that would deadlock: the
  // service is created by the very apply that waits for it). Mount first, then
  // let a child scope wait for the namespace service before touching it.
  const disposeRemote = await ctx.remote.$mount(pstackRolesRemote);

  // Spread into a fresh literal: DSH's typed register accepts the open locale map,
  // and the catalogs already pin one complete dictionary per supported locale.
  ctx.effect(() => ctx.locale.register(ROLES_NS, { ...rolesCatalogs }), "pstack-roles.locale");
  ctx.effect(
    () => ctx.locale.register(PLUGINS_NS, { ...pluginsCatalogs }),
    "pstack-plugins.locale",
  );

  const pluginManager = (ctx.remote as unknown as { readonly pluginManager: PluginManagerRemote })
    .pluginManager;
  const optionalPlugins: OptionalPluginsApi = {
    listBundles: async () => {
      const result = await pluginManager.listBundles();
      if (!result.ok) throw result.error;
      return result.value;
    },
    setBundleEnabled: async (name, enabled) => {
      const result = await pluginManager.setBundleEnabled(name, enabled);
      if (!result.ok) throw result.error;
      return result.value;
    },
  };

  ctx.inject(["remote.pstackRoles"], (scope: Context) => {
    const namespace = (scope.remote as unknown as PstackRolesNamespace).pstackRoles;
    const api: PstackRolesApi = {
      status: async () => {
        const result = await namespace.status();
        if (!result.ok) throw result.error;
        return result.value;
      },
      catalogue: async () => {
        const result = await namespace.catalogue();
        if (!result.ok) throw result.error;
        return result.value;
      },
      save: async (request) => {
        const result = await namespace.save(request);
        if (!result.ok) return { ok: false, reason: result.error.message };
        return result.value;
      },
    };

    scope.slots.inject("plugins.bundle.config", () =>
      scope.slots.register(
        {
          name: "plugins.bundle.config",
          key: "dsh-pstack",
          locale: ROLES_NS,
          inject: () => ({ api, optionalPlugins, pluginsT: ctx.locale.bind(PLUGINS_NS) }),
        },
        PstackBundleConfigPage,
      ),
    );

    scope.slots.inject("plugins.bundle.activation", () =>
      scope.slots.register(
        {
          name: "plugins.bundle.activation",
          key: "dsh-pstack",
          locale: PLUGINS_NS,
          inject: () => ({ optionalPlugins }),
        },
        OptionalPluginsActivation,
      ),
    );
  });

  return disposeRemote;
}
