import { reviewedMessageV2, type ReviewedMessageV2 } from "./content";
import type { ScopeGrantSnapshot } from "./scopes";
import type { RecordScope } from "./record-scope";
import type { RequestSnapshot } from "./request";
import { ControlError } from "../durable/contracts";
export const CONNECTORS = ["crm", "email", "quote"] as const;
export type ContactConnector = "crm" | "email";
export type Connector = (typeof CONNECTORS)[number];
export type Payload = (
  | import("./quote-action").QuoteStepPayload
  | { lifecycle: "lead" | "customer"; sourceVersion?: string }
  | { template: "case_received" }
  | ({ template: "reviewed_acknowledgement_v2" } & ReviewedMessageV2)
) & { binding?: string; request?: RequestSnapshot; scopeGrant?: ScopeGrantSnapshot };
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
  readonly recordScope?: Readonly<RecordScope>;
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
    !(["crm", "email"] as string[]).includes(p.connector) ||
    !p.payload ||
    typeof p.payload !== "object" ||
    Array.isArray(p.payload)
  )
    throw new ControlError(
      400,
      "Choose a registered agent and a supported sample workflow.",
    );
  const keys = Object.keys(p.payload);
  if (p.connector === "email" && (p.payload as {template?:string}).template === "reviewed_acknowledgement_v2") {
    if (keys.sort().join() !== "subject,template,text,version") throw new ControlError(400,"Only the exact reviewed message may be proposed.");
    const content = p.payload as ReviewedMessageV2;
    reviewedMessageV2({version:content.version,subject:content.subject,text:content.text});
    return p;
  }
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
