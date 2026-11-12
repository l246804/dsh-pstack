// Decide how many workers to start from the machine's actual capacity instead of a
// fixed default. Memory is treated as 1 GB per worker with a 30% safety margin, and the
// count is capped so a big host never spawns an unbounded fleet of Chrome instances.

import { cpus, freemem } from "node:os";

const GB = 1024 ** 3;
/** Reserved cores for the OS, the editor, and the web processes themselves. */
const CORE_HEADROOM = 2;
/** Fraction of free RAM workers may claim; the rest stays for the host. */
const MEMORY_FRACTION = 0.7;
/** 1 GB working set per worker, before the memory fraction is applied. */
const GB_PER_WORKER = 1.0;
const MAX_WORKERS = 12;

export interface Capacity {
  workers: number;
  cores: number;
  availableGB: number;
  reason: string;
}

/**
 * workers = min(nproc - 2, floor(availableGB * 0.7 / 1.0), 12), floored at 1.
 * An explicit override wins and is reported as such. Slowdowns and 429s are only
 * observed by the caller; this function never paces a running batch.
 */
export function computeWorkers(override?: number): Capacity {
  const cores = cpus().length;
  const availableGB = freemem() / GB;
  if (override !== undefined) {
    return {
      workers: Math.max(1, Math.floor(override)),
      cores,
      availableGB,
      reason: `override --workers ${override}`,
    };
  }
  const byCores = cores - CORE_HEADROOM;
  const byMemory = Math.floor((availableGB * MEMORY_FRACTION) / GB_PER_WORKER);
  const workers = Math.max(1, Math.min(byCores, byMemory, MAX_WORKERS));
  return {
    workers,
    cores,
    availableGB,
    reason: `min(nproc-2=${byCores}, floor(freeGB*0.7/1)=${byMemory}, 12) = ${workers}`,
  };
}
