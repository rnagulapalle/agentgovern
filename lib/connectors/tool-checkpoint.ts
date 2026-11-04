import { parseConnectorProposal, type ConnectorProposal } from "./contracts";
import { LoopLabsToolClient, ToolRequestError, type ToolDecision } from "./tool-client";

export interface CheckpointTicket {
  actionId: string;
  agentId: string;
  connector: "crm" | "email";
  payloadHash: string;
}
const ticketKeys = ["actionId", "agentId", "connector", "payloadHash"];
function checkedTicket(value: unknown): CheckpointTicket {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new ToolRequestError("refused");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== ticketKeys.length || !ticketKeys.every(key => fields[key] && "value" in fields[key] && fields[key].enumerable))
    throw new ToolRequestError("refused");
  const v = value as CheckpointTicket;
  if (typeof v.actionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.actionId)
    || typeof v.agentId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(v.agentId)
    || !["crm", "email"].includes(v.connector) || typeof v.payloadHash !== "string" || !/^[a-f0-9]{64}$/.test(v.payloadHash))
    throw new ToolRequestError("refused");
  return { actionId: v.actionId, agentId: v.agentId, connector: v.connector, payloadHash: v.payloadHash };
}
/** Persist in the existing runner's durable checkpoint, never in an agent prompt.
 * This is a reference to saved state, not signed evidence or execution authority. */
export function serializeCheckpointTicket(ticket: CheckpointTicket): string {
  return JSON.stringify({ contract: "looplabs-checkpoint-ticket-1", ticket: checkedTicket(ticket) });
}
export function parseCheckpointTicket(encoded: string): CheckpointTicket {
  try {
    if (typeof encoded !== "string" || encoded.length > 512) throw new ToolRequestError("refused");
    const v = JSON.parse(encoded);
    if (!v || v.contract !== "looplabs-checkpoint-ticket-1") throw new ToolRequestError("refused");
    const ticket = checkedTicket(v.ticket);
    // Accept only our canonical representation: rejects duplicate keys, unknown
    // fields, credentials, trailing data and ambiguous version reinterpretation.
    if (serializeCheckpointTicket(ticket) !== encoded) throw new ToolRequestError("refused");
    return ticket;
  } catch {
    throw new ToolRequestError("refused");
  }
}
export interface CheckpointResult {
  ticket: CheckpointTicket;
  status: "held" | "execution-pending" | "executing" | "action-verified" | "uncertain" | "needs-review" | "rejected" | "cancelled";
  providerExecutionGranted: false;
  workflowCompleted: false;
}
/**
 * External tool boundary for existing supported connector contracts only.
 * Reuses server authority through the existing client. Never invokes a provider,
 * approves a request, dispatches a write, supplies an execution permit or retries.
 * The separate enrolled worker owns execution; succeeded is one action, not a run.
 * Binding real HubSpot/pricing tools requires its own reviewed connector contract.
 */
export class LoopLabsToolCheckpoint {
  private readonly client: LoopLabsToolClient;
  constructor(origin: string, private readonly agentId: string, credential: () => Promise<string>, timeoutMs = 10_000) {
    this.client = new LoopLabsToolClient(origin, agentId, credential, timeoutMs);
  }
  async propose(proposal: Omit<ConnectorProposal, "agentId">): Promise<CheckpointResult> {
    // Reuse the existing strict schema; do not broaden tool payloads in an SDK wrapper.
    const parsed = parseConnectorProposal({ ...proposal, agentId: this.agentId });
    const decision = await this.client.propose(parsed);
    return this.result(decision);
  }
  async read(ticket: CheckpointTicket): Promise<CheckpointResult> {
    const pinned = checkedTicket(ticket);
    if (pinned.agentId !== this.agentId) throw new ToolRequestError("refused");
    const decision = await this.client.read(pinned.actionId);
    if (decision.connector !== pinned.connector || decision.payload_hash !== pinned.payloadHash) throw new ToolRequestError("unconfirmed");
    return this.result(decision);
  }
  /** Fresh credentials and current server checks on every restart. GET only;
   * never generates an action ID, repeats a proposal or dispatches a provider. */
  async resume(encodedTicket: string): Promise<CheckpointResult> {
    return this.read(parseCheckpointTicket(encodedTicket));
  }
  private result(decision: ToolDecision): CheckpointResult {
    const statuses = {
      held: "held", ready: "execution-pending", executing: "executing", succeeded: "action-verified",
      uncertain: "uncertain", conflict: "needs-review", rejected: "rejected", cancelled: "cancelled",
    } as const;
    // ToolClient validates responses; keep the runtime default closed if its contract expands.
    if (decision.agent_id !== this.agentId || !["crm", "email"].includes(decision.connector)
      || !Object.hasOwn(statuses, decision.state)) throw new ToolRequestError("unconfirmed");
    return { ticket: { actionId: decision.id, agentId: decision.agent_id, connector: decision.connector as "crm" | "email", payloadHash: decision.payload_hash },
      status: statuses[decision.state as keyof typeof statuses], providerExecutionGranted: false, workflowCompleted: false };
  }
}
