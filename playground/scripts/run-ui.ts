/**
 * Drive one plugin-UI scenario against a prepared worker browser.
 *
 * The executor opens a worker's web URL, walks the plugin UI by role/text discovery
 * (never a hard-coded selector chain beyond the stable `data-plugin-*` handles the
 * host plugin manager already publishes), performs each step's action, and asserts the
 * expected DOM text, role-file content, or screenshot on disk. A failed step makes the
 * scenario `not-verified`; infrastructure gaps make it `inconclusive`; a clean mechanical
 * run stays `inconclusive` until a human reviews the screenshots (pending semantic review).
 *
 * Action vocabulary (see `playground/scenarios/plugin-ui.ts`):
 *   open-plugins-detail [expected]        打开插件侧栏 → dsh-pstack 详情 → 配置对话框
 *   open-role-tab                         切到角色模型页签
 *   select-role role=<key>                定位并滚动到角色卡片
 *   set-route role=<key>                  用 worker home 的 testModel 填一条合法路由
 *   save role=<key>                       保存角色卡片
 *   clear-role role=<key>                 清除角色卡片（配合 save 删除角色行）
 *   assert-file-contains role=<key>       断言 $DSH_HOME/pstack-models.mdc 含该角色行
 *   assert-file-not-contains role=<key>   断言文件不含该角色行
 *   assert-plugin-listed name=<pkg>       断言推荐插件列表渲染该包名与状态标签
 *   toggle-plugin name=<pkg>              切换插件启用/禁用（宿主不允许时保留禁用态）
 *   assert-plugin-state name=<pkg>        断言状态与切换一致，或明确禁用/报错
 *   screenshot name=<slug|final>          落盘截图；name=final 即 RunRecord 主截图
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { EnvironmentMatrix, PluginUiScenario, TestTarget } from "../types.ts";
import { pluginUiScenarios } from "../scenarios/plugin-ui.ts";
import { createBrowserSession, type BrowserSession } from "./lib/browser.ts";
import { assertSafeRecord, recordFileName } from "./lib/evidence.ts";
import { CONFIG_FILE, readHomePlan, readPlaygroundConfig, readWebUrl } from "./lib/env.ts";
import { createEnvironment, REPORT_DIRECTORY } from "./lib/run-metadata.ts";
import {
  ROLE_FILE,
  UI_ACTION_VERBS,
  buildUiRunRecord,
  fileAssertionFailure,
  parseUiAction,
  resolveExpected,
  type FileAssertionVerb,
} from "./lib/ui-execution.ts";
import { workerPaths } from "./lib/worker.ts";

const PLUGINS_PACKAGE = "dsh-pstack";
const POLL_INTERVAL_MS = 300;

class InfraError extends Error {}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Poll a boolean-valued page expression until it holds or the deadline passes. */
function waitFor(
  session: BrowserSession,
  expression: string,
  timeoutMs: number,
  intervalMs = POLL_INTERVAL_MS,
): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (session.eval<boolean>(expression)) return true;
    } catch {
      // A navigation or React remount can invalidate the context mid-poll; retry until timeout.
    }
    sleep(intervalMs);
  }
  try {
    return session.eval<boolean>(expression);
  } catch {
    return false;
  }
}

function dismissPreview(session: BrowserSession): void {
  try {
    if (!session.eval<string>("document.body.innerText").includes("预览版说明")) return;
  } catch {
    return;
  }
  session.eval<boolean>(
    `(() => { const button = [...document.querySelectorAll("button")].find((element) => element.innerText.trim() === "继续"); if (!button) return false; button.click(); return true; })()`,
  );
  session.wait(1500);
}

const PANEL_LABELS = ["插件", "Plugins"];
const PANEL_BUTTON_SCRIPT = `(() => {
  const labels = ${JSON.stringify(PANEL_LABELS)};
  const button = [...document.querySelectorAll("button")].find((candidate) => labels.includes((candidate.getAttribute("aria-label") || "").trim()));
  if (!button) return "no-panel";
  button.click();
  return "ok";
})()`;

function openPluginsDetail(session: BrowserSession): void {
  const first = session.eval<string>(PANEL_BUTTON_SCRIPT);
  if (first !== "ok") {
    session.eval<boolean>(
      `(() => { const opener = document.querySelector("[data-sidebar-opener]"); if (opener) opener.click(); return true; })()`,
    );
    session.wait(800);
    if (session.eval<string>(PANEL_BUTTON_SCRIPT) !== "ok") {
      throw new Error("could not find the Plugins panel button (aria-label 插件/Plugins)");
    }
  }
  if (
    !waitFor(
      session,
      `!!document.querySelector('[data-plugin-package="${PLUGINS_PACKAGE}"]')`,
      20_000,
    )
  ) {
    throw new Error(`plugin list did not show ${PLUGINS_PACKAGE}`);
  }
  const opened = session.eval<string>(`(() => {
    const item = document.querySelector('[data-plugin-package="${PLUGINS_PACKAGE}"]');
    if (!item) return "no-item";
    const button = [...item.querySelectorAll("button")].find((candidate) => /查看|View/i.test(candidate.getAttribute("aria-label") || "")) || item.querySelector("button");
    if (!button) return "no-open";
    button.click();
    return "ok";
  })()`);
  if (opened !== "ok") throw new Error(`could not open the ${PLUGINS_PACKAGE} detail (${opened})`);
  if (
    !waitFor(
      session,
      `!!document.querySelector('[data-plugin-detail="${PLUGINS_PACKAGE}"]')`,
      20_000,
    )
  ) {
    throw new Error(`${PLUGINS_PACKAGE} detail page did not appear`);
  }
  const configured = session.eval<string>(`(() => {
    const detail = document.querySelector('[data-plugin-detail="${PLUGINS_PACKAGE}"]');
    if (!detail) return "no-detail";
    const button = [...detail.querySelectorAll("button")].find((candidate) => ["配置", "Configure"].includes((candidate.textContent || "").trim()));
    if (!button) return "no-configure";
    button.click();
    return "ok";
  })()`);
  if (configured !== "ok")
    throw new Error(`could not open the pstack config dialog (${configured})`);
  if (!waitFor(session, `!!document.querySelector('.pstack-panel[role="dialog"]')`, 20_000)) {
    throw new Error("pstack config dialog did not appear");
  }
}

function openRoleTab(session: BrowserSession): void {
  const clicked = session.eval<string>(`(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((candidate) => /角色模型|Role models/i.test((candidate.textContent || "").trim()));
    if (!tab) return "no-tab";
    tab.click();
    return "ok";
  })()`);
  if (clicked !== "ok") throw new Error(`could not find the role models tab (${clicked})`);
  if (!waitFor(session, `!!document.querySelector(".pstack-role-card")`, 20_000)) {
    throw new Error("role cards did not render");
  }
}

function findRoleCardScript(role: string, body: string): string {
  return `(() => {
    const role = ${JSON.stringify(role)};
    const card = [...document.querySelectorAll(".pstack-role-card")].find((candidate) => [...candidate.querySelectorAll("code")].some((chip) => (chip.textContent || "").trim() === role));
    if (!card) return "no-card";
    ${body}
  })()`;
}

function selectRole(session: BrowserSession, role: string): void {
  const result = session.eval<string>(
    findRoleCardScript(role, `card.scrollIntoView({ block: "center" }); return "ok";`),
  );
  if (result !== "ok")
    throw new Error(`could not find role card ${JSON.stringify(role)} (${result})`);
}

function setRouteValue(
  session: BrowserSession,
  role: string,
  index: number,
  value: string,
): string {
  return session.eval<string>(
    findRoleCardScript(
      role,
      `const select = card.querySelectorAll("select")[${index}];
    if (!select) return "no-select:${index}";
    if (![...select.options].some((option) => option.value === ${JSON.stringify(value)})) return "missing-option:" + ${JSON.stringify(value)};
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return "ok";`,
    ),
  );
}

function setRoute(session: BrowserSession, role: string, plan: TestTarget): void {
  const provider = setRouteValue(session, role, 0, plan.provider);
  if (provider !== "ok") throw new Error(`provider select rejected ${plan.provider}: ${provider}`);
  session.wait(500);
  const model = setRouteValue(session, role, 1, plan.model);
  if (model !== "ok") throw new Error(`model select rejected ${plan.model}: ${model}`);
  session.wait(400);
  const effort = setRouteValue(session, role, 2, plan.effort);
  if (effort !== "ok") throw new Error(`effort select rejected ${plan.effort}: ${effort}`);
  session.wait(400);
  const values = JSON.parse(
    session.eval<string>(
      findRoleCardScript(
        role,
        `return JSON.stringify([...card.querySelectorAll("select")].map((select) => select.value));`,
      ),
    ),
  ) as string[];
  if (values[0] !== plan.provider || values[1] !== plan.model || values[2] !== plan.effort) {
    throw new Error(
      `route selectors hold ${JSON.stringify(values)}, expected ${JSON.stringify([plan.provider, plan.model, plan.effort])}`,
    );
  }
}

function saveRole(session: BrowserSession, role: string): void {
  const clicked = session.eval<string>(
    findRoleCardScript(
      role,
      `const button = [...card.querySelectorAll("button")].find((candidate) => candidate.classList.contains("pstack-btn-primary"));
    if (!button) return "no-save";
    if (button.disabled) return "disabled";
    button.click();
    return "ok";`,
    ),
  );
  if (clicked !== "ok")
    throw new Error(`save button unavailable for ${JSON.stringify(role)} (${clicked})`);
  const settled = waitFor(
    session,
    `(() => {
      const role = ${JSON.stringify(role)};
      const card = [...document.querySelectorAll(".pstack-role-card")].find((candidate) => [...candidate.querySelectorAll("code")].some((chip) => (chip.textContent || "").trim() === role));
      if (!card) return false;
      const message = card.querySelector(".pstack-inline-message");
      return !!message && ["success", "error"].includes(message.getAttribute("data-tone") || "");
    })()`,
    25_000,
  );
  if (!settled)
    throw new Error(`role ${JSON.stringify(role)} save produced no success/error message`);
}

function clearRole(session: BrowserSession, role: string): void {
  const clicked = session.eval<string>(
    findRoleCardScript(
      role,
      `const button = [...card.querySelectorAll("button")].find((candidate) => /清除|Clear/i.test((candidate.textContent || "").trim()));
    if (!button) return "no-clear";
    if (button.disabled) return "disabled";
    button.click();
    return "ok";`,
    ),
  );
  if (clicked !== "ok")
    throw new Error(`clear button unavailable for ${JSON.stringify(role)} (${clicked})`);
  session.wait(400);
}

interface PluginCardState {
  readonly found: boolean;
  readonly status: string;
  readonly enabled: boolean;
  readonly switchDisabled: boolean;
  readonly inlineMessage: string;
}

const EMPTY_PLUGIN_STATE: PluginCardState = {
  found: false,
  status: "",
  enabled: false,
  switchDisabled: true,
  inlineMessage: "",
};

function readPluginCard(session: BrowserSession, name: string): PluginCardState {
  const raw = session.eval<string>(`(() => {
    const name = ${JSON.stringify(name)};
    const card = [...document.querySelectorAll(".pstack-plugin-card")].find((candidate) => [...candidate.querySelectorAll("code")].some((chip) => (chip.textContent || "").trim() === name));
    if (!card) return JSON.stringify(${JSON.stringify(EMPTY_PLUGIN_STATE)});
    const status = card.querySelector(".pstack-status");
    const toggle = card.querySelector('[role="switch"]');
    const message = card.querySelector(".pstack-inline-message");
    return JSON.stringify({
      found: true,
      status: status ? (status.textContent || "").trim() : "",
      enabled: toggle ? toggle.getAttribute("aria-checked") === "true" : false,
      switchDisabled: toggle ? toggle.disabled === true : true,
      inlineMessage: message ? (message.textContent || "").trim() : "",
    });
  })()`);
  return JSON.parse(raw) as PluginCardState;
}

interface ToggleRecord {
  toggled: boolean;
  before: PluginCardState;
  after?: PluginCardState;
}

interface StepContext {
  readonly plan: TestTarget;
  readonly home: string;
  readonly recordBase: string;
  readonly observed: string[];
  readonly pluginState: Map<string, ToggleRecord>;
  screenshotFile?: string;
}

function assertPluginListed(session: BrowserSession, name: string): void {
  const state = readPluginCard(session, name);
  if (!state.found) throw new Error(`plugin card for ${name} is not in the recommended list`);
  if (state.status === "") throw new Error(`plugin card for ${name} shows no status label`);
}

function togglePlugin(session: BrowserSession, name: string, context: StepContext): void {
  const before = readPluginCard(session, name);
  if (!before.found) throw new Error(`plugin card for ${name} is not in the recommended list`);
  context.pluginState.set(name, { toggled: false, before });
  if (before.switchDisabled) return;
  const clicked = session.eval<string>(`(() => {
    const name = ${JSON.stringify(name)};
    const card = [...document.querySelectorAll(".pstack-plugin-card")].find((candidate) => [...candidate.querySelectorAll("code")].some((chip) => (chip.textContent || "").trim() === name));
    if (!card) return "no-card";
    const toggle = card.querySelector('[role="switch"]');
    if (!toggle) return "no-switch";
    if (toggle.disabled) return "disabled";
    toggle.click();
    return "ok";
  })()`);
  if (clicked !== "ok") return;
  waitFor(
    session,
    `(() => {
      const name = ${JSON.stringify(name)};
      const card = [...document.querySelectorAll(".pstack-plugin-card")].find((candidate) => [...candidate.querySelectorAll("code")].some((chip) => (chip.textContent || "").trim() === name));
      if (!card) return false;
      const message = card.querySelector(".pstack-inline-message");
      const toggle = card.querySelector('[role="switch"]');
      const enabled = toggle ? toggle.getAttribute("aria-checked") === "true" : false;
      return (!!message && (message.textContent || "").trim().length > 0) || enabled !== ${JSON.stringify(before.enabled)};
    })()`,
    25_000,
  );
  const after = readPluginCard(session, name);
  context.pluginState.set(name, { toggled: true, before, after });
}

function assertPluginState(session: BrowserSession, name: string, context: StepContext): void {
  const record = context.pluginState.get(name);
  if (record === undefined)
    throw new Error(`toggle-plugin did not run before assert-plugin-state for ${name}`);
  if (!record.toggled) {
    const state = record.before;
    if (!/未安装|不可用|只读|Not installed|Unavailable|Read-only/i.test(state.status)) {
      throw new Error(
        `switch for ${name} was not clickable, but status ${JSON.stringify(state.status)} is not an explicit unavailable/missing/read-only state`,
      );
    }
    return;
  }
  const after = record.after ?? readPluginCard(session, name);
  const flipped = after.enabled !== record.before.enabled && after.status !== record.before.status;
  const explained =
    after.inlineMessage !== "" ||
    /未安装|不可用|只读|无法|Not installed|Unavailable|Read-only/i.test(
      `${after.status} ${after.inlineMessage}`,
    );
  if (flipped || explained) return;
  throw new Error(
    `toggle for ${name} did not change the status and left no explicit message (before ${record.before.status}/${record.before.enabled}, after ${after.status}/${after.enabled})`,
  );
}

function captureScreenshot(session: BrowserSession, name: string, context: StepContext): void {
  const slug = name.replace(/[^a-zA-Z0-9_-]/g, "-");
  const target =
    name === "final" || name === ""
      ? `${context.recordBase}.png`
      : `${context.recordBase}-${slug || "shot"}.png`;
  session.screenshot(target);
  if (!existsSync(target) || statSync(target).size === 0) {
    throw new Error(`screenshot was not written or is empty: ${target}`);
  }
  context.observed.push(`screenshot=${target}`);
  if (name === "final" || name === "") context.screenshotFile = target;
}

function domMatches(session: BrowserSession, expected: string): boolean {
  return session.eval<boolean>(`(() => {
    const raw = ${JSON.stringify(expected)};
    const body = (document.body && document.body.innerText) || "";
    const optionTexts = [...document.querySelectorAll("option")].map((option) => (option.textContent || "").trim());
    if (raw.startsWith("re:")) {
      let pattern;
      try { pattern = new RegExp(raw.slice(3)); } catch { return false; }
      return pattern.test(body) || optionTexts.some((text) => pattern.test(text));
    }
    return body.includes(raw) || optionTexts.some((text) => text === raw);
  })()`);
}

function assertDom(session: BrowserSession, expected: string): string | null {
  return waitForDom(session, expected) ? null : `DOM did not show ${JSON.stringify(expected)}`;
}

function waitForDom(session: BrowserSession, expected: string): boolean {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if (domMatches(session, expected)) return true;
    } catch {
      // retry through remounts
    }
    sleep(POLL_INTERVAL_MS);
  }
  try {
    return domMatches(session, expected);
  } catch {
    return false;
  }
}

function readRoleFile(home: string): string {
  const file = join(home, ROLE_FILE);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function requireParam(
  params: Readonly<Record<string, string>>,
  key: string,
  action: string,
): string {
  const value = params[key];
  if (value === undefined || value === "")
    throw new Error(`${action} needs a ${key}=... parameter`);
  return value;
}

function runStep(
  session: BrowserSession,
  step: { action: string; expected: string },
  context: StepContext,
): string | null {
  let action: ReturnType<typeof parseUiAction>;
  try {
    action = parseUiAction(step.action);
  } catch (error) {
    return `invalid action ${JSON.stringify(step.action)}: ${messageOf(error)}`;
  }
  if (!(UI_ACTION_VERBS as readonly string[]).includes(action.verb)) {
    return `unknown action verb ${JSON.stringify(action.verb)}`;
  }
  const role = action.params.role;
  const expected = resolveExpected(step.expected, {
    plan: context.plan,
    ...(role === undefined ? {} : { role }),
  });
  try {
    switch (action.verb) {
      case "open-plugins-detail":
        openPluginsDetail(session);
        return assertDom(session, expected);
      case "open-role-tab":
        openRoleTab(session);
        return assertDom(session, expected);
      case "select-role":
        selectRole(session, requireParam(action.params, "role", action.verb));
        return assertDom(session, expected);
      case "set-route":
        setRoute(session, requireParam(action.params, "role", action.verb), context.plan);
        return assertDom(session, expected);
      case "save":
        saveRole(session, requireParam(action.params, "role", action.verb));
        return assertDom(session, expected);
      case "clear-role":
        clearRole(session, requireParam(action.params, "role", action.verb));
        return assertDom(session, expected);
      case "assert-file-contains":
      case "assert-file-not-contains": {
        const roleKey = requireParam(action.params, "role", action.verb);
        return fileAssertionFailure({
          verb: action.verb as FileAssertionVerb,
          fileText: readRoleFile(context.home),
          expectedLine: expected,
          role: roleKey,
        });
      }
      case "assert-plugin-listed":
        assertPluginListed(session, requireParam(action.params, "name", action.verb));
        return assertDom(session, expected);
      case "toggle-plugin":
        togglePlugin(session, requireParam(action.params, "name", action.verb), context);
        return assertDom(session, expected);
      case "assert-plugin-state":
        assertPluginState(session, requireParam(action.params, "name", action.verb), context);
        return null;
      case "screenshot":
        captureScreenshot(session, action.params.name ?? "", context);
        return null;
      default:
        return `unknown action verb ${JSON.stringify(action.verb)}`;
    }
  } catch (error) {
    return messageOf(error);
  }
}

function loadUiScenario(id: string): PluginUiScenario {
  const scenario = pluginUiScenarios.find((entry) => entry.id === id);
  if (scenario === undefined) {
    throw new Error(
      `unknown plugin UI scenario: ${id}; known: ${pluginUiScenarios.map((entry) => entry.id).join(", ")}`,
    );
  }
  return scenario;
}

async function main(): Promise<void> {
  const scenarioId = argValue("--scenario");
  if (scenarioId === undefined || scenarioId === "") {
    throw new Error(
      "usage: run-ui.ts --worker N --scenario ID [--environment base] [--packages dsh-pstack] [--config FILE]",
    );
  }
  const worker = Number(argValue("--worker") ?? "0");
  if (!Number.isInteger(worker) || worker < 0)
    throw new Error("--worker must be a non-negative integer");
  const scenario = loadUiScenario(scenarioId);
  const environmentId = argValue("--environment") ?? scenario.environmentId ?? "base";
  const packages = (argValue("--packages") ?? "dsh-pstack")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  const matrix: EnvironmentMatrix = { id: environmentId, enabledPluginPackages: packages };
  const paths = workerPaths(worker, matrix.id);
  const configFile = argValue("--config") ?? process.env.PLAYGROUND_CONFIG_FILE ?? CONFIG_FILE;
  const config = readPlaygroundConfig(configFile);
  const environment = createEnvironment({ worker, matrix, config, phase: "adapted", paths });

  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replace(/[:.]/g, "-");
  mkdirSync(paths.evidenceDir, { recursive: true });
  const recordFile = join(
    paths.evidenceDir,
    recordFileName(scenarioId, "adapted", matrix.id, stamp),
  );
  const recordBase = recordFile.replace(/\.json$/, "");

  const preparedPhase = existsSync(paths.phaseFile)
    ? readFileSync(paths.phaseFile, "utf8").trim()
    : "";
  const installed = existsSync(
    join(paths.home, "profiles", "playground", "node_modules", "dsh-pstack", "package.json"),
  );
  const observed: string[] = [];
  const failures: string[] = [];
  let blockedReason: string | undefined;
  let target: TestTarget | null = null;
  let screenshotFile: string | undefined;

  if (preparedPhase !== "adapted") {
    blockedReason = `worker ${matrix.id}/w${worker} is prepared for ${preparedPhase || "nothing"}, not adapted; run playground:prepare --phase adapted --environment ${matrix.id}`;
  } else if (!existsSync(paths.urlFile)) {
    blockedReason = `worker ${matrix.id}/w${worker} has no web URL; run playground:prepare --phase adapted --environment ${matrix.id}`;
  } else if (!installed) {
    blockedReason = `worker ${matrix.id}/w${worker} profile is missing dsh-pstack; prepare the adapted profile so the plugin UI is present`;
  }

  if (blockedReason === undefined) {
    const plan = readHomePlan(paths);
    target = { provider: plan.provider, model: plan.model, effort: plan.effort };
    const context: StepContext = {
      plan,
      home: paths.home,
      recordBase,
      observed,
      pluginState: new Map(),
    };
    let session: BrowserSession | undefined;
    try {
      session = createBrowserSession({
        session: `${matrix.id}-w${worker}-ui`,
        browserDir: paths.browserDir,
      });
      session.open(readWebUrl(paths));
      session.wait(6000);
      dismissPreview(session);
      for (const [index, step] of scenario.steps.entries()) {
        const failure = runStep(session, step, context);
        if (failure !== null) {
          failures.push(`step ${index + 1} ${step.action}: ${failure}`);
          break;
        }
      }
    } catch (error) {
      if (error instanceof InfraError) blockedReason = error.message;
      else failures.push(`driver: ${messageOf(error)}`);
    } finally {
      if (context.screenshotFile === undefined && session !== undefined) {
        try {
          const fallback = `${recordBase}.png`;
          session.screenshot(fallback);
          context.observed.push(`screenshot=${fallback}`);
          context.screenshotFile = fallback;
        } catch {
          // A missing fallback screenshot must not mask the step failure above.
        }
      }
      session?.close();
    }
    screenshotFile = context.screenshotFile;
  }

  const record = buildUiRunRecord({
    scenarioId,
    environment,
    target,
    recordFile,
    ...(screenshotFile === undefined ? {} : { screenshotFile }),
    observed,
    failures,
    ...(blockedReason === undefined ? {} : { blockedReason }),
    capturedAt,
  });
  assertSafeRecord(
    record,
    Object.values(config.providers).map((provider) => provider.apiKey),
  );
  writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[run-ui] ${scenarioId} adapted ${matrix.id} ${record.verdict.status}`);
  console.log(`[run-ui] evidence=${recordFile}`);
  console.log(`[run-ui] reports=${REPORT_DIRECTORY}`);
  process.exitCode = record.verdict.status === "not-verified" ? 1 : 2;
}

main().catch((error: unknown) => {
  console.error(`[run-ui] ERROR: ${messageOf(error)}`);
  process.exitCode = 1;
});
