import { createHash } from "node:crypto";
import { preserveRuntimeInventory, type DiscoveredRuntime } from "./cloud-discovery";
export const workflowEventNames = ["workflow.started", "workflow.resumed", "workflow.paused", "workflow.finished", "action.proposed", "action.started", "action.completed", "action.failed", "action.uncertain", "action.withheld", "policy.evaluated", "approval.requested", "approval.approved", "approval.rejected", "approval.expired", "customer_output.prepared", "customer_output.withheld", "customer_output.sent", "customer_output.failed"] as const;
export interface WorkflowTelemetryEvent {
  eventId: string; runId: string; actionId: string | null; eventName: typeof workflowEventNames[number]; occurredAt: string;
  attempt: number; traceId: string; spanId: string; triggerChannel: "slack" | "email" | "internal";
  reportedDeploymentVersion: string;
  actionName: string | null; provider: string | null; decision: string | null; reasonCode: string | null; reportedOutcome: string | null;
  ruleId: string | null; ruleVersion: string | null; requestedPercent: number | null; approvalThreshold: number | null; maximumDiscount: number | null;
  evidence: "source-reported"; effectVerified: false; approvalIdentityVerified: false;
}
export interface WorkflowTelemetryApi {
  callerIdentity(): Promise<unknown>;
  listEvents(input: { logGroupIdentifier: string; startTime: number; endTime: number; limit: 100; nextToken?: string }): Promise<unknown>;
}
export interface WorkflowTelemetryWindow {
  source: { runtimeArn: string; enrolledRuntimeVersion: string; logGroup: string; startTime: number; endTime: number };
  events: WorkflowTelemetryEvent[]; completeness: "complete-api-traversal" | "partial";
  unsupportedRecords: number; duplicateDeliveries: number; conflictingEventIds: string[];
  failures: ("read-unavailable" | "invalid-page" | "invalid-event" | "pagination-cycle" | "page-limit" | "conflicting-event")[];
  enforcement: "not-established";
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const symbol = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_.-]{1,160}$/.test(v) && !/(?:xox[abp]-|sk-|fsk_|bearer|AIza|GOCSPX)/i.test(v);
function time(v: unknown) {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) || !Number.isFinite(Date.parse(v))) return null;
  const result = new Date(v).toISOString(); if (result.slice(0,19) !== v.slice(0,19)) return null;
  const fraction = v.match(/\.(\d+)/)?.[1] ?? ""; return result.slice(0,19) + "." + fraction.padEnd(6,"0") + "Z";
}
/** Explicit business-event v1 mapping, not universal OTEL parsing. Raw messages,
 * customer content, provider responses and arbitrary extensions never leave it. */
export function projectWorkflowEvent(raw: string): WorkflowTelemetryEvent | null {
  try {
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 65536) return null;
    const v: unknown = JSON.parse(raw);
    if (!object(v) || v.schema_version !== "1.0" || !symbol(v.event_id) || !symbol(v.run_id)
      || typeof v.event_name !== "string" || !workflowEventNames.includes(v.event_name as never)
      || (v.action_id !== null && !symbol(v.action_id)) || !symbol(v.agent_deployment_version)
      || !Number.isSafeInteger(v.attempt) || Number(v.attempt) < 1 || Number(v.attempt) > 10000
      || typeof v.trace_id !== "string" || !/^[a-f0-9]{32}$/.test(v.trace_id) || /^0+$/.test(v.trace_id)
      || typeof v.span_id !== "string" || !/^[a-f0-9]{16}$/.test(v.span_id) || /^0+$/.test(v.span_id)
      || typeof v.trigger_channel !== "string" || !["slack", "email", "internal"].includes(v.trigger_channel)) return null;
    const occurredAt = time(v.timestamp); if (!occurredAt) return null;
    const optional = ["action_name", "provider", "decision", "reason_code", "outcome", "rule_id", "rule_version"];
    if (optional.some(k => v[k] !== undefined && !symbol(v[k]))) return null;
    for (const k of ["requested_pct", "approval_threshold_pct", "decline_above_pct"])
      if (v[k] !== undefined && v[k] !== null && (typeof v[k] !== "number" || !Number.isFinite(v[k]) || v[k] < 0 || v[k] > 100)) return null;
    return { eventId: v.event_id, runId: v.run_id, actionId: v.action_id as string | null, eventName: v.event_name as WorkflowTelemetryEvent["eventName"], occurredAt,
      attempt: v.attempt as number, traceId: v.trace_id, spanId: v.span_id, triggerChannel: v.trigger_channel as WorkflowTelemetryEvent["triggerChannel"], reportedDeploymentVersion: v.agent_deployment_version,
      actionName: v.action_name as string ?? null, provider: v.provider as string ?? null, decision: v.decision as string ?? null,
      reasonCode: v.reason_code as string ?? null, reportedOutcome: v.outcome as string ?? null, ruleId: v.rule_id as string ?? null, ruleVersion: v.rule_version as string ?? null,
      requestedPercent: v.requested_pct as number ?? null, approvalThreshold: v.approval_threshold_pct as number ?? null, maximumDiscount: v.decline_above_pct as number ?? null,
      evidence: "source-reported", effectVerified: false, approvalIdentityVerified: false };
  } catch { return null; }
}
export async function collectWorkflowTelemetry(api: WorkflowTelemetryApi, runtime: DiscoveredRuntime,
  window: { logGroup: string; startTime: number; endTime: number }, timeoutMs = 10000): Promise<WorkflowTelemetryWindow> {
  const pinned = preserveRuntimeInventory(null, { scope: runtime.scope, observedAt: runtime.observedAt, completeness: "partial", records: [runtime], failures: [] }).records[0].record;
  if (!window || Object.keys(window).sort().join() !== "endTime,logGroup,startTime" || typeof window.logGroup !== "string" || !/^\/[A-Za-z0-9_./#-]{1,250}$/.test(window.logGroup)
    || !Number.isSafeInteger(window.startTime) || window.startTime < 0 || !Number.isSafeInteger(window.endTime) || window.endTime <= window.startTime || window.endTime-window.startTime > 604800000
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw Error("Reviewed log source and finite history window required");
  const source = { runtimeArn: pinned.resourceArn, enrolledRuntimeVersion: pinned.version, ...window };
  const bounded = async <T>(call: () => Promise<T>) => { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([call(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error()), timeoutMs); })]); } finally { clearTimeout(timer); } };
  let identity: unknown;
  try { identity = await bounded(() => api.callerIdentity()); } catch { throw Error("History identity unavailable"); }
  if (!object(identity) || identity.Account !== pinned.scope.accountId) throw Error("History account differs");
  const result: WorkflowTelemetryWindow = { source, events: [], completeness: "partial", unsupportedRecords: 0, duplicateDeliveries: 0, conflictingEventIds: [], failures: [], enforcement: "not-established" };
  const events = new Map<string,string>(), tokens = new Set<string>(); let nextToken: string | undefined;
  const deadline = Date.now()+30000;
  for (let page = 0; page < 20; page++) {
    let value: unknown;
    try {
      if (Date.now() >= deadline) throw Error();
      const text = JSON.stringify(await bounded(() => api.listEvents({ logGroupIdentifier: `arn:aws:logs:${pinned.scope.region}:${pinned.scope.accountId}:log-group:${source.logGroup}`, startTime: source.startTime, endTime: source.endTime, limit: 100, ...(nextToken ? { nextToken } : {}) })));
      if (typeof text !== "string" || Buffer.byteLength(text) > 1_048_576) throw Error();
      value = JSON.parse(text);
    } catch { result.failures.push("read-unavailable"); return result; }
    if (!object(value) || !Array.isArray(value.events) || value.events.length > 100) { result.failures.push("invalid-page"); return result; }
    for (const raw of value.events) {
      if (!object(raw) || !symbol(raw.eventId) || !Number.isSafeInteger(raw.timestamp) || Number(raw.timestamp) < source.startTime || Number(raw.timestamp) >= source.endTime || typeof raw.message !== "string") { result.failures.push("invalid-event"); continue; }
      const projected = projectWorkflowEvent(raw.message);
      if (!projected) { result.unsupportedRecords++; continue; }
      if (Date.parse(projected.occurredAt) > source.endTime+300000) { result.failures.push("invalid-event"); continue; }
      const digest = createHash("sha256").update(JSON.stringify(projected)).digest("hex"), previous = events.get(projected.eventId);
      if (previous !== undefined) {
        if (previous === digest) result.duplicateDeliveries++;
        else if (!result.conflictingEventIds.includes(projected.eventId)) { result.conflictingEventIds.push(projected.eventId); result.failures.push("conflicting-event"); }
        continue;
      }
      events.set(projected.eventId,digest); result.events.push(projected);
    }
    if (value.nextToken === undefined || value.nextToken === null) {
      result.events.sort((a,b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
      if (!result.failures.length) result.completeness = "complete-api-traversal";
      return result;
    }
    if (typeof value.nextToken !== "string" || !/^\S{1,2048}$/.test(value.nextToken)) { result.failures.push("invalid-page"); return result; }
    if (tokens.has(value.nextToken)) { result.failures.push("pagination-cycle"); return result; }
    tokens.add(value.nextToken); nextToken = value.nextToken;
  }
  result.failures.push("page-limit"); return result;
}
