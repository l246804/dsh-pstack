/**
 * Wire shapes of the role configuration page.
 *
 * The Host service, the hand-written Remote contribution, and the Client bundle
 * all share these shapes. Nothing here imports Node, so the Client bundle can
 * inline it without pulling a file-system module into the browser.
 */

import type { CatalogueResult } from "../models.ts";
import type { RoleValueShape } from "./role-manifest.ts";

/** Which spelling of "inherit the parent route" a role line uses. */
export type InheritAlias = "inherit-parent" | "auto";

/** One role value as the configuration page sees it. */
export type RouteView =
  | { readonly kind: "inherit"; readonly alias: InheritAlias }
  | {
      readonly kind: "route";
      readonly provider: string;
      readonly model: string;
      readonly effort?: string;
    };

/** One of the 17 roles in manifest order. */
export interface RoleView {
  readonly key: string;
  readonly shape: RoleValueShape;
  /** Whether the role file configures this role. */
  readonly configured: boolean;
  /** The winning line, when the role file configures this role. */
  readonly line?: number;
  readonly routes: readonly RouteView[];
  readonly issues: readonly string[];
}

/** One file-level problem. Unknown and malformed lines are reported, never dropped. */
export interface RoleFileIssue {
  readonly line?: number;
  readonly message: string;
}

/** Everything the configuration page renders about `$DSH_HOME/pstack-models.mdc`. */
export interface RoleFileSnapshot {
  readonly path: string;
  readonly status: "missing" | "loaded" | "unreadable";
  readonly reason?: string;
  readonly budget?: string;
  readonly roles: readonly RoleView[];
  readonly issues: readonly RoleFileIssue[];
  /** False only when the file cannot be read at all. */
  readonly canSave: boolean;
}

/** One role save. List roles carry every route, never only the edited one. */
export interface SaveRoleRequest {
  readonly key: string;
  readonly routes: readonly RouteView[];
}

/** A refused save leaves the file untouched and names the reason. */
export type SaveRoleResult =
  | { readonly ok: true; readonly snapshot: RoleFileSnapshot }
  | { readonly ok: false; readonly reason: string };

/** The live model directory the page offers. */
export type RoleCatalogue = CatalogueResult;
