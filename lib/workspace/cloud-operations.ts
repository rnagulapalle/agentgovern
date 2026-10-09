import { randomUUID } from "node:crypto";
import { ControlError, type Actor } from "../durable/contracts";
import { CloudInventoryStore } from "./cloud-inventory";
import { cloudDiscoveryBinding } from "./cloud-binding";
import { collectAwsRuntimeInventory, type AwsRuntimeInventoryApi, type CloudDiscoveryScope } from "./cloud-discovery";
export class CloudDiscoveryOperations {
  constructor(private readonly store: CloudInventoryStore, private readonly binding: (scope: CloudDiscoveryScope) => Promise<AwsRuntimeInventoryApi> = cloudDiscoveryBinding, private readonly now = Date.now) {}
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
    const api = await this.binding(scope), started = this.now(), deadline = started + 45_000;
    function read<T>(fn: () => Promise<T>, now: () => number) {
      // Each real CLI read kills its child after15s. Don't admit another read
      // without that time remaining. Exhaustion persists partial evidence.
      if (now() > deadline - 15_000) return Promise.reject(new Error("Discovery scan time budget reached"));
      return fn();
    }
    const bounded: AwsRuntimeInventoryApi = { callerIdentity: () => read(() => api.callerIdentity(), this.now), listRuntimes: input => read(() => api.listRuntimes(input), this.now), getRuntime: input => read(() => api.getRuntime(input), this.now) };
    let result;
    try { result = await collectAwsRuntimeInventory(bounded, scope, new Date(started).toISOString()); }
    catch { throw new ControlError(503, "Cloud identity could not be verified. No discovery scan was saved."); }
    // Rechecks current session and recovery after network I/O. Never hold the
    // workspace transaction lock during a cloud request.
    await this.store.recordScan(actor, randomUUID(), result);
    return this.store.latest(actor, connectionId);
  }
}
