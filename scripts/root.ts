/**
 * Repository root, in one place.
 *
 * `build-assets.ts` and `build-runtime.ts` need this before either can import the
 * other: the asset builder copies the built runtime, and the runtime builder
 * resolves every source and output path from the repository. Keeping the constant
 * in a leaf module is what stops that pair from being an import cycle whose
 * top-level constants are read before they are initialised.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of this repository (a checkout) or installed package root. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Repository-relative prefix of the pinned upstream submodule root.
 *
 * Asset paths and patch targets are relative to `upstream/cursor-plugins/pstack`,
 * so this is the one place that adds the submodule's own directories. Both
 * `build-assets.ts` and `build-runtime.ts` need it, and neither owns it.
 */
export const UPSTREAM_PREFIX = "upstream/cursor-plugins/pstack/";
