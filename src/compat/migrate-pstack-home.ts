/** Startup migration from the legacy `$DSH_HOME` root layout. */

import { constants, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import { migrateMdcToJson } from "./mdc-to-json.ts";
import { upgradeRoleFile } from "./upgrade-role-file.ts";
import { ROLE_FILE_VERSION, serializeRoleDocument } from "../roles/role-store.ts";
import { describeError } from "../lib/errors.ts";
import { resolveDshHome } from "../lib/dsh-home.ts";
import { pstackHomePaths, type PstackHomePaths } from "../pstack/home.ts";

/** Legacy filenames at the `$DSH_HOME` root. `pstack-repair.json` is never migrated. */
const LEGACY_MODELS_FILENAME = "pstack-models.json";
const LEGACY_MODELS_MDC_FILENAME = "pstack-models.mdc";
const LEGACY_SETTINGS_FILENAME = "pstack-settings.json";

function moveLegacyIfDestinationMissing(legacyPath: string, currentPath: string): void {
  if (existsSync(currentPath) || !existsSync(legacyPath)) return;
  mkdirSync(dirname(currentPath), { recursive: true });
  try {
    copyFileSync(legacyPath, currentPath, constants.COPYFILE_EXCL);
    rmSync(legacyPath, { force: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // A concurrent startup pass may have won the race: the source is gone
    // (ENOENT) or the destination already exists (EEXIST).
    if (code === "ENOENT" || (code === "EEXIST" && existsSync(currentPath))) return;
    throw error;
  }
}

/** Non-fatal problems from one startup migration pass. */
export interface PstackHomeMigration {
  readonly errors: readonly string[];
}

/** Converge `$DSH_HOME` on the current pstack layout in one startup pass. */
export function migratePstackHome(dshHome: string = resolveDshHome()): PstackHomeMigration {
  const paths = pstackHomePaths(dshHome);
  const errors: string[] = [];

  try {
    migrateModels(dshHome, paths);
  } catch (error) {
    errors.push(`role file: ${describeError(error)}`);
  }

  try {
    moveLegacyIfDestinationMissing(join(dshHome, LEGACY_SETTINGS_FILENAME), paths.settings);
  } catch (error) {
    errors.push(`settings file: ${describeError(error)}`);
  }

  return { errors };
}

function migrateModels(dshHome: string, paths: PstackHomePaths): void {
  const legacyModels = join(dshHome, LEGACY_MODELS_FILENAME);
  const legacyMdc = join(dshHome, LEGACY_MODELS_MDC_FILENAME);

  if (!existsSync(paths.models)) {
    if (existsSync(legacyModels)) {
      moveLegacyIfDestinationMissing(legacyModels, paths.models);
    } else if (existsSync(legacyMdc)) {
      migrateMdcToJson(legacyMdc, paths.models, {
        currentVersion: ROLE_FILE_VERSION,
        serialize: serializeRoleDocument,
      });
    }
  }

  if (existsSync(paths.models)) {
    const result = upgradeRoleFile(paths.models, {
      currentVersion: ROLE_FILE_VERSION,
      serialize: serializeRoleDocument,
    });
    if (result.status === "unreadable") throw new Error(result.reason);
  }
}
