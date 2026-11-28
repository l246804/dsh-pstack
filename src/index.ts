/** Root host entry for dsh-pstack. */
/**
 * The package root must be an active Loader entry so the client module registry
 * can discover the `dsh.client` bundle. The root entry also owns the
 * PstackHomeService startup migration and package-wide Remote registration;
 * other host services live in their own subpath entries.
 */
import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";

import type {} from "@deepseek-ai/dsh-typert-registry";
import { pstackHostContribution } from "./shared/remote.ts";

import { migratePstackHome } from "./compat/migrate-pstack-home.ts";

export const name = "pstack";

export const PSTACK_HOME_SERVICE = "pstackHome";

/** Host service that owns startup migration and the package Remote contract. */
export class PstackHomeService extends Service {
  static inject = ["typert"];
  constructor(ctx: Context) {
    super(ctx, PSTACK_HOME_SERVICE);
  }

  protected [Service.init](): void {
    migratePstackHome();
    this.ctx.typert.register(pstackHostContribution);
  }
}

export default PstackHomeService;
