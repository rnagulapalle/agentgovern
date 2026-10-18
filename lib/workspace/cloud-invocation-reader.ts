import { createHash } from "node:crypto";
import { preserveRuntimeInventory, type DiscoveredRuntime } from "./cloud-discovery";
import { projectInvocationObservation, type InvocationObservation } from "./cloud-invocation-observation";

export interface AwsInvocationLogsApi {
  callerIdentity(): Promise<unknown>;
  listEvents(input: { logGroupName: string; startTime: number; endTime: number; limit: number; nextToken?: string }): Promise<unknown>;
}
export interface InvocationWindow {
  source: { runtimeArn: string; enrolledRuntimeVersion: string; logGroup: string; startTime: number; endTime: number };
  observations: { sourceEventId: string; timestamp: number; observation: InvocationObservation }[];
  completeness: "complete-api-traversal" | "partial";
  failures: ("read-unavailable" | "invalid-page" | "invalid-event" | "conflicting-event" | "pagination-cycle" | "page-limit")[];
  unsupportedRecords: number;
  toolActivity: "unknown";
  enforcement: "unverified";
}
/** A finite read window, not a subscription or durable cursor. Save event IDs atomically in a later store. */
export async function collectAwsInvocationWindow(api: AwsInvocationLogsApi, runtime: DiscoveredRuntime,
  window: { logGroup: string; startTime: number; endTime: number }): Promise<InvocationWindow> {
  const pinned = preserveRuntimeInventory(null, { scope: runtime.scope, observedAt: runtime.observedAt, completeness: "partial", records: [runtime], failures: [] }).records[0].record;
  const prefix = `/aws/bedrock-agentcore/runtimes/${pinned.resourceId}-`;
  if (!window || Object.keys(window).sort().join() !== "endTime,logGroup,startTime"
    || typeof window.logGroup !== "string" || !window.logGroup.startsWith(prefix)
    || !/^[A-Za-z0-9_-]{1,100}$/.test(window.logGroup.slice(prefix.length))
    || !Number.isSafeInteger(window.startTime) || window.startTime < 0
    || !Number.isSafeInteger(window.endTime) || window.endTime <= window.startTime
    || window.endTime - window.startTime > 900_000) throw Error("Reviewed runtime log group and bounded time window required");
  const source = { runtimeArn: pinned.resourceArn, enrolledRuntimeVersion: pinned.version,
    logGroup: window.logGroup, startTime: window.startTime, endTime: window.endTime };
  let identity: unknown;
  try { identity = await api.callerIdentity(); } catch { throw Error("Observation caller identity unavailable"); }
  if (!identity || typeof identity !== "object" || (identity as { Account?: unknown }).Account !== pinned.scope.accountId) throw Error("Observation caller account mismatch");
  const result: InvocationWindow = { source, observations: [], completeness: "partial", failures: [], unsupportedRecords: 0, toolActivity: "unknown", enforcement: "unverified" };
  const events = new Map<string, string>(), tokens = new Set<string>();
  let nextToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    let response: Record<string, unknown>;
    try {
      const raw = await api.listEvents({ logGroupName: source.logGroup, startTime: source.startTime, endTime: source.endTime, limit: 100, ...(nextToken ? { nextToken } : {}) });
      if (raw && Buffer.byteLength(JSON.stringify(raw)) > 1_048_576) throw Error();
      response = raw as Record<string, unknown>;
    } catch { result.failures.push("read-unavailable"); return result; }
    if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.events) || response.events.length > 100) { result.failures.push("invalid-page"); return result; }
    for (const raw of response.events) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) { result.failures.push("invalid-event"); continue; }
      const event = raw as Record<string, unknown>;
      if (typeof event.eventId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(event.eventId)
        || typeof event.timestamp !== "number" || !Number.isSafeInteger(event.timestamp)
        || event.timestamp < source.startTime || event.timestamp >= source.endTime
        || typeof event.message !== "string" || Buffer.byteLength(event.message) > 65_536) { result.failures.push("invalid-event"); continue; }
      // Keep raw data only within this scan; public evidence retains the allowlisted projection.
      const signature = createHash("sha256").update(JSON.stringify([event.timestamp, event.message])).digest("hex");
      if (events.has(event.eventId)) {
        if (events.get(event.eventId) !== signature) result.failures.push("conflicting-event");
        continue;
      }
      events.set(event.eventId, signature);
      const observation = projectInvocationObservation(event.message, pinned);
      if (!observation) { result.unsupportedRecords++; continue; }
      result.observations.push({ sourceEventId: event.eventId, timestamp: event.timestamp, observation });
    }
    if (response.nextToken === undefined || response.nextToken === null) {
      if (!result.failures.length) result.completeness = "complete-api-traversal";
      return result;
    }
    if (typeof response.nextToken !== "string" || !/^\S{1,2048}$/.test(response.nextToken)) { result.failures.push("invalid-page"); return result; }
    if (tokens.has(response.nextToken)) { result.failures.push("pagination-cycle"); return result; }
    tokens.add(response.nextToken); nextToken = response.nextToken;
  }
  result.failures.push("page-limit"); return result;
}
