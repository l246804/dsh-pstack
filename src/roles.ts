/**
 * `pstack-roles`: the Host half of the role model configuration page.
 *
 * It owns no cached policy: every read and write goes to
 * `$DSH_HOME/pstack-models.mdc`, which `pstack_subagent` also re-reads on every
 * delegation. Saving therefore takes effect on the next delegation without a
 * restart, and an already running child keeps the route it started with.
 */

import { Service, type Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

import type { LlmHost } from "./internal/host-contract.ts";
import { saveRoleConfiguration, snapshotFromConfiguration } from "./internal/role-editor.ts";
import { modelsFilePath, readRoleConfiguration, resolveDshHome } from "./internal/role-config.ts";
import type { RoleFileSnapshot, SaveRoleRequest, SaveRoleResult } from "./internal/role-wire.ts";
import { collectCatalogue, type CatalogueResult } from "./models.ts";
import { REMOTE_PACKAGE, ROLES_SERVICE, pstackRolesRemote } from "./remote.ts";

interface TypertHost {
  register(contribution: {
    readonly package: string;
    readonly face: "host";
    readonly schemas: readonly unknown[];
    readonly model: {
      readonly services: readonly unknown[];
      readonly events: readonly unknown[];
      readonly objects: readonly unknown[];
    };
    readonly invocations: typeof pstackRolesRemote.descriptors;
  }): unknown;
}

/** Read and write the role file for the Plugins configuration page. */
export class PstackRolesService extends TypertRemoteService {
  static inject = ["llm", "typert"];

  constructor(ctx: Context) {
    super(ctx, ROLES_SERVICE);
  }

  protected [Service.init](): void {
    const typert = (
      this.ctx as unknown as {
        readonly typert?: TypertHost;
      }
    ).typert;
    if (typert === undefined) {
      throw new Error("pstack-roles requires the Typert registry service");
    }
    typert.register({
      package: REMOTE_PACKAGE,
      face: "host",
      schemas: [],
      model: { services: [], events: [], objects: [] },
      invocations: pstackRolesRemote.descriptors,
    });
  }

  /** Current path, status, values, and per-line issues. */
  status(): RoleFileSnapshot {
    return snapshotFromConfiguration(readRoleConfiguration(roleFilePath()));
  }

  /** The live directory the page offers for its provider/model/effort selects. */
  async catalogue(signal: AbortSignal): Promise<CatalogueResult> {
    return collectCatalogue(this.llm, undefined, signal);
  }

  /** Validate and save one role, then return the reloaded snapshot. */
  async save(request: SaveRoleRequest, signal: AbortSignal): Promise<SaveRoleResult> {
    signal.throwIfAborted();
    const catalogue = await collectCatalogue(this.llm, undefined, signal);
    signal.throwIfAborted();
    return saveRoleConfiguration(roleFilePath(), request, catalogue);
  }

  private get llm(): LlmHost {
    return (
      this.ctx as unknown as {
        readonly llm: LlmHost;
      }
    ).llm;
  }
}

function roleFilePath(): string {
  return modelsFilePath(resolveDshHome());
}

export default PstackRolesService;
