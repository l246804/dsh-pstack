/**
 * Read-only worktree prune audit.
 *
 * A Node replacement for the upstream `scripts/worktree-audit.sh`. The shell
 * script's job was to classify every git worktree by size, age, merge state,
 * uncommitted work, remote/PR state, and the newest supplied session, then print
 * one TSV table sorted by size with a suggested bucket. That job is unchanged; what
 * changed is the toolchain. This file runs under Node alone, needs no `bash`, no
 * `jq`, and no `awk`, and reads the caller's session JSON with `JSON.parse`.
 *
 * Behaviour kept deliberately identical, because the playbook and the tests name
 * the columns:
 *
 * - The header is `# base: <ref>` then one TSV header line, written once.
 * - Columns are SIZE, AGE, MERGED, DIRTY, REMOTE, PR, LAST_CHAT, PINNED, BUCKET,
 *   WORKTREE, in that order.
 * - The main worktree is never a candidate. Only `git worktree list` provides
 *   paths; nothing is hand-typed.
 * - `MERGED` is `YES` only when the worktree HEAD is an ancestor of the base.
 *   Squash merges are not ancestors, so the PR state is the real signal there.
 * - `DIRTY` counts tracked edits as `wip:<n>` and untracked-only as `scratch:<n>`,
 *   with `clean` for neither.
 * - `REMOTE` is `pushed`, `ahead<n>`, `detached`, or `no-remote`.
 * - `PR` is `#<number>/<state>` from the forge, or `-`.
 * - `PINNED` is always `unknown`: this host exposes no pinned-state source, so the
 *   user's own set decides and the script says so instead of guessing.
 * - `BUCKET` is `hold-wip`, `hold-open-pr`, `unknown-usage`, `verify-recent-chat`,
 *   `safe`, or `review`. An unknown usage signal never reaches `safe`.
 * - Rows are sorted by SIZE descending, then kept in the order they were produced.
 * - The session store is never scanned. `--sessions` is the only usage input, and
 *   without it the LAST_CHAT column is `-` and the bucket is `unknown-usage`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** One row of the audit, in column order. */
export interface AuditRow {
  readonly size: string;
  readonly age: string;
  readonly merged: string;
  readonly dirty: string;
  readonly remote: string;
  readonly pr: string;
  readonly lastChat: string;
  readonly pinned: string;
  readonly bucket: string;
  /** Why the usage signal is unknown, when it is. Absent once a session matched. */
  readonly note?: string;
  readonly worktree: string;
}

/** One entry of the caller's `pstack_history` JSON. */
export interface SessionInput {
  readonly sessionId?: string;
  readonly cwd?: string | null;
  readonly lastEventTime?: number;
}

/** The shape `--sessions` takes, repeated in every message about it. */
const SESSIONS_SHAPE = 'a JSON array of {"sessionId","cwd","lastEventTime"} objects';

/** Everything the table is built from. */
export interface AuditInput {
  readonly base: string;
  readonly repo: string;
  readonly sessions: readonly SessionInput[] | undefined;
  /** Epoch seconds; injected so the age column is testable. */
  readonly now: number;
}

export const PINNED = "unknown";

export const HEADER = [
  "SIZE",
  "AGE",
  "MERGED",
  "DIRTY",
  "REMOTE",
  "PR",
  "LAST_CHAT",
  "PINNED",
  "BUCKET",
  "WORKTREE",
] as const;

/** The bucket for a worktree whose usage signal is missing. */
export const UNKNOWN_USAGE_BUCKET = "unknown-usage";

/** Raised for a usage problem; the caller prints the message and exits nonzero. */
export class AuditError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "AuditError";
    this.exitCode = exitCode;
  }
}

/** How many days a worktree may be untouched and still count as recent. */
export const RECENT_DAYS = 4;

// ---------------------------------------------------------------------------
// git plumbing
// ---------------------------------------------------------------------------

/**
 * Run git, returning stdout, or `undefined` when it fails.
 *
 * The shell script wrote `2>/dev/null` on most calls and branched on the exit
 * status, so a failure is a normal value here rather than an exception.
 */
function git(repo: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}

/** Run git without `-C`, for commands that must see the real repository root. */
function gitHere(cwd: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}

/** `git worktree list --porcelain`, parsed into worktree paths in order. */
export function worktreePaths(repo: string): readonly string[] {
  const out = git(repo, ["worktree", "list", "--porcelain"]);
  if (out === undefined) return [];
  return out
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

// ---------------------------------------------------------------------------
// columns
// ---------------------------------------------------------------------------

/**
 * Human size, matching `du -h`.
 *
 * GNU `du -h` divides by 1024, promotes the unit when the value reaches 1024, and
 * prints one decimal below ten and a rounded integer at or above ten. Verified
 * against `du` on this host: 8.0K for 4096 bytes, 12K for 8192, 1.1M for 1 MiB,
 * 513M for 512 MiB. Reproducing the format keeps the column comparable with the
 * numbers the playbook quotes and removes the dependency on `du` and `awk`.
 */
export function formatSize(bytes: number): string {
  const units = ["B", "K", "M", "G", "T", "P"] as const;
  if (bytes < 1024) return `${bytes}B`;

  let value = bytes / 1024;
  let unit = 1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const suffix = units[unit] as string;
  return `${value < 10 ? value.toFixed(1) : String(Math.round(value))}${suffix}`;
}

/**
 * Directory size in bytes as `du -s` counts it: allocated blocks, directories
 * included.
 *
 * Three details make this match `du`, and each was checked against it on this host:
 *
 * - `stat.blocks` is in 512-byte units, not bytes.
 * - A directory consumes blocks of its own, so its `blocks` counts too. Skipping
 *   them reads one 4 KiB block low per directory.
 * - `.git` here is a file in a linked worktree, not a directory, so it contributes
 *   its own block and nothing is traversed through it.
 *
 * That block accounting is the point of the column: the playbook quotes the space
 * `du` reports before deleting. A symlink contributes its own block and is never
 * traversed, matching `du` without `-L`.
 */
function directorySize(root: string): number {
  let total = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    let details;
    try {
      details = statSync(current, { throwIfNoEntry: false });
    } catch {
      continue;
    }
    if (details === undefined) continue;
    // `blocks` is absent on some platforms (notably Windows); fall back to the
    // apparent size there so the column stays populated instead of reading 0.
    total += details.blocks === undefined ? details.size : details.blocks * 512;
    if (!details.isDirectory()) continue;

    let names: string[];
    try {
      names = readdirSync(current);
    } catch {
      continue;
    }
    for (const name of names) pending.push(resolve(current, name));
  }
  return total;
}

/** `SIZE` as `du -sh` would print it, or `-` when the directory is gone. */
export function sizeColumn(worktree: string): string {
  try {
    if (!statSync(worktree).isDirectory()) return "-";
  } catch {
    return "-";
  }
  return formatSize(directorySize(worktree));
}

/** `AGE` as `<n>d`, or `?` when the HEAD time is unavailable. */
export function ageColumn(headTimestamp: number, now: number): string {
  if (!(headTimestamp > 0)) return "?";
  return `${Math.floor((now - headTimestamp) / 86400)}d`;
}

/**
 * `DIRTY` for one worktree.
 *
 * `git status --porcelain` marks untracked entries with `??`. Anything else is
 * tracked work, which is what a human has to look at before deleting.
 */
export function dirtyColumn(porcelain: string): string {
  const lines = porcelain.split("\n").filter((line) => line !== "");
  if (lines.length === 0) return "clean";
  const tracked = lines.filter((line) => !line.startsWith("??"));
  if (tracked.length > 0) return `wip:${tracked.length}`;
  return `scratch:${lines.filter((line) => line.startsWith("??")).length}`;
}

/** `MERGED` for one worktree, from whether HEAD is an ancestor of the base. */
export function mergedColumn(isAncestor: boolean): string {
  return isAncestor ? "YES" : "no";
}

/** `REMOTE` for one worktree. */
export function remoteColumn(input: {
  readonly branch: string | undefined;
  readonly hasRemote: boolean;
  readonly remoteSha: string | undefined;
  readonly head: string | undefined;
  readonly aheadCount: number | undefined;
}): string {
  if (input.branch === undefined || input.branch === "") return "detached";
  if (!input.hasRemote) return "no-remote";
  if (input.remoteSha !== undefined && input.head !== undefined && input.remoteSha === input.head) {
    return "pushed";
  }
  return `ahead${input.aheadCount ?? 0}`;
}

/** One forge PR, normalized. */
export interface ForgePr {
  readonly number: number;
  readonly state: string;
  readonly head: string;
}

/** `PR` for one branch, matching the first entry the forge reported for it. */
export function prColumn(branch: string | undefined, prs: readonly ForgePr[]): string {
  if (branch === undefined || branch === "") return "-";
  const hit = prs.find((pr) => pr.head === branch);
  return hit === undefined ? "-" : `#${hit.number}/${hit.state}`;
}

/**
 * Whether a session's recorded cwd is this worktree or a directory below it.
 *
 * Both sides go through `resolve` before comparing. `git worktree list` returns
 * platform separators while a session's `cwd` may have been written by a different
 * source, so on Windows `C:\repo\wt` and `C:/repo/wt` name the same checkout but are
 * different strings. The old comparison hardcoded `/`, so it matched nothing there:
 * every `LAST_CHAT` was `-` and every bucket silently degraded to `unknown-usage`.
 *
 * `resolve` also normalises trailing separators and `..` segments, so neither can
 * make one path look like an ancestor of the other by accident.
 */
export function sameOrInside(cwd: string, worktree: string): boolean {
  const child = resolve(cwd);
  const parent = resolve(worktree);
  return child === parent || child.startsWith(`${parent}${sep}`);
}

/** The newest supplied session whose cwd is this worktree or below it. */
export function lastSession(
  worktree: string,
  sessions: readonly SessionInput[] | undefined,
): SessionInput | undefined {
  if (sessions === undefined || sessions.length === 0) return undefined;

  const matches = sessions.filter((session) => sameOrInside(session.cwd ?? "", worktree));
  if (matches.length === 0) return undefined;

  // `sort_by(.lastEventTime // 0) | last` in the shell version: the newest wins,
  // and a missing time sorts first. `toSorted` keeps the input untouched.
  return matches.toSorted((left, right) => (left.lastEventTime ?? 0) - (right.lastEventTime ?? 0))[
    matches.length - 1
  ];
}

/** `LAST_CHAT` for one worktree. */
export function lastChatColumn(session: SessionInput | undefined): string {
  return session === undefined ? "-" : (session.sessionId ?? "unknown");
}

/** Whether a session counts as recent for the bucket decision. */
export function isRecent(session: SessionInput | undefined, now: number): boolean {
  const time = session?.lastEventTime ?? 0;
  if (!(time > 0)) return false;
  return Math.floor((now - time) / 86400) <= RECENT_DAYS;
}

/**
 * The suggested bucket.
 *
 * Uncommitted tracked work outranks everything, then an open PR, then the usage
 * signal. An unknown usage signal never reaches `safe`: without the caller's
 * session input the bucket stays `unknown-usage`, and the playbook asks the user.
 */
export function bucketFor(input: {
  readonly dirty: string;
  readonly pr: string;
  readonly merged: string;
  readonly usageKnown: boolean;
  readonly usedRecently: boolean;
}): string {
  if (input.dirty.startsWith("wip:")) return "hold-wip";
  if (input.pr.endsWith("/open") || input.pr.endsWith("/draft")) return "hold-open-pr";
  if (!input.usageKnown) return UNKNOWN_USAGE_BUCKET;
  if (input.usedRecently) return "verify-recent-chat";
  if (input.merged === "YES" || input.pr !== "-") return "safe";
  return "review";
}

// ---------------------------------------------------------------------------
// forge
// ---------------------------------------------------------------------------

/**
 * Read this user's PRs from whichever forge CLI can answer.
 *
 * `origin` reports `status`, `gh` reports `state`; both are normalized to a
 * lowercase `state` here. An unreachable forge is an empty list, not an error: the
 * PR column is one signal among several and a first pass may run offline.
 */
export function readForgePrs(cwd: string, run: typeof execFileSync = execFileSync): readonly ForgePr[] {
  const origin = tryJson(run, cwd, "origin", [
    "pr",
    "list",
    "--author",
    "@me",
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,status,headRef",
  ]);
  if (origin !== undefined) return normalizeOrigin(origin);

  const gh = tryJson(run, cwd, "gh", [
    "pr",
    "list",
    "--author",
    "@me",
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,state,headRefName",
  ]);
  if (gh !== undefined) return normalizeGh(gh);

  return [];
}

function tryJson(
  run: typeof execFileSync,
  cwd: string,
  command: string,
  args: readonly string[],
): unknown {
  try {
    const out = run(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    }) as unknown as string;
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

/** `[{number, status, headRef}]` from the `origin` CLI. */
export function normalizeOrigin(raw: unknown): readonly ForgePr[] {
  if (!Array.isArray(raw)) return [];
  const prs: ForgePr[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const number = record["number"];
    const head = record["headRef"];
    if (typeof number !== "number" || typeof head !== "string") continue;
    prs.push({ number, state: String(record["status"] ?? ""), head });
  }
  return prs;
}

/** `[{number, state, headRefName}]` from the `gh` CLI, with a lowercase state. */
export function normalizeGh(raw: unknown): readonly ForgePr[] {
  if (!Array.isArray(raw)) return [];
  const prs: ForgePr[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const number = record["number"];
    const head = record["headRefName"];
    if (typeof number !== "number" || typeof head !== "string") continue;
    prs.push({ number, state: String(record["state"] ?? "").toLowerCase(), head });
  }
  return prs;
}

// ---------------------------------------------------------------------------
// base selection
// ---------------------------------------------------------------------------

/**
 * Pick the base ref when the caller gave no `-b`.
 *
 * `origin/HEAD`, then `origin/main`, then `origin/master`, matching the shell
 * script. An empty result means no base exists and the caller must pass one.
 */
export function resolveBase(repo: string): string | undefined {
  const candidates: string[] = [];
  const head = git(repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (head !== undefined) candidates.push(head.trim());
  candidates.push("origin/main", "origin/master");

  return candidates.find(
    (candidate) =>
      candidate !== "" && git(repo, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]) !== undefined,
  );
}

// ---------------------------------------------------------------------------
// table
// ---------------------------------------------------------------------------

/** One worktree's row, before formatting. */
export interface AuditContext {
  readonly base: string;
  readonly repo: string;
  readonly mainWorktree: string;
  readonly prs: readonly ForgePr[];
  readonly sessions: readonly SessionInput[] | undefined;
  readonly now: number;
}

/** Build one row. Every column is a pure function so each has a unit test. */
export function buildRow(worktree: string, context: AuditContext): AuditRow {
  const head = git(worktree, ["rev-parse", "HEAD"])?.trim();
  const headTimestamp = Number(git(worktree, ["log", "-1", "--format=%ct", "HEAD"])?.trim() ?? 0);

  // Squash-merged branches are not ancestors of the base, so PR state is the real
  // signal; merge-base only catches fast-forward and rebase merges.
  const isAncestor =
    head !== undefined && head !== "" && head !== "0"
      ? git(worktree, ["merge-base", "--is-ancestor", head, context.base]) !== undefined
      : false;

  const dirty = dirtyColumn(git(worktree, ["status", "--porcelain"]) ?? "");

  const branchText = git(worktree, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const branch = branchText === undefined ? "" : branchText.trim();
  const hasRemote =
    branch !== "" &&
    git(worktree, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`]) !== undefined;
  const remoteSha = hasRemote ? git(worktree, ["rev-parse", `origin/${branch}`])?.trim() : undefined;
  const aheadText = hasRemote ? git(worktree, ["rev-list", "--count", `origin/${branch}..HEAD`]) : undefined;
  const remote = remoteColumn({
    branch: branch === "" ? undefined : branch,
    hasRemote,
    remoteSha,
    head: head?.trim(),
    aheadCount: aheadText === undefined ? undefined : Number(aheadText.trim()),
  });

  const pr = prColumn(branch === "" ? undefined : branch, context.prs);

  // The newest supplied session whose cwd is this worktree. The caller produced
  // that list with `pstack_history`; nothing here reads the session store.
  //
  // `usageKnown` means "this worktree has a matching session", not "a non-empty
  // array was supplied". The difference decides whether a worktree becomes a
  // deletion candidate: with the array-non-empty form, a list that simply never
  // mentioned this checkout marked `merged: YES` as `safe`, i.e. "no usage record"
  // was read as "proven unused".
  const session = lastSession(worktree, context.sessions);
  const usageKnown = session !== undefined;
  const sessionsProvided = context.sessions !== undefined;

  const bucket = bucketFor({
    dirty,
    pr,
    merged: mergedColumn(isAncestor),
    usageKnown,
    usedRecently: isRecent(session, context.now),
  });

  return {
    size: sizeColumn(worktree),
    age: ageColumn(headTimestamp, context.now),
    merged: mergedColumn(isAncestor),
    dirty,
    remote,
    pr,
    lastChat: lastChatColumn(session),
    pinned: PINNED,
    bucket,
    note: usageNote({ usageKnown, sessionsProvided }),
    worktree,
  };
}

/**
 * Why a row's usage signal is what it is.
 *
 * Both "nobody supplied a session list" and "a list was supplied but it never
 * mentioned this worktree" produce the `unknown-usage` bucket, and the caller has
 * to fix a different thing in each case: build the list, or widen it. Collapsing
 * them would lose that distinction, which is the only diagnostic the row carries.
 */
export function usageNote(input: {
  readonly usageKnown: boolean;
  readonly sessionsProvided: boolean;
}): string | undefined {
  if (input.usageKnown) return undefined;
  return input.sessionsProvided
    ? "no session in the supplied list touched this worktree"
    : "no session list supplied";
}

/** Sort rows by SIZE descending, preserving the original order on a tie. */
export function sortRows(rows: readonly AuditRow[]): readonly AuditRow[] {
  const sizeOf = (row: AuditRow): number => {
    const match = /^([\d.]+)([BKMGTP]?)$/.exec(row.size);
    if (match === null) return 0;
    const value = Number(match[1]);
    const unit = match[2] as string;
    const power = { "": 0, B: 0, K: 1, M: 2, G: 3, T: 4, P: 5 }[unit] ?? 0;
    return value * 1024 ** power;
  };
  // `sort -rh` on the size column is a stable reverse numeric sort, so equal
  // sizes keep the order `git worktree list` reported.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => sizeOf(right.row) - sizeOf(left.row) || left.index - right.index)
    .map((entry) => entry.row);
}

/** Render the whole table, header included. */
export function renderTable(rows: readonly AuditRow[], base: string): string {
  const lines = [`# base: ${base}`, HEADER.join("\t")];
  for (const row of rows) {
    lines.push(
      [
        row.size,
        row.age,
        row.merged,
        row.dirty,
        row.remote,
        row.pr,
        row.lastChat,
        row.pinned,
        row.bucket,
        row.worktree,
      ].join("\t"),
    );
  }
  // The column set is a documented contract, so the usage diagnostics go below the
  // table as a comment block rather than becoming an eleventh column. Both cases
  // land in `unknown-usage`, but they call for different fixes — build the list, or
  // widen it — and collapsing them would throw that difference away.
  const notes = rows.filter((row) => row.note !== undefined);
  if (notes.length > 0) {
    lines.push("# usage signal unknown for:");
    for (const row of notes) lines.push(`#   ${row.worktree}: ${row.note as string}`);
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// sessions file
// ---------------------------------------------------------------------------

/**
 * Read and validate the `--sessions` file.
 *
 * The shell version required a JSON array via `jq -e 'type == "array"'` and pinned
 * the path before changing directory. Both hold here: the path is resolved before
 * any `git -C`, and a non-array is an error rather than an empty list, because a
 * silently ignored usage signal would quietly turn every bucket into
 * `unknown-usage`.
 *
 * Every element is checked, not filtered. The array is a projection the caller
 * builds from `pstack_history` results, so a malformed entry is a real mistake; the
 * previous `filter` dropped such entries and let the row fall through to
 * `unknown-usage`, which is exactly the silent data loss the paragraph above says
 * this function refuses to do.
 */
export function readSessionsFile(path: string): readonly SessionInput[] {
  const absolute = isAbsolute(path) ? path : resolve(process.cwd(), path);
  let text: string;
  try {
    text = readFileSync(absolute, "utf8");
  } catch {
    throw new AuditError(`cannot read sessions file: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AuditError(`sessions file must be ${SESSIONS_SHAPE}: ${path}`);
  }
  if (!Array.isArray(parsed)) {
    // The most likely mistake is passing a `pstack_history` result straight in:
    // that tool returns one object, never an array, so say so rather than only
    // "not an array".
    throw new AuditError(
      `sessions file must be ${SESSIONS_SHAPE}: ${path}. ` +
        "Build it from pstack_history results; the history page itself is not an array.",
    );
  }

  return parsed.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AuditError(
        `sessions[${index}] must be an object, got ${JSON.stringify(entry)?.slice(0, 60) ?? "undefined"}`,
      );
    }
    const { sessionId, cwd, lastEventTime } = entry as Record<string, unknown>;
    if (typeof sessionId !== "string" || sessionId === "") {
      throw new AuditError(`sessions[${index}].sessionId must be a non-empty string`);
    }
    if (cwd !== undefined && cwd !== null && typeof cwd !== "string") {
      throw new AuditError(`sessions[${index}].cwd must be a string or null`);
    }
    if (lastEventTime !== undefined && typeof lastEventTime !== "number") {
      throw new AuditError(`sessions[${index}].lastEventTime must be a number`);
    }
    return {
      sessionId,
      ...(cwd === undefined ? {} : { cwd: cwd as string | null }),
      ...(lastEventTime === undefined ? {} : { lastEventTime }),
    };
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** The parsed command line. */
export interface AuditArgs {
  readonly base?: string;
  readonly sessions?: string;
  readonly repo?: string;
  readonly help: boolean;
}

/** Usage text, kept close to the shell script's help. */
export const USAGE = [
  "Usage: worktree-audit.mjs [-b|--base <ref>] [-s|--sessions <json>] [repo-path]",
  "  repo-path defaults to the current repo.",
  "  -b sets the ref the MERGED column checks against (e.g. origin/integration).",
  "  Without it the base is origin/HEAD, then origin/main, then origin/master.",
  "  -s takes the JSON you produced with `pstack_history`, an array of",
  '  {"sessionId","cwd","lastEventTime"}. This script never reads the session',
  '  store, so without it LAST_CHAT is "-" and the bucket is unknown-usage.',
  '  PINNED is always "unknown": this host exposes no pinned-state source, so the',
  "  user's own set decides.",
  "",
].join("\n");

/**
 * Parse the command line.
 *
 * An unknown option and a missing argument value both exit 2, as the shell script
 * did; an unreadable sessions file and a missing base exit 1.
 */
export function parseArgs(argv: readonly string[]): AuditArgs {
  let base: string | undefined;
  let sessions: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "-b" || argument === "--base") {
      const value = argv[index + 1];
      if (value === undefined) throw new AuditError(`${argument} needs a ref`, 2);
      base = value;
      index += 1;
      continue;
    }
    if (argument === "-s" || argument === "--sessions") {
      const value = argv[index + 1];
      if (value === undefined) throw new AuditError(`${argument} needs a JSON file`, 2);
      sessions = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) throw new AuditError(`unknown option: ${argument}`, 2);
    positional.push(argument);
  }

  if (positional.length > 1) {
    throw new AuditError(`expected at most one repo path, received ${positional.length}`, 2);
  }
  return {
    ...(base === undefined ? {} : { base }),
    ...(sessions === undefined ? {} : { sessions }),
    ...(positional[0] === undefined ? {} : { repo: positional[0] }),
    help: false,
  };
}

export interface AuditIo {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

/** Run the audit. Returns the process exit code. */
export function main(
  argv: readonly string[],
  io: AuditIo = {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  },
  options: { readonly now?: number; readonly cwd?: string; readonly run?: typeof execFileSync } = {},
): number {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      io.stdout(USAGE);
      return 0;
    }

    const sessions =
      args.sessions === undefined ? undefined : readSessionsFile(args.sessions);

    const cwd = options.cwd ?? process.cwd();
    const repo =
      args.repo ??
      gitHere(cwd, ["rev-parse", "--show-toplevel"])?.trim() ??
      (() => {
        throw new AuditError("not in a git repo; pass a repo path");
      })();

    if (git(repo, ["rev-parse", "--git-dir"]) === undefined) {
      throw new AuditError(`not a git repo: ${repo}`);
    }

    // The main worktree is the first entry; everything else is a candidate.
    const paths = worktreePaths(repo);
    const mainWorktree = paths[0];
    if (mainWorktree === undefined) {
      throw new AuditError(`not a git repo: ${repo}`);
    }

    let base = args.base;
    if (base === undefined) {
      base = resolveBase(repo);
      if (base === undefined) {
        throw new AuditError(
          "no base ref (origin/HEAD, origin/main, origin/master all missing); pass -b <ref>",
        );
      }
      io.stderr(`warn: no -b given; MERGED checks against ${base}\n`);
    }

    // The explicit refspec creates the base even in a single-branch clone; a
    // failure is a warning, since a stale merge column is still worth printing.
    if (base.startsWith("origin/")) {
      const fetched = git(repo, [
        "fetch",
        "origin",
        `+refs/heads/${base.slice("origin/".length)}:refs/remotes/${base}`,
        "--quiet",
      ]);
      if (fetched === undefined) {
        io.stderr(`warn: could not fetch ${base}; merged column may be stale\n`);
      }
    }
    if (git(repo, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]) === undefined) {
      throw new AuditError(`base ref not found: ${base}`);
    }

    const prs = readForgePrs(repo);
    const now = options.now ?? Math.floor(Date.now() / 1000);
    const context: AuditContext = { base, repo, mainWorktree, prs, sessions, now };
    const rows = paths
      .filter((path) => path !== mainWorktree)
      .map((path) => buildRow(path, context));

    io.stdout(renderTable(sortRows(rows), base));
    return 0;
  } catch (error) {
    if (error instanceof AuditError) {
      io.stderr(`error: ${error.message}\n`);
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`error: ${message}\n`);
    return 1;
  }
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
