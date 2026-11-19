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

import type { AllowedRoute, PlaygroundConfig, TestTarget, Treatment } from "../types.ts";
import { readConfig } from "./config.ts";
import { NATIVE_ROOT, REPOSITORY_ROOT, dshVersion } from "./run-metadata.ts";
import type { WorkerPaths } from "./worker.ts";

export const PROFILE_NAME = "playground";
export const PROFILE_TEMPLATE_DIR = join(REPOSITORY_ROOT, "playground/profile");
export const DEFAULT_HOST_PATCH_FILE = join(homedir(), ".dsh/profiles/web/cordis.patch.yml");
export const DEFAULT_CREDENTIALS_FILE = join(homedir(), ".dsh/.credentials.yaml");
export const HOST = "127.0.0.1";
const DSH_BIN = process.env.DSH_BIN ?? "dsh";

export { DEFAULT_CONFIG_FILE as CONFIG_FILE, NATIVE_ROOT, NATIVE_SKILLS } from "./run-metadata.ts";

function runtimeEnv(paths: WorkerPaths): Record<string, string> {
  // Every tool child of the worker inherits these, so they must not point into the
  // repository tree or the tested session could derive the repo root from its own env.
  const runtime = join(paths.isolatedRoot, "xdg-runtime");
  const tmp = join(paths.isolatedRoot, "tmp");
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
      filteredModels.push({
        ...hostModel,
        reasoningEfforts: Object.fromEntries(
          efforts.map((effort) => [effort, hostModel.reasoningEfforts?.[effort] ?? null]),
        ),
      });
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

function anonymousProviders(providers: ProviderPlan["providers"]): ProviderPlan["providers"] {
  return Object.fromEntries(
    Object.entries(providers).map(([id, provider]) => [
      id,
      {
        ...provider,
        ...(provider.models === undefined
          ? {}
          : { models: provider.models.map((model) => ({ ...model, name: "匿名模型" })) }),
      },
    ]),
  );
}

interface WorkerInstructionSection {
  heading: string;
  rules: readonly string[];
}

const WORKER_INSTRUCTION_SECTIONS: readonly WorkerInstructionSection[] = [
  {
    heading: "Read boundary",
    rules: [
      "You may read files only inside the current workspace.",
      "Read-only runtime input explicitly mounted for this session is also allowed.",
      "The worker role file $DSH_HOME/pstack-models.json is allowed read-only runtime input.",
      "The installed dsh-pstack package tree is allowed read-only runtime input: read any file under its dist/pstack directory, including skills and docs.",
      "Never read, list, stat, search, or infer any other path, even when the user supplies an absolute path.",
    ],
  },
  {
    heading: "External path requests",
    rules: [
      "Refuse briefly when a request targets a path outside the allowed roots.",
      "State that the path is outside the workspace.",
      "Do not call read, grep, glob, bash, cat, find, ls, or any other tool against it.",
    ],
  },
  {
    heading: "External side effects",
    rules: [
      "Treat git as local-only. Never add an origin or remote to a repository.",
      "Never create, modify, delete, push, tag, or otherwise change a remote repository or external service.",
      "Do not use gh or another forge CLI, and do not read or use credentials or tokens.",
      "If a task requires remote work, state that it is unavailable and produce a local plan instead.",
    ],
  },
  {
    heading: "Reporting",
    rules: [
      "Never paste or summarize content from a path outside the allowed roots.",
      "Continue with work that stays inside the workspace.",
    ],
  },
];

function renderWorkerInstructions(): string {
  return [
    "# Playground Worker Instructions",
    "",
    ...WORKER_INSTRUCTION_SECTIONS.flatMap((section) => [
      `## ${section.heading}`,
      "",
      ...section.rules.map((rule) => `- ${rule}`),
      "",
    ]),
  ].join("\n");
}

export function writeWorkerInstructions(paths: WorkerPaths): void {
  mkdirSync(paths.home, { recursive: true });
  writeFileSync(join(paths.home, "AGENTS.md"), renderWorkerInstructions());
}

export function writeRoleFile(paths: WorkerPaths, config: PlaygroundConfig): void {
  mkdirSync(paths.home, { recursive: true });
  const roles: Record<
    string,
    Array<{ kind: "route"; provider: string; model: string; effort?: string }>
  > = {};
  for (const [role, value] of Object.entries(config.roleModels ?? {})) {
    const routes = Array.isArray(value) ? value : [value];
    roles[role] = routes.map((route) => ({
      kind: "route",
      provider: route.provider,
      model: route.model,
      ...(route.effort === undefined ? {} : { effort: route.effort }),
    }));
  }
  writeFileSync(
    join(paths.home, "pstack-models.json"),
    `${JSON.stringify({ version: 2, roles }, null, 2)}\n`,
  );
}

/**
 * Seed `$DSH_HOME/pstack-settings.json`. The poteto workflow is a session toggle whose
 * global default applies to new Sessions, so this replaces the removed poteto-mode root
 * preset: adapted workers start with the workflow on, native keeps it off.
 */
export function writePstackSettings(paths: WorkerPaths, potetoDefault: boolean): void {
  mkdirSync(paths.home, { recursive: true });
  writeFileSync(
    join(paths.home, "pstack-settings.json"),
    `${JSON.stringify({ version: 1, potetoDefault }, null, 2)}\n`,
  );
}

export function writeHomePatch(
  paths: WorkerPaths,
  plan: ProviderPlan,
  _treatment: Treatment,
): void {
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
    {
      id: "llm-pi-ai",
      name: "@deepseek-ai/dsh-llm-pi-ai",
      config: { providers: anonymousProviders(plan.providers) },
    },
    {
      id: "approval",
      name: "@deepseek-ai/dsh-user-approval",
      config: { policy: "never" },
    },
    {
      id: "permission",
      name: "@deepseek-ai/dsh-permission-presets",
      // Approval "never" keeps gated actions from blocking the absent user. The worker uses
      // the fixed workspace-write + never preset; a base-bundle rejection is a prepare failure.
      config: {
        presets: { unattended: { sandbox: "workspace-write", approval: "never" } },
        defaultPreset: "unattended",
      },
    },
  ];
  writeFileSync(homePatchFile(paths), yamlDump(patch, { lineWidth: 120 }));

  // The Settings page reads the profile patch, while the worker also loads the home patch.
  // Mirror the provider rows into the profile patch so its model catalog matches the session.
  const profilePatchPath = join(profileDirectory(paths), "cordis.patch.yml");
  if (existsSync(profilePatchPath)) {
    const existing = (yamlLoad(readFileSync(profilePatchPath, "utf8")) as unknown[]) ?? [];
    const overrides = new Map(patch.map((entry) => [entry.id, entry]));
    const merged = existing.map((entry) => {
      if (typeof entry !== "object" || entry === null) return entry;
      const id = (entry as { id?: unknown }).id;
      return typeof id === "string" && overrides.has(id) ? overrides.get(id) : entry;
    });
    const present = new Set(
      existing
        .map((entry) =>
          typeof entry === "object" && entry !== null ? (entry as { id?: unknown }).id : undefined,
        )
        .filter((id): id is string => typeof id === "string"),
    );
    for (const entry of patch) if (!present.has(entry.id)) merged.push(entry);
    writeFileSync(profilePatchPath, yamlDump(merged, { lineWidth: 120 }));
  }
  writeWorkerInstructions(paths);
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
    name: "匿名模型",
  };
}

export function copyCredentials(paths: WorkerPaths, file = DEFAULT_CREDENTIALS_FILE): void {
  mkdirSync(paths.home, { recursive: true });
  if (existsSync(file)) copyFileSync(file, join(paths.home, ".credentials.yaml"));
}

export function resetHome(paths: WorkerPaths): void {
  rmSync(paths.root, { recursive: true, force: true });
  rmSync(paths.isolatedRoot, { recursive: true, force: true });
  mkdirSync(paths.home, { recursive: true });
}

/**
 * Copy the generated native tree to the worker's mount outside the repository and return the
 * mount root. The native profile and persona reference this copy only; the in-repo path would
 * hand the tested session the repository root, and with it the scenario rubrics.
 */
export function mountNativeTree(paths: WorkerPaths, source: string = NATIVE_ROOT): string {
  if (!existsSync(source)) throw new Error("native tree is missing; run vp run generate first");
  rmSync(paths.nativeMount, { recursive: true, force: true });
  mkdirSync(paths.isolatedRoot, { recursive: true });
  cpSync(source, paths.nativeMount, { recursive: true });
  return paths.nativeMount;
}

export function profileManifest(
  treatment: Treatment,
  enabledPluginPackages: string[],
  runtimeVersion: string,
): Record<string, unknown> {
  if (treatment === "native" && enabledPluginPackages.includes("dsh-pstack")) {
    throw new Error("native profile must not install dsh-pstack");
  }
  const dependencies = Object.fromEntries(
    enabledPluginPackages.map((name) => [
      name,
      name === "dsh-pstack"
        ? `link:${REPOSITORY_ROOT}`
        : // Experimental DSH packages share the dsh version. A bare "*" resolves the older
          // `latest` tag, which no longer matches the dsh runtime API.
          name.startsWith("@deepseek-ai/")
          ? runtimeVersion
          : "*",
    ]),
  );
  const bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", ...enabledPluginPackages];
  return {
    name: `dsh-playground-${treatment}`,
    private: true,
    dependencies,
    dsh: { profile: { bundles } },
  };
}

export function nativeProfileEntries(template: unknown[], mount: string): unknown[] {
  const skills = join(mount, "pstack/skills");
  if (!existsSync(skills))
    throw new Error(
      "native mount is missing; run playground:prepare for the native treatment first",
    );
  return [
    ...template,
    {
      insert: [
        {
          id: "pstack-native-skills",
          name: "@deepseek-ai/dsh-skill-filesystem",
          config: {
            providerName: "pstack-native",
            includeDefaultRoots: false,
            watch: false,
            bundledSkillDir: skills,
          },
        },
      ],
    },
  ];
}

export function buildProfile(
  paths: WorkerPaths,
  treatment: Treatment,
  enabledPluginPackages: string[] = treatment === "adapted" ? ["dsh-pstack"] : [],
  teamMode = false,
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
  const patch = treatment === "native" ? nativeProfileEntries(entries, paths.nativeMount) : entries;
  if (teamMode) {
    (patch as unknown[]).push({ id: "agent-team", config: { defaultEnabled: true } });
  }
  writeFileSync(join(directory, "cordis.patch.yml"), yamlDump(patch, { lineWidth: 120 }));
  const manifest = profileManifest(treatment, enabledPluginPackages, dshVersion());
  if (treatment === "adapted" && !enabledPluginPackages.includes("dsh-pstack")) {
    throw new Error("adapted profile must explicitly include dsh-pstack");
  }
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function profileDirFor(paths: WorkerPaths): string {
  return profileDirectory(paths);
}

export function installPlugins(
  paths: WorkerPaths,
  versionExemptions: readonly string[] = [],
): void {
  const result = spawnSync(DSH_BIN, ["plugin", "--profile", PROFILE_NAME, "install"], {
    cwd: REPOSITORY_ROOT,
    env: { ...process.env, ...runtimeEnv(paths), DSH_HOME: paths.home },
    stdio: "inherit",
  });
  if (result.error) throw new Error(`failed to run dsh plugin install: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`dsh plugin install exited ${result.status}`);
  if (versionExemptions.length > 0) grantVersionExemptions(paths, versionExemptions);
}

/** The cached version of a package the profile installed under its own node_modules. */
function installedPackageVersion(paths: WorkerPaths, name: string): string {
  const file = join(paths.home, "profiles", PROFILE_NAME, "node_modules", name, "package.json");
  if (!existsSync(file)) {
    throw new Error(
      `cannot exempt ${name}: it is not installed in the profile (run install first)`,
    );
  }
  const version = (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version;
  if (!version) throw new Error(`cannot exempt ${name}: its package.json has no version`);
  return version;
}

/**
 * Grant exact-version exemptions so the loader keeps plugin rows whose peer range omits the
 * running dsh. `dsh plugin allow-version` wants an exact `name@version` and the exact runtime
 * version, so both are read from disk and the running CLI rather than hard-coded. Returns the
 * granted `name@version` list for the caller to record.
 */
export function grantVersionExemptions(
  paths: WorkerPaths,
  packageNames: readonly string[],
  runtimeVersion = dshVersion(),
): string[] {
  const granted: string[] = [];
  for (const name of packageNames) {
    const packageVersion = `${name}@${installedPackageVersion(paths, name)}`;
    const result = spawnSync(
      DSH_BIN,
      [
        "plugin",
        "--profile",
        PROFILE_NAME,
        "allow-version",
        packageVersion,
        "--dsh-version",
        runtimeVersion,
        "--accept-risk",
      ],
      {
        cwd: REPOSITORY_ROOT,
        env: { ...process.env, ...runtimeEnv(paths), DSH_HOME: paths.home },
        stdio: "inherit",
      },
    );
    if (result.error)
      throw new Error(
        `failed to grant version exemption ${packageVersion}: ${result.error.message}`,
      );
    if (result.status !== 0)
      throw new Error(`dsh plugin allow-version ${packageVersion} exited ${result.status}`);
    granted.push(packageVersion);
  }
  return granted;
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

export async function startWeb(
  paths: WorkerPaths,
  plan: ProviderPlan,
  port = 0,
): Promise<StartedWeb> {
  if (process.platform !== "linux") {
    throw new Error(
      "the managed web lifecycle currently supports Linux only; run scenarios in a managed DSH process",
    );
  }
  mkdirSync(paths.home, { recursive: true });
  mkdirSync(paths.isolatedRoot, { recursive: true });
  const logFd = openSync(paths.logFile, "w");
  const spawnEnvironment = {
    ...process.env,
    ...runtimeEnv(paths),
    DSH_HOME: paths.home,
    GH_CONFIG_DIR: join(paths.home, "gh-config"),
    GIT_TERMINAL_PROMPT: "0",
    [plan.apiKeyEnv]: plan.apiKey,
  };
  for (const key of [
    "PWD",
    "OLDPWD",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GITHUB_ENTERPRISE_TOKEN",
    "GH_HOST",
    "GITHUB_HOST",
    "GIT_ASKPASS",
  ]) {
    delete spawnEnvironment[key];
  }
  mkdirSync(join(paths.home, "gh-config"), { recursive: true });
  const child = spawn(
    DSH_BIN,
    ["--profile", PROFILE_NAME, "--port", String(port), "--host", HOST, "--no-open"],
    {
      cwd: paths.isolatedRoot,
      env: spawnEnvironment,
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
