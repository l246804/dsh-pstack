/** The shared route grammar for the role file, wire codec, and editor. */

import { INHERIT_ALIASES, type InheritAlias, type RoleSpec } from "./role-manifest.ts";

/** One resolved child route. */
export type Route =
  | { readonly kind: "inherit"; readonly alias: InheritAlias }
  | {
      readonly kind: "route";
      readonly provider: string;
      readonly model: string;
      readonly effort?: string;
    };

/** One parsed route token. */
export interface ParsedRoute {
  readonly route?: Route;
  readonly issue: string;
}

/** Validate one structured route entry (the role-file and wire shape). */
export function parseRouteEntry(value: unknown): ParsedRoute {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { issue: "the route entry is not an object" };
  }
  const record = value as Record<string, unknown>;
  if (record["kind"] === "inherit") {
    const alias = record["alias"] ?? "inherit-parent";
    if (typeof alias !== "string" || !(INHERIT_ALIASES as readonly string[]).includes(alias)) {
      return { issue: 'a route entry with kind "inherit" needs alias "inherit-parent" or "auto"' };
    }
    return { route: { kind: "inherit", alias: alias as InheritAlias }, issue: "" };
  }
  if (record["kind"] !== "route") {
    return { issue: 'a route entry needs kind "route" or "inherit"' };
  }
  const provider = record["provider"];
  const model = record["model"];
  const effort = record["effort"];
  if (typeof provider !== "string" || provider.trim() === "") {
    return { issue: "provider must be a non-empty string" };
  }
  if (typeof model !== "string" || model.trim() === "") {
    return { issue: "model must be a non-empty string" };
  }
  if (effort !== undefined && (typeof effort !== "string" || effort.trim() === "")) {
    return { issue: "effort must be a non-empty string when present" };
  }
  const providerValue = provider.trim();
  const modelValue = model.trim();
  const effortValue = typeof effort === "string" ? effort.trim() : undefined;
  const problem = validateRouteParts(providerValue, modelValue, effortValue);
  if (problem !== undefined) return { issue: problem };
  return {
    route: {
      kind: "route",
      provider: providerValue,
      model: modelValue,
      ...(effortValue === undefined ? {} : { effort: effortValue }),
    },
    issue: "",
  };
}

/** Validate route parts shared by the text and wire parsers. */
export function validateRouteParts(
  provider: string,
  model: string,
  effort: string | undefined,
): string | undefined {
  if (provider === "" || model === "" || /\s/.test(provider) || /\s/.test(model)) {
    return "is not a route; provider and model cannot contain spaces";
  }
  if (effort !== undefined && effort === "") {
    return "has empty brackets; drop them or name an effort";
  }
  if (effort !== undefined && /\s/.test(effort)) {
    return "has a multi-word effort; an effort is one token";
  }
  return undefined;
}

/** Type guard for a concrete route. */
export function isRoute(route: Route): route is Extract<Route, { kind: "route" }> {
  return route.kind === "route";
}

/** The single-route shape rule shared by the file parser and the save validator. */
export function validateRoleRouteShape(
  spec: RoleSpec,
  routes: { readonly length: number },
): string | undefined {
  if (spec.shape === "single" && routes.length > 1) {
    return "a single-route role cannot hold a comma-separated list";
  }
  return undefined;
}

/** Whether two route lists are structurally equal. */
export function routesEqual(left: readonly Route[], right: readonly Route[]): boolean {
  return (
    left.length === right.length && left.every((route, index) => routeEqual(route, right[index]!))
  );
}

function routeEqual(left: Route, right: Route): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "inherit") {
    return right.kind === "inherit" && left.alias === right.alias;
  }
  return (
    right.kind === "route" &&
    left.provider === right.provider &&
    left.model === right.model &&
    left.effort === right.effort
  );
}
