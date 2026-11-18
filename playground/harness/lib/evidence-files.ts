export const EVIDENCE_FILES = {
  record: "record.json",
  screenshot: "screenshot.png",
  session: "session.jsonl.zstd",
  source: "record.source.json",
  sourceSuffix: ".source.json",
  safe: "record.safe.json",
} as const;

export const EVIDENCE_DIRECTORIES = {
  scenarios: "scenarios",
} as const;
