/**
 * Demo scenario library.
 *
 * Each Scenario is one "governance incident" the control-plane demo can play,
 * driven end-to-end by the REAL engine (lib/engine). A scenario supplies only
 * presentation data + the inputs for one governed ActionRequest; the verdict,
 * risk, evidence and receipt all come from evaluate(). This is what lets us add
 * runs without forking the demo — one component set, many scenarios.
 *
 * Grounded in docs/research/2026-06-agent-governance-reddit.md:
 *  - Run 1 (discount)   → over-authority threshold → human approval  (Signal: delegated authority)
 *  - Run 2 (stale CRM)  → source-of-truth freshness → hard block     (Signals 3, 8, 15 — the origin incident)
 */

import { Mail, Database, CalendarClock, Sparkles, type LucideIcon } from "lucide-react";
import type { AgentIdentity, ActionRequest } from "./engine";
import { SDR_AGENT_17 } from "./engine";
import type { PlannedAction, PolicyCheck, ActionId } from "./mock-data";
import type { Decision } from "./types";

const DAY_MS = 86_400_000;
const isoDaysBefore = (iso: string, days: number) =>
  new Date(new Date(iso).getTime() - days * DAY_MS).toISOString();

/** Display identity card (distinct from the engine AgentIdentity contract). */
export interface AgentCard {
  name: string;
  owner: string;
  role: string;
  delegatedBy: string;
  sessionExpires: string;
  sessionRemaining: string;
  riskTier: "Low" | "Medium" | "High";
  allowedTools: string[];
  restrictedTools: string[];
  fingerprint: string;
}

/** The single interactive control that drives the governed action live. */
export interface ScenarioControl {
  /** How the control value maps into the ActionRequest. */
  kind: "discount" | "freshness";
  unit: string; // "%" | "d"
  min: number;
  max: number;
  step: number;
  cap: number; // policy threshold; value > cap == over authority
  capMarkerLabel: string; // "cap 10%" | "stale > 14d"
  default: number;
  presets: number[];
  staticLabel: string; // "Agent's discount offer"
  interactiveLabel: string; // "Drag — adjust the agent's offer"
  policyId: string;
  policyText: string;
  okBannerTitle: string;
  badBannerTitle: string;
  /** Governed row copy in the evaluated-rules list. */
  rowLabel: (v: number) => string;
  rowDetailOk: (v: number) => string;
  rowDetailBad: (v: number) => string;
}

export interface DecisionButton {
  decision: Exclude<Decision, null>;
  label: string;
  variant: "primary" | "secondary" | "danger";
  icon: "edit" | "shield" | "override" | "reject";
}

export interface ResolvedCopy {
  approvalTitle: string;
  tone: "emerald" | "indigo" | "red";
  approvalLine: (v: number) => string;
  receiptLabel: string;
  receiptOutput: (v: number) => string;
  approver: string;
}

export interface Scenario {
  id: string;
  /** Switcher tab. */
  tab: string;
  tabHint: string;
  runId: string; // audit crumb
  consoleName: string; // "agent-console · SDR-Agent-17"
  agent: AgentIdentity; // engine contract
  agentCard: AgentCard; // display identity
  humanTask: string;
  reasoningLines: string[];
  plannedActions: PlannedAction[];
  /** Which planned action is evaluated live by the engine. */
  governedActionId: ActionId;
  /** Static context rows shown above the governed row. */
  policyRows: PolicyCheck[];
  /** The engine check id whose status drives the governed row. */
  governedCheckId: string;
  now: string;
  control: ScenarioControl;
  /** Build the governed ActionRequest from the current control value. */
  buildRequest: (value: number) => ActionRequest;
  approval: {
    headerOk: string;
    headerNeedsDecision: string;
    reasonOk: (v: number) => string;
    reasonBad: (v: number) => string;
    summary: (v: number, risk: number) => { l: string; v: string; mono?: boolean }[];
    /** Buttons shown when the action needs a human (require_approval or block). */
    buttons: DecisionButton[];
  };
  receipt: {
    file: string;
    seq: string;
    agentName: string;
    owner: string;
    tool: string;
    action: string;
    inputQuote: string;
    chainLabel: string;
  };
  audit: {
    othersTitle: string;
    othersDetail: string;
    governedOkTitle: string;
    governedBadTitle: string;
    governedDetail: (over: boolean, v: number) => string;
  };
  resolved: Record<Exclude<Decision, null>, ResolvedCopy>;
}

/* ------------------------------------------------------------------ */
/*  Shared display identity for SDR-Agent-17 (both runs use it)        */
/* ------------------------------------------------------------------ */

const SDR_CARD: AgentCard = {
  name: "SDR-Agent-17",
  owner: "Raj Nagulapalle",
  role: "Outbound Sales Assistant",
  delegatedBy: "Raj",
  sessionExpires: "24h",
  sessionRemaining: "23h 41m",
  riskTier: "Medium",
  allowedTools: ["Gmail", "HubSpot", "Calendar"],
  restrictedTools: ["Stripe", "DocuSign", "Payroll"],
  fingerprint: "did:agentgovern:0x4f2a91c7",
};

const RUN_NOW = "2026-06-28T23:41:00Z";

/* ================================================================== */
/*  Run 1 — Sales discount above delegated authority → human approval  */
/*  (behaviour-identical to the original single-run demo)              */
/* ================================================================== */

const DISCOUNT_SCENARIO: Scenario = {
  id: "sales-discount",
  tab: "Sales · discount",
  tabHint: "over-authority → approval",
  runId: "run_a91f-2207",
  consoleName: "agent-console · SDR-Agent-17",
  agent: SDR_AGENT_17,
  agentCard: SDR_CARD,
  humanTask:
    "Follow up with John from Acme. Offer a 25% discount, update HubSpot, and schedule a call tomorrow if he doesn’t reply.",
  reasoningLines: [
    "Loading lead context — Acme · John Carter (VP Sales)",
    "Last touch 11 days ago · opened 2 emails · no reply",
    "Selecting tools — Gmail, HubSpot, Calendar",
    "Drafting re-engagement offer · discount 25%",
    "Composing 4-step action plan",
  ],
  plannedActions: [
    {
      id: "email",
      title: "Draft follow-up email to John",
      detail: "Personalized re-engagement with a 25% discount offer.",
      tool: "Gmail",
      icon: Mail,
      status: "blocked",
    },
    {
      id: "crm",
      title: "Update Acme CRM stage",
      detail: "Move deal Acme · Q3 Expansion → “Negotiation”.",
      tool: "HubSpot",
      icon: Database,
      status: "auto-approved",
    },
    {
      id: "call",
      title: "Schedule follow-up call (tomorrow)",
      detail: "Hold 15-min slot if no reply within 24h.",
      tool: "Calendar",
      icon: CalendarClock,
      status: "auto-approved",
    },
    {
      id: "delegate",
      title: "Delegate lead enrichment to Research-Agent-02",
      detail: "Scoped, read-only access to public firmographics.",
      tool: "Agent Mesh",
      icon: Sparkles,
      status: "auto-approved",
    },
  ],
  governedActionId: "email",
  governedCheckId: "discount",
  policyRows: [
    {
      id: "crm",
      label: "CRM stage update",
      detail: "Within delegated authority for HubSpot deal stages.",
      verdict: "allowed",
    },
    {
      id: "calendar",
      label: "Calendar scheduling",
      detail: "Booking on owner’s calendar is permitted for SDR agents.",
      verdict: "allowed",
    },
    {
      id: "delegate",
      label: "Research delegation",
      detail: "Allowed with scoped, read-only access — no write tools shared.",
      verdict: "scoped",
    },
  ],
  now: RUN_NOW,
  control: {
    kind: "discount",
    unit: "%",
    min: 0,
    max: 40,
    step: 1,
    cap: 10,
    capMarkerLabel: "cap 10%",
    default: 25,
    presets: [10, 25, 40],
    staticLabel: "Agent's discount offer",
    interactiveLabel: "Drag — adjust the agent's offer",
    policyId: "POL-SDR-DISCOUNT-002",
    policyText:
      "AI SDR agents may offer discounts up to 10%. Discounts above 10% require human approval.",
    okBannerTitle: "Within delegated authority",
    badBannerTitle: "Blocked — discount exceeds delegated authority",
    rowLabel: (v) => `Email with ${v}% discount`,
    rowDetailOk: (v) => `Discount of ${v}% is within the 10% cap.`,
    rowDetailBad: (v) => `Discount of ${v}% exceeds delegated authority.`,
  },
  buildRequest: (value) => ({
    id: "act_9281",
    agentId: SDR_AGENT_17.id,
    capability: "email.send",
    tool: "Gmail",
    summary: `Send follow-up email · ${value}% discount`,
    target: "john@acme.com",
    params: { discountPct: value },
    sourceRecord: {
      id: "hubspot/contact/8842",
      system: "HubSpot",
      lastSyncedAt: isoDaysBefore(RUN_NOW, 2),
    },
    at: RUN_NOW,
  }),
  approval: {
    headerOk: "Authority check",
    headerNeedsDecision: "Approval required",
    reasonOk: (v) =>
      `Discount of ${v}% is within the 10% cap. The agent is cleared to execute autonomously.`,
    reasonBad: (v) =>
      `Discount of ${v}% is above delegated authority. Recommended — edit to 10% or request manager approval.`,
    summary: (v, risk) => [
      { l: "Action", v: `Send email · ${v}% off` },
      { l: "Risk", v: risk >= 45 ? "Medium" : "Low" },
      { l: "Tool", v: "Gmail" },
      { l: "Policy", v: "POL-SDR-002", mono: true },
    ],
    buttons: [
      { decision: "edited", label: "Edit to 10%", variant: "primary", icon: "edit" },
      { decision: "exception", label: "Approve exception", variant: "secondary", icon: "shield" },
      { decision: "rejected", label: "Reject", variant: "danger", icon: "reject" },
    ],
  },
  receipt: {
    file: "receipt · act_9281.json",
    seq: "seq 9281 · immutable",
    agentName: "SDR-Agent-17",
    owner: "Raj Nagulapalle",
    tool: "Gmail",
    action: "Send email",
    inputQuote:
      "“Follow up with John from Acme. Offer 25% off, update HubSpot, schedule a call tomorrow if no reply.”",
    chainLabel: "chain: blk_0x4f2a · verifiable on AgentGovernance ledger",
  },
  audit: {
    othersTitle: "CRM update auto-approved",
    othersDetail: "calendar + delegation cleared",
    governedOkTitle: "Email within authority",
    governedBadTitle: "Email action blocked",
    governedDetail: (over, v) => (over ? `${v}% > 10% policy cap` : `${v}% ≤ 10% cap`),
  },
  resolved: {
    approved: {
      approvalTitle: "Approved & executed",
      tone: "emerald",
      approvalLine: (v) =>
        `Within delegated authority — the agent sent the email with a ${v}% discount autonomously. No human approval was required.`,
      receiptLabel: "Approved",
      receiptOutput: (v) =>
        `Email sent to john@acme.com with a ${v}% discount — within delegated authority, no human approval required.`,
      approver: "Auto · within authority",
    },
    edited: {
      approvalTitle: "Edited to 10% & executed",
      tone: "emerald",
      approvalLine: () =>
        "Discount auto-corrected to the 10% policy cap. Email sent within delegated authority — no exception logged.",
      receiptLabel: "Approved",
      receiptOutput: () =>
        "Email sent to john@acme.com with a 10% discount (auto-corrected to policy cap).",
      approver: "Raj · auto-corrected",
    },
    exception: {
      approvalTitle: "Approved with exception",
      tone: "indigo",
      approvalLine: (v) =>
        `Raj approved a one-time exception for the ${v}% discount. A signed override is attached to the audit receipt.`,
      receiptLabel: "Approved · exception",
      receiptOutput: (v) =>
        `Email sent to john@acme.com with a ${v}% discount under a signed one-time exception.`,
      approver: "Raj · manager override",
    },
    rejected: {
      approvalTitle: "Rejected",
      tone: "red",
      approvalLine: () =>
        "Action rejected. The agent was instructed to revise the offer and resubmit for review.",
      receiptLabel: "Rejected",
      receiptOutput: () =>
        "No email sent. Agent notified to revise the discount within policy and resubmit.",
      approver: "Raj · denied",
    },
  },
};

/* ================================================================== */
/*  Run 2 — Stale source-of-truth → hard block (the origin incident)   */
/*  Same agent + email.send capability; the CRM record is stale, so    */
/*  the freshness guard blocks the send before it can go out.          */
/* ================================================================== */

const STALE_CRM_SCENARIO: Scenario = {
  id: "stale-crm",
  tab: "Vendor · stale CRM",
  tabHint: "stale source-of-truth → block",
  runId: "run_b47c-3391",
  consoleName: "agent-console · SDR-Agent-17",
  agent: SDR_AGENT_17,
  agentCard: SDR_CARD,
  humanTask:
    "Email the renewal quote to our contact at Northwind Logistics and move the deal forward in HubSpot.",
  reasoningLines: [
    "Loading deal context — Northwind Logistics · Q3 renewal",
    "Primary contact on file — last synced 41 days ago",
    "Selecting tools — Gmail, HubSpot, Calendar",
    "Drafting renewal quote email to contact on record",
    "Composing 4-step action plan",
  ],
  plannedActions: [
    {
      id: "email",
      title: "Draft renewal quote email to Northwind contact",
      detail: "Send Q3 renewal quote to the contact on the HubSpot record.",
      tool: "Gmail",
      icon: Mail,
      status: "blocked",
    },
    {
      id: "crm",
      title: "Update Northwind deal stage",
      detail: "Move deal Northwind · Q3 Renewal → “Quote sent”.",
      tool: "HubSpot",
      icon: Database,
      status: "auto-approved",
    },
    {
      id: "call",
      title: "Schedule renewal call (tomorrow)",
      detail: "Hold 20-min slot if no reply within 24h.",
      tool: "Calendar",
      icon: CalendarClock,
      status: "auto-approved",
    },
    {
      id: "delegate",
      title: "Delegate account research to Research-Agent-02",
      detail: "Scoped, read-only access to public firmographics.",
      tool: "Agent Mesh",
      icon: Sparkles,
      status: "auto-approved",
    },
  ],
  governedActionId: "email",
  governedCheckId: "freshness",
  policyRows: [
    {
      id: "crm",
      label: "CRM stage update",
      detail: "Within delegated authority for HubSpot deal stages.",
      verdict: "allowed",
    },
    {
      id: "calendar",
      label: "Calendar scheduling",
      detail: "Booking on owner’s calendar is permitted for SDR agents.",
      verdict: "allowed",
    },
    {
      id: "delegate",
      label: "Research delegation",
      detail: "Allowed with scoped, read-only access — no write tools shared.",
      verdict: "scoped",
    },
  ],
  now: RUN_NOW,
  control: {
    kind: "freshness",
    unit: "d",
    min: 0,
    max: 60,
    step: 1,
    cap: 14,
    capMarkerLabel: "stale > 14d",
    default: 41,
    presets: [2, 14, 41],
    staticLabel: "CRM record age (last sync)",
    interactiveLabel: "Drag — age the source-of-truth record",
    policyId: "POL-FRESHNESS-005",
    policyText:
      "No external send may use a source-of-truth record older than 14 days. Stale records must be refreshed before the action runs.",
    okBannerTitle: "Source-of-truth is fresh",
    badBannerTitle: "Blocked — source-of-truth is stale",
    rowLabel: (v) => `Email against a ${v}-day-old record`,
    rowDetailOk: (v) => `HubSpot record synced ${v}d ago (≤ 14d).`,
    rowDetailBad: (v) => `HubSpot record is ${v}d stale (> 14d).`,
  },
  buildRequest: (value) => ({
    id: "act_6120",
    agentId: SDR_AGENT_17.id,
    capability: "email.send",
    tool: "Gmail",
    summary: `Send renewal quote · source ${value}d old`,
    target: "ops@northwind.co",
    params: { discountPct: 0 },
    sourceRecord: {
      id: "hubspot/contact/6120",
      system: "HubSpot",
      lastSyncedAt: isoDaysBefore(RUN_NOW, value),
    },
    at: RUN_NOW,
  }),
  approval: {
    headerOk: "Authority check",
    headerNeedsDecision: "Action blocked — stale data",
    reasonOk: (v) =>
      `Source record was synced ${v}d ago (within 14 days). The agent is cleared to send to the verified contact.`,
    reasonBad: (v) =>
      `The HubSpot contact was last synced ${v} days ago — beyond the 14-day freshness limit. Recommended — refresh the record before any send, or approve a signed override.`,
    summary: (v, risk) => [
      { l: "Action", v: "Send renewal quote" },
      { l: "Risk", v: risk >= 60 ? "High" : "Medium" },
      { l: "Source", v: `${v}d stale`, mono: true },
      { l: "Policy", v: "POL-FRESH-005", mono: true },
    ],
    buttons: [
      { decision: "rejected", label: "Send back to refresh", variant: "primary", icon: "reject" },
      { decision: "exception", label: "Override — send anyway", variant: "danger", icon: "override" },
    ],
  },
  receipt: {
    file: "receipt · act_6120.json",
    seq: "seq 6120 · immutable",
    agentName: "SDR-Agent-17",
    owner: "Raj Nagulapalle",
    tool: "Gmail",
    action: "Send renewal quote",
    inputQuote:
      "“Email the renewal quote to our contact at Northwind Logistics and move the deal forward in HubSpot.”",
    chainLabel: "chain: blk_0x6120 · verifiable on AgentGovernance ledger",
  },
  audit: {
    othersTitle: "CRM update auto-approved",
    othersDetail: "calendar + delegation cleared",
    governedOkTitle: "Email source-of-truth fresh",
    governedBadTitle: "Email blocked — stale record",
    governedDetail: (over, v) => (over ? `record ${v}d old > 14d limit` : `record ${v}d old ≤ 14d`),
  },
  resolved: {
    approved: {
      approvalTitle: "Approved & executed",
      tone: "emerald",
      approvalLine: (v) =>
        `Source record is fresh (${v}d ≤ 14d). The renewal quote was sent to the verified Northwind contact.`,
      receiptLabel: "Approved",
      receiptOutput: (v) =>
        `Renewal quote sent to ops@northwind.co against a fresh HubSpot record (${v}d old).`,
      approver: "Auto · source verified",
    },
    edited: {
      approvalTitle: "Refreshed & executed",
      tone: "emerald",
      approvalLine: () =>
        "Record re-synced from HubSpot, then the renewal quote was sent to the verified contact.",
      receiptLabel: "Approved",
      receiptOutput: () =>
        "Renewal quote sent to ops@northwind.co after the contact record was refreshed.",
      approver: "Raj · record refreshed",
    },
    exception: {
      approvalTitle: "Override — sent on stale data",
      tone: "indigo",
      approvalLine: (v) =>
        `Raj approved a one-time override to send against a ${v}-day-old record. A signed exception is attached to the receipt.`,
      receiptLabel: "Approved · exception",
      receiptOutput: (v) =>
        `Renewal quote sent to ops@northwind.co under a signed override, against a ${v}-day-old record.`,
      approver: "Raj · risk override",
    },
    rejected: {
      approvalTitle: "Blocked — sent back to refresh",
      tone: "red",
      approvalLine: () =>
        "No email sent. The action was returned to the owner to refresh the Northwind contact before any send.",
      receiptLabel: "Blocked",
      receiptOutput: () =>
        "No email sent. Stale source-of-truth — record returned to the owner to refresh before resubmit.",
      approver: "Raj · refresh required",
    },
  },
};

export const SCENARIOS: Scenario[] = [DISCOUNT_SCENARIO, STALE_CRM_SCENARIO];

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
