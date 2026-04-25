import { redactRecord } from "@repobrain/core";
import type { LocalAuditEvent } from "@repobrain/shared-types";

export function createLocalAuditEvent(params: Omit<LocalAuditEvent, "timestamp" | "metadata"> & {
  metadata?: Record<string, unknown>;
  now?: Date;
}): LocalAuditEvent {
  return {
    type: params.type,
    action: params.action,
    severity: params.severity,
    timestamp: (params.now ?? new Date()).toISOString(),
    metadata: params.metadata ? redactRecord(params.metadata) : undefined
  };
}
