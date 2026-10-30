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

import { pstackRolesRemote, type PstackRolesNamespace } from "../remote.ts";
import { OptionalPluginsActivation } from "./OptionalPluginsPage.tsx";
import { PstackBundleConfigPage } from "./PstackBundleConfigPage.tsx";
import type { PstackRolesApi } from "./RoleSettingsPage.tsx";
import type { BundleChange, BundleSnapshot, OptionalPluginsApi } from "./optional-plugins-state.ts";
import { NS, en, zh } from "./locales.ts";

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
    /** dsh-pstack bundle page copy (role editor and recommended plugins). */
    pstackRoles: PstackRolesLocaleKey;
  }
}

/** Browser services this plugin needs before `apply` runs. */
export const inject = ["remote", "slots", "locale", "remote.pluginManager"];

/** Mount the Remote contribution and register the bundle page and activation guidance. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(pstackRolesRemote);

  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "pstack-roles.locale");

  const namespace = (ctx.remote as unknown as PstackRolesNamespace).pstackRoles;
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

  ctx.slots.inject("plugins.bundle.config", () =>
    ctx.slots.register(
      {
        name: "plugins.bundle.config",
        key: "dsh-pstack",
        locale: NS,
        inject: () => ({ api, optionalPlugins }),
      },
      PstackBundleConfigPage,
    ),
  );

  ctx.slots.inject("plugins.bundle.activation", () =>
    ctx.slots.register(
      {
        name: "plugins.bundle.activation",
        key: "dsh-pstack",
        locale: NS,
        inject: () => ({ optionalPlugins }),
      },
      OptionalPluginsActivation,
    ),
  );

  return disposeRemote;
}
