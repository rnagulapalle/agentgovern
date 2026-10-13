import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectQuoteContractAdvertisement, probeQuoteContract, type QuoteContractBinding } from "./provider-contract";
const configured = (): QuoteContractBinding => ({ origin: "https://stage.fetchsandbox.com", sandboxId: "012345abcd", workspaceId: "company-a", quoteId: "quote-42", quoteBinding: "a".repeat(64), emailBinding: "b".repeat(64), contractVersion: 3 });
const advertisement = () => ({ contract: "quote-provider-advertisement-1", contractVersion: 3, workspaceId: "company-a", quoteId: "quote-42", quoteBinding: "a".repeat(64), emailBinding: "b".repeat(64), quoteWrite: "quote-conditional-write-1", quoteLookup: "quote-effect-lookup-1", quoteReadback: "quote-effect-readback-1", emailRequest: "quote-email-request-1" });
const credential = async () => "s".repeat(32);
const status = (state: string) => ({ status: state, conformanceEstablished: false, executionEligible: false });
function respond(value: unknown = advertisement(), init: ResponseInit = {}) {
  return vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, ...init })));
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("proposed quote provider advertisement, not conformance", () => {
  it("matches exact server-owned identity without granting conformance or execution", () => {
    expect(inspectQuoteContractAdvertisement(advertisement(), configured())).toEqual(status("advertised"));
    expect(Object.isFrozen(inspectQuoteContractAdvertisement(advertisement(), configured()))).toBe(true);
  });
  it.each(["contract", "quoteWrite", "quoteLookup", "quoteReadback", "emailRequest", "workspaceId", "quoteId", "quoteBinding", "emailBinding"])("refuses mismatched %s", field => {
    expect(inspectQuoteContractAdvertisement({ ...advertisement(), [field]: "different" }, configured())).toEqual(status("unsupported"));
  });
  it.each([0, 2, 4, "3", 3.5, null])("refuses stale/changed/malformed advertised version %s", contractVersion => {
    expect(inspectQuoteContractAdvertisement({ ...advertisement(), contractVersion }, configured())).toEqual(status("unsupported"));
  });
  it.each([null, [], {}, { resources: ["contacts"] }, { ...advertisement(), atomicSourceVersion: true }])("refuses absent, contacts-only or extra capabilities", value => {
    expect(inspectQuoteContractAdvertisement(value, configured())).toEqual(status("unsupported"));
  });
  it("rejects accessors, inherited fields, hidden fields and symbol extras without invoking getters", () => {
    const getter = vi.fn(() => "quote-provider-advertisement-1");
    const values = [Object.defineProperty(advertisement(), "contract", { get: getter }), Object.create(advertisement()), Object.defineProperty(advertisement(), "quoteWrite", { enumerable: false }), { ...advertisement(), [Symbol("extra")]: true }];
    for (const value of values) expect(inspectQuoteContractAdvertisement(value, configured())).toEqual(status("unsupported"));
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([{ origin: "https://evil.example" }, { origin: "https://fetchsandbox.com/" }, { origin: "https://secret@fetchsandbox.com" }, { sandboxId: "../secret" }, { workspaceId: "" }, { quoteId: "q/x" }, { quoteBinding: "bad" }, { emailBinding: "a".repeat(64) }, { contractVersion: 0 }, { contractVersion: "3" }, { extra: true }])("refuses malformed or unsafe server binding before credentials/fetch", async patch => {
    const credentials = vi.fn(credential); respond();
    expect(await probeQuoteContract({ ...configured(), ...patch }, credentials)).toEqual(status("unsupported"));
    expect(credentials).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([0, 30_001, 1.1, NaN])("refuses invalid timeout %s", async timeout => {
    respond(); expect(await probeQuoteContract(configured(), credential, timeout)).toEqual(status("unsupported")); expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses invalid root and credential source", async () => {
    respond(); expect(await probeQuoteContract(null, credential)).toEqual(status("unsupported"));
    expect(await probeQuoteContract(configured(), null as never)).toEqual(status("unsupported"));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("issues one bounded GET with no browser credentials or redirect and no writes", async () => {
    respond(); expect(await probeQuoteContract(configured(), credential)).toEqual(status("advertised"));
    expect(fetch).toHaveBeenCalledExactlyOnceWith("https://stage.fetchsandbox.com/sandbox/012345abcd/.well-known/looplabs-quote-contract", expect.objectContaining({ method: "GET", redirect: "error", credentials: "omit", cache: "no-store", headers: { Authorization: `Bearer ${"s".repeat(32)}`, Accept: "application/json" } }));
    expect((vi.mocked(fetch).mock.calls[0][1]!.signal as AbortSignal).aborted).toBe(true);
  });
  it("copies binding before credentials await, rather than using mutated authority", async () => {
    const b = configured(); respond();
    expect(await probeQuoteContract(b, async () => { b.workspaceId = "foreign"; b.contractVersion = 9; b.origin = "https://evil.example"; return credential(); })).toEqual(status("advertised"));
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("https://stage.fetchsandbox.com/");
  });
  it.each(["short", "a\nsecret", "s".repeat(257), null])("refuses malformed credentials without an HTTP call", async token => {
    respond(); expect(await probeQuoteContract(configured(), async () => token as string)).toEqual(status("unsupported")); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([404, 405, 501])("reports unsupported advertised endpoint HTTP %s", async code => {
    respond({}, { status: code }); expect(await probeQuoteContract(configured(), credential)).toEqual(status("unsupported"));
  });
  it.each([401, 403, 500, 302])("reports unavailable HTTP %s without leaking provider error", async code => {
    respond({ secret: "credential-private" }, { status: code }); expect(await probeQuoteContract(configured(), credential)).toEqual(status("unavailable"));
  });
  it("treats redirect rejection, malformed JSON, secret-bearing credential failure as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Error("secret-location"); }));
    expect(await probeQuoteContract(configured(), credential)).toEqual(status("unavailable"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{private", { headers: { "content-type": "application/json" } })));
    expect(await probeQuoteContract(configured(), credential)).toEqual(status("unavailable"));
    expect(await probeQuoteContract(configured(), async () => { throw Error("secret-token"); })).toEqual(status("unavailable"));
  });
  it.each<Record<string, string>>([{ "content-type": "text/html" }, {}, { "content-type": "application/json", "content-length": "-1" }, { "content-type": "application/json", "content-length": "16385" }])("refuses incompatible or oversize response declarations", async headers => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(advertisement()), { headers })));
    expect(await probeQuoteContract(configured(), credential)).toEqual(status("unavailable"));
  });
  it("bounds actual body bytes even when Content-Length lies; refuses missing body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(16385), { headers: { "content-type": "application/json", "content-length": "1" } })));
    expect(await probeQuoteContract(configured(), credential)).toEqual(status("unavailable"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "content-type": "application/json" } })));
    expect(await probeQuoteContract(configured(), credential)).toEqual(status("unavailable"));
  });
  it("accepts streamed valid metadata but never interprets it as provider conformance", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(advertisement()));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 10)); c.enqueue(bytes.slice(10)); c.close(); } }), { headers: { "content-type": "application/json; charset=utf-8", "content-length": String(bytes.length) } })));
    expect(await probeQuoteContract(configured(), credential)).toEqual(status("advertised"));
  });
  it.each(["credential", "fetch", "body"])("bounds stalled %s with one shared deadline", async stall => {
    vi.useFakeTimers(); const never = () => new Promise<never>(() => {});
    vi.stubGlobal("fetch", vi.fn(stall === "fetch" ? never : async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } })));
    const pending = probeQuoteContract(configured(), stall === "credential" ? never : credential, 100);
    await vi.advanceTimersByTimeAsync(101);
    expect(await pending).toEqual(status("unavailable"));
    expect(fetch).toHaveBeenCalledTimes(stall === "credential" ? 0 : 1);
  });
});
