import {
  Mail,
  Database,
  CalendarClock,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ActionStatus =
  | "pending"
  | "auto-approved"
  | "blocked"
  | "requires-approval"
  | "executed"
  | "rejected"
  | "executed-exception";

export type ActionId = "email" | "crm" | "call" | "delegate";

export interface PlannedAction {
  id: ActionId;
  title: string;
  detail: string;
  tool: string;
  icon: LucideIcon;
  /** Default status before any human decision. */
  status: ActionStatus;
}

export interface PolicyCheck {
  id: string;
  label: string;
  detail: string;
  verdict: "allowed" | "scoped" | "blocked";
}

/* ------------------------------------------------------------------ */
/*  The human task that kicked off the run                             */
/* ------------------------------------------------------------------ */

export const HUMAN_TASK =
  "Follow up with John from Acme. Offer a 25% discount, update HubSpot, and schedule a call tomorrow if he doesn’t reply.";

/* ------------------------------------------------------------------ */
/*  Agent identity                                                     */
/* ------------------------------------------------------------------ */

export const AGENT = {
  name: "SDR-Agent-17",
  handle: "agent_sdr_17",
  owner: "Raj Nagulapalle",
  role: "Outbound Sales Assistant",
  delegatedBy: "Raj",
  sessionExpires: "24h",
  sessionRemaining: "23h 41m",
  riskTier: "Medium" as const,
  allowedTools: ["Gmail", "HubSpot", "Calendar"],
  restrictedTools: ["Stripe", "DocuSign", "Payroll"],
  fingerprint: "did:agentgovern:0x4f2a91c7",
};

/* ------------------------------------------------------------------ */
/*  Planned actions (the agent's plan)                                 */
/* ------------------------------------------------------------------ */

export const PLANNED_ACTIONS: PlannedAction[] = [
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
];

/* ------------------------------------------------------------------ */
/*  Policy engine checks                                               */
/* ------------------------------------------------------------------ */

export const POLICY_CHECKS: PolicyCheck[] = [
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
  {
    id: "email",
    label: "Email with 25% discount",
    detail: "Blocked: discount exceeds delegated authority.",
    verdict: "blocked",
  },
];

export const DISCOUNT_POLICY = {
  id: "POL-SDR-DISCOUNT-002",
  name: "Outbound discount authority",
  text: "AI SDR agents may offer discounts up to 10%. Discounts above 10% require human approval.",
  cap: 10,
  requested: 25,
  max: 40,
};

/**
 * Fixed clock + source-of-truth record so the engine stays deterministic.
 * John's HubSpot contact was synced 2 days ago — fresh (within the 14-day cap).
 */
export const RUN_NOW = "2026-06-28T23:41:00Z";
export const JOHN_SOURCE = {
  id: "hubspot/contact/8842",
  system: "HubSpot",
  lastSyncedAt: "2026-06-26T23:41:00Z",
};

/** Streamed one at a time in the console while the agent "plans". */
export const REASONING_LINES = [
  "Loading lead context — Acme · John Carter (VP Sales)",
  "Last touch 11 days ago · opened 2 emails · no reply",
  "Selecting tools — Gmail, HubSpot, Calendar",
  "Drafting re-engagement offer · discount 25%",
  "Composing 4-step action plan",
];

/** Stepper shown in the run console. */
export const RUN_STEPS = [
  { key: "plan", label: "Plan" },
  { key: "intercept", label: "Intercept" },
  { key: "policy", label: "Policy" },
  { key: "approve", label: "Approve" },
  { key: "receipt", label: "Receipt" },
] as const;

/* ------------------------------------------------------------------ */
/*  Fleet, policies, approvals — for the supporting product pages      */
/* ------------------------------------------------------------------ */

export type Risk = "Low" | "Medium" | "High";

export interface FleetAgent {
  name: string;
  did: string;
  owner: string;
  role: string;
  tools: string[];
  risk: Risk;
  trust: number;
  status: "active" | "review" | "paused";
  actions: number;
}

export const FLEET: FleetAgent[] = [
  {
    name: "SDR-Agent-17",
    did: "did:agentgovern:0x4f2a91c7",
    owner: "Raj Nagulapalle",
    role: "Outbound Sales Assistant",
    tools: ["Gmail", "HubSpot", "Calendar"],
    risk: "Medium",
    trust: 72,
    status: "review",
    actions: 128,
  },
  {
    name: "Research-Agent-02",
    did: "did:agentgovern:0x77be12a0",
    owner: "Raj Nagulapalle",
    role: "Lead Enrichment",
    tools: ["Web", "Clearbit"],
    risk: "Low",
    trust: 88,
    status: "active",
    actions: 342,
  },
  {
    name: "Support-Agent-09",
    did: "did:agentgovern:0x9c3df451",
    owner: "Mara Lin",
    role: "Tier-1 Support",
    tools: ["Zendesk", "Gmail"],
    risk: "Low",
    trust: 91,
    status: "active",
    actions: 1204,
  },
  {
    name: "Billing-Agent-03",
    did: "did:agentgovern:0x21aa88fe",
    owner: "Mara Lin",
    role: "Invoicing & Refunds",
    tools: ["Stripe", "HubSpot"],
    risk: "High",
    trust: 64,
    status: "review",
    actions: 57,
  },
  {
    name: "Ops-Agent-21",
    did: "did:agentgovern:0x55ef0b12",
    owner: "Devang P.",
    role: "Workflow Runner",
    tools: ["Slack", "Jira", "Calendar"],
    risk: "Medium",
    trust: 79,
    status: "active",
    actions: 489,
  },
  {
    name: "Recruiter-Agent-05",
    did: "did:agentgovern:0x33cc7a90",
    owner: "Devang P.",
    role: "Candidate Sourcing",
    tools: ["LinkedIn", "Gmail"],
    risk: "Medium",
    trust: 70,
    status: "paused",
    actions: 96,
  },
];

export interface Policy {
  id: string;
  name: string;
  scope: string;
  rule: string;
  enforcement: string;
  status: "active" | "draft";
  hits: number;
}

export const POLICIES: Policy[] = [
  {
    id: "POL-SDR-DISCOUNT-002",
    name: "Outbound discount authority",
    scope: "SDR agents",
    rule: "Discounts ≤ 10% auto-approved; above 10% requires human approval",
    enforcement: "Block + approve",
    status: "active",
    hits: 14,
  },
  {
    id: "POL-TOOL-RESTRICT-001",
    name: "Restricted tool access",
    scope: "All agents",
    rule: "Stripe, DocuSign & Payroll require an elevated, time-boxed grant",
    enforcement: "Block",
    status: "active",
    hits: 8,
  },
  {
    id: "POL-SPEND-LIMIT-004",
    name: "Spend authorization",
    scope: "Billing agents",
    rule: "Charges or refunds over $500 require human approval",
    enforcement: "Block + approve",
    status: "active",
    hits: 3,
  },
  {
    id: "POL-PII-EXPORT-007",
    name: "PII export guard",
    scope: "All agents",
    rule: "No bulk export of customer PII beyond 100 records",
    enforcement: "Block + alert",
    status: "active",
    hits: 1,
  },
  {
    id: "POL-DELEGATION-003",
    name: "Sub-agent delegation",
    scope: "All agents",
    rule: "Delegated tool calls inherit a reduced, read-only scope",
    enforcement: "Scope down",
    status: "active",
    hits: 21,
  },
  {
    id: "POL-OFFHOURS-009",
    name: "Off-hours send window",
    scope: "Outbound agents",
    rule: "No external sends between 10pm–6am recipient-local",
    enforcement: "Queue",
    status: "draft",
    hits: 0,
  },
];

export interface ApprovalItem {
  id: string;
  agent: string;
  action: string;
  tool: string;
  risk: Risk;
  policy: string;
  status: "pending" | "approved" | "edited" | "exception" | "rejected";
  age: string;
}

export const APPROVALS: ApprovalItem[] = [
  {
    id: "apr_5521",
    agent: "SDR-Agent-17",
    action: "Send email · 25% discount",
    tool: "Gmail",
    risk: "Medium",
    policy: "POL-SDR-DISCOUNT-002",
    status: "pending",
    age: "just now",
  },
  {
    id: "apr_5519",
    agent: "Billing-Agent-03",
    action: "Refund $640 to Acme Corp",
    tool: "Stripe",
    risk: "High",
    policy: "POL-SPEND-LIMIT-004",
    status: "approved",
    age: "12m ago",
  },
  {
    id: "apr_5512",
    agent: "SDR-Agent-17",
    action: "Send email · 18% discount",
    tool: "Gmail",
    risk: "Medium",
    policy: "POL-SDR-DISCOUNT-002",
    status: "edited",
    age: "1h ago",
  },
  {
    id: "apr_5498",
    agent: "Support-Agent-09",
    action: "Export 2,400 contact records",
    tool: "Zendesk",
    risk: "High",
    policy: "POL-PII-EXPORT-007",
    status: "rejected",
    age: "3h ago",
  },
  {
    id: "apr_5490",
    agent: "Ops-Agent-21",
    action: "Delete Jira project ATLAS",
    tool: "Jira",
    risk: "High",
    policy: "POL-TOOL-RESTRICT-001",
    status: "rejected",
    age: "5h ago",
  },
  {
    id: "apr_5471",
    agent: "Billing-Agent-03",
    action: "Apply credit · $1,200 enterprise",
    tool: "Stripe",
    risk: "High",
    policy: "POL-SPEND-LIMIT-004",
    status: "exception",
    age: "yesterday",
  },
];

/** Dashboard KPIs. */
export const DASH_STATS = [
  { label: "Active agents", value: "24", delta: "+3 this week", tone: "neutral" },
  { label: "Actions today", value: "1,284", delta: "+18%", tone: "up" },
  { label: "Auto-approved", value: "92%", delta: "within policy", tone: "ok" },
  { label: "Pending approvals", value: "1", delta: "needs you", tone: "warn" },
  { label: "Blocked today", value: "7", delta: "policy saves", tone: "bad" },
];

export interface RecentAction {
  agent: string;
  action: string;
  tool: string;
  verdict: "auto" | "approved" | "blocked" | "exception";
  time: string;
}

export const RECENT_ACTIONS: RecentAction[] = [
  { agent: "Support-Agent-09", action: "Reply to ticket #4821", tool: "Zendesk", verdict: "auto", time: "23:41" },
  { agent: "SDR-Agent-17", action: "Send email · 25% discount", tool: "Gmail", verdict: "exception", time: "23:41" },
  { agent: "Research-Agent-02", action: "Enrich lead · Acme Corp", tool: "Clearbit", verdict: "auto", time: "23:39" },
  { agent: "Billing-Agent-03", action: "Refund $640 to Acme Corp", tool: "Stripe", verdict: "approved", time: "23:29" },
  { agent: "Ops-Agent-21", action: "Delete Jira project ATLAS", tool: "Jira", verdict: "blocked", time: "23:18" },
  { agent: "Support-Agent-09", action: "Export 2,400 contacts", tool: "Zendesk", verdict: "blocked", time: "23:04" },
];

/* ------------------------------------------------------------------ */
/*  Trust report                                                       */
/* ------------------------------------------------------------------ */

export const TRUST_SCORE = 72;

export const TRUST_PASSED = [
  "Unique agent identity",
  "Scoped tool access",
  "Human approval for risky action",
  "Replayable audit receipt",
  "Delegation captured",
];

export const TRUST_MISSING = [
  "No instant revoke workflow",
  "No policy version history",
  "No customer-facing trust center",
];
