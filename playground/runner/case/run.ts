import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

import type {
  BehaviorScenario,
  BrowserConfig,
  PlaygroundConfig,
  RunRecord,
  SessionFacts,
  TestTarget,
  Treatment,
} from "../types.ts";
import {
  captureFullPage,
  collapseSidebar,
  createBrowserSession,
  type BrowserSession,
} from "../browser/session.ts";
import { isBlankImage } from "../evidence/png.ts";
import {
  digestSession,
  pendingSemanticReview,
  readSessionEvents,
  sessionFacts,
  sessionMatchesPrompt,
  verdictFor,
  type SessionDigest,
  type SessionEvent,
} from "../evidence/evidence.ts";
import {
  DEFAULT_ANSWER_TEXT,
  POLL_INTERVAL_MS,
  PRESET_LABELS,
  SETTLE_WINDOW_MS,
  SUBAGENT_TIMEOUT_MS,
  TURN_TIMEOUT_MS,
  UI_LABELS,
} from "../worker/runtime.ts";
import { createEnvironment, environmentMatrix } from "../worker/run-metadata.ts";
import { stopRequestFile, type WorkerPaths } from "../worker/worker.ts";

const {
  composerSelector: COMPOSER_SELECTOR,
  newSession: NEW_SESSION_LABEL,
  previewNotice: PREVIEW_NOTICE,
  continue: CONTINUE_LABEL,
} = UI_LABELS;

export class InfraError extends Error {}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sessionSignature(file: string): string {
  const events = readSessionEvents(file);
  return `${events.length}:${events.at(-1)?.type ?? "none"}`;
}

function waitForSettledSession(file: string): void {
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  let signature = sessionSignature(file);
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    sleep(POLL_INTERVAL_MS);
    const next = sessionSignature(file);
    if (next !== signature) {
      signature = next;
      stableSince = Date.now();
      continue;
    }
    if (Date.now() - stableSince >= SETTLE_WINDOW_MS) return;
  }
  throw new InfraError("session did not settle after turn/end");
}

function eventText(event: SessionEvent): string {
  const content = (event.data as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part && typeof part === "object" && (part as { type?: string }).type === "text"
        ? ((part as { text?: string }).text ?? "")
        : "",
    )
    .join("");
}

/**
 * Async subagents finish after the main turn ended and then start a follow-up turn.
 * Capture must wait until every spawned subagent reports finished, so the record and
 * screenshot include the completion result instead of stopping at the dispatch notice.
 */
function activeSubagents(file: string): number {
  const events = readSessionEvents(file);
  // rc.2 addresses children by name and its completion notice reads
  // "Background subagent <name>". Older runtimes used the Session id. Track both
  // handles per cataloged child and accept a finish notice that carries either.
  const handles = new Map<string, Set<string>>();
  const finished = new Set<string>();
  for (const event of events) {
    if (event.type === "subagent/catalog") {
      const data = event.data as { childId?: unknown; name?: unknown } | undefined;
      const childId = typeof data?.childId === "string" ? data.childId : undefined;
      if (childId === undefined) continue;
      const set = handles.get(childId) ?? new Set<string>();
      set.add(childId);
      if (typeof data?.name === "string" && data.name !== "") set.add(data.name);
      handles.set(childId, set);
      continue;
    }
    if (event.type !== "user/message") continue;
    const text = eventText(event);
    for (const [childId, names] of handles) {
      if (finished.has(childId)) continue;
      for (const handle of names) {
        if (text.includes(`Background subagent ${handle}`) && /finished|was stopped/.test(text)) {
          finished.add(childId);
          break;
        }
      }
    }
  }
  return handles.size - finished.size;
}

function waitForSubagentsSettled(file: string): void {
  const deadline = Date.now() + SUBAGENT_TIMEOUT_MS;
  let signature = sessionSignature(file);
  let stableSince = Date.now();
  for (;;) {
    if (Date.now() > deadline) throw new InfraError("subagents did not settle before capture");
    sleep(POLL_INTERVAL_MS);
    const next = sessionSignature(file);
    if (next !== signature) {
      signature = next;
      stableSince = Date.now();
      continue;
    }
    if (activeSubagents(file) === 0 && Date.now() - stableSince >= SETTLE_WINDOW_MS) {
      return;
    }
  }
}

interface SessionFile {
  id: string;
  file: string;
}

function listSessionFiles(paths: WorkerPaths): SessionFile[] {
  const root = join(paths.home, "sessions");
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((slug) => {
    const directory = join(root, slug);
    if (!statSync(directory).isDirectory()) return [];
    return readdirSync(directory).flatMap((id) => {
      const file = join(directory, id, "session.v4.jsonl.zstd");
      return existsSync(file) ? [{ id, file }] : [];
    });
  });
}

export function latestSessionFile(paths: WorkerPaths): SessionFile | null {
  const files = listSessionFiles(paths);
  files.sort((left, right) => statSync(right.file).mtimeMs - statSync(left.file).mtimeMs);
  return files[0] ?? null;
}

function waitFor(predicate: () => boolean, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    sleep(500);
  }
  return predicate();
}

function dismissPreview(session: BrowserSession): void {
  if (!session.eval<string>("document.body.innerText").includes(PREVIEW_NOTICE)) return;
  session.eval<boolean>(
    `(() => { const button = [...document.querySelectorAll("button")].find((element) => element.innerText.trim() === ${JSON.stringify(CONTINUE_LABEL)}); if (!button) return false; button.click(); return true; })()`,
  );
  session.wait(2000);
}

function startSession(session: BrowserSession, scenarioId: string): void {
  const started = session.eval<string>(
    `(() => {
      const title = ${JSON.stringify(scenarioId)};
      const button = [...document.querySelectorAll("button")].find((element) => {
        const label = element.getAttribute("aria-label") || "";
        return label.includes(title) && (label.includes("新建会话") || label.toLowerCase().includes("new session"));
      });
      if (button) { button.click(); return "workspace"; }
      const header = [...document.querySelectorAll("button")].find((element) => element.innerText.trim() === ${JSON.stringify(NEW_SESSION_LABEL)});
      if (header) { header.click(); return "header"; }
      return "none";
    })()`,
  );
  if (started === "none") throw new Error("could not start a session in the scenario workspace");
}

/**
 * Ensure the new-session preset matches `preset`. DSH opens a fresh session on the
 * default preset, so when the seat already shows the wanted label there is nothing to
 * click. rc.2 preset menus ignore a bare `.click()` and open only on a full pointer
 * sequence, so a switch dispatches one before looking for the menu item.
 */
function selectPreset(session: BrowserSession, preset: string): void {
  const labels = PRESET_LABELS[preset] ?? [preset];
  const current = session.eval<string>(
    `(() => {
      const button = [...document.querySelectorAll("button")].find((element) =>
        (element.className || "").toString().includes("seat") ||
        (element.getAttribute("aria-haspopup") === "menu" && !element.getAttribute("aria-label") && /模式|Mode/.test(element.innerText || ""))
      );
      if (!button) return "no-seat";
      button.setAttribute("data-playground-preset-seat", "1");
      return (button.innerText || "").trim();
    })()`,
  );
  if (current === "no-seat") throw new InfraError("preset selector is unavailable");
  if (labels.some((label) => current.startsWith(label))) return;
  session.eval(
    `(() => {
      const button = document.querySelector("button[data-playground-preset-seat]");
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
      }
      return true;
    })()`,
  );
  session.wait(900);
  const picked = session.eval<string>(
    `(() => {
      const labels = ${JSON.stringify(labels)};
      const item = [...document.querySelectorAll("[role=menuitem]")].find((element) => labels.some((label) => (element.innerText || "").trim().startsWith(label)));
      if (!item) return "no-item";
      item.click(); return "selected";
    })()`,
  );
  if (picked !== "selected") throw new InfraError(`could not select preset ${preset}`);
  session.wait(900);
}

export function materializeWorkspace(paths: WorkerPaths, scenario: BehaviorScenario): string {
  const workspace = join(paths.workspaceRoot, scenario.id);
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  for (const [relative, content] of Object.entries(scenario.workspace.files)) {
    const target = join(workspace, relative);
    if (target !== workspace && !target.startsWith(`${workspace}/`)) {
      throw new Error(`fixture path escapes workspace: ${relative}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const git = spawnSync("git", ["init", "-q"], { cwd: workspace, encoding: "utf8" });
  if (git.error) throw new Error(`git init failed: ${git.error.message}`);
  if (git.status !== 0) throw new Error(`git init failed: ${git.stderr.trim() || git.status}`);
  return workspace;
}

interface MatchResult {
  id: string;
  file: string;
}

function findMatchingSession(
  paths: WorkerPaths,
  before: Set<string>,
  startedAtMs: number,
  prompt: string,
): MatchResult | null {
  for (const { id, file } of listSessionFiles(paths)) {
    if (before.has(id) && statSync(file).mtimeMs < startedAtMs - 2000) continue;
    const events = readSessionEvents(file);
    const header = events.find((event) => event.type === "session");
    // Only the root session answers a scenario prompt. A delegated child shares the
    // workspace and often echoes the prompt, so matching it would capture the child
    // instead of the orchestrator.
    if (
      header !== undefined &&
      (header.origin === "subagent" || (header.delegationDepth ?? 0) > 0)
    ) {
      continue;
    }
    if (sessionMatchesPrompt(events, prompt, true)) return { id, file };
  }
  return null;
}

/**
 * Answer the open ask_user_question card as the absent user would. The card is a
 * one-question-per-page wizard: choosing an option on a non-last question advances on its
 * own, and the last question needs the primary submit button in the footer. So we act one
 * step per poll (select, or submit) and let React re-render before the next poll. A case's
 * `answers` rules win; otherwise take the first option, or type the default text when the
 * question offers no options. Every distinct answer is recorded once for the evidence.
 */
function answerPendingQuestions(
  session: BrowserSession,
  scenario: BehaviorScenario,
  log: Array<{ question: string; answer: string }>,
): void {
  let raw: string;
  try {
    raw = session.eval<string>(
      `(() => {
      const rules = ${JSON.stringify(scenario.answers ?? [])};
      const fallback = ${JSON.stringify(DEFAULT_ANSWER_TEXT)};
      const visible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
      const card = [...document.querySelectorAll("[data-question-key]")].find(visible);
      if (!card) return "[]";
      const labelledBy = card.getAttribute("aria-labelledby");
      const labelEl = labelledBy ? document.getElementById(labelledBy) : null;
      const question = ((labelEl && labelEl.innerText) || (card.innerText || "")).trim().split("\\n")[0].slice(0, 300);
      const rule = rules.find((r) => question.includes(r.match));
      const optionButtons = [...card.querySelectorAll("[data-option-row] button")].filter((b) => visible(b) && !b.disabled);
      const selected = optionButtons.filter((b) => b.getAttribute("aria-checked") === "true");
      const actions = [];
      const record = (answer) => actions.push({ question, answer: answer || "(clicked first option)" });
      // The primary footer button advances a non-last question and submits the last.
      // Skip the pager arrows and the skip button.
      const footer = card.querySelector("footer");
      const primary = footer
        ? [...footer.querySelectorAll("button")].find((b) => {
            const label = b.getAttribute("aria-label") || "";
            if (/上一题|下一题|prev|next/i.test(label) && !b.innerText.trim()) return false;
            if (/跳过|skip/i.test((b.innerText || "") + " " + label)) return false;
            return visible(b) && !b.disabled;
          })
        : null;
      const input = card.querySelector("textarea, input:not([type=checkbox]):not([type=radio])");
      const wantsCustom = Boolean(rule && rule.custom);
      const wantsFallback = !rule && optionButtons.length === 0;
      if (selected.length === 0 && (wantsCustom || wantsFallback)) {
        const text = wantsCustom ? rule.custom : fallback;
        const current = input ? String(input.value || "").trim() : "";
        if (input && current !== text.trim()) {
          const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value").set.call(input, text);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          record(text);
          return JSON.stringify(actions);
        }
        if (primary) primary.click();
        return JSON.stringify(actions);
      }
      if (selected.length === 0) {
        if (optionButtons.length > 0) {
          let target = null;
          if (rule && rule.selected && rule.selected.length) {
            target = optionButtons.find((b) => (b.getAttribute("aria-label") || b.innerText || "").includes(rule.selected[0]));
          }
          if (!target) {
            target = optionButtons.find((b) => {
              const label = (b.getAttribute("aria-label") || "") + " " + (b.innerText || "");
              return /(Recommended)|（推荐）|推荐/.test(label);
            });
          }
          if (!target) target = optionButtons[0];
          record((target.getAttribute("aria-label") || target.innerText || "").trim());
          target.click();
        }
        return JSON.stringify(actions);
      }
      if (primary) primary.click();
      return JSON.stringify(actions);
    })()`,
    );
  } catch {
    // A transient eval failure (for example the page context changed mid-poll when a
    // preset switch or navigation reloads the app) must not abort the case; retry next poll.
    return;
  }
  try {
    const parsed = JSON.parse(raw) as Array<{ question: string; answer: string }>;
    for (const entry of parsed) {
      if (log.some((item) => item.question === entry.question && item.answer === entry.answer))
        continue;
      log.push(entry);
      console.log(`[run-case] auto-answered "${entry.question}" -> ${entry.answer}`);
    }
  } catch {
    // The browser returned no complete question card.
  }
}

interface AttemptInput {
  paths: WorkerPaths;
  scenario: BehaviorScenario;
  url: string;
  expectedTarget: TestTarget;
  screenshotFile: string;
  expectedPreset: string;
  browser?: BrowserConfig;
}

function captureScreenshot(session: BrowserSession, path: string): void {
  captureFullPage(session, path);
}

function throwIfStopped(paths: WorkerPaths, session: BrowserSession, screenshotFile: string): void {
  if (!existsSync(stopRequestFile(paths))) return;
  try {
    captureScreenshot(session, screenshotFile);
  } catch {
    // The stop happened before the page could be captured; the blocked record still remains.
  }
  throw new InfraError("external stop requested");
}

function sessionHealthy(session: BrowserSession): boolean {
  try {
    const length = session.eval<number>("document.body ? document.body.innerText.length : 0");
    return typeof length === "number" && length > 0;
  } catch {
    return false;
  }
}

/** The conversation always renders the user turn, so it is a stable marker that the
 * screenshot page still shows this scenario and not a fresh empty session. */
function pageShowsPrompt(session: BrowserSession, prompt: string): boolean {
  const needle = prompt.trim().slice(0, 16);
  if (!needle) return false;
  try {
    return session.eval<boolean>(
      `document.body ? document.body.innerText.includes(${JSON.stringify(needle)}) : false`,
    );
  } catch {
    return false;
  }
}

function captureOnce(session: BrowserSession, screenshotFile: string, lastPrompt: string): boolean {
  if (!sessionHealthy(session) || !pageShowsPrompt(session, lastPrompt)) return false;
  collapseSidebar(session);
  try {
    captureScreenshot(session, screenshotFile);
  } catch {
    return false;
  }
  return !isBlankImage(screenshotFile) && sessionHealthy(session);
}

/**
 * Capture only after the page provably shows this scenario and the frame is not one flat
 * color. A dead browser, a lost conversation, or a blank frame fails closed: delete the
 * screenshot and throw, so the record becomes blocked instead of storing an invalid image.
 */
export function captureVerified(
  session: BrowserSession,
  screenshotFile: string,
  lastPrompt: string,
): void {
  if (captureOnce(session, screenshotFile, lastPrompt)) return;
  rmSync(screenshotFile, { force: true });
  throw new InfraError(
    "screenshot capture failed, was blank, or the page lost the conversation; refusing to record an invalid screenshot",
  );
}

export function attemptScenario(input: AttemptInput): {
  digest: SessionDigest;
  file: string;
  answers: SessionFacts["autoAnswers"];
} {
  const { paths, scenario, url, screenshotFile, expectedPreset, browser } = input;
  const preset = expectedPreset;
  const session = createBrowserSession({
    session: `${paths.environmentId}-w${paths.index}`,
    browserDir: paths.browserDir,
    ...(browser === undefined ? {} : { browser }),
  });
  const autoAnswers: Array<{ question: string; answer: string }> = [];
  try {
    try {
      session.raw(["close", "--all"]);
    } catch {
      // No prior daemon is fine; the open below starts a clean browser either way.
    }
    session.open(url);
    session.wait(6000);
    dismissPreview(session);
    startSession(session, scenario.id);
    session.wait(2500);
    if (
      !waitFor(
        () =>
          session.eval<number>(
            `document.querySelectorAll(${JSON.stringify(COMPOSER_SELECTOR)}).length`,
          ) > 0,
        15_000,
      )
    ) {
      throw new InfraError("composer did not appear");
    }
    selectPreset(session, preset);
    const prompt = scenario.turns[0]?.prompt;
    if (!prompt) throw new Error("scenario has no turn");
    const before = new Set(listSessionFiles(paths).map((entry) => entry.id));
    let match: MatchResult | null = null;
    let seenTurnEnds = 0;
    for (const [turnIndex, turn] of scenario.turns.entries()) {
      const turnStartedAt = Date.now();
      session.click(COMPOSER_SELECTOR);
      session.keyboardType(turn.prompt);
      session.wait(800);
      session.press("Enter");
      session.wait(2000);
      if (
        session.eval<string>(
          `(document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)})?.innerText ?? "").trim()`,
        ) !== ""
      ) {
        session.eval<boolean>(
          `(() => { const buttons = [...document.querySelectorAll("button")].filter((b) => !b.disabled && b.querySelector("svg")); const last = buttons.at(-1); if (!last) return false; last.click(); return true; })()`,
        );
        session.wait(2500);
      }
      for (;;) {
        try {
          throwIfStopped(paths, session, screenshotFile);
          answerPendingQuestions(session, scenario, autoAnswers);
          // Only the first turn discovers a fresh session from its opening prompt. Every
          // later turn runs in that same session, whose first user message never changes,
          // so reuse the match and wait for one more turn/end instead of re-matching on a
          // prompt that can never be the first message again.
          if (turnIndex === 0) {
            match = findMatchingSession(paths, before, turnStartedAt, turn.prompt);
          } else if (!match) {
            throw new InfraError("no session matched the scenario");
          } else if (!existsSync(match.file)) {
            throw new InfraError("matched session log vanished");
          }
          if (match) {
            const ends = readSessionEvents(match.file).filter(
              (event) => event.type === "turn/end",
            ).length;
            if (ends > seenTurnEnds) {
              seenTurnEnds = ends;
              waitForSettledSession(match.file);
              break;
            }
          }
        } catch (error) {
          if (error instanceof InfraError) throw error;
          throw new InfraError(error instanceof Error ? error.message : String(error));
        }
        sleep(POLL_INTERVAL_MS);
      }
    }
    if (!match) throw new InfraError("no session matched the scenario");
    const matched: MatchResult = match;
    waitForSubagentsSettled(matched.file);
    session.wait(1000);
    const lastPrompt = scenario.turns.at(-1)?.prompt ?? "";
    captureVerified(session, screenshotFile, lastPrompt);
    if (!existsSync(matched.file)) throw new InfraError("session log vanished before reading");
    try {
      return {
        digest: digestSession(matched.file, matched.id, paths.index),
        file: matched.file,
        answers: autoAnswers,
      };
    } catch (error) {
      throw new InfraError(error instanceof Error ? error.message : String(error));
    }
  } finally {
    session.close();
  }
}

export function blockedRecord(input: {
  scenarioId: string;
  treatment: Treatment;
  paths: WorkerPaths;
  config: PlaygroundConfig;
  recordFile: string;
  screenshotFile: string;
  sessionFile?: string;
  sessionId?: string;
  reason: string;
  /** The attempt start stamp shared with the record and source filenames. */
  capturedAt: string;
}): RunRecord {
  const config = input.config;
  const matrix = environmentMatrix(input.paths.environmentId);
  const sessionFile = input.sessionFile;
  const session = sessionFile
    ? (() => {
        try {
          return sessionFacts(
            digestSession(sessionFile, input.sessionId ?? "", input.paths.index),
            sessionFile,
            [],
          );
        } catch {
          return null;
        }
      })()
    : null;
  return {
    scenarioId: input.scenarioId,
    treatment: input.treatment,
    environment: createEnvironment({
      worker: input.paths.index,
      matrix,
      config,
      treatment: input.treatment,
      paths: input.paths,
    }),
    target: null,
    session,
    artifacts: {
      recordFile: input.recordFile,
      screenshotFile: input.screenshotFile,
      observed: [],
    },
    semanticReview: pendingSemanticReview(),
    mechanicalFailures: [],
    verdict: verdictFor({
      treatment: input.treatment,
      failures: [],
      semanticReview: pendingSemanticReview(),
      blockedReason: input.reason,
    }),
    batchId: process.env.PLAYGROUND_BATCH_ID,
    capturedAt: input.capturedAt,
  };
}
