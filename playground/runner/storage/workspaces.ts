import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  WorkspaceDomainState,
  WorkspaceId,
  WorkspaceRecord,
} from "@deepseek-ai/dsh-workspace";
import type { WorkerPaths } from "../worker/worker.ts";
export interface WorkspaceRegistration {
  dirs: Record<string, string>;
  defaultId: string;
  defaultTitle: string;
}

interface WorkspaceStore {
  unit: { name: string; version: number };
  global: WorkspaceDomainState;
  tables: { workspaces: Record<string, WorkspaceRecord> };
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
  const tables: Record<string, WorkspaceRecord> = {};
  const workspaceIds: WorkspaceId[] = [];
  for (const id of ids) {
    const workspaceId = crypto.randomUUID() as WorkspaceId;
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
  store.global.defaultWorkspaceId = entry[0] as WorkspaceId;
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`);
}

export function readWorkspaceStore(paths: WorkerPaths): {
  defaultTitle: string;
  workspaces: Array<{ path: string; title: string }>;
} {
  const store = readWorkspaceStoreFile(paths);
  const defaultId = store.global.defaultWorkspaceId;
  const defaultWorkspace = defaultId === undefined ? undefined : store.tables.workspaces[defaultId];
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
