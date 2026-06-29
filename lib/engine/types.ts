/**
 * AgentGovernance — Execution Policy Engine · types
 *
 * Design principles (from docs/research/2026-06-agent-governance-reddit.md):
 *  - The model proposes (ActionRequest). The engine decides (evaluate()).
 *  - Policy lives outside the agent; evaluation is deterministic.
 *  - No external action without evidence; missing evidence is a hard block.
 *  - Approval is independent from reasoning. Receipts are immutable.
 */

export type CapabilityId =
  | "email.send"
  | "crm.update"
  | "calendar.schedule"
  | "agent.delegate"
  | "payment.refund"
  | "data.export";

export type DecisionType = "allow" | "require_approval" | "block";

/** A record from the system of truth (CRM, billing, …) used for an action. */
export interface SourceRecord {
  id: string; // e.g. "hubspot/contact/8842"
  system: string; // "HubSpot"
  lastSyncedAt: string; // ISO timestamp
}

/** The agent's PROPOSED action — structured, not executed. */
export interface ActionRequest {
  id: string;
  agentId: string;
  capability: CapabilityId;
  tool: string; // "Gmail"
  summary: string; // human-readable
  params: Record<string, unknown>; // { discountPct: 25, recipient: "john@acme.com" }
  target?: string; // intended recipient/target, e.g. "john@acme.com"
  sourceRecord?: SourceRecord; // provenance for freshness + diff
  diff?: Record<string, { from: unknown; to: unknown }>; // change vs current state
  estCostUsd?: number;
  at: string; // ISO timestamp of the request
}

/** What an agent may do — the hard contract (capability registry entry). */
export interface Capability {
  id: CapabilityId;
  maxDiscountPct?: number;
  maxSpendUsd?: number;
  requiresFreshSourceWithinDays?: number;
  requiresTarget?: boolean;
  requiresDiff?: boolean;
}

export interface AgentIdentity {
  id: string; // "SDR-Agent-17"
  owner: string;
  role: string;
  riskTier: "Low" | "Medium" | "High";
  capabilities: Capability[]; // the registry / contract
  restrictedTools: string[];
}

/** Per-run blast-radius budget. */
export interface RunBudget {
  maxSpendUsd: number;
  spentUsd: number;
  maxActions: number;
  actionCount: number;
}

export interface EvalContext {
  agent: AgentIdentity;
  now: string; // ISO — passed in so the engine is deterministic (never Date.now)
  budget?: RunBudget;
}

export type CheckStatus = "pass" | "approval" | "fail";

export interface PolicyCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  policyId?: string;
  severity: "info" | "low" | "medium" | "high";
}

/** Evidence captured on the receipt — required BEFORE the action may run. */
export interface ReceiptEvidence {
  sourceRecordId: string | null;
  sourceSystem: string | null;
  sourceLastSyncedAt: string | null;
  freshnessOk: boolean | null; // null = no source required
  freshnessAgeDays: number | null;
  intendedTarget: string | null;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  estCostUsd: number | null;
  permittingRule: string | null;
}

/** Immutable, signed record produced for every evaluated action. */
export interface ActionReceipt {
  id: string; // "rcpt_…"
  actionId: string;
  agentId: string;
  capability: CapabilityId;
  decision: DecisionType;
  riskScore: number; // 0–100
  evidence: ReceiptEvidence;
  evidenceComplete: boolean;
  checks: PolicyCheck[];
  createdAt: string;
  evidenceHash: string; // 0x… deterministic hash of the evidence
  signature: string; // ed25519:… deterministic demo signature
}

export interface EvaluationResult {
  decision: DecisionType;
  riskScore: number;
  checks: PolicyCheck[];
  receipt: ActionReceipt;
  blockingReasons: string[];
}
