import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";

import type { PlaygroundConfig, ProviderConfig, TestTarget, Variant } from "../types.ts";
import { readConfig } from "../config/config.ts";
import type { ProviderPlan } from "../config/provider.ts";
import { type NetworkMode } from "../container/spec.ts";
import { profilePatchFile } from "./profile.ts";
import { NATIVE_ROOT } from "./run-metadata.ts";
import type { WorkerPaths } from "./worker.ts";

export const DEFAULT_CREDENTIALS_FILE = join(homedir(), ".dsh/.credentials.yaml");

export { DEFAULT_CONFIG_FILE as CONFIG_FILE, NATIVE_ROOT, NATIVE_SKILLS } from "./run-metadata.ts";

function homePatchFile(paths: WorkerPaths): string {
  return join(paths.home, "cordis.patch.yml");
}

/** Host network keeps loopback; bridge needs the Docker host gateway. */
function workerBaseURL(value: string, mode: NetworkMode): string {
  if (mode === "host") return value;
  const url = new URL(value);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    url.hostname = "host.docker.internal";
  }
  return url.toString();
}

/** Translate config providers into the DSH patch rows the worker profile needs. */
function providerRows(
  providers: Record<string, ProviderConfig>,
  networkMode: NetworkMode,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const piAi = Object.entries(providers).filter(
    (entry): entry is [string, Extract<ProviderConfig, { kind: "pi-ai" }>] =>
      entry[1].kind === "pi-ai",
  );
  if (piAi.length > 0) {
    rows.push({
      id: "llm-pi-ai",
      name: "@deepseek-ai/dsh-llm-pi-ai",
      config: {
        providers: Object.fromEntries(
          piAi.map(([name, provider]) => [
            name,
            {
              apiKeyEnv: provider.apiKeyEnv,
              ...(provider.api === undefined ? {} : { api: provider.api }),
              ...(provider.baseURL === undefined
                ? {}
                : { baseURL: workerBaseURL(provider.baseURL, networkMode) }),
              reasoning: provider.reasoning,
              models: provider.models,
            },
          ]),
        ),
      },
    });
  }
  for (const [, provider] of Object.entries(providers)) {
    if (provider.kind === "deepseek-api-key") {
      rows.push({
        id: "llm-deepseek",
        name: "@deepseek-ai/dsh-llm-deepseek-api-key",
        config: {
          apiKeyEnv: provider.apiKeyEnv,
          ...(provider.reasoning === undefined ? {} : { reasoningEffort: provider.reasoning }),
          ...(provider.models === undefined ? {} : { models: provider.models }),
        },
      });
    }
    if (provider.kind === "deepseek-account") {
      rows.push({
        id: "llm-deepseek-account",
        name: "@deepseek-ai/dsh-llm-deepseek-account",
        config: {
          ...(provider.reasoning === undefined ? {} : { reasoningEffort: provider.reasoning }),
          ...(provider.modelOverrides === undefined
            ? {}
            : { modelOverrides: provider.modelOverrides }),
        },
      });
    }
  }
  return rows;
}

export function writeRoleFile(
  paths: WorkerPaths,
  config: Pick<PlaygroundConfig, "roleModels">,
): void {
  const root = join(paths.home, "pstack");
  mkdirSync(root, { recursive: true });
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
  writeFileSync(join(root, "models.json"), `${JSON.stringify({ version: 2, roles }, null, 2)}\n`);
}

/**
 * Seed the pstack settings file. The poteto workflow is a session toggle whose
 * global default applies to new Sessions. Adapted workers start with it on;
 * native keeps it off.
 */
export function writePstackSettings(paths: WorkerPaths, potetoDefault: boolean): void {
  const root = join(paths.home, "pstack");
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "settings.json"),
    `${JSON.stringify({ version: 1, potetoDefault }, null, 2)}\n`,
  );
}

export function writeHomePatch(
  paths: WorkerPaths,
  plan: ProviderPlan,
  variant: Variant,
  teamMode: boolean,
  networkMode: NetworkMode,
): void {
  mkdirSync(paths.home, { recursive: true });
  rmSync(join(paths.home, "AGENTS.md"), { force: true });
  const patch: Array<Record<string, unknown>> = [
    // Test stability: the worker serves a built artifact, so live reload must stay off.
    { id: "hmr", disabled: true },
    { id: "client-hmr", disabled: true },
    // Deterministic UI language for probes that read visible labels.
    { id: "locale", config: { preference: "zh" } },
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
      id: "approval",
      name: "@deepseek-ai/dsh-user-approval",
      config: { policy: "never" },
    },
    ...providerRows(plan.providers, networkMode),
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
  if (variant === "native") {
    patch.push({
      insert: [
        {
          id: "pstack-native-skills",
          name: "@deepseek-ai/dsh-skill-filesystem",
          config: {
            providerName: "pstack-native",
            includeDefaultRoots: false,
            watch: false,
            bundledSkillDir: join(paths.containerNative, "pstack", "skills"),
          },
        },
      ],
    });
  }
  if (teamMode) patch.push({ id: "agent-team", config: { defaultEnabled: true } });
  writeFileSync(homePatchFile(paths), yamlDump(patch, { lineWidth: 120 }));

  // The Settings page reads the profile patch, while the worker also loads the home patch.
  // Mirror the provider rows into the profile patch so its model catalog matches the session.
  const profilePatchPath = profilePatchFile(paths);
  if (existsSync(profilePatchPath)) {
    const parsed = yamlLoad(readFileSync(profilePatchPath, "utf8"));
    if (parsed !== undefined && parsed !== null && !Array.isArray(parsed)) {
      throw new Error(`profile patch must be a YAML list: ${profilePatchPath}`);
    }
    const existing = (parsed as unknown[] | undefined) ?? [];
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
    for (const entry of patch)
      if (typeof entry.id === "string" && !present.has(entry.id)) merged.push(entry);
    writeFileSync(profilePatchPath, yamlDump(merged, { lineWidth: 120 }));
  }
}

export type HomePlan = TestTarget;

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
  };
}

export function copyCredentials(paths: WorkerPaths, file = DEFAULT_CREDENTIALS_FILE): void {
  if (!existsSync(file)) {
    throw new Error(`copyCredentials is enabled but the credential file does not exist: ${file}`);
  }
  mkdirSync(paths.home, { recursive: true });
  copyFileSync(file, join(paths.home, ".credentials.yaml"));
}

export function resetHome(paths: WorkerPaths): void {
  rmSync(paths.root, { recursive: true, force: true });
  rmSync(paths.isolatedRoot, { recursive: true, force: true });
  mkdirSync(paths.home, { recursive: true });
}

/**
 * Copy the generated native tree to the worker's ignored .workspace mount and return the
 * mount root. The native profile and persona reference this copy only; the in-repo path would
 * hand the tested session the repository root, and with it the scenario rubrics.
 */
export function mountNativeTree(paths: WorkerPaths, source: string = NATIVE_ROOT): string {
  const tree = join(source, "pstack");
  if (!existsSync(tree))
    throw new Error("native tree is missing; run vp run native:generate first");
  rmSync(paths.nativeMount, { recursive: true, force: true });
  mkdirSync(paths.nativeMount, { recursive: true });
  cpSync(tree, join(paths.nativeMount, "pstack"), { recursive: true });
  return paths.nativeMount;
}

export interface WorkspaceRegistration {
  dirs: Record<string, string>;
  defaultId: string;
  defaultTitle: string;
}

interface WorkspaceStoreEntry {
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceStore {
  unit: { name: string; version: number };
  global: {
    initialized: boolean;
    workspaceIds: string[];
    archivedSessionIds: string[];
    pinnedSessionIds: string[];
    defaultWorkspaceId: string;
  };
  tables: { workspaces: Record<string, WorkspaceStoreEntry> };
}

function workspaceStoreFile(paths: WorkerPaths): string {
  return join(paths.home, "storages/workspace.json");
}

function readWorkspaceStoreFile(paths: WorkerPaths): WorkspaceStore {
  return JSON.parse(readFileSync(workspaceStoreFile(paths), "utf8")) as WorkspaceStore;
}

export function registerWorkspaces(
  paths: WorkerPaths,
  scenarioIds: string[],
): WorkspaceRegistration {
  const ids = [...new Set(scenarioIds)].sort();
  if (ids.length === 0) ids.push("playground");
  mkdirSync(paths.workspaceRoot, { recursive: true });
  const storeFile = workspaceStoreFile(paths);
  mkdirSync(dirname(storeFile), { recursive: true });
  const now = new Date().toISOString();
  const dirs: Record<string, string> = {};
  const tables: Record<string, WorkspaceStoreEntry> = {};
  const workspaceIds: string[] = [];
  for (const id of ids) {
    const workspaceId = crypto.randomUUID();
    const path = join(paths.workspaceRoot, id);
    const containerPath = join(paths.containerWorkspace, id);
    mkdirSync(path, { recursive: true });
    dirs[id] = path;
    workspaceIds.push(workspaceId);
    tables[workspaceId] = {
      path: containerPath,
      title: id,
      sessionIds: [],
      createdAt: now,
      updatedAt: now,
    };
  }
  const store: WorkspaceStore = {
    unit: { name: "workspace", version: 2 },
    global: {
      initialized: true,
      workspaceIds,
      archivedSessionIds: [],
      pinnedSessionIds: [],
      defaultWorkspaceId: workspaceIds[0]!,
    },
    tables: { workspaces: tables },
  };
  writeFileSync(storeFile, `${JSON.stringify(store, null, 2)}\n`);
  return { dirs, defaultId: workspaceIds[0] as string, defaultTitle: ids[0] as string };
}

export function setDefaultWorkspace(paths: WorkerPaths, scenarioId: string): void {
  const file = workspaceStoreFile(paths);
  const store = readWorkspaceStoreFile(paths);
  const entry = Object.entries(store.tables.workspaces).find(
    ([, workspace]) => workspace.title === scenarioId,
  );
  if (entry === undefined) {
    throw new Error(`workspace store has no scenario workspace: ${scenarioId}`);
  }
  store.global.defaultWorkspaceId = entry[0]!;
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`);
}

export function readWorkspaceStore(paths: WorkerPaths): {
  defaultTitle: string;
  workspaces: Array<{ path: string; title: string }>;
} {
  const store = readWorkspaceStoreFile(paths);
  const defaultWorkspace = store.tables.workspaces[store.global.defaultWorkspaceId];
  if (defaultWorkspace === undefined) {
    throw new Error("workspace store has no default workspace");
  }
  return {
    defaultTitle: defaultWorkspace.title,
    workspaces: store.global.workspaceIds.map((id) => {
      const workspace = store.tables.workspaces[id];
      if (workspace === undefined) throw new Error(`workspace store is missing ${id}`);
      return workspace;
    }),
  };
}

export function readPlaygroundConfig(file: string): Promise<PlaygroundConfig> {
  return readConfig(resolve(file));
}
