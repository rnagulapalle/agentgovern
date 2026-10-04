export type ActionState =
  | "held"
  | "ready"
  | "executing"
  | "succeeded"
  | "blocked"
  | "rejected"
  | "cancelled"
  | "uncertain"
  | "conflict"
  | "recovered";
export type Role = "operator" | "agent" | "worker";
export interface Actor {
  orgId: string;
  subject: string;
  role: Role;
  tokenHash: string;
}
export interface Proposal {
  actionId: string;
  agentId: string;
  discount: number;
  expectedVersion: number;
}
export interface DurableAction {
  id: string;
  agent_id: string;
  discount: number;
  expected_version: number;
  policy_version: number;
  state: ActionState;
  reason: string;
  payload_hash: string;
  lease_token: string | null;
  lease_until: string | null;
  approved_by: string | null;
  approval_until: string | null;
  created_at: string;
}
export interface Snapshot {
  agents: {
    id: string;
    active: boolean;
    tools: string[];
    action_limit: number;
    reserved: number;
  }[];
  policy: { version: number; auto_limit: number; hard_limit: number };
  record: { version: number; discount: number };
  actions: DurableAction[];
  events: {
    id: string;
    action_id: string | null;
    kind: string;
    subject: string;
    at: string;
  }[];
  effects: {
    action_id: string;
    before_discount: number;
    after_discount: number;
    after_version: number;
    recovered: boolean;
  }[];
}
export class ControlError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function parseProposal(value: unknown): Proposal {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ControlError(400, "A structured action is required.");
  const p = value as Record<string, unknown>;
  if (
    Object.keys(p).some(
      (k) =>
        !["actionId", "agentId", "discount", "expectedVersion"].includes(k),
    ) ||
    typeof p.actionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      p.actionId,
    ) ||
    typeof p.agentId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(p.agentId) ||
    !Number.isInteger(p.discount) ||
    (p.discount as number) < 0 ||
    (p.discount as number) > 100 ||
    !Number.isSafeInteger(p.expectedVersion) ||
    (p.expectedVersion as number) < 1
  )
    throw new ControlError(
      400,
      "Provide a UUID v4 action ID, agent ID, integer discount (0–100), and record version.",
    );
  return p as unknown as Proposal;
}
