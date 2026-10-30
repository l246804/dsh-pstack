/**
 * Hand-written Typert Remote metadata for the role configuration page.
 *
 * The repository has no Typert generation chain, so this artifact supplies the
 * same consumer-facing contract a generated `./remote` artifact would: strict
 * input and result codecs plus the `methods` index the Client mounts with
 * `ctx.remote.$mount()`. The Host registers these identical descriptors with
 * `ctx.typert.register()`, which selects strict validation instead of the
 * Gateway's SRC fallback.
 *
 * No Node imports: the Client bundle inlines this module.
 */

import type {
  InvocationDescriptor,
  InvocationParameterDescriptor,
  RemoteResult,
  TypertClientRemote,
  TypertCodec,
  TypertRemoteContribution,
  TypertRemoteInfo,
  TypertRemoteMethod,
  TypertSchema,
} from "@deepseek-ai/dsh-typert-protocol";

import type { CatalogueResult } from "./models.ts";
import type {
  RoleFileSnapshot,
  SaveRoleRequest,
  SaveRoleResult,
  RouteView,
} from "./internal/role-wire.ts";

/** npm package that owns these methods. */
export const REMOTE_PACKAGE = "dsh-pstack";

/** Cordis service key and wire namespace of the Host role service. */
export const ROLES_SERVICE = "pstackRoles";

type StrictCodec<Value> = Extract<TypertCodec<Value>, { readonly mode: "strict" }>;

function jsonCodec<Value>(
  typeSymbol: string,
  parse: (value: unknown) => Value,
  decode?: (value: unknown) => Value,
): StrictCodec<Value> {
  return {
    mode: "strict",
    typeSymbol,
    create: () => ({ parse }),
    ...(decode === undefined ? {} : { decode }),
  };
}

function parameter(
  wire: string,
  typeSymbol: string,
  parse: (value: unknown) => unknown,
): InvocationParameterDescriptor {
  return { name: wire, wire, source: "json", codec: jsonCodec(typeSymbol, parse) };
}

function parseRecord(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${subject} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseRoute(value: unknown, subject: string): RouteView {
  const record = parseRecord(value, subject);
  if (record["kind"] === "inherit") {
    const alias = record["alias"] ?? "inherit-parent";
    if (alias !== "inherit-parent" && alias !== "auto") {
      throw new TypeError(`${subject}.alias must be "inherit-parent" or "auto"`);
    }
    return { kind: "inherit", alias };
  }
  if (record["kind"] !== "route") throw new TypeError(`${subject}.kind is unknown`);
  const provider = record["provider"];
  const model = record["model"];
  const effort = record["effort"];
  if (typeof provider !== "string" || provider.trim() === "") {
    throw new TypeError(`${subject}.provider must be a non-empty string`);
  }
  if (typeof model !== "string" || model.trim() === "") {
    throw new TypeError(`${subject}.model must be a non-empty string`);
  }
  if (effort !== undefined && (typeof effort !== "string" || effort.trim() === "")) {
    throw new TypeError(`${subject}.effort must be a non-empty string when present`);
  }
  return {
    kind: "route",
    provider,
    model,
    ...(typeof effort === "string" ? { effort } : {}),
  };
}

/** Parse one save request from the wire. */
export function parseSaveRoleRequest(value: unknown): SaveRoleRequest {
  const record = parseRecord(value, "the save request");
  if (typeof record["key"] !== "string") throw new TypeError("the save request must name a role");
  const routes = record["routes"];
  if (!Array.isArray(routes)) throw new TypeError("the save request must carry a route list");
  return {
    key: record["key"],
    routes: routes.map((route, index) => parseRoute(route, `routes[${index}]`)),
  };
}

function parseRoleFileIssue(value: unknown): RoleFileSnapshot["issues"][number] {
  const record = parseRecord(value, "a role file issue");
  if (typeof record["message"] !== "string")
    throw new TypeError("a role file issue needs a message");
  const line = record["line"];
  if (line !== undefined && typeof line !== "number") {
    throw new TypeError("a role file issue line must be a number");
  }
  return { ...(typeof line === "number" ? { line } : {}), message: record["message"] };
}

function parseRoleView(value: unknown, index: number): RoleFileSnapshot["roles"][number] {
  const record = parseRecord(value, `roles[${index}]`);
  if (typeof record["key"] !== "string")
    throw new TypeError(`roles[${index}].key must be a string`);
  if (record["shape"] !== "single" && record["shape"] !== "list") {
    throw new TypeError(`roles[${index}].shape is unknown`);
  }
  if (typeof record["configured"] !== "boolean") {
    throw new TypeError(`roles[${index}].configured must be a boolean`);
  }
  const routes = record["routes"];
  const issues = record["issues"];
  if (!Array.isArray(routes) || !Array.isArray(issues)) {
    throw new TypeError(`roles[${index}] must carry routes and issues arrays`);
  }
  const line = record["line"];
  return {
    key: record["key"],
    shape: record["shape"],
    configured: record["configured"],
    ...(typeof line === "number" ? { line } : {}),
    routes: routes.map((route, routeIndex) =>
      parseRoute(route, `roles[${index}].routes[${routeIndex}]`),
    ),
    issues: issues.map((issue) => String(issue)),
  };
}

/** Parse a role-file snapshot from the wire. */
export function parseRoleFileSnapshot(value: unknown): RoleFileSnapshot {
  const record = parseRecord(value, "the role file snapshot");
  const status = record["status"];
  if (status !== "missing" && status !== "loaded" && status !== "unreadable") {
    throw new TypeError("the role file snapshot status is unknown");
  }
  if (typeof record["path"] !== "string")
    throw new TypeError("the role file snapshot path must be a string");
  if (typeof record["canSave"] !== "boolean") {
    throw new TypeError("the role file snapshot canSave must be a boolean");
  }
  const roles = record["roles"];
  const issues = record["issues"];
  if (!Array.isArray(roles) || !Array.isArray(issues)) {
    throw new TypeError("the role file snapshot must carry roles and issues arrays");
  }
  const reason = record["reason"];
  const budget = record["budget"];
  return {
    path: record["path"],
    status,
    ...(typeof reason === "string" ? { reason } : {}),
    ...(typeof budget === "string" ? { budget } : {}),
    roles: roles.map((role, index) => parseRoleView(role, index)),
    issues: issues.map(parseRoleFileIssue),
    canSave: record["canSave"],
  };
}

/** Parse a save result from the wire. */
export function parseSaveRoleResult(value: unknown): SaveRoleResult {
  const record = parseRecord(value, "the save result");
  if (record["ok"] === true) {
    return { ok: true, snapshot: parseRoleFileSnapshot(record["snapshot"]) };
  }
  if (record["ok"] === false && typeof record["reason"] === "string") {
    return { ok: false, reason: record["reason"] };
  }
  throw new TypeError("the save result must be ok with a snapshot or refused with a reason");
}

/** Parse the live catalogue the page offers. */
export function parseCatalogue(value: unknown): CatalogueResult {
  const record = parseRecord(value, "the catalogue");
  const providers = record["providers"];
  if (!Array.isArray(providers)) throw new TypeError("the catalogue must carry providers");
  if (typeof record["truncated"] !== "boolean") {
    throw new TypeError("the catalogue truncated flag must be a boolean");
  }
  return {
    providers: providers.map((provider, index) => {
      const entry = parseRecord(provider, `providers[${index}]`);
      if (typeof entry["provider"] !== "string" || typeof entry["name"] !== "string") {
        throw new TypeError(`providers[${index}] needs provider and name strings`);
      }
      const models = entry["models"];
      if (!Array.isArray(models))
        throw new TypeError(`providers[${index}].models must be an array`);
      return {
        provider: entry["provider"],
        name: entry["name"],
        ...(typeof entry["error"] === "string" ? { error: entry["error"] } : {}),
        models: models.map((model, modelIndex) => {
          const item = parseRecord(model, `providers[${index}].models[${modelIndex}]`);
          if (
            typeof item["route"] !== "string" ||
            typeof item["id"] !== "string" ||
            typeof item["name"] !== "string"
          ) {
            throw new TypeError(
              `providers[${index}].models[${modelIndex}] needs route, id, and name strings`,
            );
          }
          const efforts = item["efforts"];
          if (!Array.isArray(efforts) || efforts.some((effort) => typeof effort !== "string")) {
            throw new TypeError(
              `providers[${index}].models[${modelIndex}].efforts must be strings`,
            );
          }
          return {
            route: item["route"],
            id: item["id"],
            name: item["name"],
            ...(typeof item["description"] === "string"
              ? { description: item["description"] }
              : {}),
            ...(typeof item["contextWindow"] === "number"
              ? { contextWindow: item["contextWindow"] }
              : {}),
            ...(typeof item["maxTokens"] === "number" ? { maxTokens: item["maxTokens"] } : {}),
            efforts,
            ...(typeof item["defaultEffort"] === "string"
              ? { defaultEffort: item["defaultEffort"] }
              : {}),
            ...(typeof item["error"] === "string" ? { error: item["error"] } : {}),
          };
        }),
      };
    }),
    truncated: record["truncated"],
  };
}

interface MethodOptions<Input extends object, Output> {
  readonly method: string;
  readonly parameters: readonly InvocationParameterDescriptor[];
  readonly result: StrictCodec<Output>;
  readonly cancellation?: boolean;
  readonly invoke: (
    remote: TypertClientRemote,
    input: Input,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<Output>>;
}

function directMethod<Input extends object, Output>(
  options: MethodOptions<Input, Output>,
): TypertRemoteMethod<Input, Output> {
  const descriptor: InvocationDescriptor = {
    id: `${REMOTE_PACKAGE}#${ROLES_SERVICE}/${options.method}`,
    service: ROLES_SERVICE,
    namespace: ROLES_SERVICE,
    method: options.method,
    invocation: { kind: "direct" },
    parameters: options.parameters,
    result: options.result,
    ...(options.cancellation === true ? { cancellation: { parameter: "signal" } } : {}),
  };
  const input = {
    create(): TypertSchema<Input> {
      return {
        parse(value: unknown): Input {
          const record = parseRecord(value, "the method input");
          const parsed: Record<string, unknown> = {};
          for (const item of options.parameters) {
            if (record[item.wire] !== undefined) {
              const codec = item.codec as StrictCodec<unknown>;
              parsed[item.wire] = codec.create().parse(record[item.wire]);
            }
          }
          return parsed as Input;
        },
      };
    },
  };
  const method = {
    ...descriptor,
    input: () => input,
    invoke(
      remote: TypertClientRemote,
      named: Input,
      signal?: AbortSignal,
    ): Promise<RemoteResult<Output>> {
      const namespace = Reflect.get(remote as object, ROLES_SERVICE) as Record<
        string,
        (...args: unknown[]) => Promise<RemoteResult<Output>>
      >;
      const values = options.parameters.map(
        (item) => (named as Record<string, unknown>)[item.wire],
      );
      if (options.cancellation === true) values.push(signal);
      return namespace[options.method]!(...values);
    },
  };
  return method as TypertRemoteMethod<Input, Output>;
}

const statusMethod = directMethod<Record<string, never>, RoleFileSnapshot>({
  method: "status",
  parameters: [],
  result: jsonCodec("PstackRoleFileSnapshot", parseRoleFileSnapshot, parseRoleFileSnapshot),
  invoke: (remote) =>
    (remote as unknown as PstackRolesNamespace).pstackRoles.status() as Promise<
      RemoteResult<RoleFileSnapshot>
    >,
});

const catalogueMethod = directMethod<Record<string, never>, CatalogueResult>({
  method: "catalogue",
  parameters: [],
  result: jsonCodec("PstackRoleCatalogue", parseCatalogue, parseCatalogue),
  cancellation: true,
  invoke: (remote, _input, signal) =>
    (remote as unknown as PstackRolesNamespace).pstackRoles.catalogue(signal) as Promise<
      RemoteResult<CatalogueResult>
    >,
});

const saveMethod = directMethod<SaveRoleRequest, SaveRoleResult>({
  method: "save",
  parameters: [
    parameter("request", "PstackSaveRoleRequest", (value) => {
      parseSaveRoleRequest(value);
      return value;
    }),
  ],
  result: jsonCodec("PstackSaveRoleResult", parseSaveRoleResult, parseSaveRoleResult),
  cancellation: true,
  invoke: (remote, request, signal) =>
    (remote as unknown as PstackRolesNamespace).pstackRoles.save(request, signal) as Promise<
      RemoteResult<SaveRoleResult>
    >,
});

/** The typed Client face installed by `$mount`. */
export interface PstackRolesNamespace {
  readonly pstackRoles: {
    status(): Promise<RemoteResult<RoleFileSnapshot>>;
    catalogue(signal?: AbortSignal): Promise<RemoteResult<CatalogueResult>>;
    save(request: SaveRoleRequest, signal?: AbortSignal): Promise<RemoteResult<SaveRoleResult>>;
  };
}

/** Mountable contribution the Client passes to `ctx.remote.$mount()`. */
export const pstackRolesRemote: TypertRemoteInfo = {
  package: REMOTE_PACKAGE,
  descriptors: [statusMethod, catalogueMethod, saveMethod] as InvocationDescriptor[],
  methods: {
    [`${ROLES_SERVICE}/status`]: statusMethod,
    [`${ROLES_SERVICE}/catalogue`]: catalogueMethod,
    [`${ROLES_SERVICE}/save`]: saveMethod,
  } as TypertRemoteInfo["methods"],
};

/** The same descriptors registered by the Host as its strict definitions. */
export const pstackRolesContribution: TypertRemoteContribution = pstackRolesRemote;
