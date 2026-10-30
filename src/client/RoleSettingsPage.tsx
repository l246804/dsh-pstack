/** Role configuration section inside the bundle configuration dialog for `$DSH_HOME/pstack-models.mdc`. */

import { useEffect, useState, type CSSProperties, type ReactElement } from "react";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";

import type { CatalogueResult } from "../models.ts";
import type { RoleFileSnapshot, RoleView, SaveRoleRequest } from "../internal/role-wire.ts";
import {
  appendRoute,
  draftIssues,
  draftsFromSnapshot,
  effortChoices,
  formatRoute,
  inheritRoute,
  modelChoices,
  providerChoices,
  removeRoute,
  replaceRoute,
  sameRoutes,
  saveRequestFor,
  type DraftRoute,
} from "./state.ts";
import { NS, type PstackRolesLocaleKey } from "./locales.ts";

/** Translation function supplied by the slot locale. */
export type Translate = (
  key: PstackRolesLocaleKey,
  vars?: Record<string, string | number>,
) => string;

/** Narrow bridge over the mounted Remote namespace. */
export interface PstackRolesApi {
  status(): Promise<RoleFileSnapshot>;
  catalogue(): Promise<CatalogueResult>;
  save(
    request: SaveRoleRequest,
  ): Promise<{ ok: true; snapshot: RoleFileSnapshot } | { ok: false; reason: string }>;
}

/** Props of the pure view used by tests and the slot container. */
export interface RoleSettingsViewProps {
  readonly snapshot: RoleFileSnapshot | null;
  readonly catalogue: CatalogueResult | undefined;
  readonly drafts: Readonly<Record<string, readonly DraftRoute[]>>;
  readonly busyKey?: string | undefined;
  readonly messages: Readonly<
    Record<string, { readonly tone: "ok" | "error"; readonly text: string }>
  >;
  readonly loadError?: string | undefined;
  readonly onRetry: () => void;
  readonly onRouteChange: (key: string, index: number, route: DraftRoute) => void;
  readonly onAddRoute: (key: string) => void;
  readonly onRemoveRoute: (key: string, index: number) => void;
  readonly onSave: (key: string) => void;
  readonly onReset: (key: string) => void;
  readonly t: Translate;
}

const COLOR_TEXT = "var(--dsw-alias-label-primary)";
const COLOR_SECONDARY = "var(--dsw-alias-label-secondary)";
const COLOR_CAPTION = "var(--dsw-alias-label-caption)";
const COLOR_BORDER = "var(--dsw-alias-border-l3)";
const COLOR_SURFACE = "var(--dsw-alias-bg-layer-1)";
const COLOR_ERROR = "var(--dsw-alias-state-error-primary)";
const COLOR_SUCCESS = "var(--dsw-alias-state-success-primary)";
const COLOR_WARN = "var(--dsw-alias-state-warn-primary)";
const FONT_CODE = "var(--dsh-font-family-code)";

function statusColor(status: RoleFileSnapshot["status"]): string {
  if (status === "loaded") return COLOR_SUCCESS;
  if (status === "unreadable") return COLOR_ERROR;
  return COLOR_WARN;
}

function buttonStyle(primary = false): CSSProperties {
  return {
    border: `1px solid ${primary ? "transparent" : COLOR_BORDER}`,
    borderRadius: 8,
    padding: "5px 12px",
    cursor: "pointer",
    font: "inherit",
    background: primary ? "var(--dsw-alias-brand-primary)" : "transparent",
    color: primary ? "var(--dsw-alias-label-primary-foreground)" : COLOR_TEXT,
  };
}

function fieldStyle(): CSSProperties {
  return {
    minWidth: 0,
    padding: "5px 8px",
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 8,
    background: COLOR_SURFACE,
    color: COLOR_TEXT,
    font: "inherit",
  };
}

function statusLabel(t: Translate, status: RoleFileSnapshot["status"]): string {
  if (status === "loaded") return t("statusLoaded");
  if (status === "unreadable") return t("statusUnreadable");
  return t("statusMissing");
}

function routeSelection(route: DraftRoute): string {
  return route.kind === "inherit" ? `__inherit__:${route.alias}` : route.provider;
}

function fromSelection(selection: string): DraftRoute {
  if (selection === "__inherit__:inherit-parent") return inheritRoute("inherit-parent");
  if (selection === "__inherit__:auto") return inheritRoute("auto");
  return { kind: "route", provider: selection, model: "" };
}

function RoleRouteRow(props: {
  readonly role: RoleView;
  readonly index: number;
  readonly route: DraftRoute;
  readonly routes: readonly DraftRoute[];
  readonly catalogue: CatalogueResult | undefined;
  readonly readOnly: boolean;
  readonly onChange: (index: number, route: DraftRoute) => void;
  readonly onRemove: (index: number) => void;
  readonly t: Translate;
}): ReactElement {
  const { role, index, route, routes, catalogue, readOnly, onChange, onRemove, t } = props;
  const providers = providerChoices(catalogue);
  const models = route.kind === "route" ? modelChoices(catalogue, route.provider) : [];
  const efforts =
    route.kind === "route" ? effortChoices(catalogue, route.provider, route.model) : [];
  const providerMissing =
    route.kind === "route" && !providers.some((entry) => entry.provider === route.provider);
  const modelMissing =
    route.kind === "route" &&
    !models.some((entry) => entry.id === route.model) &&
    route.model !== "";
  const effortMissing =
    route.kind === "route" &&
    route.effort !== undefined &&
    route.effort !== "" &&
    !efforts.includes(route.effort);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select
        aria-label={`${role.key} ${t("provider")}`}
        value={routeSelection(route)}
        disabled={readOnly}
        onChange={(event) => {
          const next = fromSelection(event.target.value);
          if (next.kind === "route") {
            const firstModel = modelChoices(catalogue, next.provider)[0];
            return onChange(index, {
              ...next,
              model: firstModel?.id ?? "",
              ...(firstModel?.defaultEffort === undefined
                ? {}
                : { effort: firstModel.defaultEffort }),
            });
          }
          onChange(index, next);
        }}
        style={fieldStyle()}
      >
        <option value="__inherit__:inherit-parent">{t("inheritParent")}</option>
        <option value="__inherit__:auto">{t("auto")}</option>
        {providers.map((provider) => (
          <option key={provider.provider} value={provider.provider}>
            {provider.name === provider.provider
              ? provider.provider
              : `${provider.name} (${provider.provider})`}
          </option>
        ))}
        {providerMissing ? (
          <option value={route.provider}>{`${route.provider} (${t("unavailable")})`}</option>
        ) : null}
      </select>

      {route.kind === "route" ? (
        <>
          <select
            aria-label={`${role.key} ${t("model")}`}
            value={route.model}
            disabled={readOnly}
            onChange={(event) => {
              const model = event.target.value;
              const entry = models.find((candidate) => candidate.id === model);
              onChange(index, {
                kind: "route",
                provider: route.provider,
                model,
                ...(entry?.defaultEffort === undefined ? {} : { effort: entry.defaultEffort }),
              });
            }}
            style={fieldStyle()}
          >
            <option value="" disabled>
              {t("model")}
            </option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}
              </option>
            ))}
            {modelMissing ? <option value={route.model}>{route.model}</option> : null}
          </select>
          <select
            aria-label={`${role.key} ${t("effort")}`}
            value={route.effort ?? ""}
            disabled={readOnly}
            onChange={(event) => {
              const effort = event.target.value;
              onChange(index, {
                kind: "route",
                provider: route.provider,
                model: route.model,
                ...(effort === "" ? {} : { effort }),
              });
            }}
            style={fieldStyle()}
          >
            <option value="">{t("effortUnset")}</option>
            {efforts.map((effort) => {
              const model = models.find((candidate) => candidate.id === route.model);
              const defaultEffort = model?.defaultEffort === effort;
              return (
                <option key={effort} value={effort}>
                  {defaultEffort ? t("effortDefault", { effort }) : effort}
                </option>
              );
            })}
            {effortMissing ? <option value={route.effort}>{route.effort}</option> : null}
          </select>
        </>
      ) : (
        <span style={{ color: COLOR_CAPTION, font: "inherit" }}>{t("inheritsParent")}</span>
      )}

      {routes.length > 1 ? (
        <button
          type="button"
          style={buttonStyle()}
          onClick={() => onRemove(index)}
          disabled={readOnly}
        >
          {t("removeRoute")}
        </button>
      ) : null}
    </div>
  );
}

function RoleCard(props: {
  readonly role: RoleView;
  readonly routes: readonly DraftRoute[];
  readonly catalogue: CatalogueResult | undefined;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly message: { readonly tone: "ok" | "error"; readonly text: string } | undefined;
  readonly onRouteChange: (index: number, route: DraftRoute) => void;
  readonly onAddRoute: () => void;
  readonly onRemoveRoute: (index: number) => void;
  readonly onSave: () => void;
  readonly onReset: () => void;
  readonly t: Translate;
}): ReactElement {
  const {
    role,
    routes,
    catalogue,
    busy,
    readOnly,
    message,
    onRouteChange,
    onAddRoute,
    onRemoveRoute,
    onSave,
    onReset,
    t,
  } = props;
  const issues = draftIssues(role, routes);
  const canReset =
    routes.length !== 1 || routes[0]?.kind !== "inherit" || routes[0]?.alias !== "inherit-parent";

  return (
    <section
      style={{
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 12,
        padding: 14,
        display: "grid",
        gap: 10,
        background: COLOR_SURFACE,
      }}
    >
      <header style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ color: COLOR_TEXT, fontSize: 14 }}>{role.key}</strong>
        <span style={{ color: COLOR_CAPTION, fontSize: 12 }}>
          {role.shape === "list" ? t("listRoutes") : t("singleRoute")}
        </span>
        <span style={{ color: COLOR_CAPTION, fontSize: 12 }}>
          {role.configured ? t("configuredLine", { line: role.line ?? "?" }) : t("notConfigured")}
        </span>
      </header>
      <code style={{ color: COLOR_SECONDARY, fontFamily: FONT_CODE, fontSize: 12 }}>
        {readOnly ? t("statusUnreadable") : routes.map((route) => formatRoute(route)).join(" · ")}
      </code>
      {role.issues.map((issue, index) => (
        <div key={`${issue}-${index}`} style={{ color: COLOR_ERROR, fontSize: 12 }}>
          {t("roleIssues", { message: issue })}
        </div>
      ))}
      {readOnly
        ? null
        : routes.map((route, index) => (
            <RoleRouteRow
              key={index}
              role={role}
              index={index}
              route={route}
              routes={routes}
              catalogue={catalogue}
              readOnly={readOnly}
              onChange={onRouteChange}
              onRemove={onRemoveRoute}
              t={t}
            />
          ))}
      {issues.map((issue, index) => (
        <div key={`${issue}-${index}`} style={{ color: COLOR_ERROR, fontSize: 12 }}>
          {issue}
        </div>
      ))}
      <footer style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {role.shape === "list" && !readOnly ? (
          <button type="button" style={buttonStyle()} onClick={onAddRoute} disabled={busy}>
            {t("addRoute")}
          </button>
        ) : null}
        <button
          type="button"
          style={buttonStyle(true)}
          onClick={onSave}
          disabled={readOnly || busy || issues.length > 0}
        >
          {busy ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          style={buttonStyle()}
          onClick={onReset}
          disabled={readOnly || busy || !canReset}
        >
          {busy ? t("resetting") : t("reset")}
        </button>
        {message === undefined ? null : (
          <span
            style={{ color: message.tone === "ok" ? COLOR_SUCCESS : COLOR_ERROR, fontSize: 12 }}
          >
            {message.text}
          </span>
        )}
      </footer>
    </section>
  );
}

function RoleEffortNote({ t }: { readonly t: Translate }): ReactElement {
  return (
    <section
      style={{
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 12,
        padding: "12px 14px",
        display: "grid",
        gap: 6,
        background: COLOR_SURFACE,
        color: COLOR_SECONDARY,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ color: COLOR_TEXT, fontSize: 13 }}>{t("effortBaselineTitle")}</strong>
      <p style={{ margin: 0 }}>{t("effortBaselineIntro")}</p>
      <ul style={{ margin: 0, paddingInlineStart: 18, display: "grid", gap: 4 }}>
        <li>{t("effortRuleRange")}</li>
        <li>{t("effortRuleUp")}</li>
        <li>{t("effortRuleDown")}</li>
        <li>{t("effortRuleTrigger")}</li>
        <li>{t("effortRuleBoundary")}</li>
      </ul>
    </section>
  );
}

/** Pure view: all rendering decisions are explicit props. */
export function RoleSettingsView(props: RoleSettingsViewProps): ReactElement {
  const { snapshot, catalogue, drafts, busyKey, messages, loadError, onRetry, t } = props;
  return (
    <div style={{ display: "grid", gap: 16, padding: "4px 0 20px", color: COLOR_TEXT }}>
      <header style={{ display: "grid", gap: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{t("title")}</h3>
        <p style={{ margin: 0, color: COLOR_SECONDARY, fontSize: 13, lineHeight: 1.5 }}>
          {t("subtitle")}
        </p>
      </header>

      <RoleEffortNote t={t} />

      {snapshot === null ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", color: COLOR_SECONDARY }}>
          {loadError === undefined ? t("loading") : t("loadFailed", { message: loadError })}
          {loadError === undefined ? null : (
            <button type="button" style={buttonStyle()} onClick={onRetry}>
              {t("retry")}
            </button>
          )}
        </div>
      ) : (
        <>
          <section
            style={{
              border: `1px solid ${COLOR_BORDER}`,
              borderRadius: 12,
              padding: 14,
              display: "grid",
              gap: 6,
              background: COLOR_SURFACE,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: COLOR_CAPTION }}>{t("file")}</span>
              <code style={{ fontFamily: FONT_CODE, fontSize: 12, overflowWrap: "anywhere" }}>
                {snapshot.path}
              </code>
              <span
                style={{
                  fontSize: 12,
                  padding: "1px 8px",
                  borderRadius: 999,
                  border: `1px solid ${statusColor(snapshot.status)}`,
                  color: statusColor(snapshot.status),
                }}
              >
                {statusLabel(t, snapshot.status)}
              </span>
            </div>
            {snapshot.budget === undefined ? null : (
              <div style={{ fontSize: 12, color: COLOR_SECONDARY }}>
                {t("budget")}: <code style={{ fontFamily: FONT_CODE }}>{snapshot.budget}</code>
              </div>
            )}
            {snapshot.status === "unreadable" ? (
              <div style={{ fontSize: 12, color: COLOR_ERROR }}>
                {t("unreadableBody", { reason: snapshot.reason ?? "" })}
              </div>
            ) : null}
          </section>

          {snapshot.issues.length === 0 ? null : (
            <section style={{ display: "grid", gap: 4 }}>
              <strong style={{ fontSize: 13 }}>{t("fileIssues")}</strong>
              {snapshot.issues.map((issue, index) => (
                <div key={`${issue.message}-${index}`} style={{ color: COLOR_ERROR, fontSize: 12 }}>
                  {issue.line === undefined
                    ? issue.message
                    : `${t("line", { line: issue.line })}: ${issue.message}`}
                </div>
              ))}
            </section>
          )}

          {catalogue === undefined || catalogue.providers.length === 0 ? (
            <div style={{ color: COLOR_WARN, fontSize: 12 }}>{t("noCatalogue")}</div>
          ) : catalogue.truncated ? (
            <div style={{ color: COLOR_CAPTION, fontSize: 12 }}>{t("truncated")}</div>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            {snapshot.roles.map((role) => (
              <RoleCard
                key={role.key}
                role={role}
                routes={drafts[role.key] ?? [inheritRoute()]}
                catalogue={catalogue}
                busy={busyKey === role.key}
                readOnly={!snapshot.canSave}
                message={messages[role.key]}
                onRouteChange={(index, route) => props.onRouteChange(role.key, index, route)}
                onAddRoute={() => props.onAddRoute(role.key)}
                onRemoveRoute={(index) => props.onRemoveRoute(role.key, index)}
                onSave={() => props.onSave(role.key)}
                onReset={() => props.onReset(role.key)}
                t={t}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function remoteError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** Props of the role configuration section rendered inside the bundle config dialog. */
export type RoleSettingsPageProps = PropsLocale<typeof NS> & {
  readonly api: PstackRolesApi;
};

/** Section container: owns loading, drafts, and the two Remote calls. */
export function RoleSettingsPage(props: RoleSettingsPageProps): ReactElement {
  const { api, t } = props;
  const [snapshot, setSnapshot] = useState<RoleFileSnapshot | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueResult | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, readonly DraftRoute[]>>({});
  const [messages, setMessages] = useState<Record<string, { tone: "ok" | "error"; text: string }>>(
    {},
  );
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(undefined);
    void Promise.all([api.status(), api.catalogue()]).then(
      ([nextSnapshot, nextCatalogue]) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setCatalogue(nextCatalogue);
        setDrafts(draftsFromSnapshot(nextSnapshot));
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoadError(remoteError(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, reloadToken]);

  const updateRole = (key: string, next: readonly DraftRoute[]): void => {
    setDrafts((current) => ({ ...current, [key]: next }));
    setMessages((current) => {
      const { [key]: _ignored, ...rest } = current;
      return rest;
    });
  };

  const save = (key: string, routes: readonly DraftRoute[]): void => {
    setBusyKey(key);
    setMessages((current) => {
      const { [key]: _ignored, ...rest } = current;
      return rest;
    });
    void api.save(saveRequestFor(key, routes)).then(
      (result) => {
        setBusyKey(undefined);
        if (!result.ok) {
          setMessages((current) => ({
            ...current,
            [key]: { tone: "error", text: t("saveRejected", { reason: result.reason }) },
          }));
          return;
        }
        setSnapshot(result.snapshot);
        setDrafts((current) => ({
          ...current,
          [key]: draftsFromSnapshot(result.snapshot)[key] ?? [inheritRoute()],
        }));
        setMessages((current) => ({ ...current, [key]: { tone: "ok", text: t("saved") } }));
      },
      (error: unknown) => {
        setBusyKey(undefined);
        setMessages((current) => ({
          ...current,
          [key]: { tone: "error", text: t("saveRejected", { reason: remoteError(error) }) },
        }));
      },
    );
  };

  return (
    <RoleSettingsView
      snapshot={snapshot}
      catalogue={catalogue}
      drafts={drafts}
      busyKey={busyKey}
      messages={messages}
      loadError={loadError}
      onRetry={() => setReloadToken((value) => value + 1)}
      onRouteChange={(key, index, route) => {
        const current = drafts[key] ?? [inheritRoute()];
        updateRole(key, replaceRoute(current, index, route));
      }}
      onAddRoute={(key) => updateRole(key, appendRoute(drafts[key] ?? [inheritRoute()]))}
      onRemoveRoute={(key, index) =>
        updateRole(key, removeRoute(drafts[key] ?? [inheritRoute()], index))
      }
      onSave={(key) => save(key, drafts[key] ?? [inheritRoute()])}
      onReset={(key) => save(key, [inheritRoute()])}
      t={t}
    />
  );
}

/** Whether one card differs from the saved value; exported for the container's tests. */
export function isRoleDirty(role: RoleView, routes: readonly DraftRoute[]): boolean {
  return !sameRoutes(role.routes.length === 0 ? [inheritRoute()] : role.routes, routes);
}

/** Formatting helper shared with tests and the page. */
export function routeText(route: DraftRoute): string {
  return formatRoute(route);
}
