// History pins only. This module grants no execution or review authority.
// A quote worker must separately validate its installed role, immutable dispatch
// route, current memberships, scopes, policy, approvals and predecessor effects.
export interface QuoteRunContract {
  contract: "quote-background-1";
  planId: string;
  runId: string;
  planHash: string;
  planVersion: "distributor-quote-plan-2";
  connectorVersion: "native-quote-mail-1";
  recoveryEpoch: string;
  updateActionId: string;
  messageActionId: string;
  updateRequestIdentity: string;
  messageRequestIdentity: string;
  workerBuildId: string;
}
export type QuoteProgress = "waiting" | "awaiting-message-approval" | "awaiting-named-verification" | "contained";
const keys = ["contract", "planId", "runId", "planHash", "planVersion", "connectorVersion", "recoveryEpoch", "updateActionId", "messageActionId", "updateRequestIdentity", "messageRequestIdentity", "workerBuildId"].sort();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
export function assertQuoteRunContract(value: unknown): asserts value is QuoteRunContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Unsupported quote run contract");
  const c = value as Record<string, unknown>;
  if (Object.keys(c).sort().join("|") !== keys.join("|")
    || c.contract !== "quote-background-1" || c.planVersion !== "distributor-quote-plan-2" || c.connectorVersion !== "native-quote-mail-1"
    || ![c.planId,c.runId,c.updateActionId,c.messageActionId].every(v => typeof v === "string" && uuid.test(v))
    || c.updateActionId === c.messageActionId
    || ![c.planHash,c.updateRequestIdentity,c.messageRequestIdentity].every(v => typeof v === "string" && hash.test(v))
    || typeof c.recoveryEpoch !== "string" || !uuid.test(c.recoveryEpoch)
    || typeof c.workerBuildId !== "string" || !/^quote-[0-9a-f]{64}$/.test(c.workerBuildId)) throw Error("Unsupported quote run contract");
}
export interface QuoteActivities {
  // Must call the existing quote connector/workflow controls with a genuine
  // independently bound workload. It must not propose, approve or renew review.
  advanceQuoteContract(contract: QuoteRunContract): Promise<QuoteProgress>;
}
