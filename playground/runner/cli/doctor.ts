import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { agentBrowserBin, chromeExecutable } from "../lib/browser.ts";
import { CONFIG_FILE, DEFAULT_CREDENTIALS_FILE } from "../lib/env.ts";

const failures: string[] = [];

function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "OK" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

function versionOf(binary: string): string | null {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 15_000 });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n")[0] ?? null;
}

if (process.platform !== "linux") {
  check("platform", false, `${process.platform} is not supported; playground runs on Linux only`);
} else {
  check("platform", true, "linux");
}

const requiredNode = (
  JSON.parse(readFileSync("package.json", "utf8")) as {
    devEngines?: { runtime?: { version?: string } };
  }
).devEngines?.runtime?.version;
check(
  "node",
  process.versions.node === requiredNode ||
    process.versions.node.startsWith(`${requiredNode ?? ""}.`),
  `${process.version} (expected ${requiredNode ?? "unknown"})`,
);

const vp = versionOf("vp");
check("vp", vp !== null, vp ?? "not found on PATH");

const dsh = versionOf(process.env.DSH_BIN ?? "dsh");
check("dsh", dsh !== null, dsh ?? "not found on PATH");

const browser = agentBrowserBin();
check("agent-browser", existsSync(browser), browser);

try {
  const chrome = chromeExecutable();
  check("chrome", existsSync(chrome), chrome);
} catch (error) {
  check("chrome", false, error instanceof Error ? error.message : String(error));
}

check("config", existsSync(CONFIG_FILE), CONFIG_FILE);
check("credentials", existsSync(DEFAULT_CREDENTIALS_FILE), DEFAULT_CREDENTIALS_FILE);

if (failures.length > 0) {
  console.error(`[doctor] ${failures.length} prerequisite(s) missing`);
  process.exitCode = 1;
} else {
  console.log("[doctor] ready");
}
