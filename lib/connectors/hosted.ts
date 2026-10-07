import { ControlError } from "../durable/contracts";
import type { Connector, ConnectorAction, ConnectorProvider, Observation } from "./contracts";
import { FetchSandboxConnectors, connectorBody } from "./twin";

export interface HostedBinding {
  origin: string;
  ownerKey: string;
  workspaceId: string;
  contactId: string;
  legs: Record<Connector, { sandboxId: string; apiKey: string }>;
}
const unavailable = () => new ControlError(503, "Hosted connector evidence unavailable. No safe retry inferred.");
export class HostedFetchSandboxConnectors implements ConnectorProvider {
  readonly workspaceId: string;
  constructor(readonly binding: HostedBinding, readonly timeout = 1500) {
    if (!binding || !["https://fetchsandbox.com", "https://stage.fetchsandbox.com", "http://127.0.0.1:8019"].includes(binding.origin)
      || typeof binding.ownerKey !== "string" || !/^fsk_[a-zA-Z0-9_-]{20,128}$/.test(binding.ownerKey)
      || typeof binding.workspaceId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(binding.workspaceId)
      || typeof binding.contactId !== "string" || !/^[0-9]{1,24}$/.test(binding.contactId)
      || !binding.legs || !["crm", "email"].every(c => {
        const leg = binding.legs[c as Connector];
        return leg && typeof leg.sandboxId === "string" && /^[a-f0-9]{10}$/.test(leg.sandboxId) && typeof leg.apiKey === "string" && leg.apiKey.length >= 16 && leg.apiKey.length <= 256;
      }) || binding.legs.crm.sandboxId === binding.legs.email.sandboxId) throw unavailable();
    this.workspaceId = binding.workspaceId;
  }
  body(a: ConnectorAction) { return connectorBody(a); }
  async request(path: string, credential: string, init: RequestInit = {}) {
    const response = await fetch(this.binding.origin + path, {
      ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(this.timeout),
      headers: { ...init.headers, Authorization: `Bearer ${credential}` },
    });
    if (!response.ok) throw unavailable();
    return response.json();
  }
  provider(connector: Connector, path: string, init: RequestInit = {}) {
    const leg = this.binding.legs[connector];
    return this.request(`/sandbox/${leg.sandboxId}${path}`, leg.apiKey, init);
  }
  async contact() { return this.provider("crm", `/crm/v3/objects/contacts/${this.binding.contactId}`); }
  async source(connector: Connector) {
    if (connector === "email") return null;
    const contact = await this.contact();
    if (contact.id !== this.binding.contactId || typeof contact.updatedAt !== "string" || !contact.updatedAt) throw unavailable();
    return contact.updatedAt as string;
  }
  async write(a: ConnectorAction, loseResponse: boolean): Promise<Observation> {
    if (a.org_id !== this.workspaceId) throw new ControlError(403, "Connector belongs to another workspace.");
    // HubSpot does not supply the private fixture's atomic version guard.
    // Retain LoopLabs' current approval invariant rather than quietly weakening it.
    if (a.connector === "crm") return { outcome: "unknown", detail: "CRM update not supported by this binding: atomic approval-version enforcement is unavailable. No write was sent; downstream actions stay held." };
    if (loseResponse) throw new ControlError(400, "Arm controlled faults through FetchSandbox; caller headers cannot inject faults.");
    await this.provider("email", "/emails", { method: "POST", headers: {
      "Content-Type": "application/json", "Idempotency-Key": `looplabs-${a.id}`, "X-Flow-Run-Id": `looplabs-${a.id}`,
    }, body: JSON.stringify(this.body(a)) });
    return this.inspect(a);
  }
  async inspect(a: ConnectorAction): Promise<Observation> {
    if (a.org_id !== this.workspaceId) throw new ControlError(403, "Connector belongs to another workspace.");
    if (a.connector === "crm") return { outcome: "unknown", detail: "CRM atomic approval-version enforcement is not supported by this binding. State alone cannot certify this action." };
    const leg = this.binding.legs.email;
    const archive = await this.request(`/api/sandboxes/${leg.sandboxId}/archive?kind=request&flow_run_id=looplabs-${encodeURIComponent(a.id)}&limit=101`, this.binding.ownerKey);
    if (!Array.isArray(archive.events) || archive.events.length >= 101) throw unavailable();
    const writes = archive.events.map((e: { payload: unknown }) => e.payload).filter((r: Record<string, unknown>) =>
      r && r.flow_run_id === `looplabs-${a.id}` && r.method === "POST" && r.path === "/emails" && typeof r.response_status === "number" && r.response_status >= 200 && r.response_status < 300);
    if (!writes.length) return { outcome: "unknown", detail: "No correlated provider acceptance was observed. Do not resend based on missing evidence." };
    if (writes.some((r: Record<string, unknown>) => JSON.stringify(r.request_body) !== JSON.stringify(this.body(a)))) return { outcome: "conflict", detail: "Provider request differs from the approved message." };
    const ids = new Set(writes.map((r: { response_body?: { id?: string } }) => r.response_body?.id));
    const reference = [...ids][0];
    if (ids.size !== 1 || typeof reference !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(reference)) return { outcome: "conflict", detail: "Provider acceptance does not identify exactly one email." };
    const record = await this.provider("email", `/emails/${encodeURIComponent(reference)}`);
    const expected = this.body(a);
    if (record.id !== reference || record.from !== expected.from || JSON.stringify(record.to) !== JSON.stringify(expected.to) || record.subject !== expected.subject || record.text !== expected.text) return { outcome: "conflict", detail: "Provider readback differs from the approved message or recipient." };
    return { outcome: "verified", reference, detail: "One correlated simulated provider acceptance and exact email readback verified. Inbox delivery is not established." };
  }
}
export function connectorProvider() {
  const raw = process.env.LOOPLABS_FETCHSANDBOX_BINDING;
  if (!raw) return new FetchSandboxConnectors();
  try { return new HostedFetchSandboxConnectors(JSON.parse(raw)); }
  catch { throw unavailable(); }
}
