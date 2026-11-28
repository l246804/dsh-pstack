import type { BehaviorScenario } from "../types.ts";
import type { BrowserSession } from "./session.ts";
export const DEFAULT_ANSWER_TEXT = "按你的最佳判断继续";

export const UI_LABELS = {
  composerSelector: '[data-composer-input="true"]',
  newSession: "新会话",
  previewNotice: "预览版说明",
  continue: "继续",
} as const;

export const PRESET_LABELS: Record<string, string[]> = {
  "poteto-mode": ["Poteto 模式", "Poteto mode"],
  standard: ["标准模式", "Standard mode"],
};

const {
  composerSelector: COMPOSER_SELECTOR,
  newSession: NEW_SESSION_LABEL,
  previewNotice: PREVIEW_NOTICE,
  continue: CONTINUE_LABEL,
} = UI_LABELS;
/**
 * Collapse the left sidebar before taking screenshots. It hides the session list
 * and account name and widens the conversation area; an already collapsed sidebar
 * is left alone.
 */
export function collapseSidebar(session: BrowserSession): void {
  const collapsed = session.eval<boolean>(
    `document.querySelector("[data-sidebar-collapsed]") !== null`,
  );
  if (collapsed) return;
  const clicked = session.eval<boolean>(
    `(() => {
      const button = document.querySelector("[data-sidebar-toggle]");
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (clicked) session.wait(500);
}

export function dismissPreview(session: BrowserSession): void {
  if (!session.eval<string>("document.body.innerText").includes(PREVIEW_NOTICE)) return;
  session.eval<boolean>(
    `(() => { const button = [...document.querySelectorAll("button")].find((element) => element.innerText.trim() === ${JSON.stringify(CONTINUE_LABEL)}); if (!button) return false; button.click(); return true; })()`,
  );
  waitForPageState(
    session,
    `!document.body.innerText.includes(${JSON.stringify(PREVIEW_NOTICE)})`,
    "preview notice did not close",
  );
}

export function startSession(session: BrowserSession, scenarioId: string): void {
  // A collapsed sidebar unmounts the workspace rows, so expand it before looking for
  // the scenario workspace. Without this, the new-session fallback runs in whichever
  // workspace DSH opened by default.
  if (session.eval<boolean>(`document.querySelector("[data-sidebar-collapsed]") !== null`)) {
    session.eval<boolean>(
      `(() => { const button = document.querySelector("[data-sidebar-toggle]"); if (!button) return false; button.click(); return true; })()`,
    );
    session.wait(500);
  }
  const started = session.eval<string>(
    `(() => {
      const title = ${JSON.stringify(scenarioId)};
      // Find the workspace row structurally: data-row-key starts with "workspace:".
      // The row's last action is "new session in this workspace"; the first button is
      // the workspace actions menu. Matching any aria-label that contains the title
      // would hit the actions button first and leave the default workspace active.
      const row = [...document.querySelectorAll('[data-row-key^="workspace:"]')].find(
        (element) => (element.innerText || "").includes(title),
      );
      const button = row
        ? [...row.querySelectorAll("button")].find((element) => element.hasAttribute("aria-keyshortcuts"))
          ?? [...row.querySelectorAll("button")].at(-1)
        : undefined;
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
export function selectPreset(session: BrowserSession, preset: string): void {
  const labels = PRESET_LABELS[preset] ?? [preset];
  const current = session.eval<string>(
    `(() => {
      const stable = document.querySelector('[data-composer-card] button[aria-haspopup="menu"]:not([aria-label])');
      const fallback = [...document.querySelectorAll("button")].find((element) =>
        (element.className || "").toString().includes("seat") ||
        (element.getAttribute("aria-haspopup") === "menu" && !element.getAttribute("aria-label") && /模式|Mode/.test(element.innerText || ""))
      );
      const button = stable || fallback;
      if (!button) return "no-seat";
      button.setAttribute("data-playground-preset-seat", "1");
      return (button.innerText || "").trim();
    })()`,
  );
  if (current === "no-seat") throw new Error("preset selector is unavailable");
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
  if (picked !== "selected") throw new Error(`could not select preset ${preset}`);
  session.wait(900);
}

/**
 * Answer the open ask_user_question card as the absent user would. The card is a
 * one-question-per-page wizard: choosing an option on a non-last question advances on its
 * own, and the last question needs the primary submit button in the footer. So we act one
 * step per poll (select, or submit) and let React re-render before the next poll. A scenario's
 * `answers` rules win; otherwise take the first option, or type the default text when the
 * question offers no options. Every distinct answer is recorded once for the evidence.
 */
export function answerPendingQuestions(
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
    // preset switch or navigation reloads the app) must not abort the scenario; retry next poll.
    return;
  }
  try {
    const parsed = JSON.parse(raw) as Array<{ question: string; answer: string }>;
    for (const entry of parsed) {
      if (log.some((item) => item.question === entry.question && item.answer === entry.answer))
        continue;
      log.push(entry);
    }
  } catch {
    // The browser returned no complete question card.
  }
}

function waitForPageState(
  session: BrowserSession,
  expression: string,
  message: string,
  timeoutMs = 15_000,
): void {
  const deadline = Date.now() + timeoutMs;
  do {
    if (session.eval<boolean>(expression)) return;
    session.wait(200);
  } while (Date.now() < deadline);
  throw new Error(message);
}

export function waitForComposer(session: BrowserSession): void {
  waitForPageState(
    session,
    `document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)}) !== null`,
    "composer did not appear",
  );
}

export function openPage(session: BrowserSession, url: string): void {
  session.open(url);
  waitForPageState(
    session,
    `!!document.body && (document.body.innerText.includes(${JSON.stringify(PREVIEW_NOTICE)}) || document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)}) !== null)`,
    "DSH page did not become ready",
  );
  dismissPreview(session);
  waitForComposer(session);
}

export function sendPrompt(session: BrowserSession, prompt: string): void {
  session.click(COMPOSER_SELECTOR);
  session.keyboardType(prompt);
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
}
