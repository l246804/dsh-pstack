/**
 * `pstack_roles`: a read-only discovery query over the role manifest.
 *
 * It reports each role, its shape, and the routes configured in the role file as
 * structured `{ provider, model, reasoningEffort? }` values a caller can pass straight to
 * `pstack_subagent`.
 */

import type { Context } from "@deepseek-ai/cordis";
import type { JsonSchemaNode, ToolDefinition } from "@deepseek-ai/dsh-tools";

import { ROLE_MANIFEST, type RoleSpec } from "./roles/role-manifest.ts";
import { modelsFilePath, readRoleConfiguration, resolveDshHome } from "./roles/role-store.ts";
import { isRoute, type Route } from "./roles/route.ts";

export const name = "pstack-role-catalog";

export const inject = ["tools"];

export const TOOL_NAME = "pstack_roles";

/** One configured route, structured for direct reuse by `pstack_subagent`. */
export interface RoleRoute {
  readonly provider?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
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

/** Render the discovery records for the model. */
export function renderRoleCapabilities(roles: readonly RoleCapability[]): string {
  return [
    "pstack roles. Each role lists its configured routes as provider, model, and optional reasoningEffort; pass them to `pstack_subagent`. Omit provider and model to inherit the parent route.",
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
                inherit: { type: "boolean" },
              },
            },
          },
        },
        required: ["role", "shape", "usage", "routes"],
      },
    },
  },
  required: ["roles"],
};

const TOOL_DESCRIPTION = [
  "List every pstack role with its shape and configured routes as structured provider, model, and reasoningEffort values.",
  "",
  "Read-only. Use it to pick the provider, model, and optional reasoningEffort to pass to `pstack_subagent`; use `pstack_models` for the routes this deployment actually serves.",
  "",
  "A role with no configured route inherits the parent route when provider and model are omitted.",
].join("\n");

/** Build the tool definition. */
export function createPstackRolesTool(dshHome: string = resolveDshHome()): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: { type: "object", additionalProperties: false, properties: {} },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [
        {
          type: "text",
          text: renderRoleCapabilities(
            (value as unknown as { roles: readonly RoleCapability[] }).roles,
          ),
        },
      ],
    },
    isConcurrencySafe: () => true,
    async execute() {
      const roleFile = readRoleConfiguration(modelsFilePath(dshHome));
      if (roleFile.status === "unreadable") {
        throw new Error(
          `the pstack role file at ${roleFile.path} cannot be read: ${roleFile.reason}`,
        );
      }
      const entries = roleFile.status === "loaded" ? roleFile.roles : undefined;
      return { roles: roleCapabilities(entries) };
    },
  };
}

export function apply(ctx: Context): void {
  ctx.tools.register(createPstackRolesTool());
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
  const effort =
    route.reasoningEffort === undefined ? "" : ` reasoningEffort=${route.reasoningEffort}`;
  return `provider=${route.provider} model=${route.model}${effort}`;
}

function usageFor(spec: RoleSpec, configured: boolean): string {
  if (!configured)
    return "no configured route; omit provider and model to inherit the parent route";
  if (spec.shape === "list") return "multiple configured routes; the caller picks one";
  return "one child on the role's single configured route";
}
