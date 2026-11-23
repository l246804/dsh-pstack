/** Host role configuration service for the pstack settings page. */

import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { LlmRuntime } from "@deepseek-ai/dsh-llm";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type {} from "@deepseek-ai/dsh-typert-registry";

import { collectCatalogue, type CatalogueResult } from "./models.ts";
import type { PstackHomeService } from "./index.ts";
import type { BudgetApplyRequest } from "./roles/budget.ts";
import { readRoleConfiguration } from "./roles/role-store.ts";
import {
  saveBudgetConfiguration,
  saveRoleConfiguration,
  snapshotFromConfiguration,
} from "./roles/role-editor.ts";
import { pstackRolesHostContribution, ROLES_SERVICE } from "./roles/role-remote.ts";
import type {
  BudgetApplyResult,
  RoleFileSnapshot,
  SaveRoleRequest,
  SaveRoleResult,
} from "./roles/role-wire.ts";

/** Read and write `$DSH_HOME/pstack/models.json` for the Web settings page. */
export class PstackRolesService extends TypertRemoteService {
  static inject = ["llm", "typert", "pstackHome"];

  constructor(ctx: Context) {
    super(ctx, ROLES_SERVICE);
  }

  protected [Service.init](): void {
    this.ctx.typert.register(pstackRolesHostContribution);
  }

  /** Current path, status, values, and per-role issues. */
  status(): RoleFileSnapshot {
    let configuration = readRoleConfiguration(this.home.paths.models);
    if (configuration.status === "missing" && this.home.migrationErrors.length > 0) {
      this.home.retryMigration();
      configuration = readRoleConfiguration(this.home.paths.models);
    }
    if (configuration.status === "missing" && this.home.migrationErrors.length > 0) {
      return {
        ...snapshotFromConfiguration(configuration),
        issues: [{ message: this.home.migrationErrors[0]! }],
      };
    }
    return snapshotFromConfiguration(configuration);
  }

  /** The live model directory used by the page's selectors. */
  async catalogue(signal: AbortSignal): Promise<CatalogueResult> {
    return collectCatalogue(this.llm, undefined, signal);
  }

  /** Validate and save one role, then return the reloaded snapshot. */
  async save(request: SaveRoleRequest, signal: AbortSignal): Promise<SaveRoleResult> {
    signal.throwIfAborted();
    return saveRoleConfiguration(this.home.paths.models, request, this.llm, signal);
  }

  /** Apply a global budget target and return the reloaded snapshot. */
  async budget(request: BudgetApplyRequest, signal: AbortSignal): Promise<BudgetApplyResult> {
    signal.throwIfAborted();
    return saveBudgetConfiguration(this.home.paths.models, request, this.llm, signal);
  }

  private get home(): PstackHomeService {
    return this.ctx.get("pstackHome") as PstackHomeService;
  }

  private get llm(): LlmRuntime {
    return this.ctx.llm;
  }
}

export default PstackRolesService;
