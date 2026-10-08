import type { RequestSnapshot } from "./request";
import { ControlError } from "../durable/contracts";
export const CONNECTORS = ["crm", "email"] as const;
export type Connector = (typeof CONNECTORS)[number];
export type Payload = (
  | { lifecycle: "lead" | "customer"; sourceVersion?: string }
  | { template: "case_received" }
) & { binding?: string; request?: RequestSnapshot };
export interface ConnectorAction {
  id: string;
  org_id: string;
  agent_id: string;
  connector: Connector;
  payload: Payload;
  payload_hash: string;
  policy_version: number;
  state:
    | "held"
    | "ready"
    | "executing"
    | "succeeded"
    | "uncertain"
    | "conflict"
    | "rejected"
    | "cancelled";
  reason: string;
  proposed_by: string;
  approved_by: string | null;
  approval_until: string | null;
  lease_token: string | null;
  lease_until: string | null;
  evidence: unknown;
  created_at: string;
}
export interface ConnectorProposal {
  actionId: string;
  agentId: string;
  connector: Connector;
  payload: Payload;
}
export interface Observation {
  outcome: "verified" | "conflict" | "unknown";
  reference?: string;
  detail: string;
}
export interface ConnectorProvider {
  readonly bindingId: string;
  readonly contactId?: string;
  readonly workspaceId: string;
  source(connector: Connector): Promise<string | null>;
  write(action: ConnectorAction, loseResponse: boolean): Promise<Observation>;
  inspect(action: ConnectorAction): Promise<Observation>;
}
export function parseConnectorProposal(v: unknown): ConnectorProposal {
  const p = v as ConnectorProposal;
  if (
    !p ||
    typeof p !== "object" ||
    Array.isArray(p) ||
    Object.keys(p).some(
      (k) => !["actionId", "agentId", "connector", "payload"].includes(k),
    ) ||
    typeof p.actionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      p.actionId,
    ) ||
    typeof p.agentId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(p.agentId) ||
    !CONNECTORS.includes(p.connector) ||
    !p.payload ||
    typeof p.payload !== "object" ||
    Array.isArray(p.payload)
  )
    throw new ControlError(
      400,
      "Choose a registered agent and a supported sample workflow.",
    );
  const keys = Object.keys(p.payload);
  if (
    keys.length !== 1 ||
    (p.connector === "crm"
      ? keys[0] !== "lifecycle" ||
        !["lead", "customer"].includes(
          (p.payload as { lifecycle: string }).lifecycle,
        )
      : keys[0] !== "template" ||
        (p.payload as { template: string }).template !== "case_received")
  )
    throw new ControlError(
      400,
      "Only the prepared contact lifecycle and customer-message template are allowed.",
    );
  return p;
}

// Only server-created payloads contain this field; public proposals reject it.
export function bindingMatches(provider: ConnectorProvider, action: Pick<ConnectorAction, "payload">) {
  const current = provider.bindingId;
  return typeof current === "string" && /^[a-f0-9]{64}$/.test(current) && action.payload.binding === current;
}
