import { existsSync } from "node:fs";

import { isVariant } from "../types.ts";
import { argValue } from "../shared/args.ts";
import type { Variant } from "../types.ts";
import { environmentMatrix } from "../scenario/environments.ts";
import { workerPaths } from "../worker/worker.ts";
import { DEFAULT_CONFIG_FILE as CONFIG_FILE } from "../shared/paths.ts";
import { readRuntimeConfig } from "../config/config.ts";
import { latestSessionFile, readSessionEvents, type SessionEvent } from "../storage/sessions.ts";

function positiveInteger(value: string | undefined, fallback: number, label: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function nonNegativeInteger(value: string | undefined, fallback: number, label: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

function detailOf(event: SessionEvent): string {
  const data = event.data ?? {};
  if (event.type === "tool/call" || event.type === "tool/result") {
    return typeof data.name === "string" ? data.name : "";
  }
  if (event.type === "assistant/message") {
    const message = data.message as { content?: unknown } | undefined;
    if (!Array.isArray(message?.content)) return "";
    return message.content
      .flatMap((part) => {
        if (part === null || typeof part !== "object") return [];
        const value = part as { type?: string; name?: string; text?: string };
        if (value.type === "tool-call" && typeof value.name === "string")
          return `tool:${value.name}`;
        if (value.type === "text" && typeof value.text === "string") {
          return value.text.replace(/\s+/g, " ").slice(0, 120);
        }
        return [];
      })
      .join(" | ");
  }
  if (event.type === "subagent/catalog") {
    return typeof data.name === "string" ? data.name : "";
  }
  return "";
}

await readRuntimeConfig(CONFIG_FILE);
const variant = argValue("--variant") as Variant | undefined;
if (!isVariant(variant)) throw new Error("session-tail requires --variant native|adapted");
const environment = argValue("--environment");
if (environment === undefined) throw new Error("session-tail requires --environment");
environmentMatrix(environment);
const worker = nonNegativeInteger(argValue("--worker"), 0, "--worker");
const limit = positiveInteger(argValue("--limit"), 10, "--limit");
const scenario = argValue("--scenario");
const paths = workerPaths(worker, environment, variant);
const session = latestSessionFile(paths, {
  rootOnly: true,
  ...(scenario === undefined ? {} : { scenarioId: scenario }),
});
if (session === null || !existsSync(session.file)) {
  throw new Error(`no session file for ${variant}/${environment}/w${worker}`);
}
const events = readSessionEvents(session.file).slice(-limit);
const latest = events.at(-1);
const latestAge =
  latest?.time === undefined
    ? "unknown"
    : `${Math.max(0, Math.round((Date.now() - latest.time) / 1000))}s`;
console.log(`[session-tail] ${variant}/${environment}/w${worker} ${session.file}`);
console.log(`[session-tail] latestAge=${latestAge}`);
for (const event of events) {
  const seq = event.seq === undefined ? "-" : String(event.seq);
  const time = event.time === undefined ? "?" : new Date(event.time).toISOString();
  const detail = detailOf(event);
  console.log(`[session-tail] #${seq} ${time} ${event.type}${detail === "" ? "" : ` ${detail}`}`);
}
