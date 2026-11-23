/**
 * `pstack_roles`: a read-only discovery query over the role manifest.
 *
 * It reports each role, its shape, and the routes configured in the role file as
 * structured `{ provider, model, reasoningEffort? }` values a caller can pass straight to
 * `pstack_subagent`. When the live catalogue is available it also reports each route's
 * served `efforts` and `defaultEffort`, so a caller can change the effort without guessing.
 */

import type { Context } from "@deepseek-ai/cordis";
import type { LlmRuntime } from "@deepseek-ai/dsh-llm";
import type { JsonSchemaNode, ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";

import { collectCatalogue, type CatalogueResult } from "./models.ts";
import type { PstackHomeService } from "./index.ts";
import { resolveDshHome } from "./lib/dsh-home.ts";
import { pstackHomePaths } from "./pstack/home.ts";
import { ROLE_MANIFEST, type RoleSpec } from "./roles/role-manifest.ts";
import { readRoleConfiguration } from "./roles/role-store.ts";
import { isRoute, type Route } from "./roles/route.ts";
import { describeError } from "./lib/errors.ts";
import { textOutput } from "./lib/tool-output.ts";

export const name = "pstack-role-catalog";

export const inject = ["tools", "llm", "pstackHome"];

export const TOOL_NAME = "pstack_roles";

/** One configured route, structured for direct reuse by `pstack_subagent`. */
export interface RoleRoute {
  readonly provider?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  /** Served effort tokens for this model, when the live catalogue resolved it. */
  readonly efforts?: readonly string[];
  readonly defaultEffort?: string;
  /** Whether the live catalogue serves this route; false means the role file is stale. */
  readonly served?: boolean;
  readonly error?: string;
  readonly inherit?: true;
}

export interface RoleCapability {
  readonly role: string;
  readonly shape: "single" | "list";
  readonly usage: string;
  readonly routes: readonly RoleRoute[];
}

/** Derive one role's discovery record. */
export function roleCapability(spec: RoleSpec, routes: readonly RoleRoute[] = []): RoleCapability {
  return {
    role: spec.key,
    shape: spec.shape,
    usage: usageFor(spec, routes.length > 0),
    routes,
  };
}

/** Every role's discovery record in manifest order. */
export function roleCapabilities(
  entries?: ReadonlyMap<string, { readonly routes: readonly Route[] }>,
): readonly RoleCapability[] {
  return ROLE_MANIFEST.map((spec) => {
    const entry = entries?.get(spec.key);
    const routes = entry?.routes.map(routeToChoice) ?? [];
    return roleCapability(spec, routes);
  });
}

/** Attach each configured route's served effort domain from the live catalogue. */
export function annotateRoleCapabilities(
  roles: readonly RoleCapability[],
  catalogue: CatalogueResult,
): readonly RoleCapability[] {
  return roles.map((role) => ({
    ...role,
    routes: role.routes.map((route) => annotateRoute(route, catalogue)),
  }));
}

/** Render the discovery records for the model. */
export function renderRoleCapabilities(roles: readonly RoleCapability[]): string {
  return [
    "pstack roles. Each role lists its configured routes as provider, model, and optional reasoningEffort, plus the model's served efforts and default when known; pass provider, model, and reasoningEffort to `pstack_subagent`. Omit provider and model to inherit the parent route.",
    "",
    ...roles.map((role) => {
      const routes = role.routes.length
        ? `; routes=${role.routes.map(renderChoice).join(", ")}`
        : "";
      return `- ${role.role} — shape=${role.shape}; ${role.usage}${routes}`;
    }),
  ].join("\n");
}

const OUTPUT_SCHEMA: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  properties: {
    roles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: "string" },
          shape: { type: "string", enum: ["single", "list"] },
          usage: { type: "string" },
          routes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                provider: { type: "string" },
                model: { type: "string" },
                reasoningEffort: { type: "string" },
                efforts: { type: "array", items: { type: "string" } },
                defaultEffort: { type: "string" },
                served: { type: "boolean" },
                error: { type: "string" },
                inherit: { type: "boolean" },
              },
            },
          },
        },
        required: ["role", "shape", "usage", "routes"],
      },
    },
    catalogueError: { type: "string" },
  },
  required: ["roles"],
};

const TOOL_DESCRIPTION = [
  "List every pstack role with its shape and configured routes as structured provider, model, and reasoningEffort values, plus each route's served efforts and default effort.",
  "",
  "Read-only. Use it to pick the provider, model, and reasoningEffort to pass to `pstack_subagent`, and to change the effort to another value from the route's `efforts` instead of guessing. Use `pstack_models` only to detect served routes during setup or verify one exists.",
  "",
  "A role with no configured route inherits the parent route when provider and model are omitted.",
].join("\n");

/** Build the tool definition. */
export function createPstackRolesTool(
  dshHome: string = resolveDshHome(),
  llm?: LlmRuntime,
): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: { type: "object", additionalProperties: false, properties: {} },
    output: textOutput<{ roles: readonly RoleCapability[]; catalogueError?: string }>(
      OUTPUT_SCHEMA,
      (value) => {
        const text = renderRoleCapabilities(value.roles);
        return value.catalogueError === undefined
          ? text
          : `${text}\n\ncatalogue discovery failed: ${value.catalogueError}`;
      },
    ),
    isConcurrencySafe: () => true,
    async execute(_rawArgs, exec: ToolRunContext) {
      const roleFile = readRoleConfiguration(pstackHomePaths(dshHome).models);
      if (roleFile.status === "unreadable") {
        throw new Error(
          `the pstack role file at ${roleFile.path} cannot be read: ${roleFile.reason}`,
        );
      }
      const entries = roleFile.status === "loaded" ? roleFile.roles : undefined;
      const roles = roleCapabilities(entries);
      if (llm === undefined) return { roles };
      try {
        const catalogue = await collectCatalogue(llm, undefined, exec.signal);
        return { roles: annotateRoleCapabilities(roles, catalogue) };
      } catch (error) {
        if (exec.signal.aborted) throw error;
        return { roles, catalogueError: describeError(error) };
      }
    },
  };
}

export function apply(ctx: Context): void {
  const home = ctx.get("pstackHome") as PstackHomeService;
  ctx.tools.register(createPstackRolesTool(home.dshHome, ctx.llm));
}

function routeToChoice(route: Route): RoleRoute {
  return isRoute(route)
    ? {
        provider: route.provider,
        model: route.model,
        ...(route.effort === undefined ? {} : { reasoningEffort: route.effort }),
      }
    : { inherit: true };
}

function renderChoice(route: RoleRoute): string {
  if (route.inherit) return "inherit-parent";
  const parts = [`provider=${route.provider}`, `model=${route.model}`];
  if (route.reasoningEffort !== undefined) parts.push(`reasoningEffort=${route.reasoningEffort}`);
  if (route.efforts !== undefined && route.efforts.length > 0) {
    parts.push(`efforts=${route.efforts.join(",")}`);
  }
  if (route.defaultEffort !== undefined) parts.push(`default=${route.defaultEffort}`);
  if (route.served === false) parts.push("served=no");
  if (route.error !== undefined) parts.push(`error=${JSON.stringify(route.error)}`);
  return parts.join(" ");
}

function usageFor(spec: RoleSpec, configured: boolean): string {
  if (!configured)
    return "no configured route; omit provider and model to inherit the parent route";
  if (spec.shape === "list") return "multiple configured routes; the caller picks one";
  return "one child on the role's single configured route";
}

function annotateRoute(route: RoleRoute, catalogue: CatalogueResult): RoleRoute {
  if (route.inherit) return route;
  const provider = catalogue.providers.find((entry) => entry.provider === route.provider);
  if (provider?.error !== undefined) {
    return { ...route, served: false, efforts: [], error: provider.error };
  }
  const model = provider?.models.find((entry) => entry.id === route.model);
  if (model === undefined) return { ...route, served: false, efforts: [] };
  return {
    ...route,
    served: model.error === undefined,
    efforts: model.efforts,
    ...(model.defaultEffort === undefined ? {} : { defaultEffort: model.defaultEffort }),
    ...(model.error === undefined ? {} : { error: model.error }),
  };
}
