import { ControlError, type Actor } from "../durable/contracts";
import { CloudInventoryStore } from "./cloud-inventory";
import { cloudObservationBinding } from "./cloud-binding";
import { readPrivateDiscoveryBinding } from "./cloud-private-binding";
import { collectAwsInvocationWindow, type AwsInvocationLogsApi } from "./cloud-invocation-reader";
import type { DiscoveredRuntime } from "./cloud-discovery";
export interface ActivityReference { connectionId: string; scanId: string; resourceArn: string; version: string }
export function activityReference(value: unknown): ActivityReference {
  const v = value as ActivityReference;
  if (!v || Object.keys(v).sort().join() !== "connectionId,resourceArn,scanId,version"
    || typeof v.connectionId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(v.connectionId)
    || typeof v.scanId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.scanId)
    || typeof v.resourceArn !== "string" || !/^arn:aws:bedrock-agentcore:[a-z]{2}-[a-z]+-[1-9]:[0-9]{12}:runtime\/[a-zA-Z][a-zA-Z0-9_]{0,47}-[a-zA-Z0-9]{10}$/.test(v.resourceArn)
    || typeof v.version !== "string" || !/^[1-9][0-9]{0,4}$/.test(v.version))
    throw new ControlError(400, "Choose an agent from the current AWS inventory.");
  return { connectionId: v.connectionId, scanId: v.scanId, resourceArn: v.resourceArn, version: v.version };
}
// Separate administrator-reviewed source; neither a browser nor an agent chooses a log group.
export async function cloudActivitySource(runtime: DiscoveredRuntime, path = process.env.LOOPLABS_CLOUD_ACTIVITY_SOURCE_FILE) {
  try {
    const v = await readPrivateDiscoveryBinding(path) as { scope: unknown; runtimeArn: unknown; version: unknown; logGroup: unknown };
    if (!v || Object.keys(v).sort().join() !== "logGroup,runtimeArn,scope,version"
      || !v.scope || typeof v.scope !== "object" || Array.isArray(v.scope)
      || Object.keys(v.scope).sort().join() !== "accountId,connectionId,region,tenantId"
      || Object.entries(runtime.scope).some(([k,x]) => (v.scope as Record<string,unknown>)[k] !== x)
      || v.runtimeArn !== runtime.resourceArn || v.version !== runtime.version
      || typeof v.logGroup !== "string"
      || !v.logGroup.startsWith(`/aws/bedrock-agentcore/runtimes/${runtime.resourceId}-`)
      || !/^[A-Za-z0-9_-]{1,100}$/.test(v.logGroup.slice(`/aws/bedrock-agentcore/runtimes/${runtime.resourceId}-`.length))) throw Error();
    return v.logGroup;
  } catch { throw new ControlError(503, "Activity access is not configured for this agent version. Ask your cloud administrator to review its CloudWatch log source and read permission."); }
}
function current(data: Awaited<ReturnType<CloudInventoryStore["latest"]>>, reference: ActivityReference, now: number) {
  const found = data.records.find(r => r.record.resourceArn === reference.resourceArn && r.record.version === reference.version);
  if (data.status !== "observed" || data.scanId !== reference.scanId || data.stale || !found?.observedInCurrentScan || found.stale
    || Date.parse(found.record.observedAt) > now + 300000 || now - Date.parse(found.record.observedAt) > 900000)
    throw new ControlError(409, "Refresh AWS discovery, then select the current agent version before checking activity.");
  return found.record;
}
export class CloudActivityOperations {
  constructor(private readonly store: CloudInventoryStore,
    private readonly binding: typeof cloudObservationBinding = cloudObservationBinding,
    private readonly source: (runtime: DiscoveredRuntime) => Promise<string> = cloudActivitySource,
    private readonly now = Date.now) {}
  async read(actor: Actor, value: unknown) {
    const reference = activityReference(value);
    const admission = await this.store.beginScan(actor, reference.connectionId);
    if (!admission.allowed) throw new ControlError(429, "Too many cloud checks. Try again in a minute.");
    const runtime = current(await this.store.latest(actor, reference.connectionId), reference, this.now());
    if (runtime.scope.tenantId !== actor.orgId || JSON.stringify(runtime.scope) !== JSON.stringify(admission.scope)) throw new ControlError(409, "AWS connection scope changed. Refresh discovery.");
    const logGroup = await this.source(runtime), api = await this.binding(runtime.scope), started = this.now();
    const read = <T>(fn: () => Promise<T>) => this.now() > started + 30000 ? Promise.reject(Error("Activity time budget reached")) : fn();
    const bounded: AwsInvocationLogsApi = { callerIdentity: () => read(() => api.callerIdentity()), listEvents: input => read(() => api.listEvents(input)) };
    let window;
    try { window = await collectAwsInvocationWindow(bounded, runtime, { logGroup, startTime: started - 900000, endTime: started }); }
    catch { throw new ControlError(503, "AWS activity identity or log source could not be verified. No activity result was accepted."); }
    // Revalidate membership, recovery, scan and identity after network I/O. A historical version cannot silently become current.
    const after = current(await this.store.latest(actor, reference.connectionId), reference, this.now());
    if (JSON.stringify(after) !== JSON.stringify(runtime)) throw new ControlError(409, "AWS inventory changed during the activity check. Refresh discovery.");
    return { reference, checkedAt: new Date(this.now()).toISOString(), retention: "request-only" as const, ...window };
  }
}
