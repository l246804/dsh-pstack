/** Process-wide settings populated from PlaygroundConfig.runtime by readConfig. */
export interface RuntimeSettings {
  caseTimeoutMs?: number;
  networkMode?: "host" | "bridge";
  workspaceRoot?: string;
  workersDir?: string;
  dockerBin?: string;
  dshBin?: string;
  chromePath?: string;
}

let current: RuntimeSettings = {};

export function setRuntimeSettings(value: RuntimeSettings | undefined): void {
  current = value === undefined ? {} : { ...value };
}

export function runtimeSettings(): RuntimeSettings {
  return current;
}
