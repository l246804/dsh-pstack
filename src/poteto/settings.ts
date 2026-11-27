/** Global poteto-workflow defaults persisted in `$DSH_HOME/pstack/settings.json`. */

import { readFileSync } from "node:fs";

import { writeFileAtomically } from "../lib/atomic-write.ts";
import { pstackHomePaths } from "../pstack/home.ts";

/** The whole settings document. */
export interface PstackSettings {
  readonly potetoDefault: boolean;
}

/** Defaults used when the file is missing or corrupt. */
export const EMPTY_SETTINGS: PstackSettings = { potetoDefault: false };

/** Absolute path of the settings file for one DSH home. */
export function settingsFilePath(dshHome?: string): string {
  return pstackHomePaths(dshHome).settings;
}

/**
 * Read the settings document. A missing file is a fresh install; a corrupt file
 * falls back to {@link EMPTY_SETTINGS} so one bad write cannot break startup.
 * Every other I/O error still surfaces.
 */
export function readSettings(path: string = settingsFilePath()): PstackSettings {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_SETTINGS;
    throw error;
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return { potetoDefault: parsed["potetoDefault"] === true };
  } catch {
    return EMPTY_SETTINGS;
  }
}

/** Persist the settings document atomically so a crash cannot leave it half-written. */
export function writeSettings(settings: PstackSettings, path: string = settingsFilePath()): void {
  writeFileAtomically(path, `${JSON.stringify(settings, null, 2)}\n`);
}
