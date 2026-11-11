import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import type {
  Assertion,
  BehaviorScenario,
  Phase,
  RunRecord,
  SemanticReview,
  SessionFacts,
  TestTarget,
  ToolCallEvidence,
  Verdict,
} from "../../types.ts";

export interface SessionEvent {
  type: string;
  cwd?: string;
  agentPreset?: string;
  data?: Record<string, unknown>;
}

export interface SessionDigest extends Omit<SessionFacts, "sessionFile" | "autoAnswers"> {
  route: TestTarget | null;
  worker: number;
}

export function readSessionEvents(file: string): SessionEvent[] {
  if (!existsSync(file)) throw new Error(`session log is missing: ${file}`);
  const result = spawnSync("zstdcat", [file], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`cannot decompress session log: ${file}`);
  return (result.stdout ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as SessionEvent];
      } catch {
        return [];
      }
    });
}

function textOfContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
        return (part as { text?: string }).text ?? "";
      }
      return "";
    })
    .join("");
}

/** User-authored message texts in order, ignoring assistant and system messages. */
export function userMessageTexts(events: SessionEvent[]): string[] {
  const texts: string[] = [];
  for (const event of events) {
    if (event.type !== "user/message") continue;
    const source = event.data?.source as { kind?: string } | undefined;
    if (source?.kind !== "user") continue;
    const text = textOfContent(event.data?.content);
    if (text) texts.push(text);
  }
  return texts;
}

export function firstUserText(events: SessionEvent[]): string {
  return userMessageTexts(events)[0] ?? "";
}

/**
 * Whether a session log answers `prompt`. The first turn opens the session, so its prompt
 * must be the session's first user message. That first message stays fixed on every later
 * turn, so a later turn knows its prompt landed when any user message carries it rather than
 * re-reading the first one and failing forever.
 */
export function sessionMatchesPrompt(
  events: SessionEvent[],
  prompt: string,
  isFirstTurn: boolean,
): boolean {
  if (isFirstTurn) return firstUserText(events).includes(prompt);
  return userMessageTexts(events).some((text) => text.includes(prompt));
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw as Record<string, unknown>) ?? {};
}

/**
 * Assistant text per turn. Messages inside one turn keep the plain "\n" join; a later
 * turn with assistant output gets a delimiter header so a reviewer can attribute every
 * reply span to the turn that produced it.
 */
function joinAssistantTurns(turns: string[][]): string {
  const chunks: string[] = [];
  for (const [index, parts] of turns.entries()) {
    const joined = parts.join("\n");
    if (!joined) continue;
    chunks.push(index === 0 ? joined : `--- turn ${index + 1} ---\n\n${joined}`);
  }
  return chunks.join("\n\n");
}

export function digestEvents(events: SessionEvent[], sessionId: string, worker = 0): SessionDigest {
  const toolCalls: ToolCallEvidence[] = [];
  const callsById = new Map<string, ToolCallEvidence>();
  const skillCallById = new Map<string, string>();
  const skillLoads: string[] = [];
  let workspacePath: string | null = null;
  let agentPreset: string | null = null;
  let route: TestTarget | null = null;
  let turnEndReason: string | null = null;
  const assistantTurns: string[][] = [[]];
  for (const event of events) {
    const data = event.data ?? {};
    switch (event.type) {
      case "session": {
        if (typeof event.cwd === "string") workspacePath = event.cwd;
        if (typeof event.agentPreset === "string") agentPreset = event.agentPreset;
        break;
      }
      case "agent-preset/selected": {
        if (typeof data.agentPreset === "string") agentPreset = data.agentPreset;
        break;
      }
      case "request/header": {
        if (route) break;
        const config = (
          data.header as
            | { config?: { provider?: string; model?: string; reasoningEffort?: string } }
            | undefined
        )?.config;
        if (config?.provider && config.model) {
          route = {
            provider: config.provider,
            model: config.model,
            effort: config.reasoningEffort ?? "",
          };
        }
        break;
      }
      case "tool/call": {
        const name = typeof data.name === "string" ? data.name : "";
        const callId = typeof data.callId === "string" ? data.callId : "";
        const call = { name, status: "pending" };
        toolCalls.push(call);
        callsById.set(callId, call);
        if (["skill", "pstack_skill", "pstack-skill"].includes(name)) {
          const args = parseArguments(data.arguments);
          const skill = typeof args.name === "string" ? args.name : "";
          const resource = typeof args.resource === "string" ? args.resource : "";
          if (skill) skillCallById.set(callId, resource ? `${skill}#${resource}` : skill);
        }
        break;
      }
      case "tool/result": {
        const message = data.message as
          | { isError?: boolean; content?: unknown; toolCallId?: string }
          | undefined;
        const rawCallId = data.toolCallId ?? message?.toolCallId;
        const call = callsById.get(typeof rawCallId === "string" ? rawCallId : "");
        if (!message || !call) break;
        if (message.isError === true) {
          call.status = "error";
          call.errorText = textOfContent(message.content).slice(0, 2000);
        } else {
          call.status = "ok";
          const loaded = skillCallById.get(rawCallId as string);
          if (loaded) skillLoads.push(loaded);
        }
        break;
      }
      case "assistant/message": {
        const text = textOfContent((data.message as { content?: unknown } | undefined)?.content);
        if (text) assistantTurns[assistantTurns.length - 1].push(text);
        break;
      }
      case "turn/end": {
        const reason = data.reason as { kind?: string } | undefined;
        turnEndReason = reason?.kind ?? null;
        assistantTurns.push([]);
        break;
      }
      default:
        break;
    }
  }
  const userTexts = userMessageTexts(events);
  return {
    sessionId,
    workspacePath,
    agentPreset,
    skillLoads,
    toolCalls,
    turnEndReason,
    assistantText: joinAssistantTurns(assistantTurns),
    userText: userTexts[0] ?? "",
    userTexts,
    route,
    worker,
  };
}

export function digestSession(file: string, sessionId: string, worker = 0): SessionDigest {
  const events = readSessionEvents(file);
  if (events.length === 0) throw new Error(`session file has no readable events: ${file}`);
  return digestEvents(events, sessionId, worker);
}

/** Resolve an artifact path inside the workspace, or null when it escapes. */
function resolveInWorkspace(workspace: string, relative: string): string | null {
  const target = resolve(workspace, relative);
  return target === workspace || target.startsWith(`${workspace}/`) ? target : null;
}

function directoryHasFiles(directory: string): boolean {
  return readdirSync(directory, { recursive: true, withFileTypes: true }).some((entry) =>
    entry.isFile(),
  );
}

export function evaluateAssertions(
  assertions: Assertion[],
  session: SessionFacts,
  workspace: string,
): string[] {
  const failures: string[] = [];
  for (const assertion of assertions) {
    switch (assertion.kind) {
      case "turn-completed": {
        if (session.turnEndReason !== "completed") {
          failures.push(`turn ended with ${session.turnEndReason ?? "no turn/end"}`);
        }
        break;
      }
      case "skill-loaded": {
        const loaded = session.skillLoads.some((entry) => entry.split("#")[0] === assertion.skill);
        if (!loaded) failures.push(`process evidence: ${assertion.skill} was not loaded`);
        break;
      }
      case "no-tool-error": {
        const errors = session.toolCalls.filter((call) => call.status === "error");
        if (errors.length > 0)
          failures.push(`tool errors: ${errors.map((call) => call.name).join(", ")}`);
        break;
      }
      case "artifact-contains": {
        const target = resolveInWorkspace(workspace, assertion.path);
        if (target === null) {
          failures.push(`artifact escapes workspace: ${assertion.path}`);
        } else if (!existsSync(target)) {
          failures.push(`missing artifact: ${assertion.path}`);
        } else if (!readFileSync(target, "utf8").includes(assertion.text)) {
          failures.push(`artifact ${assertion.path} lacks ${JSON.stringify(assertion.text)}`);
        }
        break;
      }
      case "artifact-dir-nonempty": {
        const target = resolveInWorkspace(workspace, assertion.path);
        if (target === null) {
          failures.push(`artifact escapes workspace: ${assertion.path}`);
        } else if (!existsSync(target) || !statSync(target).isDirectory()) {
          failures.push(`missing artifact directory: ${assertion.path}`);
        } else if (!directoryHasFiles(target)) {
          failures.push(`artifact directory has no files: ${assertion.path}`);
        }
        break;
      }
      case "assistant-contains": {
        if (!session.assistantText.includes(assertion.text)) {
          failures.push(`assistant reply lacks ${JSON.stringify(assertion.text)}`);
        }
        break;
      }
    }
  }
  return failures;
}

export function pendingSemanticReview(): SemanticReview {
  return {
    status: "pending",
    reason: "No reviewer has compared the observed effect with the scenario rubric.",
  };
}

export function verdictFor(input: {
  phase: Phase;
  failures: string[];
  semanticReview: SemanticReview;
  blockedReason?: string;
}): Verdict {
  if (input.blockedReason) {
    return input.phase === "raw"
      ? { phase: "raw", status: "blocked", reason: input.blockedReason }
      : { phase: "adapted", status: "inconclusive", reason: input.blockedReason };
  }
  if (input.semanticReview.status === "pending" || input.semanticReview.status === "inconclusive") {
    const reason = input.semanticReview.reason;
    return input.phase === "raw"
      ? { phase: "raw", status: "unobserved", reason }
      : { phase: "adapted", status: "inconclusive", reason };
  }
  if (input.phase === "raw") {
    return input.failures.length > 0 || input.semanticReview.status === "gap"
      ? { phase: "raw", status: "gap", gaps: [...input.failures, input.semanticReview.reason] }
      : { phase: "raw", status: "observed", gaps: [] };
  }
  return input.failures.length === 0 && input.semanticReview.status === "supported"
    ? { phase: "adapted", status: "verified" }
    : {
        phase: "adapted",
        status: "not-verified",
        failures: [...input.failures, input.semanticReview.reason],
      };
}

export function assertSafeRecord(record: RunRecord, apiKeys: string[]): void {
  const serialized = JSON.stringify(record);
  for (const apiKey of apiKeys) {
    if (apiKey && serialized.includes(apiKey)) throw new Error("RunRecord contains an apiKey");
  }
}

/** Narrow parsed JSON to a RunRecord so worker state files beside evidence are skipped. */
export function isRunRecord(value: unknown): value is RunRecord {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<RunRecord> & { environment?: { matrix?: { id?: unknown } } };
  return (
    typeof candidate.scenarioId === "string" &&
    (candidate.phase === "raw" || candidate.phase === "adapted") &&
    typeof candidate.environment === "object" &&
    candidate.environment !== null &&
    typeof candidate.environment.matrix?.id === "string" &&
    typeof candidate.capturedAt === "string"
  );
}

export function latestRecords(records: RunRecord[]): RunRecord[] {
  const latest = new Map<string, RunRecord>();
  for (const record of records) {
    const key = `${record.scenarioId}\0${record.phase}\0${record.environment.matrix.id}`;
    const current = latest.get(key);
    if (!current || record.capturedAt > current.capturedAt) latest.set(key, record);
  }
  return [...latest.values()];
}

export function sessionFacts(
  digest: SessionDigest,
  file: string,
  autoAnswers: SessionFacts["autoAnswers"],
): SessionFacts {
  return {
    sessionId: digest.sessionId,
    sessionFile: file,
    workspacePath: digest.workspacePath,
    agentPreset: digest.agentPreset,
    skillLoads: digest.skillLoads,
    toolCalls: digest.toolCalls,
    turnEndReason: digest.turnEndReason,
    assistantText: digest.assistantText,
    userText: digest.userText,
    userTexts: digest.userTexts,
    autoAnswers,
  };
}

export function assertExpectedEntry(
  scenario: BehaviorScenario,
  session: SessionFacts,
  target: TestTarget,
  expectedPreset: string,
): string[] {
  const failures: string[] = [];
  if (session.userText !== scenario.turns[0]?.prompt)
    failures.push("natural-language entry differs");
  if (session.agentPreset !== expectedPreset) failures.push(`expected preset ${expectedPreset}`);
  if (!target.provider || !target.model || !target.effort)
    failures.push("actual model route is missing");
  return failures;
}

export function assertSameEntry(
  raw: RunRecord,
  adapted: RunRecord,
  scenario: BehaviorScenario,
): string[] {
  const failures: string[] = [];
  if (raw.scenarioId !== scenario.id || adapted.scenarioId !== scenario.id) {
    failures.push("records do not belong to the selected scenario");
  }
  if (raw.environment.configHash !== adapted.environment.configHash) {
    failures.push("raw and adapted configuration hashes differ");
  }
  if (raw.environment.upstreamRevision !== adapted.environment.upstreamRevision) {
    failures.push("raw and adapted upstream revisions differ");
  }
  if (JSON.stringify(raw.target) !== JSON.stringify(adapted.target)) {
    failures.push("raw and adapted actual model routes differ");
  }
  if (
    raw.session?.userText !== scenario.turns[0]?.prompt ||
    adapted.session?.userText !== scenario.turns[0]?.prompt
  ) {
    failures.push("raw and adapted natural-language entries differ from the scenario");
  }
  return failures;
}

export function expectedWorkspace(workspace: string, session: SessionFacts): string[] {
  return session.workspacePath !== null && session.workspacePath !== workspace
    ? [`session ran in ${session.workspacePath}, expected ${workspace}`]
    : [];
}

/**
 * Every mechanical check result of one run, independent of the semantic review. The
 * verdict may sit at unobserved/inconclusive while a review is pending, but this list
 * is always written to the record so the pending verdict hides nothing.
 */
export function mechanicalFailures(input: {
  scenario: BehaviorScenario;
  session: SessionFacts;
  workspace: string;
  route: TestTarget | null;
  expectedTarget: TestTarget;
  expectedPreset: string;
}): string[] {
  const failures = [
    ...evaluateAssertions(input.scenario.assertions, input.session, input.workspace),
    ...expectedWorkspace(input.workspace, input.session),
    ...assertExpectedEntry(
      input.scenario,
      input.session,
      input.route ?? { provider: "", model: "", effort: "" },
      input.expectedPreset,
    ),
  ];
  const expectedRoute = {
    provider: input.expectedTarget.provider,
    model: input.expectedTarget.model,
    effort: input.expectedTarget.effort,
  };
  if (JSON.stringify(input.route ?? null) !== JSON.stringify(expectedRoute)) {
    failures.push("actual model route differs from testModel");
  }
  return failures;
}

export function recordFileName(
  scenarioId: string,
  phase: Phase,
  environmentId: string,
  stamp: string,
): string {
  return `${scenarioId}-${phase}-${environmentId}-${stamp}.json`;
}

export function archivedRecordPath(root: string, record: RunRecord): string {
  return join(root, record.environment.matrix.id, record.phase, `${record.scenarioId}.json`);
}
