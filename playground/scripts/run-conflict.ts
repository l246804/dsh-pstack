/**
 * Execute one conflict regression on the real guard path.
 *
 * Phase 1 starts the adapted profile that layers the Agent Teams bundle onto dsh-pstack. The
 * documented behavior is that the web host still starts: Agent Teams and pstack coexist, and
 * only the pstack root presets (poteto-mode, poteto-mode-creator) refuse to compose. Phase 2
 * drives the running host in a browser, opens Settings → Agent presets, and reads the
 * poteto-mode row. A preset that failed to compose shows the AGENT_TEAMS_CONFLICT reason
 * ("pstack root presets cannot be used with Agent Teams ..."); that text is the expected pass.
 * A preset that stayed available, or a host that failed to start, is reported as not-verified,
 * never faked into a failure.
 *
 * The runner keeps no server alive: it stops the host in a `finally`. `startWeb` keeps its own
 * 120s readiness bound (infrastructure wait); the browser guard adds no scenario timeout.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { conflictForEnvironment } from "../scenarios/conflicts.ts";
import { createBrowserSession, type BrowserSession } from "./lib/browser.ts";
import { assertSafeRecord, recordFileName } from "./lib/evidence.ts";
import {
  CONFIG_FILE,
  buildProfile,
  copyCredentials,
  installPlugins,
  loadProviderPlan,
  readPlaygroundConfig,
  registerWorkspaces,
  resetHome,
  startWeb,
  stopWeb,
  writeHomePatch,
} from "./lib/env.ts";
import {
  buildConflictRunRecord,
  type ConflictGuard,
  type ConflictObservation,
  type ConflictStartup,
} from "./lib/conflict.ts";
import { REPORT_DIRECTORY, createEnvironment, environmentMatrix } from "./lib/run-metadata.ts";
import { listScenarioIds } from "./lib/scenarios.ts";
import { workerPaths } from "./lib/worker.ts";

const DEFAULT_ENVIRONMENT = "agent-team-conflict";
const PRESET_ID = "poteto-mode";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readLogText(file: string): string {
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").trim().split("\n").slice(-200).join("\n");
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function dismissPreview(session: BrowserSession): void {
  try {
    if (!session.eval<string>("document.body.innerText").includes("预览版说明")) return;
  } catch {
    return;
  }
  session.eval<boolean>(
    `(() => { const b=[...document.querySelectorAll("button")].find(e=>e.innerText.trim()==="继续"); if(!b) return false; b.click(); return true; })()`,
  );
  session.wait(1200);
}

/** Click the account menu, then its Settings entry, then the Agent-presets section. */
function openAgentPresetSettings(session: BrowserSession): void {
  const account = session.eval<string>(`(() => {
    const b=[...document.querySelectorAll("button")].find(x=>/账号菜单|账号|Account/i.test(x.getAttribute("aria-label")||""));
    if(!b) return "no-account";
    b.click(); return "ok";
  })()`);
  if (account !== "ok") throw new Error(`account menu not found (${account})`);
  session.wait(800);
  const settings = session.eval<string>(`(() => {
    const item=[...document.querySelectorAll('[role="menuitem"], [role="menu"] button, button')].find(x=>/^(设置|Settings)$/.test((x.innerText||"").trim()));
    if(!item) return "no-settings";
    item.click(); return "ok";
  })()`);
  if (settings !== "ok") throw new Error(`settings entry not found (${settings})`);
  session.wait(1200);
  const section = session.eval<string>(`(() => {
    const nav=[...document.querySelectorAll('button,[role="tab"],[role="menuitem"],a')].find(x=>/Agent ?预设|Agent presets|预设|Presets/i.test((x.innerText||"").trim()));
    if(!nav) return "no-preset-nav";
    nav.click(); return "ok";
  })()`);
  if (section !== "ok") throw new Error(`Agent presets section not found (${section})`);
}

interface PresetRow {
  readonly found: boolean;
  readonly text: string;
  readonly alert: string;
  readonly ids: string[];
}

/** Read the poteto-mode roster row and its alert text, retrying briefly while it renders. */
function readPresetRow(session: BrowserSession): PresetRow {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const raw = session.eval<string>(`JSON.stringify((() => {
      const rows=[...document.querySelectorAll('[data-agent-preset-id]')].map(r=>r.getAttribute('data-agent-preset-id'));
      const row=document.querySelector('[data-agent-preset-id="${PRESET_ID}"]');
      if(!row) return {found:false,text:"",alert:"",ids:rows};
      const alerts=[...row.querySelectorAll('[role="alert"]')].map(e=>(e.innerText||"").trim()).filter(Boolean);
      return {found:true,text:(row.innerText||"").trim(),alert:alerts.join("\\n"),ids:rows};
    })())`);
    const row = JSON.parse(raw) as PresetRow;
    if (row.found) return row;
    sleep(500);
  }
  const raw = session.eval<string>(`JSON.stringify((() => {
    const rows=[...document.querySelectorAll('[data-agent-preset-id]')].map(r=>r.getAttribute('data-agent-preset-id'));
    return {found:false,text:"",alert:"",ids:rows};
  })())`);
  return JSON.parse(raw) as PresetRow;
}

interface GuardInspection {
  readonly guard: ConflictGuard;
  readonly observed: string[];
}

/**
 * Open the host, read the poteto-mode preset row, and classify the guard outcome. A row whose
 * text carries the failed-to-load marker is the expected blocked preset; a healthy row means
 * the guard did not fire. Everything else is unknown with the roster snapshot kept for audit.
 */
function inspectPresetGuard(session: BrowserSession, url: string): GuardInspection {
  const observed: string[] = [];
  session.open(url);
  session.wait(7000);
  dismissPreview(session);
  openAgentPresetSettings(session);
  const row = readPresetRow(session);
  observed.push(`preset.ids=${row.ids.join(",") || "none"}`);
  if (row.found) {
    session.eval<boolean>(`(() => {
      const r=document.querySelector('[data-agent-preset-id="${PRESET_ID}"]');
      if(!r) return false;
      r.scrollIntoView({ block: "center" });
      return true;
    })()`);
    session.wait(500);
  }
  if (!row.found) {
    return {
      guard: {
        kind: "unknown",
        detail: `[data-agent-preset-id="${PRESET_ID}"] absent from the roster; ids=[${row.ids.join(", ")}]`,
      },
      observed,
    };
  }
  const text = row.alert !== "" ? row.alert : row.text;
  const broken = /加载失败|Failed to load|broken/i.test(row.text);
  observed.push(`preset.broken=${broken}`);
  if (broken) {
    return { guard: { kind: "blocked", text }, observed };
  }
  return {
    guard: {
      kind: "available",
      detail: `preset row present and not broken: ${row.text.slice(0, 400)}`,
    },
    observed,
  };
}

async function main(): Promise<void> {
  const environmentId = argValue("--environment") ?? DEFAULT_ENVIRONMENT;
  const worker = Number(argValue("--worker") ?? "0");
  if (!Number.isInteger(worker) || worker < 0) throw new Error("--worker must be non-negative");

  const matrix = environmentMatrix(environmentId);
  const scenario = conflictForEnvironment(environmentId);
  const installedPackages = ["dsh-pstack", ...matrix.enabledPluginPackages];
  for (const pkg of scenario.expectedConflict.packages) {
    if (!installedPackages.includes(pkg)) {
      throw new Error(
        `scenario ${scenario.id} expects ${pkg}, but environment ${matrix.id} does not enable it`,
      );
    }
  }

  const configFile = argValue("--config") ?? process.env.PLAYGROUND_CONFIG_FILE ?? CONFIG_FILE;
  const config = readPlaygroundConfig(configFile);
  const plan = loadProviderPlan(config);
  const paths = workerPaths(worker, matrix.id, "adapted");

  resetHome(paths);
  buildProfile(paths, "adapted", installedPackages);
  writeFileSync(paths.phaseFile, "adapted\n");
  copyCredentials(paths, config.credentialsFile);
  writeHomePatch(paths, plan, "adapted");
  registerWorkspaces(paths, listScenarioIds());

  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replace(/[:.]/g, "-");
  mkdirSync(paths.evidenceDir, { recursive: true });
  const recordFile = join(
    paths.evidenceDir,
    recordFileName(scenario.id, "adapted", matrix.id, stamp),
  );
  const screenshotFile = recordFile.replace(/\.json$/, ".png");

  const observed: string[] = [];
  let installError: string | undefined;
  try {
    installPlugins(paths, matrix.versionExemptions ?? []);
    observed.push("install=ok");
    if (matrix.versionExemptions !== undefined && matrix.versionExemptions.length > 0) {
      observed.push(`exemptions=${matrix.versionExemptions.join(",")}`);
    }
  } catch (error) {
    installError = messageOf(error);
    observed.push(`install=error: ${installError}`);
  }

  let startup: ConflictStartup;
  let guard: ConflictGuard = { kind: "unknown", detail: "browser guard did not run" };
  let wroteScreenshot = false;
  try {
    const started = await startWeb(paths, plan);
    startup = { kind: "started", url: started.url };
    observed.push(`web=started url=${started.url}`);
    let session: BrowserSession | undefined;
    try {
      session = createBrowserSession({
        session: `${matrix.id}-w${worker}-conflict`,
        browserDir: paths.browserDir,
      });
      const inspection = inspectPresetGuard(session, started.url);
      guard = inspection.guard;
      observed.push(...inspection.observed);
      observed.push(`guard=${guard.kind}`);
      session.screenshot(screenshotFile);
      wroteScreenshot = existsSync(screenshotFile);
      observed.push(`screenshot=${screenshotFile}`);
    } catch (error) {
      guard = { kind: "unknown", detail: `browser driver: ${messageOf(error)}` };
      observed.push(`guard=driver-error ${messageOf(error)}`);
      try {
        session?.screenshot(screenshotFile);
        wroteScreenshot = existsSync(screenshotFile);
        observed.push(`screenshot=${screenshotFile}`);
      } catch {
        // A missing screenshot must not mask the guard outcome.
      }
    } finally {
      session?.close();
    }
  } catch (error) {
    const runError = messageOf(error);
    observed.push(`web=exited error=${runError}`);
    const combinedText = [installError ?? "", runError, readLogText(paths.logFile)]
      .filter((part) => part !== "")
      .join("\n");
    startup = { kind: "exited", combinedText, runError };
  } finally {
    stopWeb(paths);
  }

  const observation: ConflictObservation = { startup, guard };
  const environment = createEnvironment({ worker, matrix, config, phase: "adapted", paths });
  const record = buildConflictRunRecord({
    scenario,
    environment,
    recordFile,
    ...(wroteScreenshot ? { screenshotFile } : {}),
    observed,
    observation,
    capturedAt,
  });
  assertSafeRecord(
    record,
    Object.values(config.providers).map((provider) => provider.apiKey),
  );
  writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`[run-conflict] ${scenario.id} adapted ${matrix.id} ${record.verdict.status}`);
  console.log(`[run-conflict] evidence=${recordFile}`);
  console.log(`[run-conflict] reports=${REPORT_DIRECTORY}`);
  process.exitCode =
    record.verdict.status === "blocked" ? 0 : record.verdict.status === "not-verified" ? 1 : 2;
}

main().catch((error: unknown) => {
  console.error(`[run-conflict] ERROR: ${messageOf(error)}`);
  process.exitCode = 1;
});
