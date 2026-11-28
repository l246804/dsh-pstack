import { SKILL_TOOL_NAMES } from "../types.ts";
import type { SessionFacts, TestTarget, ToolCallEvidence } from "../types.ts";
import { readSessionEvents, type SessionEvent } from "../storage/sessions.ts";
export interface SessionDigest extends Omit<SessionFacts, "sessionFile" | "autoAnswers"> {
  route: TestTarget | null;
  worker: number;
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
    } catch (error) {
      throw new Error(
        `invalid tool arguments: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (raw === null || typeof raw !== "object") {
    throw new Error("tool arguments must be an object or JSON string");
  }
  return raw as Record<string, unknown>;
}

/**
 * The argument keys an auditor needs to see: file paths for write/read tools, the
 * command for shell tools, targets for search and fetch tools. Everything else
 * (contents, env blobs, credential parameters) stays out of the record by omission.
 */
const SUMMARIZED_ARGUMENT_KEYS = [
  "file_path",
  "path",
  "command",
  "pattern",
  "query",
  "url",
  "name",
  "resource",
];
const ARGS_SUMMARY_LIMIT = 200;

export function summarizeToolArguments(name: string, raw: unknown): string {
  const args = parseArguments(raw);
  const parts: string[] = [];
  for (const key of SUMMARIZED_ARGUMENT_KEYS) {
    const value = args[key];
    if (typeof value !== "string" || value.trim() === "") continue;
    parts.push(`${key}=${value.replace(/\s+/g, " ").trim()}`);
  }
  return (parts.length === 0 ? name : `${name} ${parts.join(" ")}`).slice(0, ARGS_SUMMARY_LIMIT);
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
        const call: ToolCallEvidence = {
          name,
          status: "pending",
          argsSummary: summarizeToolArguments(name, data.arguments),
        };
        toolCalls.push(call);
        callsById.set(callId, call);
        if (SKILL_TOOL_NAMES.some((tool) => tool === name)) {
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
      case "user/message": {
        const text = textOfContent(data.content);
        for (const match of text.matchAll(/<skill_content name="([^"]+)">/g)) {
          const loaded = `${match[1]}#user-gesture`;
          if (!skillLoads.includes(loaded)) skillLoads.push(loaded);
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
