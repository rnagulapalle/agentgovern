import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { ControlError } from "@/lib/durable/contracts";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), connections: vi.fn(), latest: vi.fn(), configureConnection: vi.fn() }));
vi.mock("@/lib/durable/database", () => ({ database: () => ({}) }));
vi.mock("@/lib/durable/service", () => ({ authenticate: mocks.authenticate }));
vi.mock("@/lib/workspace/cloud-inventory", () => ({ CloudInventoryStore: class { connections = mocks.connections; latest = mocks.latest; configureConnection = mocks.configureConnection; } }));
import { GET, POST } from "./route";
const actor = { orgId: "company-a", role: "operator", subject: "member" };
const req = (content?: string, query = "", origin = "https://looplabs.run") => new NextRequest(`https://looplabs.run/api/workspace/discovery${query}`, { method: content === undefined ? "GET" : "POST", headers: { origin, authorization: "Bearer member", "Content-Type": "application/json" }, ...(content === undefined ? {} : { body: content }) });
const input = { operation: "configure", connectionId: "aws-a", accountId: "123456789012", region: "us-west-2" };
beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue(actor); mocks.connections.mockResolvedValue({ connections: [], scanningAvailable: false }); mocks.latest.mockResolvedValue({ status: "no-scan" }); mocks.configureConnection.mockResolvedValue({ status: "configured", authorityGranted: false }); });
it("reads only invited server-derived scope without private response caching", async () => {
  for (const query of ["", "?connectionId=aws-a"]) { const r = await GET(req(undefined, query)); expect(r.status).toBe(200); expect(r.headers.get("Cache-Control")).toBe("no-store"); }
  expect(mocks.connections).toHaveBeenCalledWith(actor); expect(mocks.latest).toHaveBeenCalledWith(actor, "aws-a");
});
it("derives tenant from authentication and never accepts raw evidence, credentials or scan commands", async () => {
  const r = await POST(req(JSON.stringify(input))); expect(r.status).toBe(200); expect(r.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.configureConnection).toHaveBeenCalledWith(actor, { tenantId: "company-a", connectionId: "aws-a", accountId: "123456789012", region: "us-west-2" });
  mocks.configureConnection.mockClear();
  for (const bad of [{ ...input, tenantId: "company-b" }, { ...input, credentials: "secret" }, { operation: "scan", connectionId: "aws-a" }, { ...input, records: [] }, { ...input, accountId: 123456789012 }, { ...input, region: "us-gov-west-1" }, { ...input, connectionId: "../other" }, { ...input, accountId: "123" }]) expect((await POST(req(JSON.stringify(bad)))).status).toBe(400);
  expect(mocks.configureConnection).not.toHaveBeenCalled();
});
it("refuses authentication, cross-site mutation and malformed bodies before inventory access", async () => {
  expect((await POST(req("{}", "", "https://evil.example"))).status).toBe(403); expect(mocks.authenticate).not.toHaveBeenCalled();
  for (const bad of ["null", "[]", "broken"]) expect((await POST(req(bad))).status).toBe(400);
  mocks.authenticate.mockRejectedValue(new ControlError(401, "Sign in")); expect((await GET(req())).status).toBe(401); expect((await POST(req(JSON.stringify(input)))).status).toBe(401);
  expect(mocks.connections).not.toHaveBeenCalled(); expect(mocks.latest).not.toHaveBeenCalled(); expect(mocks.configureConnection).not.toHaveBeenCalled();
});
it("refuses ambiguous scope selectors and sanitizes underlying errors", async () => {
  for (const query of ["?tenantId=company-b", "?connectionId=aws-a&connectionId=aws-b", "?connectionId=", "?connectionId=../other"]) expect((await GET(req(undefined, query))).status).toBe(400);
  expect(mocks.latest).not.toHaveBeenCalled(); mocks.latest.mockRejectedValue(new ControlError(404, "Discovery connection unavailable.")); expect((await GET(req(undefined, "?connectionId=aws-b"))).status).toBe(404);
  mocks.connections.mockRejectedValue(new Error("secret database URL and raw provider body")); const r = await GET(req()); expect(r.status).toBe(503); expect(await r.text()).not.toContain("secret");
});
