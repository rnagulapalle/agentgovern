import { isDeepStrictEqual } from "node:util";
import { ControlError } from "../durable/contracts";

/** A proposal boundary only. No provider is enrolled and no action is authorized here. */
export interface QuotePlanProposal {
  version: "distributor-quote-plan-1";
  planId: string;
  workspaceId: string;
  requester: string;
  approver: string;
  policyVersion: number;
  quote: {
    id: string; distributorId: string; recipient: string; sourceVersion: string; currency: "USD";
    subtotalMinor: number;
    lines: { id: string; quantity: number; unitPriceMinor: number }[];
  };
  discountBps: number;
  update: { actionId: string; agentId: string };
  message: { actionId: string; agentId: string; dependsOn: string };
}

/** Must come from current server-owned enrollment/source/policy, never the chat payload. */
export interface QuotePlanContext {
  workspaceId: string;
  requester: string;
  approvalGrants: {
    member: string; workspaceId: string; quoteId: string; policyVersion: number;
    active: true; capability: "quote.discount.approve";
  }[];
  quote: QuotePlanProposal["quote"];
  policy: { version: number; delegatedBps: number; hardCapBps: number; active: true };
  agents: {
    id: string; workspaceId: string; active: true; quoteId: string;
    action: "quote.update" | "quote.message";
  }[];
  provider: {
    workspaceId: string; quoteId: string; binding: string;
    contract: "quote-conditional-write-1";
    atomicSourceVersion: true; actionIdIdempotency: true; effectReadback: true;
  };
  email: { workspaceId: string; quoteId: string; from: string; recipient: string; actionIdIdempotency: true; effectReadback: true };
}

export interface QuotePlan {
  version: "distributor-quote-plan-1";
  planId: string;
  workspaceId: string;
  requester: string;
  approver: string;
  policyVersion: number;
  policy: QuotePlanContext["policy"];
  quote: QuotePlanProposal["quote"];
  discountBps: number;
  totalMinor: number;
  decision: "independent-review-required";
  reason: "above-delegation" | "named-review-required";
  update: {
    actionId: string; agentId: string; approvalRequired: true;
    request: {
      contract: "quote-conditional-write-1"; binding: string; method: "PATCH";
      resource: string; workspaceId: string; sourceVersion: string;
      idempotencyKey: string;
      body: { distributorId: string; currency: "USD"; subtotalMinor: number; discountBps: number; totalMinor: number };
    };
  };
  message: {
    actionId: string; agentId: string; approvalRequired: true;
    dependency: { actionId: string; requirement: "verified-matching-quote-effect" };
    request: { method: "POST"; resource: "/emails"; idempotencyKey: string; body: { from: string; to: string[]; subject: string; text: string } };
  };
}

function refuse(): never {
  throw new ControlError(409, "A current scoped quote, exact pricing, independent reviewer, policy and conditional provider contract are required. No work was authorized.");
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(value, key)) ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some((d) => !Object.hasOwn(d, "value"))) refuse();
  return value as Record<string, unknown>;
}
function id(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function email(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}
function quote(value: unknown) {
  const q = object(value, ["id", "distributorId", "recipient", "sourceVersion", "currency", "subtotalMinor", "lines"]);
  if (!id(q.id) || !id(q.distributorId) || !email(q.recipient) || typeof q.sourceVersion !== "string" ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(q.sourceVersion) || q.currency !== "USD" ||
      !integer(q.subtotalMinor, 1, Number.MAX_SAFE_INTEGER) ||
      !Array.isArray(q.lines) || q.lines.length < 1 || q.lines.length > 100) refuse();
  let sum = 0n;
  const seen = new Set<string>();
  for (const line of q.lines) {
    const l = object(line, ["id", "quantity", "unitPriceMinor"]);
    if (!id(l.id) || seen.has(l.id) || !integer(l.quantity, 1, 1_000_000) ||
        !integer(l.unitPriceMinor, 1, Number.MAX_SAFE_INTEGER)) refuse();
    seen.add(l.id);
    sum += BigInt(l.quantity) * BigInt(l.unitPriceMinor);
  }
  if (sum !== BigInt(q.subtotalMinor)) refuse();
}
type Immutable<T> = T extends readonly (infer U)[] ? readonly Immutable<U>[] :
  T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}

/** Validate against current server evidence. Revalidate again on approval and dispatch. */
export function validateQuotePlan(input: unknown, trustedContext: unknown): Immutable<QuotePlan> {
  const p = object(input, ["version", "planId", "workspaceId", "requester", "approver", "policyVersion", "quote", "discountBps", "update", "message"]);
  const c = object(trustedContext, ["workspaceId", "requester", "approvalGrants", "quote", "policy", "agents", "provider", "email"]);
  if (p.version !== "distributor-quote-plan-1" || !uuid(p.planId) ||
      !id(p.workspaceId) || p.workspaceId !== c.workspaceId ||
      !email(p.requester) || p.requester !== c.requester || !email(p.approver) ||
      p.approver === p.requester) refuse();
  quote(p.quote); quote(c.quote);
  if (!isDeepStrictEqual(p.quote, c.quote)) refuse();
  const policy = object(c.policy, ["version", "delegatedBps", "hardCapBps", "active"]);
  if (!integer(policy.version, 1, Number.MAX_SAFE_INTEGER) || p.policyVersion !== policy.version ||
      policy.active !== true || !integer(policy.delegatedBps, 0, 10_000) ||
      !integer(policy.hardCapBps, policy.delegatedBps, 10_000) ||
      !integer(p.discountBps, 0, policy.hardCapBps)) refuse();
  const q = p.quote as QuotePlanProposal["quote"];
  if (!Array.isArray(c.approvalGrants) || c.approvalGrants.length < 1 || c.approvalGrants.length > 100) refuse();
  const grants = Array.from(c.approvalGrants).map((grant) =>
    object(grant, ["member", "workspaceId", "quoteId", "policyVersion", "active", "capability"]));
  if (grants.some((g) => !email(g.member) || g.workspaceId !== p.workspaceId || g.quoteId !== q.id ||
      g.policyVersion !== policy.version || g.active !== true || g.capability !== "quote.discount.approve") ||
      new Set(grants.map((g) => g.member)).size !== grants.length ||
      !grants.some((g) => g.member === p.approver)) refuse();
  const u = object(p.update, ["actionId", "agentId"]);
  const m = object(p.message, ["actionId", "agentId", "dependsOn"]);
  if (!uuid(u.actionId) || !uuid(m.actionId) || !id(u.agentId) || !id(m.agentId) ||
      new Set([p.planId.toLowerCase(), u.actionId.toLowerCase(), m.actionId.toLowerCase()]).size !== 3 ||
      m.dependsOn !== u.actionId || u.agentId === m.agentId ||
      !Array.isArray(c.agents) || c.agents.length < 2 || c.agents.length > 100) refuse();
  const agents = Array.from(c.agents).map((agent) => object(agent, ["id", "workspaceId", "active", "quoteId", "action"]));
  if (agents.some((a) => !id(a.id) || !id(a.workspaceId) || !id(a.quoteId) ||
      a.active !== true || !["quote.update", "quote.message"].includes(a.action as string)) ||
      new Set(agents.map((a) => a.id)).size !== agents.length) refuse();
  for (const [step, action] of [[u, "quote.update"], [m, "quote.message"]] as const) {
    if (!agents.some((a) => a.id === step.agentId && a.workspaceId === p.workspaceId &&
        a.quoteId === q.id && a.action === action)) refuse();
  }
  const provider = object(c.provider, ["workspaceId", "quoteId", "binding", "contract", "atomicSourceVersion", "actionIdIdempotency", "effectReadback"]);
  const e = object(c.email, ["workspaceId", "quoteId", "from", "recipient", "actionIdIdempotency", "effectReadback"]);
  if (provider.workspaceId !== p.workspaceId || provider.quoteId !== q.id ||
      typeof provider.binding !== "string" || !/^[a-f0-9]{64}$/.test(provider.binding) ||
      provider.contract !== "quote-conditional-write-1" || provider.atomicSourceVersion !== true ||
      provider.actionIdIdempotency !== true || provider.effectReadback !== true ||
      e.workspaceId !== p.workspaceId || e.quoteId !== q.id ||
      !email(e.from) || !email(e.recipient) || e.recipient !== q.recipient ||
      e.actionIdIdempotency !== true || e.effectReadback !== true) refuse();
  const numerator = BigInt(q.subtotalMinor) * BigInt(10_000 - p.discountBps);
  // No implicit rounding rule: fractional minor units need a different explicit contract.
  if (numerator % 10_000n !== 0n) refuse();
  const exactTotal = numerator / 10_000n;
  const totalMinor = Number(exactTotal);
  const amount = `${exactTotal / 100n}.${String(exactTotal % 100n).padStart(2, "0")}`;
  const plan: QuotePlan = {
    version: "distributor-quote-plan-1", planId: p.planId, workspaceId: p.workspaceId,
    requester: p.requester, approver: p.approver, policyVersion: policy.version,
    policy: structuredClone(policy) as unknown as QuotePlanContext["policy"], quote: structuredClone(q),
    discountBps: p.discountBps, totalMinor, decision: "independent-review-required",
    reason: p.discountBps > policy.delegatedBps ? "above-delegation" : "named-review-required",
    update: { actionId: u.actionId, agentId: u.agentId, approvalRequired: true,
      request: { contract: "quote-conditional-write-1", binding: provider.binding, method: "PATCH",
        resource: `/quotes/${q.id}`, workspaceId: p.workspaceId, sourceVersion: q.sourceVersion,
        idempotencyKey: u.actionId, body: { distributorId: q.distributorId, currency: "USD",
          subtotalMinor: q.subtotalMinor, discountBps: p.discountBps, totalMinor } } },
    message: { actionId: m.actionId, agentId: m.agentId, approvalRequired: true,
      dependency: { actionId: u.actionId, requirement: "verified-matching-quote-effect" },
      request: { method: "POST", resource: "/emails", idempotencyKey: m.actionId,
        body: { from: e.from, to: [e.recipient], subject: `Updated quote ${q.id}`,
          text: `Quote ${q.id}: USD ${amount} after a ${p.discountBps / 100}% discount. This amount excludes taxes and fees.` } } },
  };
  return freeze(plan);
}
