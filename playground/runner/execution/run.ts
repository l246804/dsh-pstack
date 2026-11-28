import { existsSync } from "node:fs";
import type { BehaviorScenario, BrowserConfig, SessionFacts } from "../types.ts";
import { createBrowserSession, type BrowserSession } from "../browser/session.ts";
import {
  openPage,
  startSession,
  waitForComposer,
  selectPreset,
  sendPrompt,
  answerPendingQuestions,
} from "../browser/page.ts";
import { captureFullPage, captureVerified } from "../browser/capture.ts";
import { digestSession, type SessionDigest } from "../evidence/session-facts.ts";
import { readSessionEvents, listSessionFiles, type SessionFile } from "../storage/sessions.ts";
import { stopRequestFile, type WorkerPaths } from "../worker/worker.ts";
import {
  findMatchingSession,
  waitForSettledSession,
  waitForSubagentsSettled,
  sleep,
  POLL_INTERVAL_MS,
} from "./session.ts";
interface AttemptInput {
  paths: WorkerPaths;
  scenario: BehaviorScenario;
  url: string;
  screenshotFile: string;
  expectedPreset: string;
  browser?: BrowserConfig;
  scenarioTimeoutMs: number;
}

function throwIfStopped(paths: WorkerPaths, session: BrowserSession, screenshotFile: string): void {
  if (!existsSync(stopRequestFile(paths))) return;
  try {
    captureFullPage(session, screenshotFile);
  } catch {
    // The stop happened before the page could be captured; the blocked record still remains.
  }
  throw new Error("external stop requested");
}

export function attemptScenario(input: AttemptInput): {
  digest: SessionDigest;
  file: string;
  answers: SessionFacts["autoAnswers"];
} {
  const {
    paths,
    scenario,
    url,
    screenshotFile,
    expectedPreset,
    browser,
    scenarioTimeoutMs: timeoutOverride,
  } = input;
  const preset = expectedPreset;
  const session = createBrowserSession({
    session: `${paths.environmentId}-w${paths.index}`,
    browserDir: paths.browserDir,
    ...(browser === undefined ? {} : { browser }),
  });
  const autoAnswers: Array<{ question: string; answer: string }> = [];
  const scenarioTimeout = timeoutOverride;
  const scenarioDeadline = Date.now() + scenarioTimeout;
  try {
    try {
      session.raw(["close", "--all"]);
    } catch {
      // No prior daemon is fine; the open below starts a clean browser either way.
    }
    openPage(session, url);
    startSession(session, scenario.id);
    waitForComposer(session);
    selectPreset(session, preset);
    const prompt = scenario.turns[0]?.prompt;
    if (!prompt) throw new Error("scenario has no turn");
    const before = new Set(listSessionFiles(paths).map((entry) => entry.id));
    let match: SessionFile | null = null;
    let seenTurnEnds = 0;
    for (const [turnIndex, turn] of scenario.turns.entries()) {
      const turnStartedAt = Date.now();
      throwIfStopped(paths, session, screenshotFile);
      sendPrompt(session, turn.prompt);
      for (;;) {
        if (Date.now() > scenarioDeadline) {
          throw new Error(`scenario exceeded ${scenarioTimeout} ms without completing`);
        }
        throwIfStopped(paths, session, screenshotFile);
        answerPendingQuestions(session, scenario, autoAnswers);
        // Only the first turn discovers a fresh session from its opening prompt. Every
        // later turn runs in that same session, whose first user message never changes,
        // so reuse the match and wait for one more turn/end instead of re-matching on a
        // prompt that can never be the first message again.
        if (turnIndex === 0) {
          match = findMatchingSession(paths, before, turnStartedAt, turn.prompt);
        } else if (!match) {
          throw new Error("no session matched the scenario");
        } else if (!existsSync(match.file)) {
          throw new Error("matched session log vanished");
        }
        if (match) {
          const ends = readSessionEvents(match.file).filter(
            (event) => event.type === "turn/end",
          ).length;
          if (ends > seenTurnEnds) {
            seenTurnEnds = ends;
            waitForSettledSession(match.file, scenarioDeadline, () =>
              throwIfStopped(paths, session, screenshotFile),
            );
            break;
          }
        }
        sleep(POLL_INTERVAL_MS);
      }
    }
    if (!match) throw new Error("no session matched the scenario");
    const matched = match;
    waitForSubagentsSettled(matched.file, scenarioDeadline, () =>
      throwIfStopped(paths, session, screenshotFile),
    );
    session.wait(1000);
    const lastPrompt = scenario.turns.at(-1)?.prompt ?? "";
    captureVerified(session, screenshotFile, lastPrompt);
    if (!existsSync(matched.file)) throw new Error("session log vanished before reading");
    return {
      digest: digestSession(matched.file, matched.id, paths.index),
      file: matched.file,
      answers: autoAnswers,
    };
  } finally {
    session.close();
  }
}
