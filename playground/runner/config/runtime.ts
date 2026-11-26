import type { RuntimeConfig } from "../types.ts";

/** Process-wide settings populated from PlaygroundConfig.runtime by readConfig. */
let current: RuntimeConfig | undefined;

export function setRuntimeSettings(value: RuntimeConfig | undefined): void {
  current = value === undefined ? undefined : { ...value };
}

export function runtimeSettings(): RuntimeConfig {
  if (current === undefined) {
    throw new Error("playground runtime settings are not loaded; read playground/config.ts first");
  }
  return current;
}
