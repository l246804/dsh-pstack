import type { RunRecord } from "../types.ts";
import { EVIDENCE_FILES } from "./evidence-files.ts";

const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{8,}/g, "<REDACTED_API_KEY>"],
  [/gh[pousr]_[A-Za-z0-9_]{8,}/g, "<REDACTED_GITHUB_TOKEN>"],
  [/github_pat_[A-Za-z0-9_]{8,}/g, "<REDACTED_GITHUB_TOKEN>"],
  [/AKIA[0-9A-Z]{12,}/g, "<REDACTED_AWS_KEY>"],
  [/Bearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer <REDACTED_TOKEN>"],
  [/\btoken=[A-Za-z0-9._~%+-]{4,}/g, "token=<REDACTED_TOKEN>"],
  [/\b(TOK|TOKEN)=[A-Za-z0-9._~%+-]{8,}/g, "$1=<REDACTED_TOKEN>"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "<REDACTED_PRIVATE_KEY>"],
];

const PATH_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\/home\/[^\s"'\\]*/g, "<HOST_PATH>"],
  [/\/tmp\/[^\s"'\\]*/g, "<TEMP_PATH>"],
  [/\/Users\/[^\s"'\\]*/g, "<HOST_PATH>"],
  [/[A-Za-z]:\\\\[^\s"'\\]+/g, "<HOST_PATH>"],
  // DSH session directory keys encode the workspace path with "/" replaced by "-",
  // so a home login name shows up as `--home-<name>-...` (or `--Users-<name>-...`
  // on macOS) and survives the absolute-path patterns above.
  [/(--home-)[A-Za-z0-9._]+(?=-)/g, "$1<REDACTED_USER>"],
  [/(--Users-)[A-Za-z0-9._]+(?=-)/g, "$1<REDACTED_USER>"],
];

export function sanitizeDeep(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeDeep(entry),
      ]),
    );
  }
  return value;
}

function sanitizeText(value: string): string {
  return [...SECRET_PATTERNS, ...PATH_PATTERNS].reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}

export function sanitizeRecord(record: RunRecord): RunRecord {
  const copy = JSON.parse(JSON.stringify(record)) as RunRecord;
  if (copy.session) {
    copy.session.sessionFile = EVIDENCE_FILES.session;
    copy.session.workspacePath = "<WORKSPACE>";
    for (const call of copy.session.toolCalls) {
      call.argsSummary = sanitizeText(call.argsSummary);
      if (call.errorText) call.errorText = sanitizeText(call.errorText);
    }
    copy.session.assistantText = sanitizeText(copy.session.assistantText);
    copy.session.userText = sanitizeText(copy.session.userText);
    copy.session.userTexts = copy.session.userTexts.map(sanitizeText);
  }
  copy.artifacts.recordFile = EVIDENCE_FILES.record;
  if (copy.artifacts.screenshotFile) copy.artifacts.screenshotFile = EVIDENCE_FILES.screenshot;
  return sanitizeDeep(copy) as RunRecord;
}

export function residualKinds(text: string): string[] {
  const kinds: string[] = [];
  for (const [pattern, kind] of [
    ...SECRET_PATTERNS.map(([pattern]) => [pattern, "secret"] as const),
    ...PATH_PATTERNS.map(([pattern]) => [pattern, "host-path"] as const),
  ]) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) kinds.push(kind);
  }
  return [...new Set(kinds)];
}
