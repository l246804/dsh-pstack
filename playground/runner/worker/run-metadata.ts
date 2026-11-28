import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { RunEnvironment } from "../types.ts";
import { runtimeSettings } from "../config/runtime.ts";
import { UPSTREAM_LOCK_FILE } from "../shared/paths.ts";
export function dshVersion(): string {
  const result = spawnSync(runtimeSettings().dshBin, ["--version"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim() === "") {
    throw new Error("cannot read the actual dsh version; prepare is blocked");
  }
  return result.stdout.trim();
}

/** Read the released pstack pin recorded in native/upstream.lock.json. */
function readUpstreamLock(): { pstackVersion: string; commit: string } {
  if (!existsSync(UPSTREAM_LOCK_FILE)) {
    throw new Error(`cannot read the upstream pin: ${UPSTREAM_LOCK_FILE}`);
  }
  const raw = JSON.parse(readFileSync(UPSTREAM_LOCK_FILE, "utf8")) as {
    pstackVersion?: string;
    commit?: string;
  };
  if (!raw.pstackVersion) {
    throw new Error(`upstream pin has no pstackVersion: ${UPSTREAM_LOCK_FILE}`);
  }
  if (!raw.commit) throw new Error(`upstream pin has no commit: ${UPSTREAM_LOCK_FILE}`);
  return { pstackVersion: raw.pstackVersion, commit: raw.commit };
}

export function createEnvironment(input: {
  worker: number;
  matrix: RunEnvironment["matrix"];
}): RunEnvironment {
  const pin = readUpstreamLock();
  return {
    worker: input.worker,
    dshVersion: dshVersion(),
    pstackVersion: pin.pstackVersion,
    matrix: input.matrix,
    upstreamRevision: pin.commit,
  };
}
