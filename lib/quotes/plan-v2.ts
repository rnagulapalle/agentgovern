import { isDeepStrictEqual } from "node:util";
import { ControlError } from "../durable/contracts";
import { validateQuotePlan, type QuotePlan, type QuotePlanProposal, type QuotePlanContext } from "./plan";
import type { QuoteAuthoritySnapshot } from "./authority";

export type QuotePlanProposalV2 = Omit<QuotePlanProposal, "version"> & {
  version: "distributor-quote-plan-2"; authority: QuoteAuthoritySnapshot;
};
export interface QuotePlanContextV2 {
  contract: "quote-plan-context-2"; pricing: QuotePlanContext; authority: QuoteAuthoritySnapshot;
}
export type QuotePlanV2 = Omit<QuotePlan, "version" | "message"> & {
  version: "distributor-quote-plan-2"; authority: QuoteAuthoritySnapshot;
  message: Omit<QuotePlan["message"], "request"> & {
    request: QuotePlan["message"]["request"] & {
      contract: "quote-email-request-1"; binding: string; workspaceId: string; quoteId: string;
    };
  };
};
function refuse(): never { throw new ControlError(409, "Exact current quote and email authority required for this bound plan. No action was authorized."); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).some(k => typeof k !== "string") || Object.getOwnPropertyNames(value).sort().join() !== [...keys].sort().join() ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !('value' in d) || !d.enumerable)) refuse();
  return value as Record<string, unknown>;
}
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const email = (v: unknown) => typeof v === "string" && v.length <= 254 && /^[a-z0-9][a-z0-9._+-]*@[a-z0-9]+([.-][a-z0-9]+)*\.test$/.test(v);
const memberEmail = (v: unknown) => typeof v === "string" && v.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v);
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const positive = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 2_147_483_647;
function authority(value: unknown): QuoteAuthoritySnapshot {
  const a = object(value, ["contract","scopeId","scopeVersion","workspaceId","quoteId","distributorId","recipient","sender","quoteBinding","emailBinding","member","policyVersion","grantVersion","capability","recoveryEpoch"]);
  if (a.contract !== "quote-authority-1" || !uuid(a.scopeId) || !positive(a.scopeVersion) || !positive(a.grantVersion) ||
      !positive(a.policyVersion) || !id(a.workspaceId) || !id(a.quoteId) || !id(a.distributorId) ||
      !email(a.recipient) || !email(a.sender) || !memberEmail(a.member) || !hash(a.quoteBinding) || !hash(a.emailBinding) ||
      a.quoteBinding === a.emailBinding || !uuid(a.recoveryEpoch) || a.capability !== "quote.discount.approve") refuse();
  return a as unknown as QuoteAuthoritySnapshot;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Reuses retained v1 pricing and content. Bound proposal validation is not execution eligibility. */
export function validateQuotePlanV2(input: unknown, trustedContext: unknown): QuotePlanV2 {
  const p = object(input, ["version","planId","workspaceId","requester","approver","policyVersion","quote","discountBps","update","message","authority"]);
  const c = object(trustedContext, ["contract","pricing","authority"]);
  if (p.version !== "distributor-quote-plan-2" || c.contract !== "quote-plan-context-2") refuse();
  const proposed = authority(p.authority), current = authority(c.authority);
  if (!isDeepStrictEqual(proposed, current)) refuse();
  const { authority: ignored, ...proposal } = p; void ignored;
  const base = structuredClone(validateQuotePlan({ ...proposal, version:"distributor-quote-plan-1" }, c.pricing)) as unknown as QuotePlan;
  if (current.workspaceId !== base.workspaceId || current.quoteId !== base.quote.id || current.distributorId !== base.quote.distributorId ||
      current.member !== base.approver || current.policyVersion !== base.policyVersion || current.recipient !== base.quote.recipient ||
      current.sender !== base.message.request.body.from || current.quoteBinding !== base.update.request.binding) refuse();
  return freeze({ ...structuredClone(base), version:"distributor-quote-plan-2", authority:structuredClone(current),
    message:{ ...structuredClone(base.message), request:{...structuredClone(base.message.request),contract:"quote-email-request-1",
      binding:current.emailBinding,workspaceId:current.workspaceId,quoteId:current.quoteId} } });
}
/** Contract check only. Delayed approval/dispatch still require fresh server authority and provider proof. */
export function assertBoundQuotePlanContract(value: unknown): void {
  const discriminator = value && typeof value === "object" ? Object.getOwnPropertyDescriptor(value,"version") : undefined;
  if (!discriminator || !('value' in discriminator) || discriminator.value !== "distributor-quote-plan-2") throw new ControlError(409, "Historical quote plans lack bound email and versioned manager authority. Prepare and review a new bound plan.");
  const p = object(value,["version","planId","workspaceId","requester","approver","policyVersion","policy","quote","discountBps","totalMinor","decision","reason","update","message","authority"]) as unknown as QuotePlanV2;
  object(p.update,["actionId","agentId","approvalRequired","request"]);
  object(p.message,["actionId","agentId","approvalRequired","dependency","request"]);
  object(p.message.dependency,["actionId","requirement"]);
  object(p.update.request,["contract","binding","method","resource","workspaceId","sourceVersion","idempotencyKey","body"]);
  object(p.message.request,["contract","binding","workspaceId","quoteId","method","resource","idempotencyKey","body"]);
  object(p.message.request.body,["from","to","subject","text"]);
  const a = authority(p.authority);
  if (!uuid(p.planId) || !uuid(p.update.actionId) || !uuid(p.message.actionId) || !id(p.update.agentId) || !id(p.message.agentId) ||
      p.update.approvalRequired !== true || p.message.approvalRequired !== true ||
      p.update.request.contract !== "quote-conditional-write-1" || p.update.request.method !== "PATCH" || p.update.request.resource !== `/quotes/${a.quoteId}` ||
      p.update.request.workspaceId !== a.workspaceId || p.update.request.sourceVersion !== p.quote?.sourceVersion || p.update.request.idempotencyKey !== p.update.actionId ||
      p.message.request.method !== "POST" || p.message.request.resource !== "/emails" || p.message.request.idempotencyKey !== p.message.actionId ||
      p.message.dependency.actionId !== p.update.actionId || p.message.dependency.requirement !== "verified-matching-quote-effect" ||
      p.workspaceId !== a.workspaceId || p.approver !== a.member || p.requester === a.member || p.policyVersion !== a.policyVersion ||
      p.quote?.id !== a.quoteId || p.quote?.distributorId !== a.distributorId || p.quote?.recipient !== a.recipient ||
      p.update?.request?.binding !== a.quoteBinding || p.message?.request?.contract !== "quote-email-request-1" ||
      p.message.request.binding !== a.emailBinding || p.message.request.workspaceId !== a.workspaceId ||
      p.message.request.quoteId !== a.quoteId || p.message.request.body?.from !== a.sender ||
      !isDeepStrictEqual(p.message.request.body?.to,[a.recipient])) refuse();
}
