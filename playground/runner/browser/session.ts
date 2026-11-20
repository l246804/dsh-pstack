// Thin wrapper over the agent-browser CLI. Every call in one script must run in the
// same Node process: the CLI's daemon is a child of the process that first launches
// it, so it dies when that process exits and the next script cannot reach it.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { BrowserConfig } from "../types.ts";
import { runtimeSettings } from "../config/runtime.ts";
import { REPOSITORY_ROOT } from "../worker/run-metadata.ts";
import { chromeCandidates } from "../worker/platform.ts";

const BIN = join(REPOSITORY_ROOT, "node_modules", ".bin", "agent-browser");

export function agentBrowserBin(): string {
  return BIN;
}

/** Highest-versioned Chrome the agent-browser installer dropped under ~/.agent-browser/browsers. */
export function chromeExecutable(): string {
  const configured = runtimeSettings().chromePath;
  if (configured) return configured;
  const root = join(homedir(), ".agent-browser", "browsers");
  const candidates: string[] = [];
  if (existsSync(root)) {
    for (const name of readdirSync(root)) {
      candidates.push(...chromeCandidates(root, [name]).filter((path) => existsSync(path)));
    }
  }
  candidates.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const chosen = candidates.at(-1);
  if (!chosen) {
    throw new Error(
      "no Chrome found under ~/.agent-browser/browsers; run `node_modules/.bin/agent-browser install`",
    );
  }
  return chosen;
}

export interface BrowserSession {
  /** Run one agent-browser subcommand, returning trimmed stdout. Throws on non-zero exit. */
  raw(args: string[]): string;
  open(url: string): string;
  wait(selectorOrMs: string | number): string;
  /** Eval a JS expression and JSON.parse the serialized result (agent-browser prints JSON). */
  eval<T = unknown>(expression: string): T;
  click(selector: string): string;
  keyboardType(text: string): string;
  press(key: string): string;
  setViewport(width: number, height: number): string;
  screenshot(path: string, options?: { full?: boolean }): string;
  close(): void;
}

export interface BrowserOptions {
  session?: string;
  /** This worker's browser profile dir; each worker keeps its own HOME so sessions never collide. */
  browserDir: string;
  /** Host browser mode; omitted means managed headless Chrome. */
  browser?: BrowserConfig;
}

export function browserEnv(browserDir: string): NodeJS.ProcessEnv {
  const home = join(browserDir, "home");
  const config = join(home, ".config");
  // agent-browser's daemon socket has a 103-byte path budget; the worker home sits deep
  // in the repo checkout, so both the runtime dir and the socket dir go to a short tmp
  // path. A short hash of the absolute browser dir keeps separate repo checkouts from
  // sharing a socket dir, while HOME (the Chrome profile) stays under the worker.
  const socketTag = createHash("sha1").update(browserDir).digest("hex").slice(0, 8);
  const socketDir = join(tmpdir(), `pgw-${socketTag}`);
  for (const dir of [home, config, socketDir]) mkdirSync(dir, { recursive: true });
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_RUNTIME_DIR: socketDir,
    AGENT_BROWSER_SOCKET_DIR: socketDir,
  };
}

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

export function createBrowserSession(options: BrowserOptions): BrowserSession {
  if (!existsSync(BIN))
    throw new Error(`agent-browser binary not found at ${BIN}; run \`vp install\``);
  const env = browserEnv(options.browserDir);
  const session = options.session ?? "w0";
  const browser = options.browser?.mode === "cdp" ? options.browser : undefined;
  const base = ["--session", session];
  if (browser !== undefined) {
    if (!browser.cdpUrl) throw new Error("browser.cdpUrl is required in cdp mode");
    base.push("--cdp", browser.cdpUrl, "--pin-tab");
  } else {
    base.push(
      "--executable-path",
      chromeExecutable(),
      "--args",
      // --no-sandbox for the container; --disable-dev-shm-usage because several Chrome
      // instances share /dev/shm; the crash flags keep Chrome from writing Crashpad
      // state, which failed intermittently across parallel workers.
      "--no-sandbox,--disable-dev-shm-usage,--disable-crash-reporter,--disable-breakpad,--no-first-run",
    );
    if (options.browser?.headed) base.push("--headed");
  }

  const raw = (args: string[]): string => {
    const result = spawnSync(BIN, [...base, ...args], {
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error)
      throw new Error(`failed to run agent-browser ${args[0]}: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error(
        `agent-browser ${args.join(" ")} exited ${result.status}: ${(result.stderr || result.stdout).trim().slice(0, 600)}`,
      );
    }
    return (result.stdout ?? "").trim();
  };

  const screenshot = (path: string, options?: { full?: boolean }): string => {
    mkdirSync(dirname(path), { recursive: true });
    return raw(options?.full ? ["screenshot", "--full", path] : ["screenshot", path]);
  };

  return {
    raw,
    open: (url) => raw(["open", url]),
    wait: (selectorOrMs) => raw(["wait", String(selectorOrMs)]),
    eval: <T = unknown>(expression: string): T => {
      const output = raw(["eval", expression]);
      try {
        return JSON.parse(output) as T;
      } catch {
        throw new Error(`agent-browser eval did not return JSON: ${output.slice(0, 400)}`);
      }
    },
    click: (selector) => raw(["click", selector]),
    keyboardType: (text) => raw(["keyboard", "type", text]),
    press: (key) => raw(["press", key]),
    setViewport: (width, height) => raw(["set", "viewport", String(width), String(height)]),
    screenshot,
    close: () => {
      try {
        raw(["close"]);
      } catch {
        // closing an already-dead session is not an error worth surfacing
      }
    },
  };
}
