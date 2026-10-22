/**
 * Read `~/.dsh/pstack-models.md`, the role file `/setup-pstack` writes.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseModelConfigWithIssues, type RoleIssue, type RoleTable } from "./roles.ts";

export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

export function modelConfigPath(): string {
  return join(dshHome(), "pstack-models.md");
}

export interface LoadedRoleTable {
  readonly table: RoleTable;
  /** Parse problems, each tied to a line of the file. */
  readonly issues: readonly RoleIssue[];
  /** True when the file exists but could not be read. */
  readonly unreadable: boolean;
}

/**
 * Read the role file.
 *
 * A missing file is normal and means every role inherits the parent route. A
 * malformed line degrades only that line, and the issues travel with the table
 * so the tool can name them in its reply. A read failure keeps that distinction
 * explicit instead of collapsing into an empty table.
 */
export async function loadRoleTable(): Promise<LoadedRoleTable> {
  try {
    const source = await readFile(modelConfigPath(), "utf8");
    const { table, issues } = parseModelConfigWithIssues(source);
    return { table, issues, unreadable: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { table: new Map(), issues: [], unreadable: false };
    }
    return {
      table: new Map(),
      issues: [
        {
          line: 0,
          message: `could not read ${modelConfigPath()}: ${(error as Error).message}`,
        },
      ],
      unreadable: true,
    };
  }
}
