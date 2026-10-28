/**
 * `pstack_skill`: the trusted skill loader for pstack's own instructions.
 *
 * pstack hides most of its skills from the model catalog: `how`, `why`, `architect`,
 * `arena`, and the principle skills all declare `disable-model-invocation: true`, so
 * `poteto-mode` cannot route to them through DSH's `skill` tool. The registry's
 * `get()` is deliberately usable by trusted callers without that policy, which is the
 * public seam this tool consumes. It accepts a skill name, not a path, so a call can
 * only load a skill the package itself registered.
 *
 * The optional `resource` argument reads one file below the skill's directory. It is a
 * convenience for the references and playbooks that live beside `SKILL.md`; the path is
 * resolved and checked against the skill directory before reading, so `../` cannot
 * escape it.
 */

import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import type {
  Agent,
  JsonSchemaNode,
  SkillDefinition,
  SkillResourceBase,
  ToolDefinition,
  ToolRunContext,
  ToolsHost,
} from "./internal/host-contract.ts";

/** Model-facing tool name. */
export const TOOL_NAME = "pstack_skill";

/** Cordis row name, used by Loader diagnostics. */
export const name = "pstack-skill";

/** The tool registry and the skill registry. */
export const inject = ["skills", "tools"];

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The slice of `ctx.skills` this tool reads. */
export interface SkillsHost {
  get(
    name: string,
    options?: { readonly cwd?: string; readonly signal?: AbortSignal; readonly scope?: Agent },
  ): Promise<SkillDefinition | undefined>;
}

export interface PstackSkillHost {
  readonly skills: SkillsHost;
  readonly tools: ToolsHost;
}

export interface SkillResourceResult {
  readonly path: string;
  readonly content: string;
}

export interface LoadSkillResult {
  readonly name: string;
  readonly provider: string;
  readonly resourceBase?: SkillResourceBase;
  readonly content: string;
  readonly resource?: SkillResourceResult;
}

/** Render one loaded skill in the canonical `<skill_content>` shape. */
export function renderLoadedSkill(result: LoadSkillResult): string {
  const lines = [`<skill_content name="${escapeAttr(result.name)}">`, "<skill_resources>"];
  if (result.resourceBase === undefined) {
    lines.push(
      `Resources for this skill are managed by provider "${escapeText(result.provider)}".`,
      "Load referenced resources only as needed.",
    );
  } else if (result.resourceBase.kind === "directory") {
    lines.push(
      `Base directory for this skill: ${escapeText(result.resourceBase.path)}`,
      "Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.",
    );
  } else if (result.resourceBase.kind === "url") {
    lines.push(
      `Base URL for this skill: ${escapeText(result.resourceBase.url)}`,
      "Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.",
    );
  } else {
    lines.push(
      `Resources for this skill: ${escapeText(result.resourceBase.description)}`,
      "Load referenced resources only as needed.",
    );
  }
  lines.push(
    "</skill_resources>",
    "",
    "<skill_instructions>",
    result.content,
    "</skill_instructions>",
  );
  if (result.resource !== undefined) {
    lines.push(
      "",
      `<skill_resource path="${escapeAttr(result.resource.path)}">`,
      result.resource.content,
      "</skill_resource>",
    );
  }
  lines.push("</skill_content>");
  return lines.join("\n");
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Read one resource below a directory skill, refusing traversal and absolute paths. */
export async function readSkillResource(
  definition: SkillDefinition,
  resource: string,
): Promise<SkillResourceResult> {
  const base = definition.resourceBase;
  if (base === undefined || base.kind !== "directory") {
    throw new Error(`skill "${definition.name}" does not expose a directory resource base`);
  }
  if (resource.trim() === "" || resource.includes("\0")) {
    throw new Error("resource must be a non-empty relative path");
  }
  if (resource.startsWith("/") || resource.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(resource)) {
    throw new Error(`resource "${resource}" must be relative to the skill directory`);
  }
  const root = resolve(base.path);
  const target = resolve(root, resource);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`resource "${resource}" escapes the skill directory`);
  }
  try {
    return { path: resource, content: await readFile(target, "utf8") };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") {
      throw new Error(`resource "${resource}" is not available for skill "${definition.name}"`);
    }
    throw error;
  }
}

const OUTPUT_SCHEMA: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    provider: { type: "string" },
    resourceBase: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", const: "directory" },
            path: { type: "string" },
          },
          required: ["kind", "path"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", const: "url" },
            url: { type: "string" },
          },
          required: ["kind", "url"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", const: "opaque" },
            description: { type: "string" },
          },
          required: ["kind", "description"],
        },
      ],
    },
    content: { type: "string" },
    resource: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  required: ["name", "provider", "content"],
};

const TOOL_DESCRIPTION = [
  "Load the full instructions of any pstack skill by name, including skills hidden from the model catalog.",
  "",
  "Use this when a pstack skill tells you to route through another pstack skill (for example how, why, or architect) and the `skill` tool reports that it is unavailable because the skill disables model invocation.",
  "",
  "Pass `resource` with a path relative to the skill directory to read one reference or playbook beside its SKILL.md. The path cannot leave the skill directory.",
].join("\n");

/** Build the tool definition. Exported so tests can drive `execute` directly. */
export function createPstackSkillTool(skills: SkillsHost): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          description: "Exact kebab-case skill name, such as `how` or `principle-prove-it-works`.",
        },
        resource: {
          type: "string",
          description:
            "Optional path relative to the skill directory, such as `references/explorer-prompt.md`.",
        },
      },
      required: ["name"],
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [
        { type: "text", text: renderLoadedSkill(value as unknown as LoadSkillResult) },
      ],
    },
    isConcurrencySafe: () => true,
    async execute(rawArgs, exec: ToolRunContext) {
      const args = rawArgs as { name?: unknown; resource?: unknown };
      if (typeof args.name !== "string" || !SKILL_NAME.test(args.name)) {
        throw new Error(`invalid skill name "${String(args.name)}"`);
      }
      if (args.resource !== undefined && typeof args.resource !== "string") {
        throw new Error("resource must be a string when present");
      }
      const definition = await skills.get(args.name, {
        signal: exec.signal,
        ...(exec.agent === undefined ? {} : { scope: exec.agent }),
      });
      if (definition === undefined) {
        throw new Error(`skill "${args.name}" is unknown or no longer available`);
      }
      const result: LoadSkillResult = {
        name: definition.name,
        provider: definition.provider,
        ...(definition.resourceBase === undefined ? {} : { resourceBase: definition.resourceBase }),
        content: definition.content,
        ...(args.resource === undefined
          ? {}
          : { resource: await readSkillResource(definition, args.resource) }),
      };
      return result;
    },
  };
}

/** Register `pstack_skill` on one row. */
export function apply(ctx: PstackSkillHost): void {
  ctx.tools.register(createPstackSkillTool(ctx.skills));
}
