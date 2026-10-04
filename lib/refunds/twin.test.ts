import { afterEach, describe, it, expect, vi } from "vitest";
import { FetchSandboxStripe } from "./twin";
import { PAYMENT, type RefundAction } from "./contracts";
const key = "sk_test_" + "a".repeat(40);
afterEach(() => vi.unstubAllGlobals());
const body = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const payment = {
  id: PAYMENT,
  amount: 100000,
  currency: "usd",
  paid: true,
  amount_refunded: 0,
};
const refund = {
  id: "re_example",
  amount: 500,
  currency: "usd",
  charge: PAYMENT,
  status: "succeeded",
  metadata: { looplabs_action: "action" },
};
describe("Restricted FetchSandbox Stripe adapter", () => {
  it("rejects live endpoints, unconfigured credentials and malformed test keys", () => {
    for (const [base, token] of [
      ["", ""],
      ["https://api.stripe.com", key],
      ["http://localhost:8017", key],
      ["http://127.0.0.1:8017", "sk_live_bad"],
    ])
      expect(() => new FetchSandboxStripe(base, token)).toThrow();
    const old = {
      url: process.env.LOOPLABS_REFUND_TWIN_URL,
      token: process.env.LOOPLABS_REFUND_TWIN_TOKEN,
    };
    delete process.env.LOOPLABS_REFUND_TWIN_URL;
    delete process.env.LOOPLABS_REFUND_TWIN_TOKEN;
    expect(() => new FetchSandboxStripe()).toThrow();
    if (old.url) process.env.LOOPLABS_REFUND_TWIN_URL = old.url;
    if (old.token) process.env.LOOPLABS_REFUND_TWIN_TOKEN = old.token;
  });
  it("validates authoritative payment evidence and refuses malformed balances", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const twin = new FetchSandboxStripe("http://127.0.0.1:8017", key);
    fetcher.mockResolvedValueOnce(body(payment));
    expect(await twin.payment()).toEqual(payment);
    for (const p of [
      { ...payment, id: "other" },
      { ...payment, currency: "inr" },
      { ...payment, paid: false },
      { ...payment, amount: 0 },
      { ...payment, amount: 1.1 },
      { ...payment, amount_refunded: -1 },
      { ...payment, amount_refunded: 100001 },
      { ...payment, amount_refunded: 1.1 },
    ]) {
      fetcher.mockResolvedValueOnce(body(p));
      await expect(twin.payment()).rejects.toThrow();
    }
  });
  it("requires a complete, bounded, well-formed refund list", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const twin = new FetchSandboxStripe("http://127.0.0.1:8017", key);
    fetcher.mockResolvedValueOnce(body({ data: [refund], has_more: false }));
    expect(await twin.refunds()).toEqual([refund]);
    for (const list of [
      { data: {}, has_more: false },
      { data: [], has_more: true },
      ...[
        null,
        { ...refund, id: 1 },
        { ...refund, id: "bad" },
        { ...refund, amount: 0 },
        { ...refund, amount: 1.1 },
        { ...refund, currency: "inr" },
        { ...refund, charge: "other" },
        { ...refund, metadata: {} },
        { ...refund, status: "unknown" },
      ].map((r) => ({ data: [r], has_more: false })),
    ]) {
      fetcher.mockResolvedValueOnce(body(list));
      await expect(twin.refunds()).rejects.toThrow();
    }
  });
  it("uses the stable action id and exact form body, with real transport timeout injection", async () => {
    const fetcher = vi.fn().mockImplementation(async () => body(refund));
    vi.stubGlobal("fetch", fetcher);
    const twin = new FetchSandboxStripe("http://127.0.0.1:8017", key);
    const a = {
      id: "action",
      payment_id: PAYMENT,
      amount: 500,
    } as RefundAction;
    expect(await twin.create(a, true)).toEqual(refund);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8017/v1/refunds");
    expect(init.headers["Idempotency-Key"]).toBe("looplabs-action");
    expect(init.headers["X-LoopLabs-Lose-Response"]).toBe("true");
    expect(init.redirect).toBe("error");
    expect(init.body).toContain("amount=500");
    await twin.create(a, false);
    expect(
      fetcher.mock.calls[1][1].headers["X-LoopLabs-Lose-Response"],
    ).toBeUndefined();
    fetcher.mockResolvedValueOnce(
      body({ error: "sensitive provider text" }, 400),
    );
    await expect(twin.payment()).rejects.toThrow(
      "Provider evidence unavailable",
    );
  });
});
