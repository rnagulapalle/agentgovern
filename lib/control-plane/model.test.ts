import { describe, expect, it } from "vitest";
import {
  controlReducer,
  initialState,
  outputCheck,
  ROLE_TOOLS,
  type Agent,
  type ControlState,
} from "./model";

const stamp = { id: "test_1", at: "2026-09-29T17:00:00Z" };
const fresh = () => initialState(stamp.at);
const simulate = (
  state: ControlState,
  changes: Partial<{
    agentId: string;
    discount: number;
    sourceAge: number;
  }> = {},
) =>
  controlReducer(state, {
    ...stamp,
    type: "simulate",
    agentId: "agt_003",
    discount: 5,
    sourceAge: 2,
    ...changes,
  });

describe("unified control plane", () => {
  it("uses the existing action engine to allow, hold, and block", () => {
    expect(simulate(fresh()).runs[0].status).toBe("completed");
    expect(simulate(fresh(), { discount: 25 }).runs[0].status).toBe(
      "awaiting_approval",
    );
    expect(simulate(fresh(), { sourceAge: 40 }).runs[0].status).toBe("blocked");
  });
  it("denies an active agent without the required tool permission", () => {
    expect(simulate(fresh(), { agentId: "agt_002" }).runs[0].status).toBe(
      "blocked",
    );
  });
  it("reserves enough model budget for the next simulated call", () => {
    const s = fresh();
    s.agents[2].budget = s.agents[2].spent + 0.01;
    const next = simulate(s);
    expect(next.runs[0].status).toBe("blocked");
    expect(next.agents[2].spent).toBe(s.agents[2].spent);
  });
  it("suspends descendants and invalidates pending delegated work", () => {
    const s = controlReducer(fresh(), {
      ...stamp,
      type: "agent_status",
      agentId: "agt_001",
      status: "paused",
    });
    expect(s.agents.slice(0, 3).every((a) => a.status === "paused")).toBe(true);
    expect(s.runs[0].status).toBe("terminated");
    expect(s.approvals[0].status).toBe("invalidated");
    expect(simulate(s).runs[0].status).toBe("blocked");
  });
  it("rejects role and parent scope escalation at onboarding", () => {
    const s = fresh();
    const newAgent: Agent = { ...s.agents[1], id: "new", tier: "Frontier" };
    expect(
      controlReducer(s, { ...stamp, type: "onboard", agent: newAgent }),
    ).toBe(s);
    const noDelegation: Agent = {
      ...newAgent,
      tier: "Utility",
      parentId: "agt_002",
    };
    expect(
      controlReducer(s, { ...stamp, type: "onboard", agent: noDelegation }),
    ).toBe(s);
    const excessTools: Agent = {
      ...newAgent,
      tier: "Utility",
      tools: ROLE_TOOLS.Coordinator,
    };
    expect(
      controlReducer(s, { ...stamp, type: "onboard", agent: excessTools }),
    ).toBe(s);
  });
  it("accepts a scoped agent with an owner and a budget", () => {
    const s = fresh();
    const next = controlReducer(s, {
      ...stamp,
      type: "onboard",
      agent: { ...s.agents[1], id: "new" },
    });
    expect(next.agents).toHaveLength(7);
    expect(next.audit[0].action).toBe("Agent onboarded");
  });
  it("executes an approved proposal once and records its output", () => {
    const s = controlReducer(fresh(), {
      ...stamp,
      type: "approval",
      approvalId: "apr_1048",
      decision: "approve",
    });
    expect(s.runs[0].status).toBe("completed");
    expect(s.outputs[0].released).toContain("25%");
    expect(
      controlReducer(s, {
        ...stamp,
        type: "approval",
        approvalId: "apr_1048",
        decision: "approve",
      }),
    ).toBe(s);
  });
  it("invalidates proposals when any policy threshold changes", () => {
    const s = controlReducer(fresh(), {
      ...stamp,
      type: "policy",
      policyId: "freshness",
      threshold: 1,
    });
    expect(s.approvals[0].status).toBe("invalidated");
    expect(s.runs[0].status).toBe("blocked");
    expect(
      controlReducer(s, {
        ...stamp,
        type: "approval",
        approvalId: "apr_1048",
        decision: "approve",
      }),
    ).toBe(s);
  });
  it("will not resume a terminated run through an old approval", () => {
    const s = controlReducer(fresh(), {
      ...stamp,
      type: "terminate",
      runId: "run_1048",
    });
    expect(s.approvals[0].status).toBe("invalidated");
    expect(
      controlReducer(s, {
        ...stamp,
        type: "approval",
        approvalId: "apr_1048",
        decision: "approve",
      }).runs[0].status,
    ).toBe("terminated");
  });
  it("requires containment and a plan before state restoration", () => {
    const s = fresh();
    expect(
      controlReducer(s, { ...stamp, type: "reconcile", incidentId: "inc_024" }),
    ).toBe(s);
  });
  it("contains the whole delegation tree when the incident belongs to a parent", () => {
    const s = fresh();
    s.incidents[0].agentId = "agt_001";
    const next = controlReducer(s, {
      ...stamp,
      type: "contain",
      incidentId: "inc_024",
    });
    expect(next.agents.slice(0, 3).every((a) => a.status === "paused")).toBe(
      true,
    );
    expect(next.approvals[0].status).toBe("invalidated");
    expect(next.runs[0].steps[2].status).toBe("blocked");
  });
  const planned = () => {
    const isolated = controlReducer(fresh(), {
      ...stamp,
      type: "contain",
      incidentId: "inc_024",
    });
    return controlReducer(isolated, {
      ...stamp,
      type: "plan",
      incidentId: "inc_024",
    });
  };
  it("restores expected fields with a NEW version and preserves containment", () => {
    const s = controlReducer(planned(), {
      ...stamp,
      type: "reconcile",
      incidentId: "inc_024",
    });
    expect(s.records["crm/northstar"]).toEqual({
      version: 8,
      discount: 10,
      stage: "Negotiation",
    });
    expect(s.incidents[0].status).toBe("resolved");
    expect(s.agents[2].status).toBe("paused");
    expect(s.runs.find((r) => r.id === "run_1047")?.status).toBe("terminated");
  });
  it("does not overwrite a concurrent change", () => {
    const s = planned();
    s.records["crm/northstar"].version = 8;
    s.records["crm/northstar"].discount = 12;
    const next = controlReducer(s, {
      ...stamp,
      type: "reconcile",
      incidentId: "inc_024",
    });
    expect(next.incidents[0].status).toBe("conflict");
    expect(next.records["crm/northstar"].discount).toBe(12);
  });
  it("stops compensation when an effect is not reversible", () => {
    const s = planned();
    s.incidents[0].reversible = false;
    const next = controlReducer(s, {
      ...stamp,
      type: "reconcile",
      incidentId: "inc_024",
    });
    expect(next.incidents[0].status).toBe("conflict");
    expect(next.records).toEqual(s.records);
  });
  it("redacts email patterns and blocks sensitive identifier patterns", () => {
    expect(outputCheck("Contact test@example.com").released).toBe(
      "Contact [EMAIL REDACTED]",
    );
    expect(outputCheck("test SSN 123-45-6789").released).toBeNull();
    expect(outputCheck("All clear").status).toBe("passed");
  });
  it("never persists sensitive playground input", () => {
    const s = controlReducer(fresh(), {
      ...stamp,
      type: "output",
      agentId: "agt_004",
      text: "test SSN 123-45-6789",
    });
    expect(JSON.stringify(s)).not.toContain("123-45-6789");
  });
});
