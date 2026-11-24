/** Root host entry for dsh-pstack. */
/**
 * The package root must be an active Loader entry so the client module registry
 * can discover the `dsh.client` bundle. The root entry also owns the
 * PstackHomeService startup migration; other host services live in their own
 * subpath entries.
 */
import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";

import { migratePstackHome } from "./compat/migrate-pstack-home.ts";
import { pstackHomePaths } from "./pstack/home.ts";
import { writePstackPathsIndex } from "./pstack/paths-index.ts";

export const name = "pstack";

export const PSTACK_HOME_SERVICE = "pstackHome";

/** Host service that owns the one startup migration pass. */
export class PstackHomeService extends Service {
  constructor(ctx: Context) {
    super(ctx, PSTACK_HOME_SERVICE);
  }

  protected [Service.init](): void {
    migratePstackHome();
    try {
      writePstackPathsIndex(pstackHomePaths().paths);
    } catch {}
  }
}

export default PstackHomeService;
