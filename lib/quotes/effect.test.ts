import { expect, it } from "vitest";
import { observeQuoteEffect, quoteRequestIdentity, type QuoteEffectLookup } from "./effect";
import type { QuotePlan } from "./plan";

function fixture(): { request: QuotePlan["update"]["request"]; evidence: QuoteEffectLookup } {
  const request: QuotePlan["update"]["request"] = {
    contract: "quote-conditional-write-1", binding: "a".repeat(64), method: "PATCH", resource: "/quotes/quote-42",
    workspaceId: "company-a", sourceVersion: "v3", idempotencyKey: "00000000-0000-4000-8000-000000000002",
    body: { distributorId: "distributor-7", currency: "USD", subtotalMinor: 100_000, discountBps: 1400, totalMinor: 86_000 },
  };
  return { request, evidence: { contract: "quote-effect-lookup-1", status: "available", effects: [{
    contract: "quote-effect-readback-1", binding: request.binding, workspaceId: request.workspaceId, quoteId: "quote-42",
    actionId: request.idempotencyKey, requestIdentity: quoteRequestIdentity(request)!, effectId: "00000000-0000-4000-8000-000000000009",
    state: "committed", sourceBefore: "v3", sourceAfter: "v4", result: structuredClone(request.body),
  }], current: { workspaceId: request.workspaceId, quoteId: "quote-42", sourceVersion: "v4", ...structuredClone(request.body) } } };
}
function mutate(root: unknown, path: string, value: unknown, remove = false) {
  let target = root as Record<string, unknown>;
  const keys = path.split(".");
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  if (remove) delete target[keys.at(-1)!]; else target[keys.at(-1)!] = value;
}
it("verifies exact correlated committed effect and current readback with no execution authority", () => {
  const { request, evidence } = fixture();
  expect(observeQuoteEffect(request, evidence)).toMatchObject({ outcome: "verified", reference: evidence.effects[0].effectId });
  expect(observeQuoteEffect(request, evidence)).not.toHaveProperty("approval");
  expect(observeQuoteEffect(request, evidence).detail).toContain("provider evidence");
});
it("identical retry/readback evidence keeps one effect identity; two different effects refuse", () => {
  const { request, evidence } = fixture();
  const first = observeQuoteEffect(request, evidence);
  evidence.effects.push(structuredClone(evidence.effects[0]));
  expect(observeQuoteEffect(request, evidence)).toEqual(first);
  evidence.effects[1].effectId = "00000000-0000-4000-8000-000000000010";
  expect(observeQuoteEffect(request, evidence).outcome).toBe("conflict");
});
it("canonical request identity is order independent and binds every approved request field", () => {
  const { request } = fixture();
  expect(quoteRequestIdentity({ body: { totalMinor: 86_000, discountBps: 1400, subtotalMinor: 100_000, currency: "USD", distributorId: "distributor-7" },
    idempotencyKey: request.idempotencyKey, sourceVersion: "v3", workspaceId: "company-a", resource: "/quotes/quote-42", method: "PATCH", binding: request.binding, contract: "quote-conditional-write-1" })).toBe(quoteRequestIdentity(request));
  for (const [field, value] of [["workspaceId", "company-b"], ["binding", "b".repeat(64)], ["sourceVersion", "v5"], ["resource", "/quotes/quote-43"], ["idempotencyKey", "00000000-0000-4000-8000-000000000003"]])
    expect(quoteRequestIdentity({ ...request, [field]: value })).not.toBe(quoteRequestIdentity(request));
});

const conflicts: [string, unknown][] = [
  ["effects.0.workspaceId", "company-b"], ["effects.0.quoteId", "quote-43"],
  ["effects.0.binding", "b".repeat(64)], ["effects.0.requestIdentity", "b".repeat(64)],
  ["effects.0.actionId", "00000000-0000-4000-8000-000000000003"],
  ["effects.0.sourceBefore", "v2"], ["effects.0.sourceAfter", "v3"],
  ["effects.0.result.distributorId", "another-distributor"],
  ["current.workspaceId", "company-b"], ["current.quoteId", "quote-43"],
  ["current.sourceVersion", "v5"], ["current.distributorId", "another-distributor"],
];
it.each(conflicts)("contains correlated evidence conflict at %s", (path, value) => {
  const { request, evidence } = fixture(); mutate(evidence, path, value);
  expect(observeQuoteEffect(request, evidence).outcome).toBe("conflict");
});

const malformed: [string, unknown][] = [
  ["contract", "other"], ["status", "unavailable"], ["status", "accepted"], ["effects", []], ["effects", null],
  ["effects.0.contract", "other"], ["effects.0.binding", "missing"], ["effects.0.workspaceId", "../other"],
  ["effects.0.quoteId", ""], ["effects.0.actionId", "bad"], ["effects.0.requestIdentity", "not-a-hash"],
  ["effects.0.effectId", "bad"], ["effects.0.state", "pending"], ["effects.0.state", "failed"],
  ["effects.0.sourceBefore", null], ["effects.0.sourceAfter", ""], ["effects.0.result", null],
  ["effects.0.result.currency", "INR"], ["effects.0.result.discountBps", -1],
  ["effects.0.result.totalMinor", 85_000], ["effects.0.result.subtotalMinor", Number.MAX_SAFE_INTEGER + 1],
  ["effects.0.result.discountBps", "1400"], ["effects.0.result.subtotalMinor", 0],
  ["effects.0.extra", "ignored"], ["current", null], ["current.workspaceId", ""], ["current.quoteId", "../other"],
  ["current.sourceVersion", null], ["current.totalMinor", 85_000], ["current.currency", "INR"],
  ["current.extra", "ignored"], ["extra", "ignored"],
];
it.each(malformed)("keeps missing/malformed/unavailable evidence unknown at %s", (path, value) => {
  const { request, evidence } = fixture(); mutate(evidence, path, value);
  expect(observeQuoteEffect(request, evidence)).toMatchObject({ outcome: "unknown" });
  expect(observeQuoteEffect(request, evidence)).not.toHaveProperty("reference");
});

const malformedRequest: [string, unknown][] = [
  ["contract", "other"], ["binding", "bad"], ["method", "POST"], ["resource", "https://other.test/quotes/42"],
  ["workspaceId", ""], ["sourceVersion", ""], ["idempotencyKey", "bad"], ["body", null],
  ["body.currency", "EUR"], ["body.distributorId", "../other"], ["body.subtotalMinor", -1],
  ["body.totalMinor", NaN], ["body.discountBps", 10_001], ["body.totalMinor", 86_001], ["extra", "authority"],
];
it.each(malformedRequest)("refuses unverifiable saved request %s", (path, value) => {
  const { request, evidence } = fixture(); mutate(request, path, value);
  expect(quoteRequestIdentity(request)).toBeNull();
  expect(observeQuoteEffect(request, evidence).outcome).toBe("unknown");
});
it("matching final values without a retained action effect or with an unavailable provider never prove success", () => {
  const { request, evidence } = fixture();
  evidence.effects = [];
  expect(observeQuoteEffect(request, evidence).outcome).toBe("unknown");
  expect(observeQuoteEffect(request, { ...evidence, effects: fixture().evidence.effects, status: "unavailable" }).outcome).toBe("unknown");
  for (const input of [null, undefined, [], {}, "HTTP 200", { accepted: true }]) {
    expect(observeQuoteEffect(request, input).outcome).toBe("unknown");
    expect(observeQuoteEffect(input, evidence).outcome).toBe("unknown");
  }
});
it("changed approved source never verifies, even if final commercial values happen to match", () => {
  const { request, evidence } = fixture();
  evidence.effects[0].sourceBefore = "v5"; evidence.effects[0].sourceAfter = "v6";
  evidence.current!.sourceVersion = "v6";
  expect(observeQuoteEffect(request, evidence).outcome).toBe("conflict");
});
it("valid but different commercial results conflict; later equal-value writes do too", () => {
  const { request, evidence } = fixture();
  evidence.effects[0].result.discountBps = 1500; evidence.effects[0].result.totalMinor = 85_000;
  expect(observeQuoteEffect(request, evidence).outcome).toBe("conflict");
  const next = fixture().evidence;
  next.current!.discountBps = 1500; next.current!.totalMinor = 85_000;
  expect(observeQuoteEffect(request, next).outcome).toBe("conflict");
});
it("missing correlation fields, sparse/oversized arrays and accessor input cannot verify", () => {
  for (const field of ["binding", "actionId", "requestIdentity", "sourceBefore", "sourceAfter", "effectId"]) {
    const { request, evidence } = fixture(); mutate(evidence, `effects.0.${field}`, null, true);
    expect(observeQuoteEffect(request, evidence).outcome).toBe("unknown");
  }
  const { request, evidence } = fixture(); evidence.effects.length = 2;
  expect(observeQuoteEffect(request, evidence).outcome).toBe("unknown");
  evidence.effects = Array.from({ length: 17 }, () => fixture().evidence.effects[0]);
  expect(observeQuoteEffect(request, evidence).outcome).toBe("unknown");
  const accessor = { ...request };
  Object.defineProperty(accessor, "binding", { enumerable: true, get() { throw Error("must not execute"); } });
  expect(observeQuoteEffect(accessor, fixture().evidence).outcome).toBe("unknown");
  const arrayAccessor = fixture().evidence;
  Object.defineProperty(arrayAccessor.effects, "0", { enumerable: true, get() { throw Error("must not execute"); } });
  expect(observeQuoteEffect(request, arrayAccessor).outcome).toBe("unknown");
  const custom = fixture().evidence;
  Object.defineProperty(custom.effects, "extra", { value: true });
  expect(observeQuoteEffect(request, custom).outcome).toBe("unknown");
});
