/** Repair tab for scanning and queueing legacy session repair. */

import { useMemo, useState, type ReactElement } from "react";

import { Button, Checkbox, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import { Spinner } from "../components/ui.tsx";
import { messageOf } from "../lib/message.ts";
import { showToast } from "../lib/toast.ts";
import type { PstackTranslations } from "../locales/index.ts";
import type {
  LegacySessionInfo,
  MaintenanceFailure,
  MaintenanceScanResult,
} from "../../poteto/maintenance-types.ts";

/** Host methods consumed by the maintenance page. */
export interface MaintenanceSettingsApi {
  scan(): Promise<MaintenanceScanResult>;
  queue(sessionIds: readonly string[]): Promise<{ queued: number }>;
}

interface WorkspaceGroup {
  readonly workspace: string;
  readonly sessions: readonly LegacySessionInfo[];
}

function normalizeWorkspace(workspace: string): string {
  const value = workspace.trim();
  if (value === "/" || /^[A-Za-z]:[\\/]$/.test(value)) return value;
  return value.replace(/[\\/]+$/, "");
}

function workspaceName(workspace: string): string {
  const value = normalizeWorkspace(workspace);
  const index = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return index >= 0 && index < value.length - 1 ? value.slice(index + 1) : value;
}

function groupByWorkspace(sessions: readonly LegacySessionInfo[]): readonly WorkspaceGroup[] {
  const groups = new Map<string, LegacySessionInfo[]>();
  for (const session of sessions) {
    const workspace = normalizeWorkspace(session.workspace);
    const group = groups.get(workspace) ?? [];
    group.push(session);
    groups.set(workspace, group);
  }
  return [...groups.entries()]
    .map(([workspace, entries]) => ({ workspace, sessions: entries }))
    .sort((left, right) => left.workspace.localeCompare(right.workspace));
}

export function MaintenanceSettingsView(props: {
  api: MaintenanceSettingsApi;
  translations: PstackTranslations;
}): ReactElement {
  const { api, translations } = props;
  const t = translations.config;
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<readonly LegacySessionInfo[] | undefined>();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [failures, setFailures] = useState<readonly MaintenanceFailure[]>([]);
  const [scanning, setScanning] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const groups = useMemo(() => groupByWorkspace(sessions ?? []), [sessions]);
  const selectedCount =
    sessions?.filter((session) => selectedIds.has(session.sessionId)).length ?? 0;

  const scan = (): void => {
    setScanning(true);
    setSessions(undefined);
    setSelectedIds(new Set());
    setFailures([]);
    setError(undefined);
    void api
      .scan()
      .then(
        (result) => {
          setSessions(result.sessions);
          setSelectedIds(new Set(result.sessions.map((session) => session.sessionId)));
          setFailures(result.failures);
        },
        (reason: unknown) => {
          setError(t("maintenanceScanFailed", { message: messageOf(reason) }));
        },
      )
      .finally(() => setScanning(false));
  };

  const openDialog = (): void => {
    setConfirmOpen(false);
    setOpen(true);
    scan();
  };

  const toggle = (sessionId: string, selected: boolean): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
  };

  const requestRepair = (): void => {
    if (selectedCount === 0) return;
    setConfirmOpen(true);
  };

  const confirmRepair = (): void => {
    const selected = sessions?.filter((session) => selectedIds.has(session.sessionId)) ?? [];
    if (selected.length === 0) {
      setConfirmOpen(false);
      return;
    }
    setQueuing(true);
    void api
      .queue(selected.map((session) => session.sessionId))
      .then(
        (result) => {
          setConfirmOpen(false);
          setOpen(false);
          showToast({
            tone: "success",
            text: t("maintenanceQueued", { count: result.queued }),
          });
        },
        (reason: unknown) => {
          setConfirmOpen(false);
          showToast({
            tone: "error",
            text: t("maintenanceRepairFailed", { message: messageOf(reason) }),
          });
        },
      )
      .finally(() => setQueuing(false));
  };

  return (
    <>
      <section className="pstack-setting-list" aria-label={t("maintenanceTitle")}>
        <div className="pstack-setting-item">
          <div className="pstack-setting-copy">
            <div className="pstack-setting-title">{t("maintenanceTitle")}</div>
            <p className="pstack-setting-description">{t("maintenanceDescription")}</p>
          </div>
          <div className="pstack-setting-control">
            <Button type="button" variant="outline" size="sm" onClick={openDialog}>
              {t("maintenanceOpen")}
            </Button>
          </div>
        </div>
      </section>

      {open ? (
        <Modal
          open
          title={t("maintenanceTitle")}
          description={t("maintenanceDescription")}
          closeLabel={translations.common("close")}
          onClose={() => {
            setConfirmOpen(false);
            setOpen(false);
          }}
          className="pstack-maintenance-panel"
          contentClassName="pstack-maintenance-content"
        >
          <div className="pstack-maintenance-body">
            <div className="pstack-maintenance-scroll">
              {error === undefined ? null : (
                <p className="pstack-setting-description" role="alert">
                  {error}
                </p>
              )}
              {failures.length === 0 ? null : (
                <p className="pstack-setting-description" role="alert">
                  {t("maintenanceScanFailed", {
                    message: failures
                      .map((failure) => `${failure.sessionId}: ${failure.message}`)
                      .join("; "),
                  })}
                </p>
              )}

              {scanning && sessions === undefined ? (
                <div className="pstack-loading">
                  <Spinner />
                  <span>{t("maintenanceScanning")}</span>
                </div>
              ) : sessions === undefined ? null : sessions.length === 0 ? (
                <p className="pstack-setting-description">{t("maintenanceScanEmpty")}</p>
              ) : (
                <div className="pstack-maintenance-groups">
                  {groups.map((group) => (
                    <div className="pstack-maintenance-group" key={group.workspace}>
                      <div className="pstack-maintenance-group-head">
                        <div className="pstack-maintenance-group-title">
                          <span className="pstack-maintenance-group-label">
                            {t("maintenanceWorkspaceLabel")}
                          </span>
                          <span className="pstack-maintenance-group-name">
                            {group.workspace === ""
                              ? t("maintenanceWorkspaceUnknown")
                              : workspaceName(group.workspace)}
                          </span>
                        </div>
                        <span className="pstack-maintenance-group-count">
                          {t("maintenanceSessionCount", { count: group.sessions.length })}
                        </span>
                      </div>
                      {group.workspace === "" ? null : (
                        <div className="pstack-maintenance-group-path">
                          <span className="pstack-maintenance-group-path-label">
                            {t("maintenanceWorkspacePath")}
                          </span>
                          <span
                            className="pstack-maintenance-group-path-value"
                            title={group.workspace}
                          >
                            {group.workspace}
                          </span>
                        </div>
                      )}
                      <ul className="pstack-maintenance-list">
                        {group.sessions.map((session) => (
                          <li
                            className="pstack-maintenance-item"
                            data-selected={selectedIds.has(session.sessionId)}
                            key={session.sessionId}
                          >
                            <div className="pstack-maintenance-copy">
                              <div className="pstack-maintenance-title">{session.title}</div>
                              <div className="pstack-maintenance-meta">
                                {session.enabled
                                  ? t("maintenanceEnabled")
                                  : t("maintenanceDisabled")}
                                {" · "}
                                {t("maintenanceEventCount", { count: session.eventCount })}
                              </div>
                            </div>
                            <Checkbox
                              checked={selectedIds.has(session.sessionId)}
                              label={session.title}
                              className="pstack-maintenance-check"
                              onChange={(selected) => toggle(session.sessionId, selected)}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pstack-maintenance-foot">
              <span className="pstack-setting-description">
                {t("maintenanceSelectedCount", { count: selectedCount })}
              </span>
              <div className="pstack-maintenance-actions">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={scanning || queuing}
                  onClick={scan}
                >
                  {scanning ? t("maintenanceScanning") : t("maintenanceScan")}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={queuing || selectedCount === 0}
                  onClick={requestRepair}
                >
                  {t("maintenanceRepair")}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmOpen ? (
        <Modal
          open
          tone="warning"
          title={t("maintenanceConfirmTitle")}
          description={t("maintenanceConfirmDescription", { count: selectedCount })}
          closeLabel={translations.common("close")}
          onClose={() => {
            if (!queuing) setConfirmOpen(false);
          }}
          className="pstack-maintenance-confirm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={queuing}
                onClick={() => setConfirmOpen(false)}
              >
                {translations.common("cancel")}
              </Button>
              <Button type="button" variant="primary" disabled={queuing} onClick={confirmRepair}>
                {queuing ? t("maintenanceConfirming") : t("maintenanceConfirm")}
              </Button>
            </>
          }
        />
      ) : null}
    </>
  );
}
