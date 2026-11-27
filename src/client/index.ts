/** Browser entry for dsh-pstack: the plugin-detail configuration action. */

import type { Context } from "@deepseek-ai/cordis";
import type { ClientRemote, RemoteResult } from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-model-selection/client";
import type { ShortcutCommand, ShortcutCommandId } from "@deepseek-ai/dsh-client-shortcuts/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";

import { pstackClientRemote, type PstackRolesNamespace } from "../roles/role-remote.ts";
import { type PstackPotetoMaintenanceNamespace } from "../poteto/maintenance-remote.ts";
import { type PstackPotetoModeNamespace } from "../poteto/remote.ts";
import { createPstackConfigAction } from "./pages/PstackConfigDialog.tsx";
import { PotetoModeToggle } from "./components/PotetoModeToggle.tsx";
import { POTETO_MODE_EVENT } from "./lib/poteto-mode.ts";
import { PotetoModeBadge } from "./components/PotetoModeBadge.tsx";
import { showToast } from "./lib/toast.ts";
import { NS, catalogs } from "./locales/index.ts";
import type { PluginManagerApi } from "./pages/RecommendedPluginsPage.tsx";
import type { RoleSettingsApi } from "./pages/RoleSettingsPage.tsx";
import type { PotetoSettingsApi } from "./pages/GeneralSettingsPage.tsx";
import type { MaintenanceSettingsApi } from "./pages/MaintenanceSettingsPage.tsx";

/** Browser services this plugin needs. `remote.pluginManager` stays optional, so roles load without it. */
export const inject = ["remote", "slots", "locale"];

/**
 * Build a stable API whose methods resolve the manager at call time.
 *
 * The plugin-manager Remote namespace can arrive before or after this plugin's
 * `apply`, so it must not be captured once here. A missing manager fails only the
 * recommendation tab when it is used, and a later arrival recovers on refresh.
 */
export function createPluginManagerApi(
  getPluginManager: () => ClientRemote["pluginManager"] | undefined,
  managerUnavailable: () => string,
): PluginManagerApi {
  const manager = (): ClientRemote["pluginManager"] => {
    const value = getPluginManager();
    if (value === undefined) throw new Error(managerUnavailable());
    return value;
  };
  return {
    listBundles: async () => unwrap(await manager().listBundles()),
    setBundleEnabled: async (name, enabled) =>
      unwrap(await manager().setBundleEnabled(name, enabled)),
  };
}

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(pstackClientRemote);
  ctx.effect(() => ctx.locale.register(NS.common, catalogs.common), "pstack-config.locale.common");
  ctx.effect(() => ctx.locale.register(NS.config, catalogs.config), "pstack-config.locale.config");
  ctx.effect(
    () => ctx.locale.register(NS.plugins, catalogs.plugins),
    "pstack-config.locale.plugins",
  );
  ctx.effect(() => ctx.locale.register(NS.roles, catalogs.roles), "pstack-config.locale.roles");
  ctx.effect(() => ctx.locale.register(NS.poteto, catalogs.poteto), "pstack-config.locale.poteto");
  const commonT = ctx.locale.bind(NS.common);
  const pluginsT = ctx.locale.bind(NS.plugins);

  // Observe the plugin-manager namespace without gating the role action on it.
  // If it arrives later, the next listBundles call sees it; if it never arrives,
  // only the recommendation tab reports the problem.
  let pluginManager: ClientRemote["pluginManager"] | undefined;
  ctx.inject(["remote.pluginManager"], (scope: Context) => {
    pluginManager = scope.remote.pluginManager;
    return () => {
      pluginManager = undefined;
    };
  });
  const pluginApi = createPluginManagerApi(
    () => pluginManager,
    () => pluginsT("managerUnavailable"),
  );

  let potetoApi:
    | (PstackPotetoModeNamespace["pstackPotetoMode"] &
        PstackPotetoMaintenanceNamespace["pstackPotetoMode"])
    | undefined;
  const potetoSettingsApi: PotetoSettingsApi = {
    readDefault: async () => {
      if (potetoApi === undefined) throw new Error(commonT("notAvailable"));
      const result = await potetoApi.getDefault();
      return unwrap(result).enabled;
    },
    writeDefault: async (enabled) => {
      if (potetoApi === undefined) return commonT("notAvailable");
      const result = await potetoApi.setDefault(enabled);
      return result.ok ? null : result.error.message;
    },
    readAgentTeamDefault: async () => {
      if (potetoApi === undefined) throw new Error(commonT("notAvailable"));
      const result = await potetoApi.getAgentTeamDefault();
      return unwrap(result).enabled;
    },
    writeAgentTeamDefault: async (enabled) => {
      if (potetoApi === undefined) return commonT("notAvailable");
      const result = await potetoApi.setAgentTeamDefault(enabled);
      return result.ok ? null : result.error.message;
    },
  };

  const maintenanceApi: MaintenanceSettingsApi = {
    scan: async () => {
      if (potetoApi === undefined) throw new Error(commonT("notAvailable"));
      return unwrap(await potetoApi.scanLegacySessions());
    },
    queue: async (sessionIds) => {
      if (potetoApi === undefined) throw new Error(commonT("notAvailable"));
      return unwrap(await potetoApi.queueLegacyRepair(sessionIds));
    },
  };

  const showRepairOutcome = (
    outcome: { readonly repaired: number; readonly failed: readonly unknown[] } | null,
  ): void => {
    if (outcome === null) return;
    const t = ctx.locale.bind(NS.config);
    if (outcome.failed.length === 0) {
      showToast({
        tone: "success",
        text: t("maintenanceRepairSuccess", { count: outcome.repaired }),
      });
      return;
    }
    showToast({
      tone: outcome.repaired === 0 ? "error" : "warn",
      text: t("maintenanceRepairPartial", {
        repaired: outcome.repaired,
        failed: outcome.failed.length,
      }),
    });
  };

  const togglePoteto = async (sessionId: string): Promise<void> => {
    const t = ctx.locale.bind(NS.poteto);
    if (potetoApi === undefined) {
      showToast({ tone: "error", text: t("failed", { message: commonT("notAvailable") }) });
      return;
    }
    const current = await potetoApi.status(sessionId);
    if (!current.ok) {
      showToast({ tone: "error", text: t("failed", { message: current.error.message }) });
      return;
    }
    const enabled = !current.value.enabled;
    const result = await potetoApi.setEnabled(sessionId, enabled);
    if (!result.ok) {
      showToast({ tone: "error", text: t("failed", { message: result.error.message }) });
      return;
    }
    window.dispatchEvent(new CustomEvent(POTETO_MODE_EVENT, { detail: { sessionId, enabled } }));
    showToast({
      tone: enabled ? "success" : "neutral",
      text: t(enabled ? "enabledNotice" : "disabledNotice"),
    });
  };

  ctx.inject(["shortcuts"], (scope: Context) => {
    const command: ShortcutCommand = {
      id: "pstack.poteto.toggle" as ShortcutCommandId,
      label: () => ctx.locale.bind(NS.poteto)("shortcutLabel"),
      aliases: ["poteto", "poteto workflow"],
      defaults: {},
      regions: ["page", "editable", "terminal"],
      modals: [],
      resolve: ({ target, modal }) => {
        if (modal !== null || target === null) return { status: "pass" };
        const occurrence = target.closest<HTMLElement>("[data-conversation-session]");
        const sessionId = occurrence?.dataset.conversationSession;
        if (sessionId === undefined) return { status: "pass" };
        return {
          status: "handled",
          run: () => {
            void togglePoteto(sessionId);
          },
        };
      },
    };
    ctx.effect(() => scope.shortcuts.register(command), "pstack.poteto.shortcut");
  });

  // `$mount` above installs the namespace, so its dependency is declared only now.
  // Injecting before the await would resolve against a namespace that does not exist yet.
  ctx.inject(["remote.pstackRoles"], (scope: Context) => {
    const pstack = (scope.remote as ClientRemote & PstackRolesNamespace).pstackRoles;
    if (pstack === undefined) return;

    const roleApi: RoleSettingsApi = {
      status: async () => unwrap(await pstack.status()),
      catalogue: async (signal) => unwrap(await pstack.catalogue(signal)),
      save: async (request, signal) => unwrap(await pstack.save(request, signal)),
      budget: async (request, signal) => unwrap(await pstack.budget(request, signal)),
    };
    const translations = {
      common: ctx.locale.bind(NS.common),
      config: ctx.locale.bind(NS.config),
      plugins: ctx.locale.bind(NS.plugins),
      roles: ctx.locale.bind(NS.roles),
      poteto: ctx.locale.bind(NS.poteto),
    };
    scope.slots.inject("plugins.detail.actions", () =>
      scope.slots.register(
        {
          name: "plugins.detail.actions",
          id: "pstack",
          order: 20,
          label: () => translations.config("configureAction"),
        },
        createPstackConfigAction(
          roleApi,
          pluginApi,
          potetoSettingsApi,
          maintenanceApi,
          translations,
        ),
      ),
    );
  });

  ctx.inject(["remote.pstackPotetoMode"], (scope: Context) => {
    potetoApi = (
      scope.remote as ClientRemote & PstackPotetoModeNamespace & PstackPotetoMaintenanceNamespace
    ).pstackPotetoMode;
    void potetoApi.consumeLegacyRepairResult().then(
      (result) => {
        if (result.ok) showRepairOutcome(result.value);
      },
      (reason: unknown) => {
        console.warn("[pstack] could not read the maintenance repair result", reason);
      },
    );
    return () => {
      potetoApi = undefined;
    };
  });
  const injectProps = (sessionId: string) => ({
    sessionId,
    readMode: async () => {
      // Reject instead of synthesizing false: the toggle keeps its projection
      // value when the answer is unavailable, so a late mount or transient
      // failure cannot overwrite a correct "on" with "off".
      if (potetoApi === undefined) throw new Error(commonT("notAvailable"));
      const result = await potetoApi.status(sessionId);
      if (!result.ok) throw result.error;
      return result.value.enabled;
    },
    selectMode: async (enabled: boolean) => {
      if (potetoApi === undefined) return commonT("notAvailable");
      const result = await potetoApi.setEnabled(sessionId, enabled);
      return result.ok ? null : result.error.message;
    },
  });
  const modelOptionsSlot = "conversation.input.model.options" as const;
  ctx.slots.inject(modelOptionsSlot, () =>
    ctx.slots.register(
      {
        name: modelOptionsSlot,
        id: "pstack-poteto-mode",
        locale: NS.poteto,
        inject: (sessionId: string) => injectProps(sessionId),
      },
      PotetoModeToggle,
    ),
  );
  ctx.slots.inject("conversation.session.header.actions", () =>
    ctx.slots.register(
      {
        name: "conversation.session.header.actions",
        id: "pstack-poteto-badge",
        order: -5,
        locale: NS.poteto,
        inject: (sessionId: string) => injectProps(sessionId),
      },
      PotetoModeBadge,
    ),
  );

  return async () => {
    await disposeRemote();
  };
}

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}
