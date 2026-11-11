// Thin wrapper over the agent-browser CLI. Every call in one script must run in the
// same Node process: the CLI's daemon is a child of the process that first launches
// it, so it dies when that process exits and the next script cannot reach it.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { REPOSITORY_ROOT } from "./run-metadata.ts";

const BIN = join(
  REPOSITORY_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "agent-browser.cmd" : "agent-browser",
);

export function agentBrowserBin(): string {
  return BIN;
}

/** Highest-versioned Chrome the agent-browser installer dropped under ~/.agent-browser/browsers. */
export function chromeExecutable(): string {
  if (process.env.AGENT_BROWSER_CHROME_PATH) return process.env.AGENT_BROWSER_CHROME_PATH;
  const root = join(homedir(), ".agent-browser", "browsers");
  const candidates: string[] = [];
  if (existsSync(root)) {
    for (const name of readdirSync(root)) {
      const binary = join(root, name, process.platform === "win32" ? "chrome.exe" : "chrome");
      if (existsSync(binary)) candidates.push(binary);
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
  screenshot(path: string): string;
  close(): void;
}

export interface BrowserOptions {
  session?: string;
  /** This worker's browser profile dir; each worker keeps its own HOME so sessions never collide. */
  browserDir: string;
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

export function createBrowserSession(options: BrowserOptions): BrowserSession {
  if (!existsSync(BIN))
    throw new Error(`agent-browser binary not found at ${BIN}; run \`vp install\``);
  const env = browserEnv(options.browserDir);
  const session = options.session ?? "w0";
  const base = [
    "--session",
    session,
    "--executable-path",
    chromeExecutable(),
    "--args",
    // --no-sandbox for the container; --disable-dev-shm-usage because several Chrome
    // instances share /dev/shm; the crash flags keep Chrome from writing Crashpad
    // state, which failed intermittently across parallel workers.
    "--no-sandbox,--disable-dev-shm-usage,--disable-crash-reporter,--disable-breakpad,--no-first-run",
  ];

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

  const screenshot = (path: string): string => {
    mkdirSync(dirname(path), { recursive: true });
    return raw(["screenshot", path]);
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
