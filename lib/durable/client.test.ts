import { afterEach, describe, expect, it, vi } from "vitest";
import { LoopLabsClient } from "./client";
const p = {
  actionId: "38e7dd44-08b1-4493-bfc0-9275dbd941c8",
  agentId: "agent",
  discount: 5,
  expectedVersion: 1,
};
afterEach(() => vi.unstubAllGlobals());
describe("Agent client contract", () => {
  it("requires HTTPS outside loopback and rejects credential-bearing origins", () => {
    for (const origin of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/path",
      "https://example.com/?token=private",
      "https://example.com/#private",
    ])
      expect(() => new LoopLabsClient(origin, "private")).toThrow();
    expect(
      () => new LoopLabsClient("http://localhost:3007", "private"),
    ).not.toThrow();
    expect(
      () => new LoopLabsClient("http://127.0.0.1:3007", "private"),
    ).not.toThrow();
  });
  it("retains action ID and payload across retries, authenticates, and reads safely", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ id: p.actionId, state: "ready" }),
    );
    vi.stubGlobal("fetch", fetcher);
    const client = new LoopLabsClient("https://looplabs.run", "private-token");
    await client.propose(p);
    await client.propose(p);
    await client.read(p.actionId);
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][1].body).toBe(calls[1][1].body);
    expect(JSON.parse(calls[0][1].body as string)).toEqual({
      operation: "propose",
      ...p,
    });
    expect(calls[0][1].headers).toMatchObject({
      Authorization: "Bearer private-token",
    });
    expect(calls[2][0]).toContain(`?action=${p.actionId}`);
  });
  it("surfaces denials without retrying or logging secrets", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: "Denied" }, { status: 403 }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      new LoopLabsClient("https://looplabs.run", "private").propose(p),
    ).rejects.toThrow("Denied");
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", async () => Response.json({}, { status: 503 }));
    await expect(
      new LoopLabsClient("https://looplabs.run", "private").read(p.actionId),
    ).rejects.toThrow("request failed");
  });
});
