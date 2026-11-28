/** Remote descriptors for the Host maintenance scan and repair queue. */

import { z } from "zod";
import type { RemoteResult, TypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol";

import { REMOTE_PACKAGE, codec, directMethod, parameter } from "../lib/typert-method.ts";
export const POTETO_MAINTENANCE_SERVICE = "pstackPotetoMaintenance";
import type {
  LegacySessionInfo,
  MaintenanceFailure,
  MaintenanceScanResult,
  RepairOutcome,
} from "./maintenance-types.ts";

const sessionSchema = z
  .object({
    sessionId: z.string().min(1),
    workspace: z.string(),
    title: z.string(),
    enabled: z.boolean(),
    eventCount: z.number().int().nonnegative(),
  })
  .strict() satisfies z.ZodType<LegacySessionInfo>;
const failureSchema = z
  .object({ sessionId: z.string(), message: z.string() })
  .strict() satisfies z.ZodType<MaintenanceFailure>;
const scanSchema = z
  .object({ sessions: z.array(sessionSchema), failures: z.array(failureSchema) })
  .strict() satisfies z.ZodType<MaintenanceScanResult>;
const outcomeSchema = z
  .object({ repaired: z.number().int().nonnegative(), failed: z.array(failureSchema) })
  .strict() satisfies z.ZodType<RepairOutcome>;
const queuedSchema = z.object({ queued: z.number().int().nonnegative() }).strict();

const parseSessionIds = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError("sessionIds must be an array of strings");
  }
  return value;
};

const scanMethod = directMethod<Record<string, never>, MaintenanceScanResult>(
  POTETO_MAINTENANCE_SERVICE,
  {
    method: "scanLegacySessions",
    parameters: [],
    result: codec("PstackLegacySessionScan", (value) => scanSchema.parse(value)),
  },
);
const queueMethod = directMethod<{ sessionIds: readonly string[] }, { queued: number }>(
  POTETO_MAINTENANCE_SERVICE,
  {
    method: "queueLegacyRepair",
    parameters: [parameter("sessionIds", "PstackLegacySessionIds", parseSessionIds)],
    result: codec("PstackLegacyRepairQueue", (value) => queuedSchema.parse(value)),
  },
);
const consumeMethod = directMethod<Record<string, never>, RepairOutcome | null>(
  POTETO_MAINTENANCE_SERVICE,
  {
    method: "consumeLegacyRepairResult",
    parameters: [],
    result: codec("PstackLegacyRepairOutcome", (value) =>
      value === null ? null : outcomeSchema.parse(value),
    ),
  },
);

/** Client face for the maintenance methods owned by the repair service. */
export interface PstackPotetoMaintenanceNamespace {
  readonly pstackPotetoMaintenance: {
    scanLegacySessions(): Promise<RemoteResult<MaintenanceScanResult>>;
    queueLegacyRepair(sessionIds: readonly string[]): Promise<RemoteResult<{ queued: number }>>;
    consumeLegacyRepairResult(): Promise<RemoteResult<RepairOutcome | null>>;
  };
}

/** Mountable maintenance contribution, kept separate from the switch methods. */
export const pstackPotetoMaintenanceRemote: TypertRemoteInfo = {
  package: REMOTE_PACKAGE,
  descriptors: [scanMethod, queueMethod, consumeMethod],
  methods: {
    [`${POTETO_MAINTENANCE_SERVICE}/scanLegacySessions`]: scanMethod,
    [`${POTETO_MAINTENANCE_SERVICE}/queueLegacyRepair`]: queueMethod,
    [`${POTETO_MAINTENANCE_SERVICE}/consumeLegacyRepairResult`]: consumeMethod,
  },
};
