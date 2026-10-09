import { randomUUID } from "node:crypto";
import { ControlError, type Actor } from "../durable/contracts";
import { CloudInventoryStore } from "./cloud-inventory";
import { cloudDiscoveryBinding } from "./cloud-binding";
import { cloudProjectDiscoveryBinding } from "./cloud-project-binding";
import { collectProjectInventory, type ProjectDiscoveryScope, type ProjectInventoryApi } from "./cloud-project-discovery";
import { collectAwsRuntimeInventory, type AwsRuntimeInventoryApi, type CloudDiscoveryScope } from "./cloud-discovery";
function scanBudget(started: number, now: () => number) {
  const deadline = started + 45_000;
  return <T>(fn: () => Promise<T>): Promise<T> => {
    // Native transports bound one operation to15s. Preserve partial evidence
    // instead of admitting another request without its deadline remaining.
    if (now() > deadline - 15_000) return Promise.reject(Error("Discovery scan time budget reached"));
    return fn();
  };
}
export class CloudDiscoveryOperations {
  constructor(private readonly store: CloudInventoryStore, private readonly binding: (scope: CloudDiscoveryScope) => Promise<AwsRuntimeInventoryApi> = cloudDiscoveryBinding, private readonly now = Date.now, private readonly projectBinding: (scope: ProjectDiscoveryScope) => Promise<ProjectInventoryApi> = cloudProjectDiscoveryBinding) {}
  async connections(actor: Actor) {
    const data = await this.store.connections(actor);
    const connections = [];
    for (const c of data.connections) {
      let scanReady = false;
      try { await this.binding(c.scope); scanReady = true; } catch { /* Unconfigured is not connected. No cloud read occurs. */ }
      connections.push({ ...c, scanReady });
    }
    return { ...data, connections, scanningAvailable: connections.some(c => c.scanReady) };
  }
  async scan(actor: Actor, connectionId: string) {
    const { scope, allowed } = await this.store.beginScan(actor, connectionId);
    if (!allowed) throw new ControlError(429, "Too many discovery scans. Try again in a minute.");
    const api = await this.binding(scope), started = this.now(), read = scanBudget(started, this.now);
    const bounded: AwsRuntimeInventoryApi = { callerIdentity: () => read(() => api.callerIdentity()), listRuntimes: input => read(() => api.listRuntimes(input)), getRuntime: input => read(() => api.getRuntime(input)) };
    let result;
    try { result = await collectAwsRuntimeInventory(bounded, scope, new Date(started).toISOString()); }
    catch { throw new ControlError(503, "Cloud identity could not be verified. No discovery scan was saved."); }
    // Rechecks current session and recovery after network I/O. Never hold the
    // workspace transaction lock during a cloud request.
    await this.store.recordScan(actor, randomUUID(), result);
    return this.store.latest(actor, connectionId);
  }
  async projectConnections(actor: Actor) {
    const data = await this.store.projectConnections(actor), connections = [];
    for (const c of data.connections) {
      let scanReady = false;
      try { await this.projectBinding(c.scope); scanReady = true; } catch { /* Scope configuration is not verified cloud access. */ }
      connections.push({ ...c, scanReady });
    }
    return { ...data, connections, scanningAvailable: connections.some(c => c.scanReady) };
  }
  async scanProject(actor: Actor, connectionId: string) {
    const { scope, allowed } = await this.store.beginProjectScan(actor, connectionId);
    if (!allowed) throw new ControlError(429, "Too many discovery scans. Try again in a minute.");
    const api = await this.projectBinding(scope), started = this.now(), read = scanBudget(started, this.now);
    const bounded: ProjectInventoryApi = { scopeIdentity: () => read(() => api.scopeIdentity()), list: input => read(() => api.list(input)), get: input => read(() => api.get(input)),
      ...(api.listVersions ? { listVersions: (input: Parameters<NonNullable<ProjectInventoryApi["listVersions"]>>[0]) => read(() => api.listVersions!(input)) } : {}) };
    let result;
    try { result = await collectProjectInventory(bounded, scope, new Date(started).toISOString()); }
    catch { throw new ControlError(503, "Cloud project identity could not be verified. No discovery scan was saved."); }
    // Current membership, recovery epoch and exact saved scope are checked again
    // inside persistence after network I/O. Discovery never creates agents/tokens.
    await this.store.recordProjectScan(actor, randomUUID(), result);
    return this.store.latestProject(actor, connectionId);
  }

}
