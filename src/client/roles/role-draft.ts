/** Draft algebra for the role settings page. */

import { routesEqual } from "../../roles/route.ts";
import type { RoleView, RouteView } from "../../roles/role-wire.ts";

export interface RoleDraft {
  readonly routes: RouteView[];
  readonly baseline: readonly RouteView[];
  readonly busy: boolean;
  /**
   * The user asked to delete this role's line. `routes` still holds the
   * inherited placeholder row so the card stays editable without implying that
   * an `inherit-parent` row is a configured route.
   */
  readonly cleared: boolean;
  readonly message?: { readonly tone: "success" | "error"; readonly text: string };
}

export type DraftMap = Readonly<Record<string, RoleDraft>>;

export function inheritedRoutes(): RouteView[] {
  return [{ kind: "inherit", alias: "inherit-parent" }];
}

/** Routes a reset restores: the configured baseline, or the inherited row for an unconfigured role. */
export function resetRoutes(draft: RoleDraft): RouteView[] {
  return draft.baseline.length === 0
    ? inheritedRoutes()
    : draft.baseline.map((route) => ({ ...route }));
}

export function draftOf(role: RoleView): RoleDraft {
  const routes =
    role.routes.length === 0 ? inheritedRoutes() : role.routes.map((route) => ({ ...route }));
  return { routes, baseline: role.routes, busy: false, cleared: false };
}

export function isDirty(draft: RoleDraft, role: RoleView): boolean {
  if (draft.cleared) return role.configured;
  if (!role.configured && routesEqual(draft.routes, inheritedRoutes())) return false;
  return !routesEqual(draft.routes, draft.baseline);
}

export function isClearDraft(draft: RoleDraft, role: RoleView | undefined): boolean {
  return (
    draft.cleared &&
    role !== undefined &&
    role.configured &&
    draft.routes.length === 1 &&
    draft.routes[0]?.kind === "inherit"
  );
}
