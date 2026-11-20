/** Process-wide settings populated from PlaygroundConfig.runtime by readConfig. */
export interface RuntimeSettings {
  caseTimeoutMs: number;
  networkMode: "host" | "bridge";
  workspaceRoot: string;
  workersDir: string;
  dockerBin: string;
  dshBin: string;
  chromePath?: string;
}

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
