import { statSync } from "node:fs";
import {
  readSessionEvents,
  listSessionFiles,
  type SessionEvent,
  type SessionFile,
} from "../storage/sessions.ts";
import { sessionMatchesPrompt } from "../evidence/session-facts.ts";
import { runtimeSettings } from "../config/runtime.ts";
import type { WorkerPaths } from "../worker/worker.ts";
export const POLL_INTERVAL_MS = 2_000;
export const SETTLE_WINDOW_MS = 5_000;
export function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sessionSignature(file: string): string {
  const events = readSessionEvents(file);
  return `${events.length}:${events.at(-1)?.type ?? "none"}`;
}

export function waitForSettledSession(
  file: string,
  scenarioDeadline: number,
  checkStopped: () => void,
): void {
  const deadline = Math.min(Date.now() + runtimeSettings().turnTimeoutMs, scenarioDeadline);
  let signature = sessionSignature(file);
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    checkStopped();
    sleep(POLL_INTERVAL_MS);
    const events = readSessionEvents(file);
    const next = `${events.length}:${events.at(-1)?.type ?? "none"}`;
    if (next !== signature) {
      signature = next;
      stableSince = Date.now();
      continue;
    }
    if (Date.now() - stableSince >= SETTLE_WINDOW_MS) return;
  }
  throw new Error("scenario deadline exceeded while waiting for session to settle");
}

function eventText(event: SessionEvent): string {
  const content = (event.data as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part && typeof part === "object" && (part as { type?: string }).type === "text"
        ? ((part as { text?: string }).text ?? "")
        : "",
    )
    .join("");
}

/**
 * Async subagents finish after the main turn ended and then start a follow-up turn.
 * Capture must wait until every spawned subagent reports finished, so the record and
 * screenshot include the completion result instead of stopping at the dispatch notice.
 */
export function activeSubagentCount(events: readonly SessionEvent[]): number {
  // rc.2 addresses children by name and its completion notice reads
  // "Background subagent <name>". Older runtimes used the Session id. Track both
  // handles per cataloged child and accept a finish notice that carries either.
  // Workflow children never emit that notice; their run ends with a run-end event.
  const handles = new Map<string, Set<string>>();
  const finished = new Set<string>();
  const workflowChildren = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.type === "subagent/catalog") {
      const data = event.data as { childId?: unknown; name?: unknown } | undefined;
      const childId = typeof data?.childId === "string" ? data.childId : undefined;
      if (childId === undefined) continue;
      const set = handles.get(childId) ?? new Set<string>();
      set.add(childId);
      if (typeof data?.name === "string" && data.name !== "") set.add(data.name);
      handles.set(childId, set);
      continue;
    }
    if (event.type === "tool-workflow/agent-start") {
      const data = event.data as { runId?: unknown; childId?: unknown } | undefined;
      if (typeof data?.runId !== "string" || typeof data?.childId !== "string") continue;
      const set = workflowChildren.get(data.runId) ?? new Set<string>();
      set.add(data.childId);
      workflowChildren.set(data.runId, set);
      continue;
    }
    if (event.type === "tool-workflow/run-end") {
      const data = event.data as { runId?: unknown } | undefined;
      if (typeof data?.runId !== "string") continue;
      for (const childId of workflowChildren.get(data.runId) ?? []) finished.add(childId);
      continue;
    }
    if (event.type !== "user/message") continue;
    const text = eventText(event);
    for (const [childId, names] of handles) {
      if (finished.has(childId)) continue;
      for (const handle of names) {
        if (text.includes(`Background subagent ${handle}`) && /finished|was stopped/.test(text)) {
          finished.add(childId);
          break;
        }
      }
    }
  }
  return handles.size - finished.size;
}

export function waitForSubagentsSettled(
  file: string,
  scenarioDeadline: number,
  checkStopped: () => void,
): void {
  const deadline = Math.min(Date.now() + runtimeSettings().subagentTimeoutMs, scenarioDeadline);
  let signature = sessionSignature(file);
  let stableSince = Date.now();
  for (;;) {
    checkStopped();
    if (Date.now() > deadline) throw new Error("subagents did not settle before capture");
    sleep(POLL_INTERVAL_MS);
    const events = readSessionEvents(file);
    const next = `${events.length}:${events.at(-1)?.type ?? "none"}`;
    if (next !== signature) {
      signature = next;
      stableSince = Date.now();
      continue;
    }
    if (activeSubagentCount(events) === 0 && Date.now() - stableSince >= SETTLE_WINDOW_MS) {
      return;
    }
  }
}

export function findMatchingSession(
  paths: WorkerPaths,
  before: Set<string>,
  startedAtMs: number,
  prompt: string,
): SessionFile | null {
  for (const { id, file } of listSessionFiles(paths)) {
    if (before.has(id) && statSync(file).mtimeMs < startedAtMs - 2000) continue;
    const events = readSessionEvents(file);
    const header = events.find((event) => event.type === "session");
    // Only the root session answers a scenario prompt. A delegated child shares the
    // workspace and often echoes the prompt, so matching it would capture the child
    // instead of the orchestrator.
    if (
      header !== undefined &&
      (header.origin === "subagent" || (header.delegationDepth ?? 0) > 0)
    ) {
      continue;
    }
    if (sessionMatchesPrompt(events, prompt, true)) return { id, file };
  }
  return null;
}
