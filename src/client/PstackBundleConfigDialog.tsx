/**
 * Configure action and Settings-style dialog for the dsh-pstack bundle detail
 * page.
 *
 * The bundle's configuration used to render inline on the detail page. It now
 * opens from the detail page header through `plugins.detail.actions`: the
 * action renders only for the dsh-pstack bundle, and the dialog keeps the
 * plugin manager's page untouched while it is open.
 */

import { useEffect, useId, useState, type CSSProperties, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";

import { OptionalPluginsSection, type OptionalPluginsFace } from "./OptionalPluginsPage.tsx";
import {
  RoleSettingsPage,
  type PstackRolesApi,
  type RoleSettingsPageProps,
} from "./RoleSettingsPage.tsx";
import { NS, type PstackPluginsTranslate } from "./optional-plugins-locales.ts";

const COLOR_TEXT = "var(--dsw-alias-label-primary)";

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const maskStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "var(--dsw-alias-bg-mask-1)",
  backdropFilter: "var(--dsw-mask-blur)",
};

const panelStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "grid",
  gridTemplateColumns: "204px minmax(0, 1fr)",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gridTemplateAreas: "'title header' 'nav options'",
  width: 800,
  height: "min(800px, calc(100vh - 48px))",
  maxWidth: "calc(100vw - 48px)",
  borderRadius: "var(--dsw-radius-panel)",
  overflow: "hidden",
  background: "var(--dsw-alias-bg-layer-2)",
  boxShadow: "var(--dsw-elevation-prominent)",
  color: COLOR_TEXT,
};

const navTitleStyle: CSSProperties = {
  gridArea: "title",
  padding: "22px 12px 8px 24px",
  fontSize: 16,
  lineHeight: "24px",
  fontWeight: 500,
  color: COLOR_TEXT,
};

const navStyle: CSSProperties = {
  gridArea: "nav",
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  padding: "10px 12px 0",
  boxSizing: "border-box",
};

const navListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minHeight: 0,
  overflowY: "auto",
};

const navLabelStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};

const headerStyle: CSSProperties = {
  gridArea: "header",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-end",
  height: 54,
  padding: "20px 14px 8px 10px",
  boxSizing: "border-box",
};

const closeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
  border: "none",
  borderRadius: "var(--dsw-radius-sm)",
  background: "transparent",
  cursor: "pointer",
  color: COLOR_TEXT,
};

const optionsStyle: CSSProperties = {
  gridArea: "options",
  minWidth: 0,
  minHeight: 0,
  padding: "0 24px 24px",
  overflowY: "auto",
};

function actionButtonStyle(): CSSProperties {
  return {
    height: 28,
    padding: "0 10px",
    border: "0.5px solid transparent",
    borderRadius: "var(--dsw-radius-sm)",
    boxShadow: "inset 0 0 0 var(--dsh-hairline-width, 0.5px) var(--dsw-alias-border-l3)",
    background: "transparent",
    color: COLOR_TEXT,
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
    lineHeight: "18px",
    whiteSpace: "nowrap",
  };
}

function navCellStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 40,
    padding: "9px 16px 9px 12px",
    boxSizing: "border-box",
    border: "none",
    borderRadius: "var(--dsw-radius-md)",
    background: active ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: "22px",
    fontWeight: 400,
    color: COLOR_TEXT,
    textAlign: "left",
  };
}

/** The two configuration sections the dialog switches between. */
export type PstackBundleConfigSection = "plugins" | "roles";

/** Injection face shared by the detail action and the dialog view. */
export interface PstackBundleConfigFace {
  readonly api: PstackRolesApi;
  readonly optionalPlugins: OptionalPluginsFace["optionalPlugins"];
  readonly rolesT: RoleSettingsPageProps["t"];
}

/** Props of the bundle header action registered into `plugins.detail.actions`. */
export type PstackBundleConfigActionProps = PropsRuntime<"plugins.detail.actions"> &
  PropsLocale<typeof NS> &
  InjectFace<PstackBundleConfigFace>;

/** Props of the pure Settings-style dialog view used by tests and the container. */
export interface PstackBundleConfigDialogViewProps {
  readonly active: PstackBundleConfigSection;
  readonly onSelect: (section: PstackBundleConfigSection) => void;
  readonly onClose: () => void;
  readonly api: PstackRolesApi;
  readonly optionalPlugins: OptionalPluginsFace["optionalPlugins"];
  readonly rolesT: RoleSettingsPageProps["t"];
  readonly pluginsT: PstackPluginsTranslate;
}

/** Header action that opens the configuration dialog for the dsh-pstack bundle only. */
export function PstackBundleConfigAction(
  props: PstackBundleConfigActionProps,
): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (props.subject.kind !== "bundle" || props.subject.pkg.name !== "dsh-pstack") return null;
  return (
    <>
      <PstackConfigureButton t={props.t} onClick={() => setOpen(true)} />
      {open ? (
        <PstackBundleConfigDialog
          api={props.api}
          optionalPlugins={props.optionalPlugins}
          rolesT={props.rolesT}
          pluginsT={props.t}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Small outlined button that opens the dialog. */
export function PstackConfigureButton(props: {
  readonly t: PstackPluginsTranslate;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      data-pstack-configure-action
      style={actionButtonStyle()}
      onClick={props.onClick}
    >
      {props.t("configureAction")}
    </button>
  );
}

/** Portaled container: owns the active section and the Escape key. */
export function PstackBundleConfigDialog(
  props: Omit<PstackBundleConfigDialogViewProps, "active" | "onSelect">,
): ReactElement {
  const [active, setActive] = useState<PstackBundleConfigSection>("plugins");
  const { onClose } = props;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return createPortal(
    <PstackBundleConfigDialogView
      {...props}
      active={active}
      onSelect={(section) => setActive(section)}
    />,
    document.body,
  );
}

function CloseIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M2 2l10 10M12 2L2 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Pure view of the Settings-style modal: mask, centered card, nav rail, and section body. */
export function PstackBundleConfigDialogView(
  props: PstackBundleConfigDialogViewProps,
): ReactElement {
  const { active, onSelect, onClose, api, optionalPlugins, rolesT, pluginsT } = props;
  const titleId = useId();
  const sections: readonly { readonly id: PstackBundleConfigSection; readonly label: string }[] = [
    { id: "plugins", label: pluginsT("configurePluginsSection") },
    { id: "roles", label: pluginsT("configureRolesSection") },
  ];
  return (
    <div style={overlayStyle} role="presentation" data-pstack-config-dialog>
      <div style={maskStyle} aria-hidden="true" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={panelStyle}>
        <div id={titleId} style={navTitleStyle}>
          {pluginsT("configureTitle")}
        </div>
        <nav aria-label={pluginsT("configureSections")} style={navStyle}>
          <div style={navListStyle}>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                style={navCellStyle(section.id === active)}
                aria-current={section.id === active ? "true" : undefined}
                autoFocus={section.id === active}
                data-pstack-config-section-tab={section.id}
                onClick={() => onSelect(section.id)}
              >
                <span style={navLabelStyle}>{section.label}</span>
              </button>
            ))}
          </div>
        </nav>
        <div style={headerStyle}>
          <button
            type="button"
            aria-label={pluginsT("configureClose")}
            style={closeStyle}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div style={optionsStyle} data-pstack-config-section={active}>
          {active === "plugins" ? (
            <OptionalPluginsSection optionalPlugins={optionalPlugins} t={pluginsT} />
          ) : (
            <RoleSettingsPage api={api} t={rolesT} />
          )}
        </div>
      </div>
    </div>
  );
}
