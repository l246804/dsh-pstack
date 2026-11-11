import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";

import type { AllowedRoute, Phase, PlaygroundConfig, TestTarget } from "../../types.ts";
import { readConfig } from "./config.ts";
import { RAW_ROOT, RAW_SKILLS, REPOSITORY_ROOT } from "./run-metadata.ts";
import type { WorkerPaths } from "./worker.ts";

export const PROFILE_NAME = "playground";
export const PROFILE_TEMPLATE_DIR = join(REPOSITORY_ROOT, "playground/profile");
export const DEFAULT_HOST_PATCH_FILE = join(homedir(), ".dsh/profiles/web/cordis.patch.yml");
export const DEFAULT_CREDENTIALS_FILE = join(homedir(), ".dsh/.credentials.yaml");
export const HOST = "127.0.0.1";
const DSH_BIN = process.env.DSH_BIN ?? (process.platform === "win32" ? "dsh.cmd" : "dsh");

export { DEFAULT_CONFIG_FILE as CONFIG_FILE, RAW_ROOT, RAW_SKILLS } from "./run-metadata.ts";

function runtimeEnv(paths: WorkerPaths): Record<string, string> {
  const runtime = join(paths.root, "xdg-runtime");
  const tmp = join(paths.root, "tmp");
  mkdirSync(runtime, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  try {
    chmodSync(runtime, 0o700);
  } catch {
    // Filesystems without POSIX modes can still use the isolated runtime.
  }
  return { XDG_RUNTIME_DIR: runtime, TMPDIR: tmp };
}

interface HostModel {
  id: string;
  name?: string;
  reasoningEfforts?: Record<string, string | null>;
}

interface HostProvider {
  apiKeyEnv?: string;
  models?: HostModel[];
  [key: string]: unknown;
}

export interface ProviderPlan {
  routes: AllowedRoute[];
  providers: Record<string, HostProvider>;
  apiKeyEnv: string;
  apiKey: string;
  main: TestTarget & { name: string };
}

function readHostProviders(file: string): Record<string, HostProvider> {
  if (!existsSync(file)) {
    throw new Error(
      `host provider patch not found at ${file}; set hostPatchFile in playground/config.json`,
    );
  }
  const entries = yamlLoad(readFileSync(file, "utf8")) as Array<{
    id?: string;
    config?: { providers?: Record<string, HostProvider> };
  }>;
  const providers = entries.find((entry) => entry.id === "llm-pi-ai")?.config?.providers;
  if (!providers || Object.keys(providers).length === 0) {
    throw new Error(`no llm-pi-ai providers in ${file}`);
  }
  return providers;
}

export function loadProviderPlan(
  config: PlaygroundConfig,
  hostFile = config.hostPatchFile ??
    process.env.PLAYGROUND_HOST_PATCH_FILE ??
    DEFAULT_HOST_PATCH_FILE,
): ProviderPlan {
  const hostProviders = readHostProviders(hostFile);
  const routes: AllowedRoute[] = [];
  const providers: Record<string, HostProvider> = {};
  for (const [provider, entry] of Object.entries(config.providers)) {
    const host = hostProviders[provider];
    if (!host?.apiKeyEnv) throw new Error(`host provider "${provider}" has no apiKeyEnv`);
    const hostById = new Map((host.models ?? []).map((model) => [model.id, model]));
    const filteredModels: HostModel[] = [];
    for (const [model, allowedEfforts] of Object.entries(entry.models)) {
      const hostModel = hostById.get(model);
      if (!hostModel) throw new Error(`host does not deploy ${provider}/${model}`);
      const efforts = allowedEfforts.filter(
        (effort) => effort in (hostModel.reasoningEfforts ?? {}),
      );
      if (efforts.length === 0)
        throw new Error(`host deploys no allowed effort for ${provider}/${model}`);
      routes.push({ provider, model, effort: "", efforts, apiKey: entry.apiKey });
      filteredModels.push(hostModel);
    }
    providers[provider] = { ...host, models: filteredModels };
  }
  const route = routes.find(
    (entry) =>
      entry.provider === config.testModel.provider &&
      entry.model === config.testModel.model &&
      entry.efforts.includes(config.testModel.effort),
  );
  if (!route) throw new Error("the host cannot serve testModel");
  const model = providers[route.provider]?.models?.find((entry) => entry.id === route.model);
  return {
    routes,
    providers,
    apiKeyEnv: hostProviders[route.provider]?.apiKeyEnv as string,
    apiKey: route.apiKey,
    main: { ...config.testModel, name: model?.name ?? route.model },
  };
}

function homePatchFile(paths: WorkerPaths): string {
  return join(paths.home, "cordis.patch.yml");
}

function profileDirectory(paths: WorkerPaths): string {
  return join(paths.home, "profiles", PROFILE_NAME);
}

function persistentInstructions(): string {
  const skill = join(RAW_SKILLS, "poteto-mode/SKILL.md");
  if (!existsSync(skill)) throw new Error("raw tree is missing; run playground:raw-generate first");
  const body = readFileSync(skill, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  return [
    "You are running the raw baseline under the standard agent preset.",
    `Read ${join(RAW_ROOT, "dsh.md")} once before following the skill below.`,
    `Skill file: ${skill}`,
    body,
  ].join("\n\n");
}

export function writeHomePatch(paths: WorkerPaths, plan: ProviderPlan, phase: Phase): void {
  mkdirSync(paths.home, { recursive: true });
  const patch = [
    {
      id: "agent-default-model",
      name: "@deepseek-ai/dsh-agent-default-model",
      config: {
        provider: plan.main.provider,
        model: plan.main.model,
        reasoningEffort: plan.main.effort,
      },
    },
    { id: "llm-pi-ai", name: "@deepseek-ai/dsh-llm-pi-ai", config: { providers: plan.providers } },
    {
      id: "approval",
      name: "@deepseek-ai/dsh-user-approval",
      config: { policy: "never" },
    },
    ...(phase === "raw"
      ? [
          {
            id: "system-prompt",
            name: "@deepseek-ai/dsh-system-prompt",
            config: { personaSuffix: persistentInstructions() },
          },
        ]
      : []),
    {
      id: "permission",
      name: "@deepseek-ai/dsh-permission-presets",
      config: {
        presets: { unattended: { sandbox: "workspace-write", approval: "never" } },
        defaultPreset: "unattended",
      },
    },
  ];
  writeFileSync(homePatchFile(paths), yamlDump(patch, { lineWidth: 120 }));
}

export interface HomePlan extends TestTarget {
  name: string;
}

export function readHomePlan(paths: WorkerPaths): HomePlan {
  const entries = yamlLoad(readFileSync(homePatchFile(paths), "utf8")) as Array<{
    id?: string;
    config?: Record<string, unknown>;
  }>;
  const config = entries.find((entry) => entry.id === "agent-default-model")?.config as
    | { provider?: string; model?: string; reasoningEffort?: string }
    | undefined;
  if (!config?.provider || !config.model || !config.reasoningEffort) {
    throw new Error("home patch has no complete testModel");
  }
  return {
    provider: config.provider,
    model: config.model,
    effort: config.reasoningEffort,
    name: config.model,
  };
}

export function copyCredentials(paths: WorkerPaths, file = DEFAULT_CREDENTIALS_FILE): void {
  mkdirSync(paths.home, { recursive: true });
  if (existsSync(file)) copyFileSync(file, join(paths.home, ".credentials.yaml"));
}

export function resetHome(paths: WorkerPaths): void {
  rmSync(paths.root, { recursive: true, force: true });
  mkdirSync(paths.home, { recursive: true });
}

export function profileManifest(
  phase: Phase,
  enabledPluginPackages: string[],
): Record<string, unknown> {
  if (phase === "raw" && enabledPluginPackages.includes("dsh-pstack")) {
    throw new Error("raw profile must not install dsh-pstack");
  }
  const dependencies = Object.fromEntries(
    enabledPluginPackages.map((name) => [
      name,
      name === "dsh-pstack" ? `link:${REPOSITORY_ROOT}` : "*",
    ]),
  );
  const bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", ...enabledPluginPackages];
  return {
    name: `dsh-playground-${phase}`,
    private: true,
    dependencies,
    dsh: { profile: { bundles } },
  };
}

export function rawProfileEntries(template: unknown[]): unknown[] {
  if (!existsSync(RAW_SKILLS))
    throw new Error("raw tree is missing; run playground:raw-generate first");
  return [
    ...template,
    {
      insert: [
        {
          id: "pstack-raw-skills",
          name: "@deepseek-ai/dsh-skill-filesystem",
          config: {
            providerName: "pstack-raw",
            includeDefaultRoots: false,
            watch: false,
            bundledSkillDir: RAW_SKILLS,
          },
        },
      ],
    },
  ];
}

export function buildProfile(
  paths: WorkerPaths,
  phase: Phase,
  enabledPluginPackages: string[] = phase === "adapted" ? ["dsh-pstack"] : [],
): void {
  const directory = profileDirectory(paths);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  copyFileSync(
    join(PROFILE_TEMPLATE_DIR, "pnpm-workspace.yaml"),
    join(directory, "pnpm-workspace.yaml"),
  );
  const entries =
    (yamlLoad(readFileSync(join(PROFILE_TEMPLATE_DIR, "cordis.patch.yml"), "utf8")) as unknown[]) ??
    [];
  const patch = phase === "raw" ? rawProfileEntries(entries) : entries;
  writeFileSync(join(directory, "cordis.patch.yml"), yamlDump(patch, { lineWidth: 120 }));
  const manifest = profileManifest(phase, enabledPluginPackages);
  if (phase === "adapted" && !enabledPluginPackages.includes("dsh-pstack")) {
    throw new Error("adapted profile must explicitly include dsh-pstack");
  }
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function profileDirFor(paths: WorkerPaths): string {
  return profileDirectory(paths);
}

export function installPlugins(paths: WorkerPaths): void {
  const result = spawnSync(DSH_BIN, ["plugin", "--profile", PROFILE_NAME, "install"], {
    cwd: REPOSITORY_ROOT,
    env: { ...process.env, ...runtimeEnv(paths), DSH_HOME: paths.home },
    stdio: "inherit",
  });
  if (result.error) throw new Error(`failed to run dsh plugin install: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`dsh plugin install exited ${result.status}`);
}

export interface WorkspaceRegistration {
  dirs: Record<string, string>;
  defaultId: string;
  defaultTitle: string;
}

export function registerWorkspaces(
  paths: WorkerPaths,
  scenarioIds: string[],
): WorkspaceRegistration {
  const ids = [...new Set(scenarioIds)].sort();
  if (ids.length === 0) ids.push("playground");
  mkdirSync(paths.workspaceRoot, { recursive: true });
  const storeFile = join(paths.home, "storages/workspace.json");
  mkdirSync(dirname(storeFile), { recursive: true });
  const now = new Date().toISOString();
  const dirs: Record<string, string> = {};
  const tables: Record<string, unknown> = {};
  const workspaceIds: string[] = [];
  for (const id of ids) {
    const workspaceId = crypto.randomUUID();
    const path = join(paths.workspaceRoot, id);
    mkdirSync(path, { recursive: true });
    dirs[id] = path;
    workspaceIds.push(workspaceId);
    tables[workspaceId] = { path, title: id, sessionIds: [], createdAt: now, updatedAt: now };
  }
  writeFileSync(
    storeFile,
    `${JSON.stringify(
      {
        unit: { name: "workspace", version: 2 },
        global: {
          initialized: true,
          workspaceIds,
          archivedSessionIds: [],
          pinnedSessionIds: [],
          defaultWorkspaceId: workspaceIds[0],
        },
        tables: { workspaces: tables },
      },
      null,
      2,
    )}\n`,
  );
  return { dirs, defaultId: workspaceIds[0] as string, defaultTitle: ids[0] as string };
}

export function readWorkspaceStore(paths: WorkerPaths): {
  defaultTitle: string;
  workspaces: Array<{ path: string; title: string }>;
} {
  const file = join(paths.home, "storages/workspace.json");
  const store = JSON.parse(readFileSync(file, "utf8")) as {
    global: { workspaceIds: string[]; defaultWorkspaceId: string };
    tables: { workspaces: Record<string, { path: string; title: string }> };
  };
  return {
    defaultTitle: store.tables.workspaces[store.global.defaultWorkspaceId]?.title ?? "",
    workspaces: store.global.workspaceIds.map((id) => store.tables.workspaces[id]).filter(Boolean),
  };
}

export interface StartedWeb {
  url: string;
  port: number;
}

export async function startWeb(paths: WorkerPaths, plan: ProviderPlan): Promise<StartedWeb> {
  if (process.platform !== "linux") {
    throw new Error(
      "the managed web lifecycle currently supports Linux only; run scenarios in a managed DSH process",
    );
  }
  mkdirSync(paths.home, { recursive: true });
  const logFd = openSync(paths.logFile, "w");
  const child = spawn(
    DSH_BIN,
    ["--profile", PROFILE_NAME, "--port", "0", "--host", HOST, "--no-open"],
    {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        ...runtimeEnv(paths),
        DSH_HOME: paths.home,
        [plan.apiKeyEnv]: plan.apiKey,
      },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  );
  closeSync(logFd);
  writeFileSync(paths.pidFile, `${child.pid ?? ""}\n`);
  child.unref();
  let exited: number | null = null;
  child.once("exit", (code) => {
    exited = code ?? -1;
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const found = readWebUrlFromLog(paths.logFile);
    if (found) {
      const port = Number(new URL(found).port);
      writeFileSync(paths.urlFile, `${found}\n`);
      return { url: found, port };
    }
    if (exited !== null) throw new Error(`web exited ${String(exited)}: ${logTail(paths.logFile)}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`web did not print a URL within 120s: ${logTail(paths.logFile)}`);
}

function readWebUrlFromLog(file: string): string | null {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").match(/^dsh web:\s*(http:\/\/\S+)$/m)?.[1] ?? null;
}

function logTail(file: string): string {
  return existsSync(file)
    ? readFileSync(file, "utf8").trim().split("\n").slice(-20).join("\n")
    : "(no log)";
}

export function readWebUrl(paths: WorkerPaths): string {
  return readFileSync(paths.urlFile, "utf8").trim();
}

function readWebPid(paths: WorkerPaths): number | null {
  if (!existsSync(paths.pidFile)) return null;
  const pid = Number(readFileSync(paths.pidFile, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isDshWeb(pid: number): boolean {
  if (!isAlive(pid)) return false;
  try {
    const command = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    return command.includes("dsh") && command.includes(PROFILE_NAME);
  } catch {
    return false;
  }
}

export function stopWeb(paths: WorkerPaths): { stopped: boolean; pid: number | null } {
  const pid = readWebPid(paths);
  const owned = pid !== null && isDshWeb(pid);
  if (pid !== null && owned) {
    signalGroup(pid, "SIGTERM");
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && isAlive(pid)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
    if (isAlive(pid)) signalGroup(pid, "SIGKILL");
  }
  rmSync(paths.pidFile, { force: true });
  rmSync(paths.urlFile, { force: true });
  return { stopped: owned, pid };
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The process exited between the liveness check and the signal.
    }
  }
}

export function readPlaygroundConfig(file: string): PlaygroundConfig {
  return readConfig(resolve(file));
}

export function cloneInstalledProfile(source: WorkerPaths, destination: WorkerPaths): void {
  cpSync(profileDirFor(source), profileDirFor(destination), { recursive: true, force: true });
}
