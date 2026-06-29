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

const REGISTRY: Record<string, AgentIdentity> = {
  [SDR_AGENT_17.id]: SDR_AGENT_17,
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
