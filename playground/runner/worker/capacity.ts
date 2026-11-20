import { cpus, freemem } from "node:os";

import { runtimeSettings } from "../config/runtime.ts";

const GB = 1024 ** 3;

export interface Capacity {
  workers: number;
  maxWorkers: number;
  cores: number;
  availableGB: number;
  reason: string;
}

/**
 * workers = min(machine capacity, task count), floored at 1.
 *
 * Capacity comes from config.runtime.workerCapacity:
 * min(cores - coreHeadroom, floor(freeGB * memoryFraction / memoryPerWorkerGB), maxWorkers).
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
  const maxWorkers = Math.max(1, Math.min(byCores, byMemory, policy.maxWorkers));
  const workers = Math.max(1, Math.min(maxWorkers, taskCount));
  return {
    workers,
    maxWorkers,
    cores,
    availableGB,
    reason: `min(nproc-${policy.coreHeadroom}=${byCores}, floor(freeGB*${policy.memoryFraction}/${policy.memoryPerWorkerGB})=${byMemory}, max=${policy.maxWorkers}) = ${maxWorkers}; tasks=${taskCount}; workers=${workers}`,
  };
}
