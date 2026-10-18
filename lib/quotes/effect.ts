import { isDeepStrictEqual } from "node:util";
import type { Observation } from "../connectors/contracts";
import type { QuotePlan } from "./plan";
import { quotePlanDigest } from "./store";

/**
 * Proposed provider contract only; no quote provider has passed conformance yet.
 * `requestIdentity` is quotePlanDigest(exact saved conditional update request),
 * using canonical JSON + the existing looplabs-quote-proposal-1 digest domain.
 * `committed` means the provider durably retained this effect/action correlation;
 * an HTTP success or an unpersisted write must never produce this representation.
 * Lookup returns the retained action effect AND current quote state. A committed
 * historical effect does not establish that later conflicting writes are absent.
 * Only an authenticated scoped connector may supply evidence in integration.
 * This pure check grants no approval, lease, retry, dispatch or delivery authority.
 */
export interface QuoteEffect {
  contract: "quote-effect-readback-1";
  binding: string;
  workspaceId: string;
  quoteId: string;
  actionId: string;
  requestIdentity: string;
  effectId: string;
  state: "committed";
  sourceBefore: string;
  sourceAfter: string;
  result: QuotePlan["update"]["request"]["body"];
}
export interface QuoteEffectLookup {
  contract: "quote-effect-lookup-1";
  status: "available" | "unavailable";
  effects: QuoteEffect[];
  current: null | {
    workspaceId: string; quoteId: string; sourceVersion: string;
    distributorId: string; currency: "USD"; subtotalMinor: number;
    discountBps: number; totalMinor: number;
  };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = /^[A-Za-z0-9_-]{1,64}$/;
const source = /^[A-Za-z0-9._:-]{1,128}$/;
const hash = /^[a-f0-9]{64}$/;
function text(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
function object(value: unknown, keys: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, "value") || !d.enumerable)) return null;
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}
function result(value: unknown): boolean {
  const r = object(value, ["distributorId", "currency", "subtotalMinor", "discountBps", "totalMinor"]);
  if (!r || !text(r.distributorId, id) || r.currency !== "USD" ||
      !integer(r.subtotalMinor, 1) || !integer(r.discountBps, 0, 10_000) || !integer(r.totalMinor, 0)) return false;
  return BigInt(r.subtotalMinor) * BigInt(10_000 - r.discountBps) === BigInt(r.totalMinor) * 10_000n;
}
function request(value: unknown): value is QuotePlan["update"]["request"] {
  const r = object(value, ["contract", "binding", "method", "resource", "workspaceId", "sourceVersion", "idempotencyKey", "body"]);
  return Boolean(r && r.contract === "quote-conditional-write-1" && text(r.binding, hash) && r.method === "PATCH" &&
    text(r.resource, /^\/quotes\/[A-Za-z0-9_-]{1,64}$/) && text(r.workspaceId, id) && text(r.sourceVersion, source) &&
    text(r.idempotencyKey, uuid) && result(r.body));
}
/** Stable proposed provider correlation, not a signature or proof of execution. */
export function quoteRequestIdentity(value: unknown): string | null {
  return request(value) ? quotePlanDigest(value) : null;
}
function effect(value: unknown): value is QuoteEffect {
  const e = object(value, ["contract", "binding", "workspaceId", "quoteId", "actionId", "requestIdentity", "effectId", "state", "sourceBefore", "sourceAfter", "result"]);
  return Boolean(e && e.contract === "quote-effect-readback-1" && text(e.binding, hash) && text(e.workspaceId, id) &&
    text(e.quoteId, id) && text(e.actionId, uuid) && text(e.requestIdentity, hash) && text(e.effectId, uuid) &&
    e.state === "committed" && text(e.sourceBefore, source) && text(e.sourceAfter, source) && result(e.result));
}
function effectValues(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16 ||
      Reflect.ownKeys(value).length !== value.length + 1) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const values: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const descriptor = descriptors[String(i)];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) return null;
    values.push(descriptor.value);
  }
  return values;
}
const unknown = (): Observation => ({ outcome: "unknown", detail: "A complete correlated quote effect and current readback are unavailable. Keep dependent work held; do not infer success or resend." });
const conflict = (): Observation => ({ outcome: "conflict", detail: "Quote effect identity, approved source or current state conflicts with the saved request. Keep dependent work held." });

/** Validate only observed effects against an exact server-saved request snapshot. */
export function observeQuoteEffect(expectedRequest: unknown, evidence: unknown): Observation {
  const identity = quoteRequestIdentity(expectedRequest);
  if (!identity || !request(expectedRequest)) return unknown();
  const lookup = object(evidence, ["contract", "status", "effects", "current"]);
  if (!lookup || lookup.contract !== "quote-effect-lookup-1" || lookup.status !== "available") return unknown();
  const effects = effectValues(lookup.effects);
  if (!effects || !effects.every(effect)) return unknown();
  const first = effects[0];
  if (effects.some(e => !isDeepStrictEqual(e, first))) return conflict();
  const quoteId = expectedRequest.resource.slice("/quotes/".length);
  if (first.binding !== expectedRequest.binding || first.workspaceId !== expectedRequest.workspaceId || first.quoteId !== quoteId ||
      first.actionId !== expectedRequest.idempotencyKey || first.requestIdentity !== identity ||
      first.sourceBefore !== expectedRequest.sourceVersion || first.sourceAfter === first.sourceBefore ||
      !isDeepStrictEqual(first.result, expectedRequest.body)) return conflict();
  const current = object(lookup.current, ["workspaceId", "quoteId", "sourceVersion", "distributorId", "currency", "subtotalMinor", "discountBps", "totalMinor"]);
  if (!current || !text(current.workspaceId, id) || !text(current.quoteId, id) || !text(current.sourceVersion, source)) return unknown();
  const currentResult = { distributorId: current.distributorId, currency: current.currency,
    subtotalMinor: current.subtotalMinor, discountBps: current.discountBps, totalMinor: current.totalMinor };
  if (!result(currentResult)) return unknown();
  if (current.workspaceId !== first.workspaceId || current.quoteId !== first.quoteId || current.sourceVersion !== first.sourceAfter ||
      !isDeepStrictEqual(currentResult, first.result)) return conflict();
  return { outcome: "verified", reference: first.effectId,
    detail: "The provider reported one committed effect for this exact conditional quote request, and its current quote readback matches. This is provider evidence, not live-provider conformance or an approval." };
}
