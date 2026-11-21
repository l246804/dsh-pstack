/** Durable per-session poteto selection kept outside the Session event log. */

import { z } from "zod";
import type { DomainSpec, DomainTableSpec } from "@deepseek-ai/dsh-storage-domain";

/** One Session's saved poteto selection. */
export interface PotetoModeRecord {
  readonly enabled: boolean;
}

/** The per-Session table shape used by the Host and tests. */
export interface PotetoModeTable {
  get(sessionId: string): PotetoModeRecord | undefined;
  put(sessionId: string, record: PotetoModeRecord): Promise<void>;
  delete(sessionId: string): Promise<boolean>;
}

const potetoModesTable: DomainTableSpec<string, PotetoModeRecord> = {
  valueSchema: z.object({ enabled: z.boolean() }).strict() as z.ZodType<PotetoModeRecord>,
};

/** Storage-domain declaration for the sidecar state. */
export const potetoDomainSpec = {
  name: "pstack",
  version: 1,
  layout: "per-record",
  tables: {
    poteto_modes: potetoModesTable,
  },
} satisfies DomainSpec;

/** Read one saved selection from the sidecar table. */
export function readPotetoMode(table: PotetoModeTable, sessionId: string): boolean | undefined {
  return table.get(sessionId)?.enabled;
}

/** Persist one selection durably; the domain write resolves after the backend. */
export async function writePotetoMode(
  table: PotetoModeTable,
  sessionId: string,
  enabled: boolean,
): Promise<void> {
  await table.put(sessionId, { enabled });
}
