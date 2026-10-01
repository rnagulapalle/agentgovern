import { evaluate } from "../engine/evaluate";
import type { AgentIdentity } from "../engine/types";

export type AgentStatus = "active" | "paused";
export type Tier = "Utility" | "Standard" | "Frontier";
export type RunStatus =
  | "completed"
  | "awaiting_approval"
  | "contained"
  | "terminated"
  | "blocked";
export type Section =
  | "overview"
  | "workflows"
  | "agents"
  | "runs"
  | "policies"
  | "approvals"
  | "gateway"
  | "outputs"
  | "reconciliation"
  | "audit"
  | "settings";
export interface Agent {
  id: string;
  name: string;
  description: string;
  initials: string;
  color: string;
  owner: string;
  team: string;
  role: string;
  status: AgentStatus;
  tier: Tier;
  tools: string[];
  budget: number;
  spent: number;
  parentId?: string;
}
export interface Step {
  agent: string;
  action: string;
  detail: string;
  status: "passed" | "held" | "blocked" | "pending";
}
export interface Run {
  id: string;
  name: string;
  agentId: string;
  agentIds: string[];
  status: RunStatus;
  at: string;
  cost: number;
  steps: Step[];
}
export interface Approval {
  id: string;
  runId: string;
  agentId: string;
  title: string;
  target: string;
  amount: number;
  limit: number;
  policyVersion: number;
  status: "pending" | "approved" | "rejected" | "invalidated";
  at: string;
}
export interface Policy {
  id: string;
  name: string;
  description: string;
  stage: "Identity" | "Action" | "Execution" | "Output";
  enabled: boolean;
  version: number;
  threshold?: number;
  unit?: string;
}
export interface RecordState {
  version: number;
  discount: number;
  stage: string;
}
export interface Incident {
  id: string;
  runId: string;
  agentId: string;
  title: string;
  recordId: string;
  expected: RecordState;
  observed: RecordState;
  status: "open" | "contained" | "planned" | "resolved" | "conflict";
  reversible: boolean;
}
export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  outcome: string;
  runId?: string;
}
export interface OutputCheck {
  id: string;
  runId: string;
  agentId: string;
  target: string;
  original: string;
  released: string | null;
  checks: string[];
  status: "passed" | "redacted" | "blocked";
}
export interface ModelRoute {
  id: Tier;
  model: string;
  provider: string;
  region: string;
  allowedRoles: string[];
  latency: number;
}
export interface ControlState {
  schema: 1;
  agents: Agent[];
  runs: Run[];
  approvals: Approval[];
  policies: Policy[];
  incidents: Incident[];
  records: Record<string, RecordState>;
  audit: AuditEvent[];
  outputs: OutputCheck[];
}

export const MODELS: ModelRoute[] = [
  {
    id: "Utility",
    model: "Amazon Nova Lite",
    provider: "AWS Bedrock",
    region: "us-west-2",
    allowedRoles: ["Researcher", "Operator", "Coordinator"],
    latency: 182,
  },
  {
    id: "Standard",
    model: "Llama 3.1 70B",
    provider: "AWS Bedrock",
    region: "us-west-2",
    allowedRoles: ["Operator", "Coordinator"],
    latency: 346,
  },
  {
    id: "Frontier",
    model: "Mistral Large",
    provider: "AWS Bedrock",
    region: "us-west-2",
    allowedRoles: ["Coordinator"],
    latency: 518,
  },
];
export const ROLES = ["Researcher", "Operator", "Coordinator"] as const;
export const ROLE_TIERS: Record<string, Tier[]> = {
  Researcher: ["Utility"],
  Operator: ["Utility", "Standard"],
  Coordinator: ["Utility", "Standard", "Frontier"],
};
export const ROLE_TOOLS: Record<string, string[]> = {
  Researcher: ["CRM · read", "Knowledge · read"],
  Operator: ["CRM · read", "CRM · write", "Email · send", "Knowledge · read"],
  Coordinator: [
    "CRM · read",
    "CRM · write",
    "Email · send",
    "Knowledge · read",
    "Agents · delegate",
  ],
};

export function initialState(now = new Date().toISOString()): ControlState {
  const ago = (minutes: number) =>
    new Date(new Date(now).getTime() - minutes * 60000).toISOString();
  return {
    schema: 1,
    agents: [
      {
        id: "agt_001",
        name: "Renewal coordinator",
        description: "Coordinates research, pricing, and customer renewals.",
        initials: "RC",
        color: "sand",
        owner: "Raj Nagulapalle",
        team: "Revenue",
        role: "Coordinator",
        status: "active",
        tier: "Frontier",
        tools: ROLE_TOOLS.Coordinator,
        budget: 50,
        spent: 12.84,
      },
      {
        id: "agt_002",
        name: "Account researcher",
        description: "Reads account context and prepares renewal briefs.",
        initials: "AR",
        color: "sage",
        owner: "Raj Nagulapalle",
        team: "Revenue",
        role: "Researcher",
        status: "active",
        tier: "Utility",
        tools: ROLE_TOOLS.Researcher,
        budget: 20,
        spent: 3.21,
        parentId: "agt_001",
      },
      {
        id: "agt_003",
        name: "Revenue operator",
        description: "Updates CRM records and prepares outbound offers.",
        initials: "RO",
        color: "lavender",
        owner: "Mara Lin",
        team: "Revenue",
        role: "Operator",
        status: "active",
        tier: "Standard",
        tools: ROLE_TOOLS.Operator,
        budget: 30,
        spent: 8.42,
        parentId: "agt_001",
      },
      {
        id: "agt_004",
        name: "Support specialist",
        description: "Resolves support requests with scoped customer access.",
        initials: "SS",
        color: "blue",
        owner: "Mara Lin",
        team: "Support",
        role: "Operator",
        status: "active",
        tier: "Standard",
        tools: ["CRM · read", "Email · send", "Knowledge · read"],
        budget: 30,
        spent: 6.18,
      },
      {
        id: "agt_005",
        name: "Finance analyst",
        description: "Researches invoices and flags payment discrepancies.",
        initials: "FA",
        color: "rose",
        owner: "Priya Raman",
        team: "Finance",
        role: "Researcher",
        status: "paused",
        tier: "Utility",
        tools: ROLE_TOOLS.Researcher,
        budget: 15,
        spent: 2.07,
      },
      {
        id: "agt_006",
        name: "Knowledge assistant",
        description: "Finds approved answers in the internal knowledge base.",
        initials: "KA",
        color: "peach",
        owner: "Devang Patel",
        team: "Operations",
        role: "Researcher",
        status: "active",
        tier: "Utility",
        tools: ["Knowledge · read"],
        budget: 10,
        spent: 1.36,
      },
    ],
    runs: [
      {
        id: "run_1048",
        name: "Acme · annual renewal",
        agentId: "agt_001",
        agentIds: ["agt_001", "agt_002", "agt_003"],
        status: "awaiting_approval",
        at: ago(3),
        cost: 0.042,
        steps: [
          {
            agent: "agt_001",
            action: "Delegate account research",
            detail: "Child agent inherits read-only access.",
            status: "passed",
          },
          {
            agent: "agt_002",
            action: "Read current account record",
            detail: "CRM record is fresh. Source version 18.",
            status: "passed",
          },
          {
            agent: "agt_003",
            action: "Propose a 25% renewal discount",
            detail: "Above the 10% delegated authority. No email sent.",
            status: "held",
          },
          {
            agent: "agt_003",
            action: "Validate and release customer email",
            detail: "Waiting for an authorized decision.",
            status: "pending",
          },
        ],
      },
      {
        id: "run_1047",
        name: "Northstar · account update",
        agentId: "agt_003",
        agentIds: ["agt_003"],
        status: "contained",
        at: ago(12),
        cost: 0.018,
        steps: [
          {
            agent: "agt_003",
            action: "Read account snapshot",
            detail: "Captured the expected state at version 6.",
            status: "passed",
          },
          {
            agent: "agt_003",
            action: "Detect unexpected record mutation",
            detail:
              "Discount and account stage differ from the approved state.",
            status: "blocked",
          },
          {
            agent: "agt_003",
            action: "Contain this execution",
            detail: "Further actions from this run are denied.",
            status: "passed",
          },
        ],
      },
      {
        id: "run_1046",
        name: "Support · resolve ticket #4821",
        agentId: "agt_004",
        agentIds: ["agt_004"],
        status: "completed",
        at: ago(24),
        cost: 0.012,
        steps: [
          {
            agent: "agt_004",
            action: "Read ticket and approved knowledge",
            detail: "Role and source freshness checks passed.",
            status: "passed",
          },
          {
            agent: "agt_004",
            action: "Check response for sensitive data",
            detail: "One email address redacted before release.",
            status: "passed",
          },
          {
            agent: "agt_004",
            action: "Release response to demo workspace",
            detail: "Tool result captured in the audit trail.",
            status: "passed",
          },
        ],
      },
      {
        id: "run_1045",
        name: "Knowledge · onboarding brief",
        agentId: "agt_006",
        agentIds: ["agt_006"],
        status: "completed",
        at: ago(38),
        cost: 0.006,
        steps: [
          {
            agent: "agt_006",
            action: "Answer from approved sources",
            detail: "Read-only scope and output validation passed.",
            status: "passed",
          },
        ],
      },
    ],
    approvals: [
      {
        id: "apr_1048",
        runId: "run_1048",
        agentId: "agt_003",
        title: "Renewal discount above authority",
        target: "Acme · customer renewal",
        amount: 25,
        limit: 10,
        policyVersion: 1,
        status: "pending",
        at: ago(3),
      },
    ],
    policies: [
      {
        id: "identity",
        name: "Verified agent identity",
        description:
          "Every request must belong to a registered, active agent and an accountable owner.",
        stage: "Identity",
        enabled: true,
        version: 1,
      },
      {
        id: "delegation",
        name: "Delegation inherits scope",
        description:
          "A child agent can only use tools and model tiers granted to its parent.",
        stage: "Identity",
        enabled: true,
        version: 1,
      },
      {
        id: "discount",
        name: "Discount authority",
        description:
          "Hold customer offers above delegated authority for human approval.",
        stage: "Action",
        enabled: true,
        threshold: 10,
        unit: "%",
        version: 1,
      },
      {
        id: "freshness",
        name: "Fresh source of truth",
        description: "Block actions based on missing or stale CRM evidence.",
        stage: "Action",
        enabled: true,
        threshold: 14,
        unit: "days",
        version: 1,
      },
      {
        id: "budget",
        name: "Model spend ceiling",
        description:
          "Refuse model calls when the agent has exhausted its assigned budget.",
        stage: "Execution",
        enabled: true,
        version: 1,
      },
      {
        id: "reconciliation",
        name: "State drift protection",
        description:
          "Contain drifted runs. Verify record versions before compensating a reversible change.",
        stage: "Execution",
        enabled: true,
        version: 1,
      },
      {
        id: "pii",
        name: "Sensitive output protection",
        description:
          "Redact email addresses and refuse SSN-shaped values before an output is released.",
        stage: "Output",
        enabled: true,
        version: 1,
      },
    ],
    incidents: [
      {
        id: "inc_024",
        runId: "run_1047",
        agentId: "agt_003",
        title: "CRM state diverged from the approved plan",
        recordId: "crm/northstar",
        expected: { version: 6, discount: 10, stage: "Negotiation" },
        observed: { version: 7, discount: 35, stage: "Closed won" },
        status: "open",
        reversible: true,
      },
    ],
    records: {
      "crm/northstar": { version: 7, discount: 35, stage: "Closed won" },
    },
    outputs: [
      {
        id: "out_1046",
        runId: "run_1046",
        agentId: "agt_004",
        target: "Support response",
        original:
          "Your account contact is alex@example.com. Your request has been resolved.",
        released:
          "Your account contact is [EMAIL REDACTED]. Your request has been resolved.",
        checks: ["Email address redacted", "Release allowed after redaction"],
        status: "redacted",
      },
      {
        id: "out_1045",
        runId: "run_1045",
        agentId: "agt_006",
        target: "Internal onboarding brief",
        original:
          "Your onboarding checklist is ready in the approved knowledge base.",
        released:
          "Your onboarding checklist is ready in the approved knowledge base.",
        checks: ["No configured sensitive patterns detected"],
        status: "passed",
      },
    ],
    audit: [
      {
        id: "evt_4",
        at: ago(3),
        actor: "Revenue operator",
        action: "Approval requested",
        target: "25% renewal discount",
        outcome: "Held",
        runId: "run_1048",
      },
      {
        id: "evt_3",
        at: ago(12),
        actor: "State monitor",
        action: "Execution contained",
        target: "Northstar CRM drift",
        outcome: "Contained",
        runId: "run_1047",
      },
      {
        id: "evt_2",
        at: ago(24),
        actor: "Output guard",
        action: "Sensitive output redacted",
        target: "Support response",
        outcome: "Redacted",
        runId: "run_1046",
      },
      {
        id: "evt_1",
        at: ago(38),
        actor: "Knowledge assistant",
        action: "Run completed",
        target: "Onboarding brief",
        outcome: "Allowed",
        runId: "run_1045",
      },
    ],
  };
}

type Stamp = { at: string; id: string };
export type ControlAction =
  | ({ type: "onboard"; agent: Agent } & Stamp)
  | ({ type: "agent_status"; agentId: string; status: AgentStatus } & Stamp)
  | ({
      type: "simulate";
      agentId: string;
      discount: number;
      sourceAge: number;
    } & Stamp)
  | ({
      type: "approval";
      approvalId: string;
      decision: "approve" | "reject";
    } & Stamp)
  | ({ type: "terminate"; runId: string } & Stamp)
  | ({ type: "policy"; policyId: string; threshold: number } & Stamp)
  | ({ type: "contain" | "plan" | "reconcile"; incidentId: string } & Stamp)
  | ({ type: "output"; text: string; agentId: string } & Stamp)
  | ({ type: "budget"; agentId: string; budget: number } & Stamp);

export function outputCheck(
  text: string,
): Pick<OutputCheck, "released" | "checks" | "status"> {
  if (/\b\d{3}[- ]\d{2}[- ]\d{4}\b/.test(text))
    return {
      released: null,
      checks: ["SSN-shaped value detected", "Output blocked before release"],
      status: "blocked",
    };
  const released = text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "[EMAIL REDACTED]",
  );
  return released !== text
    ? {
        released,
        checks: ["Email address redacted", "Release allowed after redaction"],
        status: "redacted",
      }
    : {
        released,
        checks: ["No configured sensitive patterns detected"],
        status: "passed",
      };
}

export function controlReducer(
  state: ControlState,
  action: ControlAction,
): ControlState {
  const s: ControlState = structuredClone(state);
  const event = (
    actor: string,
    verb: string,
    target: string,
    outcome: string,
    runId?: string,
  ) =>
    s.audit.unshift({
      id: action.id,
      at: action.at,
      actor,
      action: verb,
      target,
      outcome,
      runId,
    });
  const agent = (id: string) => s.agents.find((a) => a.id === id);
  const cancelApprovals = (runId: string) =>
    s.approvals.forEach((a) => {
      if (a.runId === runId && a.status === "pending") a.status = "invalidated";
    });
  const suspendTree = (agentId: string) => {
    const affected = new Set([agentId]);
    let changed = true;
    while (changed) {
      changed = false;
      s.agents.forEach((child) => {
        if (
          child.parentId &&
          affected.has(child.parentId) &&
          !affected.has(child.id)
        ) {
          affected.add(child.id);
          changed = true;
        }
      });
    }
    s.agents.forEach((a) => {
      if (affected.has(a.id)) a.status = "paused";
    });
    s.runs.forEach((run) => {
      if (
        ["awaiting_approval", "contained"].includes(run.status) &&
        run.agentIds.some((id) => affected.has(id))
      ) {
        run.status = "terminated";
        cancelApprovals(run.id);
        run.steps.forEach((step) => {
          if (step.status === "held" || step.status === "pending") {
            step.status = "blocked";
            step.detail = "Agent access suspended. Pending work stopped.";
          }
        });
      }
    });
  };
  if (action.type === "onboard") {
    const a = action.agent;
    const parent = a.parentId ? agent(a.parentId) : undefined;
    if (
      !a.name.trim() ||
      !a.owner.trim() ||
      !ROLE_TIERS[a.role]?.includes(a.tier) ||
      !Number.isFinite(a.budget) ||
      a.budget <= 0 ||
      s.agents.some((x) => x.id === a.id) ||
      a.tools.some((t) => !ROLE_TOOLS[a.role]?.includes(t))
    )
      return state;
    if (
      a.parentId &&
      (!parent ||
        parent.status !== "active" ||
        !parent.tools.includes("Agents · delegate") ||
        a.tools.some((t) => !parent.tools.includes(t)) ||
        ROLE_TIERS[a.role].indexOf(a.tier) >
          ROLE_TIERS.Coordinator.indexOf(parent.tier))
    )
      return state;
    s.agents.unshift(a);
    event("Workspace admin", "Agent onboarded", a.name, "Registered");
  } else if (action.type === "agent_status") {
    const a = agent(action.agentId);
    if (!a) return state;
    a.status = action.status;
    if (a.status === "paused") suspendTree(a.id);
    event(
      "Workspace admin",
      action.status === "paused"
        ? "Agent access suspended"
        : "Agent access restored",
      a.name,
      action.status === "paused" ? "Paused" : "Active",
    );
  } else if (action.type === "simulate") {
    // The action id is the idempotency key for a simulated run. Replays must
    // not duplicate side effects, approvals, output records, or spend.
    if (s.runs.some((run) => run.id === `run_${action.id}`)) return state;
    const a = agent(action.agentId);
    if (
      !a ||
      !Number.isFinite(action.discount) ||
      action.discount < 0 ||
      action.discount > 100 ||
      !Number.isFinite(action.sourceAge) ||
      action.sourceAge < 0
    )
      return state;
    const discount = s.policies.find((p) => p.id === "discount")!;
    const freshness = s.policies.find((p) => p.id === "freshness")!;
    const identity: AgentIdentity = {
      id: a.id,
      owner: a.owner,
      role: a.role,
      riskTier: "Medium",
      restrictedTools: [],
      capabilities: a.tools.includes("Email · send")
        ? [
            {
              id: "email.send",
              requiresTarget: true,
              maxDiscountPct: discount.threshold,
              requiresFreshSourceWithinDays: freshness.threshold,
            },
          ]
        : [],
    };
    const verdict = evaluate(
      {
        id: action.id,
        agentId: a.id,
        capability: "email.send",
        tool: "Email",
        summary: "Propose renewal offer",
        params: { discountPct: action.discount },
        target: "Acme customer",
        sourceRecord: {
          id: "crm/acme",
          system: "CRM",
          lastSyncedAt: new Date(
            new Date(action.at).getTime() - action.sourceAge * 86400000,
          ).toISOString(),
        },
        at: action.at,
      },
      { agent: identity, now: action.at },
    );
    const ancestorPaused = (
      current: Agent,
      seen = new Set<string>(),
    ): boolean => {
      if (seen.has(current.id)) return true;
      seen.add(current.id);
      const p = current.parentId ? agent(current.parentId) : undefined;
      return (
        current.status !== "active" ||
        (!!current.parentId && (!p || ancestorPaused(p, seen)))
      );
    };
    const unavailable =
      ancestorPaused(a) ||
      !ROLE_TIERS[a.role]?.includes(a.tier) ||
      a.spent + 0.024 > a.budget;
    const status: RunStatus =
      unavailable || verdict.decision === "block"
        ? "blocked"
        : verdict.decision === "require_approval"
          ? "awaiting_approval"
          : "completed";
    const reason = unavailable
      ? "Identity, delegated scope, or model budget check failed."
      : verdict.blockingReasons.join(" ") ||
        (status === "awaiting_approval"
          ? `${action.discount}% exceeds the ${discount.threshold}% authority limit.`
          : "Action is within delegated authority.");
    const runId = `run_${action.id}`;
    s.runs.unshift({
      id: runId,
      name: "Acme · simulated renewal",
      agentId: a.id,
      agentIds: [a.id],
      status,
      at: action.at,
      cost: unavailable ? 0 : 0.024,
      steps: [
        {
          agent: a.id,
          action: "Verify identity and model access",
          detail: unavailable
            ? reason
            : `${a.role} · ${a.tier} tier · within budget.`,
          status: unavailable ? "blocked" : "passed",
        },
        {
          agent: a.id,
          action: "Evaluate proposed customer offer",
          detail: reason,
          status:
            status === "blocked"
              ? "blocked"
              : status === "awaiting_approval"
                ? "held"
                : "passed",
        },
        {
          agent: a.id,
          action: "Validate output and simulate execution",
          detail:
            status === "completed"
              ? "Output checked. Simulated action recorded; no external email sent."
              : "No business action has been executed.",
          status: status === "completed" ? "passed" : "pending",
        },
      ],
    });
    if (!unavailable) a.spent = Math.round((a.spent + 0.024) * 1000) / 1000;
    if (status === "awaiting_approval")
      s.approvals.unshift({
        id: `apr_${action.id}`,
        runId,
        agentId: a.id,
        title: "Renewal discount above authority",
        target: "Acme · customer renewal",
        amount: action.discount,
        limit: discount.threshold!,
        policyVersion: discount.version,
        status: "pending",
        at: action.at,
      });
    if (status === "completed") {
      const text = `Your ${action.discount}% renewal offer is ready.`;
      s.outputs.unshift({
        id: `out_${action.id}`,
        agentId: a.id,
        runId,
        target: "Renewal offer",
        original: text,
        ...outputCheck(text),
      });
    }
    event(
      a.name,
      "Run evaluated",
      reason,
      status === "blocked"
        ? "Blocked"
        : status === "awaiting_approval"
          ? "Held"
          : "Allowed",
      runId,
    );
  } else if (action.type === "approval") {
    const approval = s.approvals.find((a) => a.id === action.approvalId);
    if (!approval || approval.status !== "pending") return state;
    const a = agent(approval.agentId);
    const run = s.runs.find((r) => r.id === approval.runId);
    const policy = s.policies.find((p) => p.id === "discount")!;
    if (
      !a ||
      a.status !== "active" ||
      !run ||
      run.status !== "awaiting_approval" ||
      policy.version !== approval.policyVersion
    ) {
      approval.status = "invalidated";
      if (run?.status === "awaiting_approval") run.status = "blocked";
      event(
        "Policy engine",
        "Approval invalidated",
        "Agent, run, or policy changed. Submit a new proposal.",
        "Blocked",
        approval.runId,
      );
    } else {
      approval.status = action.decision === "approve" ? "approved" : "rejected";
      run.status = action.decision === "approve" ? "completed" : "blocked";
      run.steps = run.steps.map((step) =>
        step.status === "held" || step.status === "pending"
          ? {
              ...step,
              status: action.decision === "approve" ? "passed" : "blocked",
              detail:
                action.decision === "approve"
                  ? "Approved by the demo admin for this exact proposal. Simulated execution only."
                  : "Rejected by the demo admin. No action executed.",
            }
          : step,
      );
      if (action.decision === "approve") {
        const text = `Your ${approval.amount}% renewal offer is ready.`;
        s.outputs.unshift({
          id: `out_${action.id}`,
          agentId: a.id,
          runId: run.id,
          target: "Approved renewal offer",
          original: text,
          ...outputCheck(text),
        });
      }
      event(
        "Workspace admin",
        action.decision === "approve"
          ? "Exception approved"
          : "Proposal rejected",
        `${approval.amount}% discount · ${approval.target}`,
        action.decision === "approve" ? "Approved" : "Rejected",
        run.id,
      );
    }
  } else if (action.type === "terminate") {
    const run = s.runs.find((r) => r.id === action.runId);
    if (!run || !["awaiting_approval", "contained"].includes(run.status))
      return state;
    run.status = "terminated";
    cancelApprovals(run.id);
    run.steps.forEach((step) => {
      if (step.status === "held" || step.status === "pending") {
        step.status = "blocked";
        step.detail = "Execution terminated by the demo admin.";
      }
    });
    event("Workspace admin", "Run terminated", run.name, "Terminated", run.id);
  } else if (action.type === "policy") {
    const policy = s.policies.find((p) => p.id === action.policyId);
    if (
      !policy ||
      policy.threshold === undefined ||
      !Number.isFinite(action.threshold) ||
      action.threshold < 0 ||
      (policy.id === "discount" && action.threshold > 100)
    )
      return state;
    policy.threshold = action.threshold;
    policy.version += 1;
    // Any rule revision invalidates pending proposals; they must be evaluated again.
    s.approvals.forEach((a) => {
      if (a.status === "pending") {
        a.status = "invalidated";
        const run = s.runs.find((r) => r.id === a.runId);
        if (run?.status === "awaiting_approval") run.status = "blocked";
      }
    });
    event(
      "Workspace admin",
      "Policy updated",
      `${policy.name} · version ${policy.version}`,
      "Updated",
    );
  } else if (
    action.type === "contain" ||
    action.type === "plan" ||
    action.type === "reconcile"
  ) {
    const incident = s.incidents.find((i) => i.id === action.incidentId);
    if (!incident || incident.status === "resolved") return state;
    const a = agent(incident.agentId);
    const run = s.runs.find((r) => r.id === incident.runId);
    if (action.type === "contain") {
      suspendTree(incident.agentId);
      if (run) run.status = "terminated";
      cancelApprovals(incident.runId);
      incident.status = "contained";
      event(
        "Workspace admin",
        "Agent isolated",
        incident.title,
        "Contained",
        incident.runId,
      );
    } else if (action.type === "plan" && incident.status === "contained") {
      incident.status = "planned";
      event(
        "State reconciler",
        "Recovery plan prepared",
        "Restore approved field values with a version check.",
        "Planned",
        incident.runId,
      );
    } else if (
      action.type === "reconcile" &&
      incident.status === "planned" &&
      a?.status === "paused" &&
      run?.status === "terminated"
    ) {
      const current = s.records[incident.recordId];
      if (
        !incident.reversible ||
        !current ||
        current.version !== incident.observed.version ||
        current.discount !== incident.observed.discount ||
        current.stage !== incident.observed.stage
      ) {
        incident.status = "conflict";
        event(
          "State reconciler",
          "Recovery needs manual review",
          "Record changed since detection, or action is not reversible. No state overwritten.",
          "Conflict",
          incident.runId,
        );
      } else {
        s.records[incident.recordId] = {
          ...incident.expected,
          version: current.version + 1,
        };
        incident.status = "resolved";
        event(
          "State reconciler",
          "Approved state restored",
          `${incident.recordId} · version ${current.version + 1}`,
          "Reconciled",
          incident.runId,
        );
      }
    } else return state;
  } else if (action.type === "output") {
    const a = agent(action.agentId);
    if (!a || !action.text.trim()) return state;
    const result = outputCheck(action.text);
    // Retain only the sanitized preview; blocked input is not persisted.
    s.outputs.unshift({
      id: `out_${action.id}`,
      runId: "playground",
      agentId: a.id,
      target: "Output playground",
      original:
        result.status === "blocked"
          ? "[Sensitive input withheld]"
          : result.released!,
      ...result,
    });
    event(
      "Output guard",
      "Output evaluated",
      result.checks.join(" · "),
      result.status === "blocked"
        ? "Blocked"
        : result.status === "redacted"
          ? "Redacted"
          : "Allowed",
    );
  } else if (action.type === "budget") {
    const a = agent(action.agentId);
    if (!a || !Number.isFinite(action.budget) || action.budget <= 0)
      return state;
    a.budget = action.budget;
    event(
      "Workspace admin",
      "Model budget updated",
      `${a.name} · $${action.budget}`,
      "Updated",
    );
  }
  return s;
}
