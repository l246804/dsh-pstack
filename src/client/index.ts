/**
 * Browser half of dsh-pstack: the role model configuration page on the
 * Plugins → dsh-pstack bundle detail.
 *
 * The browser bundle is loaded by `dsh-client-modules` as a classic script and
 * registers the page through the `plugins.bundle.config` slot. Its Remote
 * contribution is hand-written in `../remote.ts`; no Typert generation chain is
 * required at build time.
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-gateway/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type { PstackRolesLocaleKey } from "./locales.ts";

import { pstackRolesRemote, type PstackRolesNamespace } from "../remote.ts";
import { RoleSettingsPage, type PstackRolesApi } from "./RoleSettingsPage.tsx";
import { NS, en, zh } from "./locales.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** Role model configuration page copy. */
    pstackRoles: PstackRolesLocaleKey;
  }
}

/** Browser services this plugin needs before `apply` runs. */
export const inject = ["remote", "slots", "locale"];

/** Mount the Remote contribution and register the configuration page. */
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

  ctx.slots.inject("plugins.bundle.config", () =>
    ctx.slots.register(
      {
        name: "plugins.bundle.config",
        key: "dsh-pstack",
        locale: NS,
        inject: () => ({ api }),
      },
      RoleSettingsPage,
    ),
  );

  return disposeRemote;
}
