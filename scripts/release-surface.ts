#!/usr/bin/env node
// Export the stable public tool surface from the tool factories to src/surface.json.
//
// Each factory only reads its own tool schema, so a stub runtime is enough; no
// live DSH service or real $DSH_HOME is read here.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import { format } from "vite-plus/fmt";

import { createPstackModelsTool } from "../src/models.ts";
import { createPstackRolesTool } from "../src/role-catalog.ts";
import { createPstackInterruptTool, createPstackSubagentTool } from "../src/subagent.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SURFACE_PATH = join(ROOT, "src", "surface.json");

/** A value the factories never dereference; they read only their tool schema. */
const STUB = undefined as never;

export interface SurfaceTool {
  readonly name: string;
  readonly parameters: Record<string, unknown>;
}

export interface Surface {
  readonly tools: readonly SurfaceTool[];
}

export function buildSurface(): Surface {
  const definitions: ToolDefinition[] = [
    createPstackSubagentTool(STUB),
    createPstackInterruptTool(STUB),
    createPstackModelsTool(STUB),
    createPstackRolesTool("/nonexistent-dsh-home"),
  ];
  const tools = definitions
    .map((definition) => ({ name: definition.name, parameters: definition.parameters }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return { tools };
}

/** Serialize through the repo formatter so the file matches `vp check`. */
async function renderSurface(surface: Surface): Promise<string> {
  const result = await format(SURFACE_PATH, `${JSON.stringify(surface, null, 2)}\n`);
  if (result.errors.length > 0) {
    throw new Error(`cannot format src/surface.json: ${result.errors[0]?.message ?? "unknown"}`);
  }
  return result.code;
}

function diffSummary(text: string, surface: Surface): string {
  let previous: Surface;
  try {
    previous = JSON.parse(text) as Surface;
  } catch {
    return "src/surface.json is not valid JSON.";
  }
  const before = new Map(previous.tools.map((tool) => [tool.name, tool]));
  const after = new Map(surface.tools.map((tool) => [tool.name, tool]));
  const lines: string[] = [];
  for (const name of after.keys()) {
    if (!before.has(name)) lines.push(`+ tool ${name}`);
  }
  for (const name of before.keys()) {
    if (!after.has(name)) lines.push(`- tool ${name}`);
  }
  for (const [name, tool] of after) {
    const old = before.get(name);
    if (old !== undefined && JSON.stringify(old.parameters) !== JSON.stringify(tool.parameters)) {
      lines.push(`~ tool ${name} parameters`);
    }
  }
  return lines.length === 0 ? "surface content differs only in formatting." : lines.join("\n");
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const surface = buildSurface();
  const text = await renderSurface(surface);
  if (argv.includes("--check")) {
    let current: string;
    try {
      current = readFileSync(SURFACE_PATH, "utf8");
    } catch {
      console.error("src/surface.json is missing; run vpx scripts/release-surface.ts --write");
      return 1;
    }
    if (current === text) {
      console.log(`Tool surface current (${surface.tools.length} tools).`);
      return 0;
    }
    console.error(`Tool surface is stale:\n${diffSummary(current, surface)}`);
    return 1;
  }
  if (argv.includes("--write")) {
    writeFileSync(SURFACE_PATH, text);
    console.log(`Wrote ${surface.tools.length} tools to src/surface.json.`);
    return 0;
  }
  process.stdout.write(text);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
