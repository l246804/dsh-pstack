/**
 * Pure draft state for the role configuration page.
 *
 * Keeping selection, comparison, and display formatting here lets the browser
 * tests cover every form decision without mounting the Cordis Client tree.
 */

import type { CatalogueResult, ModelEntry, ProviderEntry } from "../models.ts";
import type { RoleFileSnapshot, RoleView, RouteView } from "../internal/role-wire.ts";

/** One editable route. */
export type DraftRoute = RouteView;

export type RoleDrafts = Readonly<Record<string, readonly DraftRoute[]>>;

/** The implicit value of a role absent from the file. */
export function inheritRoute(alias: "inherit-parent" | "auto" = "inherit-parent"): DraftRoute {
  return { kind: "inherit", alias };
}

/** Copy every role into an editable draft, falling back to `inherit-parent`. */
export function draftsFromSnapshot(snapshot: RoleFileSnapshot): Record<string, DraftRoute[]> {
  const drafts: Record<string, DraftRoute[]> = {};
  for (const role of snapshot.roles) {
    drafts[role.key] =
      role.routes.length === 0 ? [inheritRoute()] : role.routes.map((route) => ({ ...route }));
  }
  return drafts;
}

/** Copy one role's current value back into a draft. */
export function draftsForRole(role: RoleView): DraftRoute[] {
  return role.routes.length === 0 ? [inheritRoute()] : role.routes.map((route) => ({ ...route }));
}

/** The exact save payload one card sends. */
export function saveRequestFor(
  key: string,
  routes: readonly DraftRoute[],
): {
  key: string;
  routes: DraftRoute[];
} {
  return { key, routes: routes.map((route) => ({ ...route })) };
}

/** Structural comparison used by dirty and reset checks. */
export function sameRoutes(left: readonly DraftRoute[], right: readonly DraftRoute[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((route, index) => sameRoute(route, right[index] as DraftRoute));
}

/** Structural comparison of one route. */
export function sameRoute(left: DraftRoute, right: DraftRoute): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "inherit" && right.kind === "inherit") return left.alias === right.alias;
  if (left.kind === "route" && right.kind === "route") {
    return (
      left.provider === right.provider && left.model === right.model && left.effort === right.effort
    );
  }
  return false;
}

/** Display text of one route, matching the role-file grammar. */
export function formatRoute(route: DraftRoute): string {
  if (route.kind === "inherit") return route.alias;
  return route.effort === undefined
    ? `${route.provider}/${route.model}`
    : `${route.provider}/${route.model} [${route.effort}]`;
}

/** Replace one route in place. */
export function replaceRoute(
  routes: readonly DraftRoute[],
  index: number,
  route: DraftRoute,
): DraftRoute[] {
  return routes.map((current, position) => (position === index ? route : current));
}

/** Append one route, defaulting to `inherit-parent` for a new list entry. */
export function appendRoute(routes: readonly DraftRoute[]): DraftRoute[] {
  return [...routes, inheritRoute()];
}

/** Remove one route without ever leaving a list role empty. */
export function removeRoute(routes: readonly DraftRoute[], index: number): DraftRoute[] {
  if (routes.length <= 1) return [...routes];
  return routes.filter((_route, position) => position !== index);
}

/** Provider entries in catalogue order. */
export function providerChoices(catalogue: CatalogueResult | undefined): readonly ProviderEntry[] {
  return catalogue?.providers ?? [];
}

/** The models one provider advertises, or an empty list when the provider is gone. */
export function modelChoices(
  catalogue: CatalogueResult | undefined,
  provider: string,
): readonly ModelEntry[] {
  return catalogue?.providers.find((entry) => entry.provider === provider)?.models ?? [];
}

/** One model's declared efforts. */
export function effortChoices(
  catalogue: CatalogueResult | undefined,
  provider: string,
  model: string,
): readonly string[] {
  return modelChoices(catalogue, provider).find((entry) => entry.id === model)?.efforts ?? [];
}

/** Whether the current provider still exists in the live directory. */
export function providerKnown(catalogue: CatalogueResult | undefined, provider: string): boolean {
  return catalogue?.providers.some((entry) => entry.provider === provider) ?? false;
}

/** Client-side shape check; the Host validates providers and efforts on save. */
export function draftIssues(role: RoleView, routes: readonly DraftRoute[]): readonly string[] {
  if (routes.length === 0) return ["keep at least one route"];
  if (role.shape === "single" && routes.length !== 1)
    return ["a single-route role needs exactly one route"];
  return [];
}
