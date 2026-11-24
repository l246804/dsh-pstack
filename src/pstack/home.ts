/**
 * The pstack home layout.
 *
 * Every global pstack file lives under one directory, `$DSH_HOME/pstack/`. This
 * module is the single source of truth for the current paths and names. Legacy
 * root filenames live only in `compat/migrate-pstack-home.ts`.
 */

import { join } from "node:path";

import { resolveDshHome } from "../lib/dsh-home.ts";

/** The directory under `$DSH_HOME` that holds every pstack global file. */
export const PSTACK_DIRNAME = "pstack";

/** Current filenames inside `$DSH_HOME/pstack/`. */
export const MODELS_FILENAME = "models.json";
export const SETTINGS_FILENAME = "settings.json";
export const REPAIR_FILENAME = "repair.json";
export const PATHS_FILENAME = "paths.json";

/** The absolute paths that make up one pstack home. */
export interface PstackHomePaths {
  readonly root: string;
  readonly models: string;
  readonly settings: string;
  readonly repair: string;
  readonly paths: string;
}

/** Resolve the pstack home paths for one DSH home. */
export function pstackHomePaths(dshHome: string = resolveDshHome()): PstackHomePaths {
  const root = join(dshHome, PSTACK_DIRNAME);
  return {
    root,
    models: join(root, MODELS_FILENAME),
    settings: join(root, SETTINGS_FILENAME),
    repair: join(root, REPAIR_FILENAME),
    paths: join(root, PATHS_FILENAME),
  };
}
