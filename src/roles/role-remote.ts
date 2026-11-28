/**
 * Remote metadata for the pstack role settings page.
 *
 * The Host registers these descriptors with Typert and the Client mounts the
 * same contribution. The descriptors and their parsers are browser-safe and
 * import no Node runtime.
 */

import type { RemoteResult, TypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol";

import type { CatalogueResult } from "../models/catalogue.ts";
import { REMOTE_PACKAGE, codec, directMethod, parameter } from "../lib/typert-method.ts";
import { type BudgetApplyRequest, parseBudgetApplyRequest } from "./budget.ts";
import {
  parseBudgetApplyResult,
  parseCatalogueResult,
  parseRoleFileSnapshot,
  parseSaveRoleRequest,
  parseSaveRoleResult,
  type BudgetApplyResult,
  type RoleFileSnapshot,
  type SaveRoleRequest,
  type SaveRoleResult,
} from "./role-wire.ts";

/** npm package owning these methods. */
export { REMOTE_PACKAGE };

/** Cordis service key and wire namespace. */
export const ROLES_SERVICE = "pstackRoles";

const statusMethod = directMethod<Record<string, never>, RoleFileSnapshot>(ROLES_SERVICE, {
  method: "status",
  parameters: [],
  result: codec("PstackRoleFileSnapshot", parseRoleFileSnapshot),
});

const catalogueMethod = directMethod<Record<string, never>, CatalogueResult>(ROLES_SERVICE, {
  method: "catalogue",
  parameters: [],
  result: codec("PstackRoleCatalogue", parseCatalogueResult),
  cancellation: true,
});

const saveMethod = directMethod<{ request: SaveRoleRequest }, SaveRoleResult>(ROLES_SERVICE, {
  method: "save",
  parameters: [parameter("request", "PstackSaveRoleRequest", parseSaveRoleRequest)],
  result: codec("PstackSaveRoleResult", parseSaveRoleResult),
  cancellation: true,
});

const budgetMethod = directMethod<{ request: BudgetApplyRequest }, BudgetApplyResult>(
  ROLES_SERVICE,
  {
    method: "budget",
    parameters: [parameter("request", "PstackBudgetApplyRequest", parseBudgetApplyRequest)],
    result: codec("PstackBudgetApplyResult", parseBudgetApplyResult),
    cancellation: true,
  },
);

/** Typed Client face installed by `$mount()`. */
export interface PstackRolesNamespace {
  readonly pstackRoles: {
    status(): Promise<RemoteResult<RoleFileSnapshot>>;
    catalogue(signal?: AbortSignal): Promise<RemoteResult<CatalogueResult>>;
    save(request: SaveRoleRequest, signal?: AbortSignal): Promise<RemoteResult<SaveRoleResult>>;
    budget(
      request: BudgetApplyRequest,
      signal?: AbortSignal,
    ): Promise<RemoteResult<BudgetApplyResult>>;
  };
}

/** Mountable contribution shared by Host registration and Client `$mount`. */
export const pstackRolesRemote: TypertRemoteInfo = {
  package: REMOTE_PACKAGE,
  descriptors: [statusMethod, catalogueMethod, saveMethod, budgetMethod],
  methods: {
    [`${ROLES_SERVICE}/status`]: statusMethod,
    [`${ROLES_SERVICE}/catalogue`]: catalogueMethod,
    [`${ROLES_SERVICE}/save`]: saveMethod,
    [`${ROLES_SERVICE}/budget`]: budgetMethod,
  },
};
