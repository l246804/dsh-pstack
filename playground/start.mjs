#!/usr/bin/env node
// Start the playground DSH web instance on a fixed, uncommon port.
//
// On every launch it refreshes the playground home from this repo and the host
// DSH home, so a host model/provider change never leaves the playground booting
// with a stale, unsupported model:
//   - copy playground/profile/ into $DSH_HOME/profiles/pstack-playground
//   - inject the dsh-pstack link dependency (absolute path, computed here)
//   - copy ~/.dsh/.credentials.yaml
//   - regenerate $DSH_HOME/cordis.patch.yml from the host web profile's
//     agent-default-model / llm-pi-ai entries
// Dependencies are installed only when node_modules/dsh-pstack is missing.
// The port is fixed at 17353 (uncommon, outside the Linux ephemeral range) and
// never falls back to --port 0, so a conflict fails loudly.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);
const DSH_HOME = join(HERE, ".dsh");
const PROFILE_NAME = "pstack-playground";
const PROFILE_SRC = join(HERE, "profile");
const PROFILE_DEST = join(DSH_HOME, "profiles", PROFILE_NAME);
const HOME_PATCH_IDS = ["agent-default-model", "llm-pi-ai"];
const PORT = Number(process.env.PLAYGROUND_PORT ?? 17353);
const HOST = "127.0.0.1";

const flags = new Set(process.argv.slice(2));
const reset = flags.has("--reset");
const reinstall = flags.has("--reinstall");
const bin = process.platform === "win32" ? "dsh.cmd" : "dsh";
const log = (message) => console.log(`[start] ${message}`);

function portState() {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error) =>
      resolve(error.code === "EADDRINUSE" ? "busy" : `error:${error.code}`),
    );
    server.once("listening", () => server.close(() => resolve("free")));
    server.listen(PORT, HOST);
  });
}

function extractPatchEntries(text, ids) {
  const wanted = new Set(ids);
  const blocks = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("- ")) {
      if (current) blocks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks
    .filter((block) => {
      const match = block[0].match(/^- id:\s*["']?([A-Za-z0-9._-]+)["']?\s*$/);
      return match && wanted.has(match[1]);
    })
    .map((block) => block.join("\n").replace(/\s+$/, ""));
}

function syncProfile() {
  if (reset && existsSync(PROFILE_DEST)) {
    rmSync(PROFILE_DEST, { recursive: true, force: true });
    log("removed existing profile (--reset)");
  }
  mkdirSync(join(DSH_HOME, "profiles"), { recursive: true });
  cpSync(PROFILE_SRC, PROFILE_DEST, { recursive: true, force: true });
  const manifestPath = join(PROFILE_DEST, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.dependencies = { ...manifest.dependencies, "dsh-pstack": `link:${REPO_ROOT}` };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`synced profile -> ${PROFILE_DEST}`);
}

function syncCredentials() {
  const source = join(homedir(), ".dsh", ".credentials.yaml");
  const dest = join(DSH_HOME, ".credentials.yaml");
  if (existsSync(source)) {
    cpSync(source, dest);
    log("synced credentials from ~/.dsh/.credentials.yaml");
  } else if (!existsSync(dest)) {
    log("no ~/.dsh/.credentials.yaml to copy (fine if no model login is needed)");
  }
}

function syncHomePatch() {
  const source = join(homedir(), ".dsh", "profiles", "web", "cordis.patch.yml");
  const dest = join(DSH_HOME, "cordis.patch.yml");
  const header =
    "# Machine-local patch layer for the playground DSH home (regenerated on every start).\n" +
    "# `start.mjs` copies agent-default-model / llm-pi-ai from the host web profile.\n" +
    "# Do not commit; edit the host web profile to change model routes.\n";
  let body = "";
  if (existsSync(source)) {
    body = extractPatchEntries(readFileSync(source, "utf8"), HOME_PATCH_IDS).join("\n");
  }
  if (body) {
    writeFileSync(dest, `${header}${body}\n`);
    log("synced home patch from host web profile (agent-default-model, llm-pi-ai)");
  } else {
    if (!existsSync(dest)) {
      writeFileSync(
        dest,
        `${header}# No agent-default-model / llm-pi-ai found in the host web profile.\n# Add provider/model config here so real-session tests can call a model.\n[]\n`,
      );
    }
    log(
      "WARNING: no model config found in the host web profile; kept existing playground home patch",
    );
  }
}

function ensureInstall() {
  const installed = existsSync(join(PROFILE_DEST, "node_modules", "dsh-pstack"));
  if (installed && !reinstall && !reset) {
    log("dsh-pstack already installed, skipped (use --reinstall to force)");
    return;
  }
  log("installing dsh-pstack into the playground profile (pnpm store write access required)…");
  const result = spawnSync(bin, ["plugin", "--profile", PROFILE_NAME, "install"], {
    cwd: REPO_ROOT,
    env: { ...process.env, DSH_HOME },
    stdio: "inherit",
  });
  if (result.error) throw new Error(`failed to run dsh: ${result.error.message}; is dsh on PATH?`);
  if (result.status !== 0) {
    throw new Error(
      `dsh plugin install failed with exit ${result.status}; if this is a pnpm store permission error (default store outside the workspace), run with broader permission`,
    );
  }
}

const state = await portState();
if (state === "busy") {
  console.error(
    `[start] port ${HOST}:${PORT} is already in use; stop the other instance — refusing to fall back to another port.`,
  );
  process.exit(1);
}
if (state !== "free") {
  console.error(`[start] cannot bind ${HOST}:${PORT} (${state}).`);
  process.exit(1);
}

try {
  syncProfile();
  syncCredentials();
  syncHomePatch();
  ensureInstall();
} catch (error) {
  console.error(`[start] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

log(`launching dsh web on http://${HOST}:${PORT} (DSH_HOME=${DSH_HOME})`);
const child = spawn(
  bin,
  ["--profile", PROFILE_NAME, "--port", String(PORT), "--host", HOST, "--no-open"],
  { cwd: process.cwd(), env: { ...process.env, DSH_HOME }, stdio: "inherit" },
);

child.on("error", (error) => {
  console.error(`[start] failed to launch dsh: ${error.message}; is dsh on PATH?`);
  process.exit(1);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
