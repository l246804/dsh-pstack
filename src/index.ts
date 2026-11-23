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
import { describeError } from "./lib/errors.ts";
import { resolveDshHome } from "./lib/dsh-home.ts";
import { pstackHomePaths, type PstackHomePaths } from "./pstack/home.ts";

export const name = "pstack";

export const PSTACK_HOME_SERVICE = "pstackHome";

/** Host service that owns the pstack home layout and its startup migration. */
export class PstackHomeService extends Service {
  readonly dshHome: string;
  readonly paths: PstackHomePaths;
  migrationErrors: readonly string[] = [];

  constructor(ctx: Context) {
    super(ctx, PSTACK_HOME_SERVICE);
    this.dshHome = resolveDshHome();
    this.paths = pstackHomePaths(this.dshHome);
  }

  protected [Service.init](): void {
    try {
      this.migrationErrors = migratePstackHome(this.dshHome).errors;
    } catch (error) {
      this.migrationErrors = [describeError(error)];
    }
  }
}

export default PstackHomeService;
