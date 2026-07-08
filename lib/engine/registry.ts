/**
 * Capability Registry — the hard contract for each agent.
 *
 * What an agent may do is declared and enforced here, NOT inferred from a prompt.
 * (Reddit signal: "treat 'agent may send a contract / change CRM state' as a
 *  capability that needs a hard contract, not a prompt instruction.")
 */

import type { AgentIdentity, Capability, CapabilityId } from "./types";

export const SDR_AGENT_17: AgentIdentity = {
  id: "SDR-Agent-17",
  owner: "Raj Nagulapalle",
  role: "Outbound Sales Assistant",
  riskTier: "Medium",
  restrictedTools: ["Stripe", "DocuSign", "Payroll"],
  capabilities: [
    {
      id: "email.send",
      maxDiscountPct: 10, // delegated authority
      requiresFreshSourceWithinDays: 14, // root-cause guard: no stale-contact sends
      requiresTarget: true,
    },
    {
      id: "crm.update",
      requiresFreshSourceWithinDays: 14,
      requiresDiff: true,
    },
    { id: "calendar.schedule" },
    { id: "agent.delegate" },
  ],
};

/**
 * Institutional analytics agent (higher-ed / data-governance demo).
 * Reads governed datasets; large exports of regulated data route to a human
 * data steward. estCostUsd carries the row count for the threshold check.
 */
export const ANALYTICS_AGENT_09: AgentIdentity = {
  id: "Analytics-Agent-09",
  owner: "Priya Raman",
  role: "Institutional Analytics Assistant",
  riskTier: "High",
  restrictedTools: ["Payroll", "SIS-Write", "Stripe"],
  capabilities: [
    {
      id: "data.export",
      maxSpendUsd: 500, // rows: exports above 500 need data-steward approval
      requiresTarget: true, // must go to a sanctioned destination
      requiresFreshSourceWithinDays: 180, // dataset classification must be reviewed
    },
    { id: "crm.update", requiresFreshSourceWithinDays: 180, requiresDiff: true },
  ],
};

const REGISTRY: Record<string, AgentIdentity> = {
  [SDR_AGENT_17.id]: SDR_AGENT_17,
  [ANALYTICS_AGENT_09.id]: ANALYTICS_AGENT_09,
};

export function getAgent(agentId: string): AgentIdentity | undefined {
  return REGISTRY[agentId];
}

export function getCapability(
  agent: AgentIdentity,
  id: CapabilityId
): Capability | undefined {
  return agent.capabilities.find((c) => c.id === id);
}
