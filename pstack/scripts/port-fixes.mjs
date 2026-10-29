#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { dump, load } from "js-yaml";

const ROOT = process.cwd();
const ACTIVE = resolve(ROOT, "docs/port-fixes.yaml");
const ARCHIVE = resolve(ROOT, "docs/port-fixes-archive.yaml");
const ACTIVE_STATUSES = new Set(["open", "active", "upstream-fixed", "obsolete"]);
const RETIRED_STATUSES = new Set(["upstream-fixed", "obsolete"]);
const KINDS = new Set(["bug", "extension", "adapter", "runtime", "plugin", "docs"]);
const DATE = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;

function readLedger(path, retired) {
  if (!existsSync(path)) throw new Error(`${path}: missing ledger`);
  let ledger;
  try {
    ledger = load(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: invalid YAML: ${error.message}`);
  }
  if (!ledger || ledger.schema !== 1 || !Array.isArray(ledger.fixes))
    throw new Error(`${path}: expected schema: 1 and a fixes array`);
  const statuses = retired ? RETIRED_STATUSES : ACTIVE_STATUSES;
  const ids = new Set();
  for (const fix of ledger.fixes) {
    const label = `${path}: ${fix?.id ?? "<missing id>"}`;
    if (!fix || typeof fix !== "object" || !/^FIX-\d+$/.test(fix.id))
      throw new Error(`${label}: expected a FIX-<number> id`);
    if (ids.has(fix.id)) throw new Error(`${label}: duplicate id`);
    ids.add(fix.id);
    if (!statuses.has(fix.status)) throw new Error(`${label}: invalid status ${fix.status}`);
    if (typeof fix.issue !== "string" || !/^(#\d+|EXT-\d+)$/.test(fix.issue))
      throw new Error(`${label}: issue must be #<number> or EXT-<number>`);
    if (!KINDS.has(fix.kind)) throw new Error(`${label}: invalid kind ${fix.kind}`);
    if (typeof fix.title !== "string" || !fix.title.trim())
      throw new Error(`${label}: title is required`);
    if (!Array.isArray(fix.files) || fix.files.some((file) => typeof file !== "string"))
      throw new Error(`${label}: files must be a string array`);
    if (typeof fix.test !== "string") throw new Error(`${label}: test must be a string`);
    if (
      !fix.verified_against ||
      typeof fix.verified_against.pstack !== "string" ||
      typeof fix.verified_against.dsh !== "string"
    )
      throw new Error(`${label}: verified_against.pstack and .dsh are required`);
    if (typeof fix.note !== "string") throw new Error(`${label}: note must be a string`);
    if (fix.status === "active" && !fix.test.trim())
      throw new Error(`${label}: active FIX needs a test command`);
    if (retired) {
      if (typeof fix.retired_at !== "string" || !DATE.test(fix.retired_at))
        throw new Error(`${label}: retired_at must be an ISO date or date-time`);
      if (typeof fix.retired_reason !== "string" || !fix.retired_reason.trim())
        throw new Error(`${label}: retired_reason is required`);
    }
  }
  return ledger;
}

function writeAtomically(path, ledger) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, dump(ledger, { lineWidth: 120, noRefs: true }), "utf8");
  renameSync(temporary, path);
}

function replay(active, archive) {
  const retired = new Set(archive.fixes.map(({ id }) => id));
  for (const fix of active.fixes) {
    if (retired.has(fix.id)) throw new Error(`${fix.id}: id is already present in the archive`);
  }
  const fixes = active.fixes.filter(({ status }) => status === "active");
  if (fixes.length === 0) {
    console.log("No active FIX records; replay passed.");
    return 0;
  }
  let failed = 0;
  for (const fix of fixes) {
    console.log(`RUN ${fix.id}: ${fix.test}`);
    const result = spawnSync(fix.test, {
      cwd: ROOT,
      env: process.env,
      shell: true,
      stdio: "inherit",
    });
    if (result.error) console.error(result.error.message);
    const passed = result.status === 0 && !result.signal && !result.error;
    console.log(`${passed ? "PASS" : "FAIL"} ${fix.id}`);
    if (!passed) failed += 1;
  }
  console.log(`Replay: ${fixes.length - failed} passed, ${failed} failed.`);
  return failed === 0 ? 0 : 1;
}

function compact(active, archive) {
  const archivedIds = new Set(archive.fixes.map(({ id }) => id));
  const keep = [];
  const retired = [];
  for (const fix of active.fixes) {
    if (!RETIRED_STATUSES.has(fix.status)) {
      keep.push(fix);
      continue;
    }
    if (archivedIds.has(fix.id)) throw new Error(`${fix.id}: id is already present in the archive`);
    if (typeof fix.retired_at !== "string" || !DATE.test(fix.retired_at))
      throw new Error(`${fix.id}: retired_at must be an ISO date or date-time`);
    if (typeof fix.retired_reason !== "string" || !fix.retired_reason.trim())
      throw new Error(`${fix.id}: retired_reason is required`);
    retired.push(fix);
  }
  if (retired.length === 0) {
    console.log("No retired FIX records; compact passed.");
    return 0;
  }
  const nextArchive = { schema: 1, fixes: [...archive.fixes, ...retired] };
  writeAtomically(ARCHIVE, nextArchive);
  try {
    writeAtomically(ACTIVE, { schema: 1, fixes: keep });
  } catch (error) {
    writeAtomically(ARCHIVE, archive);
    throw error;
  }
  for (const fix of retired) console.log(`ARCHIVED ${fix.id}: ${fix.status}`);
  console.log(`Compact: ${retired.length} archived, ${keep.length} retained.`);
  return 0;
}

const command = process.argv[2];
if (process.argv.length !== 3 || !["replay", "compact"].includes(command)) {
  console.error("Usage: node pstack/scripts/port-fixes.mjs <replay|compact>");
  process.exit(2);
}

try {
  const active = readLedger(ACTIVE, false);
  const archive = readLedger(ARCHIVE, true);
  process.exitCode = command === "replay" ? replay(active, archive) : compact(active, archive);
} catch (error) {
  console.error(error.stack ?? `port-fixes: ${error.message}`);
  process.exitCode = 1;
}
