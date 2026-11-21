/** Wire-safe types shared by the Host maintenance service and its client page. */

/** One stored Session that still carries the retired `poteto/mode` event. */
export interface LegacySessionInfo {
  readonly sessionId: string;
  readonly workspace: string;
  readonly title: string;
  readonly enabled: boolean;
  readonly eventCount: number;
}

/** Result of a read-only scan for repairable Sessions. */
export interface MaintenanceScanResult {
  readonly sessions: readonly LegacySessionInfo[];
  readonly failures: readonly MaintenanceFailure[];
}

/** One Session that could not be scanned. */
export interface MaintenanceFailure {
  readonly sessionId: string;
  readonly message: string;
}

/** Result of applying the repair queue on restart. */
export interface RepairOutcome {
  readonly repaired: number;
  readonly failed: readonly MaintenanceFailure[];
}

/** Private queue document written when the user confirms a repair. */
export interface RepairQueue {
  readonly version: 1;
  readonly createdAt: number;
  readonly sessionIds: readonly string[];
}
