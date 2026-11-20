import type { RuntimeConfig } from "../types.ts";

/** Process-wide settings populated from PlaygroundConfig.runtime by readConfig. */
export type RuntimeSettings = Pick<
  RuntimeConfig,
  | "scenarioTimeoutMs"
  | "turnTimeoutMs"
  | "subagentTimeoutMs"
  | "networkMode"
  | "workerPortBase"
  | "workerCapacity"
  | "workspaceRoot"
  | "workersDir"
  | "dockerBin"
  | "dshBin"
  | "vpxBin"
  | "pnpmBin"
  | "chromePath"
>;

let current: RuntimeSettings | undefined;

export function setRuntimeSettings(value: RuntimeSettings | undefined): void {
  current = value === undefined ? undefined : { ...value };
}

export function runtimeSettings(): RuntimeSettings {
  if (current === undefined) {
    throw new Error("playground runtime settings are not loaded; read playground/config.ts first");
  }
  return current;
}
