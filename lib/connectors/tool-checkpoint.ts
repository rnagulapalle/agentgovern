import { parseConnectorProposal, type ConnectorProposal } from "./contracts";
import { LoopLabsToolClient, ToolRequestError, type ToolDecision } from "./tool-client";

export interface CheckpointTicket {
  actionId: string;
  agentId: string;
  connector: "crm" | "email";
  payloadHash: string;
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
    if (!ticket || Object.keys(ticket).sort().join() !== "actionId,agentId,connector,payloadHash"
      || ticket.agentId !== this.agentId || !["crm", "email"].includes(ticket.connector)
      || typeof ticket.payloadHash !== "string" || !/^[a-f0-9]{64}$/.test(ticket.payloadHash)) throw new ToolRequestError("refused");
    const pinned = { ...ticket };
    const decision = await this.client.read(pinned.actionId);
    if (decision.connector !== pinned.connector || decision.payload_hash !== pinned.payloadHash) throw new ToolRequestError("unconfirmed");
    return this.result(decision);
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
