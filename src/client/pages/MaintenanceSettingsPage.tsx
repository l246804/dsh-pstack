/** Maintenance tab for scanning and queueing legacy session repair. */

import { useMemo, useState, type ReactElement } from "react";

import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { IconTrash } from "../components/icons.tsx";
import { IconButton } from "../components/ui.tsx";
import { messageOf } from "../lib/message.ts";
import { ensurePstackStyles } from "../lib/styles.ts";
import type { PstackTranslations } from "../locales/index.ts";
import type {
  LegacySessionInfo,
  MaintenanceFailure,
  MaintenanceScanResult,
} from "../../poteto/maintenance-types.ts";

ensurePstackStyles();

/** Host methods consumed by the maintenance page. */
export interface MaintenanceSettingsApi {
  scan(): Promise<MaintenanceScanResult>;
  queue(sessionIds: readonly string[]): Promise<{ queued: number }>;
}

interface WorkspaceGroup {
  readonly workspace: string;
  readonly sessions: readonly LegacySessionInfo[];
}

function groupByWorkspace(sessions: readonly LegacySessionInfo[]): readonly WorkspaceGroup[] {
  const groups = new Map<string, LegacySessionInfo[]>();
  for (const session of sessions) {
    const group = groups.get(session.workspace) ?? [];
    group.push(session);
    groups.set(session.workspace, group);
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
  const [sessions, setSessions] = useState<readonly LegacySessionInfo[] | undefined>();
  const [failures, setFailures] = useState<readonly MaintenanceFailure[]>([]);
  const [scanning, setScanning] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const groups = useMemo(() => groupByWorkspace(sessions ?? []), [sessions]);

  const scan = (): void => {
    setScanning(true);
    setSessions(undefined);
    setFailures([]);
    setError(undefined);
    setNotice(undefined);
    void api
      .scan()
      .then(
        (result) => {
          setSessions(result.sessions);
          setFailures(result.failures);
        },
        (reason: unknown) => {
          setError(t("maintenanceScanFailed", { message: messageOf(reason) }));
        },
      )
      .finally(() => setScanning(false));
  };

  const remove = (sessionId: string): void => {
    setSessions((current) => current?.filter((session) => session.sessionId !== sessionId));
  };

  const repair = (): void => {
    if (sessions === undefined || sessions.length === 0) return;
    setQueuing(true);
    setError(undefined);
    setNotice(undefined);
    void api
      .queue(sessions.map((session) => session.sessionId))
      .then(
        (result) => setNotice(t("maintenanceQueued", { count: result.queued })),
        (reason: unknown) => setError(messageOf(reason)),
      )
      .finally(() => setQueuing(false));
  };

  return (
    <section className="pstack-setting-list" aria-label={t("maintenanceTitle")}>
      <div className="pstack-setting-item">
        <div className="pstack-setting-copy">
          <div className="pstack-setting-title">{t("maintenanceTitle")}</div>
          <p className="pstack-setting-description">{t("maintenanceDescription")}</p>
        </div>
        <div className="pstack-setting-control">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={scanning || queuing}
            onClick={scan}
          >
            {scanning ? t("maintenanceScanning") : t("maintenanceScan")}
          </Button>
        </div>
      </div>

      {error === undefined ? null : (
        <p className="pstack-setting-description" role="alert">
          {error}
        </p>
      )}
      {notice === undefined ? null : (
        <p className="pstack-setting-description" role="status">
          {notice}
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

      {sessions === undefined ? null : sessions.length === 0 ? (
        <p className="pstack-setting-description">{t("maintenanceScanEmpty")}</p>
      ) : (
        <>
          <div className="pstack-maintenance-groups">
            {groups.map((group) => (
              <div className="pstack-maintenance-group" key={group.workspace}>
                <h4 className="pstack-maintenance-group-title">
                  {group.workspace === "" ? t("maintenanceWorkspaceUnknown") : group.workspace}
                </h4>
                <ul className="pstack-maintenance-list">
                  {group.sessions.map((session) => (
                    <li className="pstack-maintenance-item" key={session.sessionId}>
                      <div className="pstack-maintenance-copy">
                        <div className="pstack-maintenance-title">{session.title}</div>
                        <div className="pstack-maintenance-meta">
                          {session.enabled ? t("maintenanceEnabled") : t("maintenanceDisabled")}
                          {" · "}
                          {t("maintenanceEventCount", { count: session.eventCount })}
                        </div>
                      </div>
                      <IconButton
                        type="button"
                        label={t("maintenanceRemove")}
                        onClick={() => remove(session.sessionId)}
                      >
                        <IconTrash size={13} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pstack-maintenance-foot">
            <span className="pstack-setting-description">
              {t("maintenanceSelectedCount", { count: sessions.length })}
            </span>
            <Button type="button" variant="primary" size="sm" disabled={queuing} onClick={repair}>
              {t("maintenanceRepair")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
