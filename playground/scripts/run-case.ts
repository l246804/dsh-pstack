import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type { BehaviorScenario, Phase, RunRecord, SessionFacts, TestTarget } from "../types.ts";
import { createBrowserSession, type BrowserSession } from "./lib/browser.ts";
import {
  assertSafeRecord,
  digestSession,
  mechanicalFailures,
  pendingSemanticReview,
  readSessionEvents,
  recordFileName,
  sessionFacts,
  sessionMatchesPrompt,
  verdictFor,
  type SessionDigest,
} from "./lib/evidence.ts";
import { readHomePlan, readPlaygroundConfig, readWebUrl, CONFIG_FILE } from "./lib/env.ts";
import { createEnvironment, environmentMatrix, REPORT_DIRECTORY } from "./lib/run-metadata.ts";
import { loadScenario } from "./lib/scenarios.ts";
import { workerPaths, type WorkerPaths } from "./lib/worker.ts";

const COMPOSER_SELECTOR = '[data-composer-input="true"]';
const NEW_SESSION_LABEL = "新会话";
const POLL_INTERVAL_MS = 2_000;

class InfraError extends Error {}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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

function waitFor(predicate: () => boolean, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    sleep(500);
  }
  return predicate();
}

function dismissPreview(session: BrowserSession): void {
  if (!session.eval<string>("document.body.innerText").includes("预览版说明")) return;
  session.eval<boolean>(
    `(() => { const button = [...document.querySelectorAll("button")].find((element) => element.innerText.trim() === "继续"); if (!button) return false; button.click(); return true; })()`,
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

const PRESET_LABELS: Record<string, string[]> = {
  "poteto-mode": ["Poteto 模式", "Poteto mode"],
  standard: ["标准模式", "Standard mode"],
};

function selectPreset(session: BrowserSession, preset: string): void {
  const seat = session.eval<string>(
    `(() => {
      const button = [...document.querySelectorAll("button")].find((element) =>
        (element.className || "").toString().includes("seat") ||
        (element.getAttribute("aria-haspopup") === "menu" && !element.getAttribute("aria-label") && /模式|Mode/.test(element.innerText || ""))
      );
      if (!button) return "no-seat";
      button.click(); return "clicked";
    })()`,
  );
  if (seat === "no-seat") throw new InfraError("preset selector is unavailable");
  session.wait(900);
  const picked = session.eval<string>(
    `(() => {
      const labels = ${JSON.stringify(PRESET_LABELS[preset] ?? [preset])};
      const item = [...document.querySelectorAll("[role=menuitem]")].find((element) => labels.some((label) => (element.innerText || "").trim().startsWith(label)));
      if (!item) return "no-item";
      item.click(); return "selected";
    })()`,
  );
  if (picked !== "selected") throw new InfraError(`could not select preset ${preset}`);
  session.wait(900);
}

function materializeWorkspace(paths: WorkerPaths, scenario: BehaviorScenario): string {
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
    if (sessionMatchesPrompt(events, prompt, true)) return { id, file };
  }
  return null;
}

const DEFAULT_ANSWER_TEXT = "按你的最佳判断继续";

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
      if (selected.length === 0) {
        const custom = rule && rule.custom ? rule.custom : (!rule && optionButtons.length === 0 ? fallback : "");
        if (custom) {
          const input = card.querySelector("textarea, input:not([type=checkbox]):not([type=radio])");
          if (input) {
            const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, "value").set.call(input, custom);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            record(custom);
          }
        } else if (optionButtons.length > 0) {
          let target = null;
          if (rule && rule.selected && rule.selected.length) {
            target = optionButtons.find((b) => (b.getAttribute("aria-label") || b.innerText || "").includes(rule.selected[0]));
          }
          if (!target) target = optionButtons[0];
          record((target.getAttribute("aria-label") || target.innerText || "").trim());
          target.click();
        }
        return JSON.stringify(actions);
      }
      // Already answered: click the primary footer button (advance on non-last, submit on last).
      // Skip the pager arrows (aria nav.prev/nav.next with no text) and the skip button.
      const footer = card.querySelector("footer");
      const primary = footer
        ? [...footer.querySelectorAll("button")].find((b) => {
            const label = b.getAttribute("aria-label") || "";
            if (/上一题|下一题|prev|next/i.test(label) && !b.innerText.trim()) return false;
            if (/跳过|skip/i.test((b.innerText || "") + " " + label)) return false;
            return visible(b) && !b.disabled;
          })
        : null;
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
}

function attemptScenario(input: AttemptInput): {
  digest: SessionDigest;
  file: string;
  answers: SessionFacts["autoAnswers"];
} {
  const { paths, scenario, url, screenshotFile, expectedPreset } = input;
  const preset = expectedPreset;
  const session = createBrowserSession({
    session: `${paths.environmentId}-w${paths.index}`,
    browserDir: paths.browserDir,
  });
  const autoAnswers: Array<{ question: string; answer: string }> = [];
  try {
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
    session.wait(1000);
    session.screenshot(screenshotFile);
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

function blockedRecord(input: {
  scenarioId: string;
  phase: Phase;
  paths: WorkerPaths;
  configFile: string;
  recordFile: string;
  screenshotFile: string;
  reason: string;
}): RunRecord {
  const config = readPlaygroundConfig(input.configFile);
  const matrix = environmentMatrix(input.paths.environmentId);
  const capturedAt = new Date().toISOString();
  return {
    scenarioId: input.scenarioId,
    phase: input.phase,
    environment: createEnvironment({
      worker: input.paths.index,
      matrix,
      config,
      phase: input.phase,
      paths: input.paths,
    }),
    target: null,
    session: null,
    artifacts: { recordFile: input.recordFile, screenshotFile: input.screenshotFile, observed: [] },
    semanticReview: pendingSemanticReview(),
    mechanicalFailures: [],
    verdict: verdictFor({
      phase: input.phase,
      failures: [],
      semanticReview: pendingSemanticReview(),
      blockedReason: input.reason,
    }),
    capturedAt,
  };
}

async function main(): Promise<void> {
  const phase = argValue("--phase") as Phase | undefined;
  const scenarioId = argValue("--scenario");
  if ((phase !== "raw" && phase !== "adapted") || !scenarioId) {
    throw new Error(
      "usage: run-case.ts --worker N --scenario ID --phase raw|adapted [--environment base] [--config FILE]",
    );
  }
  const worker = Number(argValue("--worker") ?? "0");
  if (!Number.isInteger(worker) || worker < 0) throw new Error("--worker must be non-negative");
  const matrix = environmentMatrix(argValue("--environment"));
  const paths = workerPaths(worker, matrix.id, phase);
  const preparedPhase = existsSync(paths.phaseFile)
    ? readFileSync(paths.phaseFile, "utf8").trim()
    : "";
  if (preparedPhase !== phase)
    throw new Error(`worker is prepared for ${preparedPhase || "nothing"}, not ${phase}`);
  const scenario = loadScenario(scenarioId);
  const configFile = argValue("--config") ?? process.env.PLAYGROUND_CONFIG_FILE ?? CONFIG_FILE;
  const config = readPlaygroundConfig(configFile);
  const expectedTarget = readHomePlan(paths);
  const expectedPreset = phase === "raw" ? "standard" : "poteto-mode";
  const workspace = materializeWorkspace(paths, scenario);
  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replace(/[:.]/g, "-");
  mkdirSync(paths.evidenceDir, { recursive: true });
  const recordFile = join(paths.evidenceDir, recordFileName(scenarioId, phase, matrix.id, stamp));
  const screenshotFile = recordFile.replace(/\.json$/, ".png");
  let record: RunRecord;
  try {
    const outcome = attemptScenario({
      paths,
      scenario,
      url: readWebUrl(paths),
      expectedTarget,
      screenshotFile,
      expectedPreset,
    });
    const session = sessionFacts(outcome.digest, outcome.file, outcome.answers);
    const failures = mechanicalFailures({
      scenario,
      session,
      workspace,
      route: outcome.digest.route,
      expectedTarget,
      expectedPreset,
    });
    const semanticReview = pendingSemanticReview();
    record = {
      scenarioId,
      phase,
      environment: createEnvironment({ worker, matrix, config, phase, paths }),
      target: outcome.digest.route,
      session,
      artifacts: {
        recordFile,
        screenshotFile,
        observed: [
          `skillLoads=${session.skillLoads.join(",") || "none"}`,
          `toolCalls=${session.toolCalls.length}`,
        ],
      },
      semanticReview,
      mechanicalFailures: failures,
      verdict: verdictFor({ phase, failures, semanticReview }),
      capturedAt,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    record = blockedRecord({
      scenarioId,
      phase,
      paths,
      configFile,
      recordFile,
      screenshotFile,
      reason,
    });
    if (!(error instanceof InfraError)) {
      record.artifacts.observed.push("scenario execution did not complete");
    }
  }
  assertSafeRecord(
    record,
    Object.values(config.providers).map((provider) => provider.apiKey),
  );
  writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[run-case] ${scenarioId} ${phase} ${matrix.id} ${record.verdict.status}`);
  console.log(`[run-case] evidence=${recordFile}`);
  console.log(`[run-case] reports=${REPORT_DIRECTORY}`);
  process.exitCode =
    record.verdict.status === "verified"
      ? 0
      : record.verdict.status === "inconclusive" || record.verdict.status === "blocked"
        ? 2
        : 1;
}

main().catch((error: unknown) => {
  console.error(`[run-case] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
