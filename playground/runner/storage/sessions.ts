import { zstdDecompressSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WorkerPaths } from "../worker/worker.ts";
export interface SessionEvent {
  type: string;
  seq?: number;
  time?: number;
  cwd?: string;
  agentPreset?: string;
  /** Provenance on the `session` header: delegated children carry "subagent". */
  origin?: string;
  /** Delegation depth on the `session` header: root is 0, children are 1 or more. */
  delegationDepth?: number;
  parentSession?: string;
  data?: Record<string, unknown>;
}

export function readSessionEvents(file: string): SessionEvent[] {
  if (!existsSync(file)) throw new Error(`session log is missing: ${file}`);
  const text = zstdDecompressSync(readFileSync(file)).toString("utf8");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line) as SessionEvent;
      } catch (error) {
        throw new Error(
          `invalid session event at line ${index + 1} in ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
}

export interface SessionFile {
  id: string;
  file: string;
}

export function listSessionFiles(paths: Pick<WorkerPaths, "home">): SessionFile[] {
  const root = join(paths.home, "sessions");
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((slug) => {
    const directory = join(root, slug);
    if (!statSync(directory).isDirectory()) return [];
    return readdirSync(directory).flatMap((id) => {
      const file = join(directory, id, "session.v4.jsonl.zstd");
      return existsSync(file) ? [{ id, file }] : [];
    });
  });
}

export function latestSessionFile(
  paths: Pick<WorkerPaths, "home">,
  options: { scenarioId?: string; rootOnly?: boolean; startedAt?: string } = {},
): SessionFile | null {
  const files = listSessionFiles(paths).filter((entry) => {
    if (options.scenarioId !== undefined && !entry.file.includes(options.scenarioId)) return false;
    if (options.startedAt !== undefined) {
      const started = Date.parse(options.startedAt);
      if (!Number.isFinite(started) || statSync(entry.file).mtimeMs < started) return false;
    }
    if (!options.rootOnly) return true;
    const header = readSessionEvents(entry.file).find((event) => event.type === "session");
    return header?.origin !== "subagent" && (header?.delegationDepth ?? 0) === 0;
  });
  files.sort((left, right) => statSync(right.file).mtimeMs - statSync(left.file).mtimeMs);
  return files[0] ?? null;
}
