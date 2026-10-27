/**
 * Repository root, in one place.
 *
 * The runtime build and the generator both resolve every path from here, and the
 * generator imports the runtime build. Keeping the constant in a leaf module stops that
 * pair from being an import cycle whose top-level constants are read before they are
 * initialised.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of this repository (a checkout). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Repository-relative prefix of the pinned upstream submodule root.
 *
 * Asset paths are relative to `upstream/cursor-plugins/pstack`, so this is the one
 * place that adds the submodule's own directories.
 */
export const UPSTREAM_PREFIX = "upstream/cursor-plugins/pstack/";

/** Repository-relative path of the generated tree root. */
export const PORT_DIRECTORY = "pstack/pstack";

/** Repository-relative path of the hand-written overlay that replaces ported files. */
export const OVERLAY_DIRECTORY = "pstack/docs";
