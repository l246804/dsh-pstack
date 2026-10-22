/**
 * Read `~/.dsh/pstack-models.md`, the role file `/setup-pstack` writes.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseModelConfig, type RoleTable } from "./roles.ts";

export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

export function modelConfigPath(): string {
  return join(dshHome(), "pstack-models.md");
}

/**
 * Read the role file. A missing file is normal and means every role inherits
 * the parent route; a malformed file degrades the same way instead of failing
 * a delegation.
 */
export async function loadRoleTable(): Promise<RoleTable> {
  try {
    return parseModelConfig(await readFile(modelConfigPath(), "utf8"));
  } catch {
    return new Map();
  }
}
