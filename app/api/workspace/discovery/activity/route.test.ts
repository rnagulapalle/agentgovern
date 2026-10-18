import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ControlError } from "@/lib/durable/contracts";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/workspace/tenant-context", () => ({ tenantContext: () => ({ authenticated: mocks.authenticated }) }));
vi.mock("@/lib/workspace/cloud-inventory", () => ({ CloudInventoryStore: class {} }));
vi.mock("@/lib/workspace/cloud-activity", () => ({ CloudActivityOperations: class { read = mocks.read; } }));
import { POST } from "./route";
const actor = { orgId: "org-a", subject: "member@example.test" };
const request = (body = "{}", origin = "https://looplabs.run") => new NextRequest("https://looplabs.run/api/workspace/discovery/activity", { method: "POST", headers: { origin, "Content-Type": "application/json", authorization: "Bearer invited" }, body });
beforeEach(() => { vi.resetAllMocks(); mocks.authenticated.mockResolvedValue({ db: {}, actor }); mocks.read.mockResolvedValue({ enforcement: "unverified", observations: [], retention: "request-only" }); });
afterEach(() => vi.unstubAllEnvs());
it("derives the actor from installed authentication and returns uncached bounded evidence", async () => {
  const response = await POST(request('{"connectionId":"aws-a"}'));
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(mocks.read).toHaveBeenCalledWith(actor, { connectionId: "aws-a" });
  expect(await response.json()).toMatchObject({ enforcement: "unverified", observations: [] });
});
it("rejects cross-site requests, bad bodies and missing installed identity before cloud activity access", async () => {
  expect((await POST(request("{}", "https://other.example"))).status).toBe(403); expect(mocks.authenticated).not.toHaveBeenCalled();
  for (const body of ["null", "[]", "broken"]) expect((await POST(request(body))).status).toBe(400);
  mocks.authenticated.mockRejectedValue(new ControlError(401, "Sign in")); expect((await POST(request())).status).toBe(401); expect(mocks.read).not.toHaveBeenCalled();
});
it("preserves explicit refusal and sanitizes AWS or database failures", async () => {
  for (const status of [403, 409, 429, 503]) { mocks.read.mockRejectedValueOnce(new ControlError(status, "Cloud evidence unavailable")); expect((await POST(request())).status).toBe(status); }
  mocks.read.mockRejectedValueOnce(Error("SECRET provider error")); const response = await POST(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("SECRET");
});
