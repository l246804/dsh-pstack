/**
 * Recommended optional plugins on the dsh-pstack bundle page, plus the
 * one-time activation guidance offered after the bundle is switched on.
 *
 * The page only reads `pluginManager.listBundles()` when it opens. Every
 * profile change goes through a button the person pressed.
 */

import { useEffect, useState, type CSSProperties, type ReactElement } from "react";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";

import {
  OPTIONAL_PLUGIN_GROUPS,
  type OptionalPluginGroup,
  type OptionalPluginId,
} from "../internal/optional-plugins.ts";
import {
  browserStorage,
  dismissGuidance,
  enableRecommendedPlugins,
  guidanceDismissed,
  optionalPluginRows,
  remainingRecommendedCount,
  type BundleChange,
  type BundleSnapshot,
  type OptionalPluginRow,
  type OptionalPluginStatus,
  type OptionalPluginsApi,
} from "./optional-plugins-state.ts";
import {
  NS,
  type PstackPluginsLocaleKey,
  type PstackPluginsTranslate,
} from "./optional-plugins-locales.ts";

/** Registration face shared by the recommendation section and activation guidance. */
export type OptionalPluginsFace = { readonly optionalPlugins: OptionalPluginsApi };

const COLOR_TEXT = "var(--dsw-alias-label-primary)";
const COLOR_SECONDARY = "var(--dsw-alias-label-secondary)";
const COLOR_CAPTION = "var(--dsw-alias-label-caption)";
const COLOR_BORDER = "var(--dsw-alias-border-l3)";
const COLOR_SURFACE = "var(--dsw-alias-bg-layer-1)";
const COLOR_ERROR = "var(--dsw-alias-state-error-primary)";
const COLOR_SUCCESS = "var(--dsw-alias-state-success-primary)";
const COLOR_WARN = "var(--dsw-alias-state-warn-primary)";

const STATUS_KEY: Record<OptionalPluginStatus, PstackPluginsLocaleKey> = {
  enabled: "pluginStatusEnabled",
  off: "pluginStatusOff",
  missing: "pluginStatusMissing",
  "unsupported-platform": "pluginStatusUnsupportedPlatform",
  error: "pluginStatusError",
};

const GROUP_KEY: Record<OptionalPluginGroup, PstackPluginsLocaleKey> = {
  sessions: "groupSessions",
  verification: "groupVerification",
  "multi-agent": "groupMultiAgent",
};

const COPY: Record<
  OptionalPluginId,
  { readonly title: PstackPluginsLocaleKey; readonly detail: PstackPluginsLocaleKey }
> = {
  "OPT-01": { title: "opt01Title", detail: "opt01Detail" },
  "OPT-02": { title: "opt02Title", detail: "opt02Detail" },
  "OPT-03": { title: "opt03Title", detail: "opt03Detail" },
  "OPT-04": { title: "opt04Title", detail: "opt04Detail" },
  "OPT-05": { title: "opt05Title", detail: "opt05Detail" },
  "OPT-06": { title: "opt06Title", detail: "opt06Detail" },
  "OPT-07": { title: "opt07Title", detail: "opt07Detail" },
  "OPT-08": { title: "opt08Title", detail: "opt08Detail" },
  "OPT-09": { title: "opt09Title", detail: "opt09Detail" },
};

function statusColor(status: OptionalPluginStatus): string {
  if (status === "enabled") return COLOR_SUCCESS;
  if (status === "error") return COLOR_ERROR;
  if (status === "missing" || status === "unsupported-platform") return COLOR_WARN;
  return COLOR_CAPTION;
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

function tagStyle(color: string): CSSProperties {
  return {
    border: `1px solid ${color}`,
    borderRadius: 999,
    padding: "1px 8px",
    color,
    fontSize: 12,
    whiteSpace: "nowrap",
  };
}

/** Whether one row is a package group the plugin manager cannot switch. */
export function isNonBundleRow(row: OptionalPluginRow): boolean {
  return row.definition.bundle === undefined;
}

/** Text for one change result. */
export function changeResultText(
  application: BundleChange["application"] | "error",
  t: PstackPluginsTranslate,
  reason?: string,
): string {
  if (application === "applied") return t("resultApplied");
  if (application === "restart-required") return t("resultRestartRequired");
  if (application === "failed" || application === "error")
    return t("resultFailed", { reason: reason ?? application });
  if (application === "overridden") return t("resultOverridden");
  return t("resultCancelled");
}

function errorText(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** Pure view of the recommendation section. */
export interface OptionalPluginsViewProps {
  readonly rows: readonly OptionalPluginRow[];
  readonly status: "loading" | "ready" | "error";
  readonly loadError?: string | undefined;
  readonly busyId?: OptionalPluginId | undefined;
  readonly bulkBusy?: boolean | undefined;
  readonly messages: Readonly<
    Record<string, { readonly tone: "ok" | "error"; readonly text: string }>
  >;
  readonly summary?: string | undefined;
  readonly onToggle: (id: OptionalPluginId, enabled: boolean) => void;
  readonly onEnableRecommended: () => void;
  readonly onRetry: () => void;
  readonly t: PstackPluginsTranslate;
}

/** Render the recommendation section; all decisions come from props. */
export function OptionalPluginsView(props: OptionalPluginsViewProps): ReactElement {
  const {
    rows,
    status,
    loadError,
    busyId,
    bulkBusy = false,
    messages,
    summary,
    onToggle,
    onEnableRecommended,
    onRetry,
    t,
  } = props;
  const offRecommended = rows.filter(
    (row) => row.definition.recommended === true && row.status === "off",
  ).length;

  return (
    <section
      data-optional-plugins
      style={{
        display: "grid",
        gap: 12,
        padding: "4px 0 18px",
        color: COLOR_TEXT,
      }}
    >
      <header style={{ display: "grid", gap: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{t("optionalPluginsTitle")}</h3>
        <p style={{ margin: 0, color: COLOR_SECONDARY, fontSize: 13, lineHeight: 1.5 }}>
          {t("optionalPluginsSubtitle")}
        </p>
      </header>

      {status === "loading" ? (
        <div style={{ color: COLOR_SECONDARY }}>{t("optionalLoading")}</div>
      ) : status === "error" ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", color: COLOR_ERROR }}>
          <span>{t("optionalLoadFailed", { message: loadError ?? "" })}</span>
          <button type="button" style={buttonStyle()} onClick={onRetry}>
            {t("optionalRetry")}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              style={buttonStyle(true)}
              onClick={onEnableRecommended}
              disabled={bulkBusy || offRecommended === 0}
            >
              {bulkBusy ? t("enablingRecommended") : t("enableRecommended")}
            </button>
            <button type="button" style={buttonStyle()} onClick={onRetry} disabled={bulkBusy}>
              {t("optionalRefresh")}
            </button>
            <span style={{ color: COLOR_CAPTION, fontSize: 12 }}>{t("recommendedHint")}</span>
          </div>
          {summary === undefined ? null : (
            <div data-optional-summary style={{ color: COLOR_SECONDARY, fontSize: 12 }}>
              {summary}
            </div>
          )}
          {OPTIONAL_PLUGIN_GROUPS.map((group) => {
            const groupRows = rows.filter((row) => row.definition.group === group);
            if (groupRows.length === 0) return null;
            return (
              <section key={group} style={{ display: "grid", gap: 8 }}>
                <h4 style={{ margin: "6px 0 0", fontSize: 13, color: COLOR_SECONDARY }}>
                  {t(GROUP_KEY[group])}
                </h4>
                {groupRows.map((row) => (
                  <OptionalPluginCard
                    key={row.definition.id}
                    row={row}
                    busy={busyId === row.definition.id || bulkBusy}
                    message={messages[row.definition.id]}
                    onToggle={onToggle}
                    t={t}
                  />
                ))}
              </section>
            );
          })}
        </>
      )}
    </section>
  );
}

function OptionalPluginCard(props: {
  readonly row: OptionalPluginRow;
  readonly busy: boolean;
  readonly message: { readonly tone: "ok" | "error"; readonly text: string } | undefined;
  readonly onToggle: (id: OptionalPluginId, enabled: boolean) => void;
  readonly t: PstackPluginsTranslate;
}): ReactElement {
  const { row, busy, message, onToggle, t } = props;
  const { definition } = row;
  const copy = COPY[definition.id];
  const nonBundle = isNonBundleRow(row);
  return (
    <article
      data-optional-plugin={definition.id}
      data-optional-status={row.status}
      style={{
        display: "grid",
        gap: 8,
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 12,
        padding: 12,
        background: COLOR_SURFACE,
      }}
    >
      <header style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>{t(copy.title)}</strong>
        <span style={{ color: COLOR_CAPTION, fontSize: 12 }}>{definition.id}</span>
        <span data-optional-status-label style={tagStyle(statusColor(row.status))}>
          {t(STATUS_KEY[row.status])}
        </span>
        {definition.recommended === true ? (
          <span style={tagStyle(COLOR_SUCCESS)}>{t("recommendedTag")}</span>
        ) : null}
        {definition.suggested === true ? (
          <span style={tagStyle(COLOR_SECONDARY)}>{t("suggestedTag")}</span>
        ) : null}
        {definition.conflict === true ? (
          <span style={tagStyle(COLOR_ERROR)}>{t("conflictTag")}</span>
        ) : null}
      </header>
      <code
        style={{
          color: COLOR_SECONDARY,
          fontSize: 12,
          overflowWrap: "anywhere",
          fontFamily: "var(--dsh-font-family-code)",
        }}
      >
        {definition.packages.join(" · ")}
      </code>
      <p style={{ margin: 0, color: COLOR_SECONDARY, fontSize: 12, lineHeight: 1.5 }}>
        {t(copy.detail)}
      </p>
      {definition.conflict === true ? (
        <p role="alert" style={{ margin: 0, color: COLOR_ERROR, fontSize: 12, lineHeight: 1.5 }}>
          {t("conflictWarning")}
        </p>
      ) : null}
      {nonBundle ? (
        <p style={{ margin: 0, color: COLOR_CAPTION, fontSize: 12 }}>{t("nonBundleGuidance")}</p>
      ) : null}
      <footer style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {row.canToggle ? (
          <button
            type="button"
            style={buttonStyle()}
            disabled={busy}
            onClick={() => onToggle(definition.id, row.status !== "enabled")}
          >
            {row.status === "enabled" ? t("disablePlugin") : t("enablePlugin")}
          </button>
        ) : null}
        {busy ? (
          <span style={{ color: COLOR_CAPTION, fontSize: 12 }}>{t("pluginWorking")}</span>
        ) : null}
        {message === undefined ? null : (
          <span
            data-optional-message
            style={{ color: message.tone === "ok" ? COLOR_SUCCESS : COLOR_ERROR, fontSize: 12 }}
          >
            {message.text}
          </span>
        )}
      </footer>
    </article>
  );
}

/** Loads bundle status and owns the recommendation section's two actions. */
export function OptionalPluginsSection(
  props: OptionalPluginsFace & PropsLocale<typeof NS>,
): ReactElement {
  const { optionalPlugins: api, t } = props;
  const [bundles, setBundles] = useState<readonly BundleSnapshot[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<OptionalPluginId | undefined>(undefined);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [messages, setMessages] = useState<Record<string, { tone: "ok" | "error"; text: string }>>(
    {},
  );
  const [summary, setSummary] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setLoadError(undefined);
    void api.listBundles().then(
      (next) => {
        if (cancelled) return;
        setBundles(next);
        setStatus("ready");
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoadError(errorText(error));
        setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, reloadToken]);

  const rows = optionalPluginRows(bundles);
  const reload = (): void => setReloadToken((value) => value + 1);

  const toggle = (id: OptionalPluginId, enabled: boolean): void => {
    const row = rows.find((candidate) => candidate.definition.id === id);
    const bundle = row?.definition.bundle;
    if (bundle === undefined) return;
    setBusyId(id);
    setMessages((current) => {
      const { [id]: _ignored, ...rest } = current;
      return rest;
    });
    void api.setBundleEnabled(bundle, enabled).then(
      (result) => {
        setBusyId(undefined);
        setMessages((current) => ({
          ...current,
          [id]: {
            tone: result.application === "failed" ? "error" : "ok",
            text: changeResultText(
              result.application,
              t,
              result.error?.diagnostic ?? result.error?.code,
            ),
          },
        }));
        reload();
      },
      (error: unknown) => {
        setBusyId(undefined);
        setMessages((current) => ({
          ...current,
          [id]: { tone: "error", text: changeResultText("error", t, errorText(error)) },
        }));
        reload();
      },
    );
  };

  const enableAll = (): void => {
    setBulkBusy(true);
    setSummary(undefined);
    setMessages({});
    void enableRecommendedPlugins(api, rows).then((result) => {
      const next: Record<string, { tone: "ok" | "error"; text: string }> = {};
      for (const outcome of result.outcomes) {
        next[outcome.id] = {
          tone:
            outcome.application === "failed" || outcome.application === "error" ? "error" : "ok",
          text: changeResultText(outcome.application, t),
        };
      }
      setMessages(next);
      setSummary(
        t("recommendedSummary", {
          applied: result.applied,
          restart: result.restartRequired,
          failed: result.failed,
          skipped: result.skipped,
        }),
      );
      setBulkBusy(false);
      reload();
    });
  };

  return (
    <OptionalPluginsView
      rows={rows}
      status={status}
      loadError={loadError}
      busyId={busyId}
      bulkBusy={bulkBusy}
      messages={messages}
      summary={summary}
      onToggle={toggle}
      onEnableRecommended={enableAll}
      onRetry={reload}
      t={t}
    />
  );
}

/** Pure view of the one-time activation guidance. */
export function OptionalPluginsActivationView(props: {
  readonly count: number;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
  readonly t: PstackPluginsTranslate;
}): ReactElement {
  const { count, onOpen, onDismiss, t } = props;
  return (
    <section
      data-optional-activation
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 12,
        padding: "10px 12px",
        background: COLOR_SURFACE,
        color: COLOR_TEXT,
      }}
    >
      <span style={{ fontSize: 13 }}>{t("guidanceTitle", { count })}</span>
      <button type="button" style={buttonStyle(true)} onClick={onOpen}>
        {t("guidanceOpen")}
      </button>
      <button type="button" style={buttonStyle()} onClick={onDismiss}>
        {t("guidanceDismiss")}
      </button>
    </section>
  );
}

/** One-time guidance shown after dsh-pstack itself is switched on. */
export function OptionalPluginsActivation(
  props: PropsRuntime<"plugins.bundle.activation"> &
    PropsLocale<typeof NS> &
    InjectFace<OptionalPluginsFace>,
): ReactElement | null {
  const { optionalPlugins: api, t, onDismiss, onOpenDetails } = props;
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (guidanceDismissed(browserStorage())) {
      setCount(0);
      return;
    }
    let cancelled = false;
    void api.listBundles().then(
      (bundles) => {
        if (cancelled) return;
        setCount(remainingRecommendedCount(optionalPluginRows(bundles)));
      },
      () => {
        if (cancelled) return;
        setCount(0);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (count !== undefined && count > 0) dismissGuidance(browserStorage());
  }, [count]);

  if (count === undefined || count === 0) return null;
  return (
    <OptionalPluginsActivationView
      count={count}
      onOpen={() => {
        dismissGuidance(browserStorage());
        onOpenDetails();
      }}
      onDismiss={() => {
        dismissGuidance(browserStorage());
        onDismiss();
      }}
      t={t}
    />
  );
}
