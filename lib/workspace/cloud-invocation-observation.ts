import type { DiscoveredRuntime } from "./cloud-discovery";
import { preserveRuntimeInventory } from "./cloud-discovery";

export interface InvocationObservation {
  runtimeArn: string;
  enrolledRuntimeVersion: string;
  traceId: string | null;
  spanId: string | null;
  requestId: string;
  sessionId: string;
  operation: "InvokeAgentRuntime" | "InvokeRuntimeOperation";
  evidence: "reported-invocation";
  toolActivity: "unknown";
  effectVerified: false;
}
/**
 * Narrow AWS APPLICATION_LOGS projection, not a general log importer.
 * Transport must independently authenticate AWS and pin the reviewed log source.
 * Runtime version is enrollment context, not a version attested by this log.
 * No payload, customer message, credentials, output or success inference retained.
 */
export function projectInvocationObservation(rawJson: string, runtime: DiscoveredRuntime): InvocationObservation | null {
  try {
    const checked = preserveRuntimeInventory(null, { scope: runtime.scope, observedAt: runtime.observedAt,
      completeness: "partial", records: [runtime], failures: [] }).records[0].record;
    if (typeof rawJson !== "string" || Buffer.byteLength(rawJson) > 65_536) return null;
    const row = JSON.parse(rawJson);
    if (!row || typeof row !== "object" || Array.isArray(row)
      || row.resource_arn !== checked.resourceArn || row.account_id !== checked.scope.accountId
      || !["InvokeAgentRuntime", "InvokeRuntimeOperation"].includes(row.operation)
      || typeof row.request_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(row.request_id)
      || typeof row.session_id !== "string" || !/^[a-zA-Z0-9_-]{1,256}$/.test(row.session_id)
      || (row.trace_id !== undefined && (typeof row.trace_id !== "string" || !/^[a-f0-9]{32}$/.test(row.trace_id)))
      || (row.span_id !== undefined && (typeof row.span_id !== "string" || !/^[a-f0-9]{16}$/.test(row.span_id)))) return null;
    return { runtimeArn: checked.resourceArn, enrolledRuntimeVersion: checked.version,
      traceId: row.trace_id ?? null, spanId: row.span_id ?? null, requestId: row.request_id,
      sessionId: row.session_id, operation: row.operation, evidence: "reported-invocation",
      toolActivity: "unknown", effectVerified: false };
  } catch { return null; }
}
