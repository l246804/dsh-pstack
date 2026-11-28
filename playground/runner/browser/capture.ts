import { rmSync } from "node:fs";
import { isBlankImage } from "../evidence/png.ts";
import type { BrowserSession } from "./session.ts";
import { collapseSidebar } from "./page.ts";
/**
 * Capture the whole conversation, not just the viewport. DSH uses an inner scroll
 * container, so Playwright's `--full` only sees the page viewport. Grow the
 * viewport to the main conversation scroll area, never the workspace sidebar,
 * capture the full page, then restore the original viewport.
 */
export function captureFullPage(session: BrowserSession, path: string): void {
  const metrics = session.eval<{ width: number; height: number; scrollHeight: number }>(
    `(() => {
      const scrollable = (element) => {
        const style = getComputedStyle(element);
        return (style.overflowY === "auto" || style.overflowY === "scroll") &&
          element.clientHeight > 100 &&
          element.scrollHeight > element.clientHeight + 4;
      };
      const main = document.querySelector("main, [role='main'], [data-slot='main'], [class*='mainPanel']");
      const mainCandidates = main
        ? [main, ...main.querySelectorAll("*")].filter(scrollable)
        : [];
      const pageCandidates = [...document.querySelectorAll("*")].filter((element) => {
        if (!scrollable(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.left >= window.innerWidth * 0.2 && rect.width >= window.innerWidth * 0.4;
      });
      const candidates = (mainCandidates.length > 0 ? mainCandidates : pageCandidates).sort(
        (left, right) =>
          right.scrollHeight - right.clientHeight - (left.scrollHeight - left.clientHeight),
      );
      const target = candidates[0];
      return {
        width: Math.max(window.innerWidth, document.documentElement.scrollWidth || 0),
        height: window.innerHeight,
        scrollHeight: Math.max(
          target?.scrollHeight ?? 0,
          document.documentElement.scrollHeight || 0,
          window.innerHeight,
        ),
      };
    })()`,
  );
  const width = Math.max(metrics.width, 1024);
  const height = Math.min(Math.max(metrics.height, metrics.scrollHeight + 200), 16_000);
  try {
    session.setViewport(width, height);
    session.wait(300);
    session.screenshot(path);
  } finally {
    session.setViewport(metrics.width, metrics.height);
  }
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
    captureFullPage(session, screenshotFile);
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
  throw new Error(
    "screenshot capture failed, was blank, or the page lost the conversation; refusing to record an invalid screenshot",
  );
}
