import { createHmac, randomUUID } from "node:crypto";
export const roles = ["worker", "scheduler"] as const;
type Role = typeof roles[number];
type Condition = "unavailable" | "backlog";
export type Alert = { id: string; role: Role; condition: Condition; transition: "opened" | "resolved"; at: number };
type RoleState = { failures: number; unavailable: boolean; backlog: boolean };
export type MonitorState = { version: 1; roles: Record<Role, RoleState>; pending: Alert[] };
export function initialState(): MonitorState {
  return { version: 1, roles: { worker: { failures: 0, unavailable: false, backlog: false }, scheduler: { failures: 0, unavailable: false, backlog: false } }, pending: [] };
}
export function parseState(value: unknown): MonitorState {
  const s = value as MonitorState;
  if (!s || s.version !== 1 || !s.roles || !Array.isArray(s.pending) || s.pending.length > 1000) throw Error("Invalid monitor journal");
  for (const role of roles) {
    const r = s.roles[role];
    if (!r || !Number.isInteger(r.failures) || r.failures < 0 || r.failures > 3 || typeof r.unavailable !== "boolean" || typeof r.backlog !== "boolean") throw Error("Invalid monitor journal");
  }
  for (const a of s.pending) {
    if (!a || !/^[a-f0-9-]{36}$/.test(a.id) || !roles.includes(a.role) || !["unavailable", "backlog"].includes(a.condition) || !["opened", "resolved"].includes(a.transition) || !Number.isSafeInteger(a.at) || a.at < 0) throw Error("Invalid monitor journal");
  }
  // Reconstruct only the approved fields; arbitrary stored input never reaches alerts.
  return { version: 1, roles: Object.fromEntries(roles.map(role => [role, { failures: s.roles[role].failures, unavailable: s.roles[role].unavailable, backlog: s.roles[role].backlog }])) as Record<Role, RoleState>, pending: s.pending.map(a => ({ id: a.id, role: a.role, condition: a.condition, transition: a.transition, at: a.at })) };
}
export function endpoint(raw: string, allowLoopback: boolean): string {
  const url = new URL(raw);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(allowLoopback && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw Error("Alert monitor requires HTTPS or explicit local proof transport");
  return url.toString();
}
export function observation(value: unknown, role: Role): { ready: boolean; backlog: boolean } {
  const s = value as { role?: unknown; ready?: unknown; alerts?: unknown };
  if (!s || s.role !== role || typeof s.ready !== "boolean" || !Array.isArray(s.alerts) || !s.alerts.every(a => typeof a === "string" && ["dependency_unavailable", "health_check_stale", "dispatch_backlog_older_than_60s"].includes(a))) throw Error("Invalid health signal");
  return { ready: s.ready && !s.alerts.includes("dependency_unavailable") && !s.alerts.includes("health_check_stale"), backlog: s.alerts.includes("dispatch_backlog_older_than_60s") };
}
export class AlertMonitor {
  constructor(readonly state: MonitorState, readonly save: (state: MonitorState) => Promise<void>) {}
  async observe(role: Role, signal: { ready: boolean; backlog: boolean } | null, now: number) {
    const r = this.state.roles[role];
    r.failures = signal?.ready ? 0 : Math.min(3, r.failures + 1);
    const changes: [Condition, boolean][] = [["unavailable", r.failures >= 3 || (r.unavailable && r.failures > 0)]];
    // An unavailable dependency cannot establish backlog recovery.
    if (signal?.ready) changes.push(["backlog", signal.backlog]);
    for (const [condition, active] of changes) {
      if (r[condition] !== active) {
        if (this.state.pending.length >= 1000) throw Error("Alert queue full; operator intervention required");
        this.state.pending.push({ id: randomUUID(), role, condition, transition: active ? "opened" : "resolved", at: now });
        r[condition] = active;
      }
    }
    await this.save(this.state);
  }
  async deliver(send: (event: Alert, signature: string) => Promise<void>, key: string) {
    if (Buffer.byteLength(key) < 32) throw Error("Alert signing key must contain at least 32 bytes");
    // Persist-before-send and retain the same ID after an ambiguous acknowledgement.
    for (let n = 0; n < 20 && this.state.pending.length; n++) {
      const event = this.state.pending[0];
      await send(event, createHmac("sha256", key).update(JSON.stringify(event)).digest("hex"));
      this.state.pending.shift(); await this.save(this.state);
    }
  }
}
