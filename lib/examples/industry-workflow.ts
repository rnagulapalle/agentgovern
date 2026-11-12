import { evaluate } from "@/lib/engine";
import type { ActionRequest, AgentIdentity } from "@/lib/engine";
import { outputCheck } from "@/lib/control-plane/model";

export type Industry = "healthcare" | "freight";
export type Stage = "idle" | "blocked" | "review" | "approved" | "rejected" | "uncertain" | "verified" | "conflict";
export type Inputs = { sourceMinutes: number; restrictedField: boolean; changedAction: boolean; lostAcknowledgement: boolean };
export type SampleEffect = { revision: number; value: string };
export type DemoEvent = { sequence: number; actor: string; event: string; detail: string };
export type IndustryState = {
  industry: Industry; revision: number; sourceVersion: number; inputs: Inputs; stage: Stage;
  approvedRevision: number | null; effects: SampleEffect[]; record: string | null; events: DemoEvent[];
};
const NOW = "2026-11-12T16:00:00.000Z";
export const industryConfig = {
  healthcare: { caseId: "REF-2048", agent: "Referral coordinator", owner: "Maya Patel", role: "Referral operations manager", source: "Referral system", target: "Verified referral office", initialValue: "Referral acknowledgement", changedValue: "Revised referral acknowledgement", recordLabel: "Referral status", before: "Awaiting acknowledgement", after: "Acknowledged", permission: "Read referral · propose acknowledgement" },
  freight: { caseId: "LD-7821", agent: "Delivery exception agent", owner: "Alex Morgan", role: "Dispatch manager", source: "Transport management system", target: "Verified shipper contact", initialValue: "Delivery ETA 16:30", changedValue: "Delivery ETA 18:00", recordLabel: "Shipper update", before: "Previous ETA 14:00", after: "Delivery ETA 16:30", permission: "Read load · propose shipper update" },
} as const;
export function initialIndustryState(industry: Industry): IndustryState {
  return { industry, revision: 1, sourceVersion: industry === "healthcare" ? 12 : 7, inputs: { sourceMinutes: industry === "freight" ? 120 : 5, restrictedField: industry === "healthcare", changedAction: false, lostAcknowledgement: true }, stage: "idle", approvedRevision: null, effects: [], record: null, events: [] };
}
export function validInputs(inputs: Inputs) {
  return Number.isFinite(inputs.sourceMinutes) && inputs.sourceMinutes >= 0 && inputs.sourceMinutes <= 1440 && [inputs.restrictedField, inputs.changedAction, inputs.lostAcknowledgement].every(x => typeof x === "boolean");
}
export function evaluateIndustry(state: IndustryState) {
  if (!validInputs(state.inputs)) return null;
  const config = industryConfig[state.industry];
  const agent: AgentIdentity = { id: `example-${state.industry}`, owner: config.owner, role: config.role, riskTier: "High", restrictedTools: [], capabilities: [{ id: "email.send", requiresTarget: true, requiresFreshSourceWithinDays: 1 / 24 }] };
  const request: ActionRequest = { id: `${config.caseId}-r${state.revision}`, agentId: agent.id, capability: "email.send", tool: "Sample messaging", summary: state.inputs.changedAction ? config.changedValue : config.initialValue, target: config.target, params: {}, sourceRecord: { id: `${config.caseId}/source-v${state.sourceVersion}`, system: config.source, lastSyncedAt: new Date(Date.parse(NOW) - state.inputs.sourceMinutes * 60000).toISOString() }, at: NOW };
  const policy = evaluate(request, { agent, now: NOW });
  // The existing checker is intentionally a narrow pattern check, not a PHI classifier.
  const output = outputCheck(state.industry === "healthcare" && state.inputs.restrictedField ? "Sample restricted field: 000-00-0000" : request.summary);
  return { request, policy, output, blocked: policy.decision === "block" || output.status === "blocked" };
}
export type IndustryAction =
  | { type: "change"; inputs: Inputs }
  | { type: "check" | "approve" | "reject" | "apply" | "reconcile" | "conflict" | "reset" };
/** Presentation state for the public browser example. Never dispatches a connector or real approval. */
export function industryReducer(state: IndustryState, action: IndustryAction): IndustryState {
  if (action.type === "reset") return initialIndustryState(state.industry);
  const add = (next: IndustryState, actor: string, event: string, detail: string): IndustryState => ({ ...next, events: [...state.events, { sequence: state.events.length + 1, actor, event, detail }] });
  const config = industryConfig[state.industry];
  if (action.type === "change") {
    if (["uncertain", "conflict"].includes(state.stage) || !validInputs(action.inputs) || JSON.stringify(action.inputs) === JSON.stringify(state.inputs)) return state;
    return add({ ...state, inputs: action.inputs, revision: state.revision + 1, sourceVersion: state.sourceVersion + (action.inputs.sourceMinutes !== state.inputs.sourceMinutes ? 1 : 0), stage: "idle", approvedRevision: null }, "Operator", "Request changed", `Revision ${state.revision + 1}; earlier review no longer applies.`);
  }
  const result = evaluateIndustry(state);
  if (!result) return state;
  if (action.type === "check") {
    if (["uncertain", "verified", "conflict", "rejected"].includes(state.stage)) return state;
    return add({ ...state, stage: result.blocked ? "blocked" : "review", approvedRevision: null }, "LoopLabs", result.blocked ? "Action blocked" : "Manager review required", result.output.status === "blocked" ? "Configured restricted pattern found in the sample draft." : result.policy.decision === "block" ? "Source is outside the example 60-minute freshness window." : `Exact request ${result.request.id}; source and configured output checks passed.`);
  }
  if (action.type === "approve" || action.type === "reject") {
    if (state.stage !== "review" || result.blocked) return state;
    return add({ ...state, stage: action.type === "approve" ? "approved" : "rejected", approvedRevision: action.type === "approve" ? state.revision : null }, config.owner, action.type === "approve" ? "Exact action approved" : "Action rejected", `${result.request.id} · ${result.request.summary}`);
  }
  if (action.type === "apply") {
    if (state.stage !== "approved" || state.approvedRevision !== state.revision || result.blocked || state.effects.some(x => x.revision === state.revision)) return state;
    const value = result.request.summary;
    return add({ ...state, effects: [...state.effects, { revision: state.revision, value }], record: value, stage: state.inputs.lostAcknowledgement ? "uncertain" : "verified" }, "Sample system", state.inputs.lostAcknowledgement ? "Acknowledgement lost" : "Local update verified", state.inputs.lostAcknowledgement ? "Local update applied; reply lost. Read back before retry." : "Sample record matches the exact approved action.");
  }
  if (action.type === "conflict" && state.stage === "uncertain") return add({ ...state, record: "Changed by another operator" }, "Another operator", "Concurrent record change", "The sample record now differs from the approved update.");
  if (action.type === "reconcile" && state.stage === "uncertain") {
    const effect = state.effects.find(x => x.revision === state.revision);
    const matches = effect && effect.value === result.request.summary && state.record === effect.value;
    return add({ ...state, stage: matches ? "verified" : "conflict" }, "LoopLabs", matches ? "Outcome reconciled" : "Conflict contained", matches ? "Existing local update found. No second update added." : "Readback differs. No overwrite and no retry; owner review required.");
  }
  return state;
}
