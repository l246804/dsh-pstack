import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Phase, Verdict } from "../../types.ts";
import { workersDirectory } from "./run-metadata.ts";

export interface ProgressState {
  phase: Phase;
  environmentId: string;
  round: number;
  total: number;
  done: number;
  statuses: Record<Verdict["status"], number>;
  running: Array<{ worker: number; scenarioId: string }>;
  startedAt: string;
  updatedAt: string;
  perWorker: Record<string, { done: number; total: number }>;
  failures: Array<{ scenarioId: string; worker: number; reason: string }>;
  workers: number;
}

export function progressFilePath(environmentId: string, phase: Phase): string {
  return join(workersDirectory(), environmentId, `${phase}-progress.json`);
}

export function readProgress(file: string): ProgressState | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ProgressState) : null;
}

export function writeProgress(file: string, state: ProgressState): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, file);
}

export function updateProgress(file: string, mutate: (state: ProgressState) => void): void {
  const state = readProgress(file);
  if (!state) throw new Error(`no progress file at ${file}`);
  mutate(state);
  state.updatedAt = new Date().toISOString();
  writeProgress(file, state);
}
