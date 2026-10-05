import { it, expect, vi, afterEach } from "vitest";
import { FetchSandboxBackOffice } from "./provider";
const token = "a".repeat(40),
  id = "861cbeef-ae03-4c61-a712-7806d78577c6";
const order = { id, status: "open", version: 1, actionId: null };
const message = {
  caseId: id,
  refundId: "re_sample",
  amount: 2000,
  recipient: "customer@example.test" as const,
  status: "accepted" as const,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("rejects live endpoints, malformed credentials and missing configuration", () => {
  for (const [url, key] of [
    ["https://api.resend.com", token],
    ["http://127.0.0.1:8019", "bad"],
    ["http://backoffice-twin:8019.evil", token],
  ])
    expect(() => new FetchSandboxBackOffice(url, key)).toThrow();
  vi.stubEnv("LOOPLABS_BACKOFFICE_TWIN_URL", "");
  vi.stubEnv("LOOPLABS_BACKOFFICE_TWIN_TOKEN", "");
  expect(() => new FetchSandboxBackOffice()).toThrow();
  expect(
    () => new FetchSandboxBackOffice("http://backoffice-twin:8019", token),
  ).not.toThrow();
});
it("validates order and email evidence instead of trusting HTTP success", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const twin = new FetchSandboxBackOffice("http://127.0.0.1:8019", token);
  const result = (v: unknown) =>
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(v)));
  result(order);
  expect(await twin.order(id)).toEqual(order);
  for (const o of [
    { ...order, id: "other" },
    { ...order, status: "unknown" },
    { ...order, version: 0 },
    { ...order, version: 1.1 },
    { ...order, actionId: "other" },
  ]) {
    result(o);
    await expect(twin.order(id)).rejects.toThrow();
  }
  result({ ...order, status: "cancelled", actionId: id });
  await twin.order(id);
  result(null);
  expect(await twin.message(id)).toBeNull();
  result(message);
  expect(await twin.message(id)).toEqual(message);
  for (const m of [
    { ...message, caseId: "other" },
    { ...message, recipient: "evil@test" },
    { ...message, status: "delivered" },
    { ...message, refundId: 1 },
    { ...message, refundId: "bad" },
    { ...message, amount: 0 },
    { ...message, amount: 1.1 },
  ]) {
    result(m);
    await expect(twin.message(id)).rejects.toThrow();
  }
  fetcher.mockResolvedValueOnce(new Response("sensitive", { status: 500 }));
  await expect(twin.order(id)).rejects.toThrow("could not be verified");
  result(order);
  await twin.cancel(id, 1, true);
  expect(fetcher.mock.lastCall?.[1].headers["X-LoopLabs-Lose-Response"]).toBe(
    "true",
  );
  expect(fetcher.mock.lastCall?.[1].redirect).toBe("error");
  result(message);
  await twin.send(message, false);
  expect(
    fetcher.mock.lastCall?.[1].headers["X-LoopLabs-Lose-Response"],
  ).toBeUndefined();
  expect(JSON.parse(fetcher.mock.lastCall?.[1].body)).toEqual(message);
});
