import { NextRequest } from "next/server";
import { it, expect, vi, beforeEach } from "vitest";
import { ControlError } from "../durable/contracts";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  draft: vi.fn(),
  publish: vi.fn(),
  create: vi.fn(),
  approve: vi.fn(),
  advance: vi.fn(),
  inspect: vi.fn(),
}));
vi.mock("../durable/database", () => ({ database: () => ({}) }));
vi.mock("../durable/service", () => ({ authenticate: mocks.auth }));
vi.mock("../refunds/service", () => ({ RefundControl: class {} }));
vi.mock("../refunds/twin", () => ({ FetchSandboxStripe: class {} }));
vi.mock("./provider", () => ({ FetchSandboxBackOffice: class {} }));
vi.mock("./service", () => ({
  BackOffice: class {
    list = mocks.list;
    draft = mocks.draft;
    publish = mocks.publish;
    create = mocks.create;
    approve = mocks.approve;
    advance = mocks.advance;
    inspect = mocks.inspect;
  },
}));
import { GET, POST } from "@/app/api/durable/back-office/route";
const actor = { subject: "founder", orgId: "local-proof", role: "operator" };
const req = (payload: object, origin = "https://looplabs.run") =>
  new NextRequest("https://looplabs.run/api/durable/back-office", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      authorization: `Bearer ${"a".repeat(40)}`,
    },
    body: JSON.stringify(payload),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(actor);
  for (const [key, m] of Object.entries(mocks))
    if (key !== "auth") m.mockResolvedValue({ ok: true });
});
it("rejects anonymous and cross-origin access and never leaks internal errors", async () => {
  mocks.auth.mockRejectedValueOnce(new ControlError(401, "Sign in required"));
  expect(
    (await GET(new NextRequest("https://looplabs.run/api/durable/back-office")))
      .status,
  ).toBe(401);
  expect(
    (await POST(req({ operation: "draft" }, "https://evil.test"))).status,
  ).toBe(403);
  mocks.list.mockRejectedValueOnce(Error("secret"));
  const r = await GET(
    new NextRequest("https://looplabs.run/api/durable/back-office"),
  );
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("secret");
});
it("dispatches only supported typed operations and returns uncached results", async () => {
  expect(
    (
      await GET(new NextRequest("https://looplabs.run/api/durable/back-office"))
    ).headers.get("Cache-Control"),
  ).toBe("no-store");
  for (const p of [
    { operation: "draft", id: "id", prompt: "prompt" },
    { operation: "publish", id: "id", hash: "hash" },
    { operation: "approve", id: "id", hash: "hash" },
    { operation: "create", id: "id", planId: "plan", amount: 20 },
    { operation: "advance", id: "id", loseResponse: false },
    { operation: "inspect", id: "id" },
  ])
    expect((await POST(req(p))).status).toBe(200);
  expect(mocks.advance).toHaveBeenCalledWith(actor, "id", false);
  for (const p of [
    { operation: "unknown" },
    { operation: "draft", id: 1, prompt: "" },
    { operation: "approve", id: "id", hash: 1 },
    { operation: "create", id: "id", planId: 1, amount: 2 },
    { operation: "create", id: "id", planId: "id", amount: "2" },
    { operation: "advance", id: "id", loseResponse: "yes" },
    { operation: "inspect", id: "id", extra: true },
  ])
    expect((await POST(req(p))).status).toBe(400);
  mocks.draft.mockRejectedValueOnce(new ControlError(409, "Conflict"));
  expect(
    (await POST(req({ operation: "draft", id: "id", prompt: "" }))).status,
  ).toBe(409);
});
