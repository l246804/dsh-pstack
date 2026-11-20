import { cpus, freemem } from "node:os";

import { runtimeSettings } from "../config/runtime.ts";

const GB = 1024 ** 3;

export interface Capacity {
  workers: number;
  capacity: number;
  cores: number;
  availableGB: number;
  reason: string;
}

/**
 * workers = min(machine capacity, task count), floored at 1.
 *
 * Capacity comes from config.runtime.workerCapacity:
 * min(cores - coreHeadroom, floor(freeGB * memoryFraction / memoryPerWorkerGB)).
 */
export function computeWorkers(taskCount: number): Capacity {
  if (!Number.isSafeInteger(taskCount) || taskCount < 0) {
    throw new Error("taskCount must be a non-negative integer");
  }
  const policy = runtimeSettings().workerCapacity;
  const cores = cpus().length;
  const availableGB = freemem() / GB;
  const byCores = Math.max(1, cores - policy.coreHeadroom);
  const byMemory = Math.floor((availableGB * policy.memoryFraction) / policy.memoryPerWorkerGB);
  const capacity = Math.max(1, Math.min(byCores, byMemory));
  const workers = Math.max(1, Math.min(capacity, taskCount));
  return {
    workers,
    capacity,
    cores,
    availableGB,
    reason: `min(nproc-${policy.coreHeadroom}=${byCores}, floor(freeGB*${policy.memoryFraction}/${policy.memoryPerWorkerGB})=${byMemory}) = ${capacity}; tasks=${taskCount}; workers=${workers}`,
  };
}
