import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BehaviorScenario } from "../types.ts";
import type { WorkerPaths } from "./worker.ts";
import { REPOSITORY_ROOT } from "../shared/paths.ts";
export function materializeWorkspace(paths: WorkerPaths, scenario: BehaviorScenario): string {
  const workspace = join(paths.workspaceRoot, scenario.id);
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  for (const [relative, content] of Object.entries(scenario.workspace.files)) {
    const target = join(workspace, relative);
    if (target !== workspace && !target.startsWith(`${workspace}/`)) {
      throw new Error(`fixture path escapes workspace: ${relative}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  for (const [relative, source] of Object.entries(scenario.workspace.assets ?? {})) {
    const sourcePath = resolve(REPOSITORY_ROOT, source);
    const target = join(workspace, relative);
    if (target !== workspace && !target.startsWith(`${workspace}/`)) {
      throw new Error(`fixture path escapes workspace: ${relative}`);
    }
    if (!existsSync(sourcePath)) throw new Error(`scenario fixture is missing: ${source}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(sourcePath));
  }
  return workspace;
}
