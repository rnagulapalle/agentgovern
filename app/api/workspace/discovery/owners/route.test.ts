import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), owners: vi.fn(), status: vi.fn(), review: vi.fn() }));
vi.mock("@/lib/workspace/tenant-context", () => ({ tenantContext: () => ({ authenticated: mocks.authenticated }) }));
vi.mock("@/lib/workspace/cloud-owner-review", () => ({ CloudOwnerReviewStore: class { owners = mocks.owners; status = mocks.status; review = mocks.review; } }));
import { GET, POST } from "./route";
const actor = { orgId: "org-a", subject: "member@example.test" };
const reference = { connectionId: "aws-a", provider: "aws-agentcore-runtime", resource: "runtime-reference", scanId: "scan-reference", version: "1" };
const request = (query = "", value?: object, origin = "https://looplabs.run") => new NextRequest(`https://looplabs.run/api/workspace/discovery/owners${query}`, { method: value ? "POST" : "GET", headers: { origin, "Content-Type": "application/json" }, ...(value ? { body: JSON.stringify(value) } : {}) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("LOOPLABS_DEPLOYMENT_PROFILE", "isolated-control-demo-1"); mocks.authenticated.mockResolvedValue({ db: {}, actor }); mocks.owners.mockResolvedValue({ owners: [] }); mocks.review.mockResolvedValue({ authorityGranted: false }); mocks.status.mockResolvedValue({ ownership: "unmapped", authorityGranted: false }); });
afterEach(() => vi.unstubAllEnvs());
it("AWS installation keeps the invited owner directory but refuses project owner status and mutation", async () => {
  expect((await GET(request())).status).toBe(200);
  for (const provider of ["azure-foundry", "google-agent-engine"]) {
    expect((await GET(request("?" + new URLSearchParams({ ...reference, provider }).toString()))).status).toBe(403);
    expect((await POST(request("", { ...reference, provider, owner: "owner@example.test" }))).status).toBe(403);
  }
  expect(mocks.status).not.toHaveBeenCalled(); expect(mocks.review).not.toHaveBeenCalled();
});
it("AWS owner review continues through existing server authority, with no client-derived tenant", async () => {
  const response = await GET(request("?" + new URLSearchParams(reference).toString())); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.status).toHaveBeenCalledWith(actor, expect.objectContaining({ ...reference, owner: actor.subject }));
  const value = { ...reference, owner: "owner@example.test" }; expect((await POST(request("", value))).status).toBe(200); expect(mocks.review).toHaveBeenCalledWith(actor, value);
});
it("cross-site owner writes fail before authentication and unrelated project capability stays unchanged in legacy proof installations", async () => {
  expect((await POST(request("", reference, "https://other.test"))).status).toBe(403); expect(mocks.authenticated).not.toHaveBeenCalled();
  vi.stubEnv("LOOPLABS_DEPLOYMENT_PROFILE", undefined);
  expect((await POST(request("", { ...reference, provider: "azure-foundry" }))).status).toBe(200);
  expect(mocks.review).toHaveBeenCalledWith(actor, expect.objectContaining({ provider: "azure-foundry" }));
});
