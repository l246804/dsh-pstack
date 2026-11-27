/** Plugin-detail action and configuration dialog for dsh-pstack. */

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";

import { IconSettings } from "../components/icons.tsx";
import { RecommendedPluginsView, type PluginManagerApi } from "./RecommendedPluginsPage.tsx";
import { RoleSettingsView, type RoleSettingsApi } from "./RoleSettingsPage.tsx";
import { GeneralSettingsView, type PotetoSettingsApi } from "./GeneralSettingsPage.tsx";
import {
  MaintenanceSettingsView,
  type MaintenanceSettingsApi,
} from "./MaintenanceSettingsPage.tsx";
import { ensurePstackStyles } from "../lib/styles.ts";
import { Button, SegmentedTabs } from "../components/ui.tsx";
import { useDiscardConfirm } from "../components/DiscardConfirmation.tsx";
import type { PstackTranslations } from "../locales/index.ts";

ensurePstackStyles();

export interface PstackConfigDialogProps {
  readonly roleApi: RoleSettingsApi;
  readonly pluginApi: PluginManagerApi;
  readonly potetoApi: PotetoSettingsApi;
  readonly maintenanceApi: MaintenanceSettingsApi;
  readonly translations: PstackTranslations;
  readonly onClose: () => void;
}

type ConfigTab = "general" | "maintenance" | "plugins" | "roles";

export function PstackConfigDialog(props: PstackConfigDialogProps): ReactElement | null {
  const [tab, setTab] = useState<ConfigTab>("general");
  const [visited, setVisited] = useState<ReadonlySet<ConfigTab>>(
    () => new Set<ConfigTab>(["general"]),
  );
  const [rolesDirty, setRolesDirty] = useState(false);
  const tabsId = useId();
  const { roleApi, pluginApi, potetoApi, maintenanceApi, translations, onClose } = props;

  const { request: requestDiscard, dialog: discardDialog } = useDiscardConfirm({
    title: translations.roles("discardTitle"),
    description: translations.roles("confirmDiscardChanges"),
    acknowledge: translations.roles("discardAcknowledge"),
    cancel: translations.common("cancel"),
    close: translations.common("close"),
    confirm: translations.roles("discardConfirm"),
  });

  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = rolesDirty;
  }, [rolesDirty]);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      requestDiscard(() => onCloseRef.current());
      return;
    }
    onCloseRef.current();
  }, [requestDiscard]);

  const selectTab = (next: ConfigTab): void => {
    setTab(next);
    setVisited((current) => (current.has(next) ? current : new Set([...current, next])));
  };

  if (typeof document === "undefined") return null;

  return (
    <Modal
      open
      title={translations.config("dialogTitle")}
      closeLabel={translations.common("close")}
      onClose={requestClose}
      className="pstack-config-modal"
      contentClassName="pstack-config-content"
    >
      <div className="pstack-tabs-row">
        <SegmentedTabs
          label={translations.config("tabsLabel")}
          value={tab}
          onChange={selectTab}
          items={[
            {
              value: "general",
              label: translations.config("tabGeneral"),
              id: `${tabsId}-general`,
              panelId: `${tabsId}-general-panel`,
            },
            {
              value: "plugins",
              label: translations.config("tabPlugins"),
              id: `${tabsId}-plugins`,
              panelId: `${tabsId}-plugins-panel`,
            },
            {
              value: "roles",
              label: translations.config("tabRoles"),
              id: `${tabsId}-roles`,
              panelId: `${tabsId}-roles-panel`,
            },
            {
              value: "maintenance",
              label: translations.config("tabMaintenance"),
              id: `${tabsId}-maintenance`,
              panelId: `${tabsId}-maintenance-panel`,
            },
          ]}
        />
      </div>
      <main className="pstack-body">
        {visited.has("general") ? (
          <div
            hidden={tab !== "general"}
            id={`${tabsId}-general-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-general`}
          >
            <GeneralSettingsView api={potetoApi} translations={translations} />
          </div>
        ) : null}
        {visited.has("plugins") ? (
          <div
            hidden={tab !== "plugins"}
            id={`${tabsId}-plugins-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-plugins`}
          >
            <RecommendedPluginsView api={pluginApi} translations={translations} />
          </div>
        ) : null}
        {visited.has("roles") ? (
          <div
            hidden={tab !== "roles"}
            id={`${tabsId}-roles-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-roles`}
          >
            <RoleSettingsView
              api={roleApi}
              translations={translations}
              onDirtyChange={setRolesDirty}
            />
          </div>
        ) : null}
        {visited.has("maintenance") ? (
          <div
            hidden={tab !== "maintenance"}
            id={`${tabsId}-maintenance-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-maintenance`}
          >
            <MaintenanceSettingsView api={maintenanceApi} translations={translations} />
          </div>
        ) : null}
      </main>
      {discardDialog}
    </Modal>
  );
}

/** Create the action component registered into `plugins.detail.actions`. */
export function createPstackConfigAction(
  roleApi: RoleSettingsApi,
  pluginApi: PluginManagerApi,
  potetoApi: PotetoSettingsApi,
  maintenanceApi: MaintenanceSettingsApi,
  translations: PstackTranslations,
): (props: PropsRuntime<"plugins.detail.actions">) => ReactElement | null {
  return function PstackConfigAction(
    props: PropsRuntime<"plugins.detail.actions">,
  ): ReactElement | null {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const wasOpen = useRef(false);

    useEffect(() => {
      if (open) return;
      if (!wasOpen.current) return;
      wasOpen.current = false;
      // Return focus where it started so keyboard users are not dropped at document top.
      triggerRef.current?.focus();
    }, [open]);

    if (props.subject.kind !== "bundle" || props.subject.pkg.name !== "dsh-pstack") return null;
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          icon={<IconSettings size={13} />}
          onClick={(event) => {
            triggerRef.current = event.currentTarget;
            wasOpen.current = true;
            setOpen(true);
          }}
        >
          {translations.config("configureAction")}
        </Button>
        {open ? (
          <PstackConfigDialog
            roleApi={roleApi}
            pluginApi={pluginApi}
            potetoApi={potetoApi}
            maintenanceApi={maintenanceApi}
            translations={translations}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    );
  };
}
