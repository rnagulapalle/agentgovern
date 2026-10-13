import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { ControlError } from "@/lib/durable/contracts";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), connections: vi.fn(), latest: vi.fn(), configureConnection: vi.fn(), scan: vi.fn(), scanProject: vi.fn(), projectConnections: vi.fn(), latestProject: vi.fn(), configureProjectConnection: vi.fn() }));
// Route contract unit tests: stub the installed tenant boundary, not a legacy singleton.
// Actual scoped database/authentication is covered by tenant and Next integration proofs.
vi.mock("@/lib/workspace/tenant-context", () => ({
  tenantContext: () => ({
    authenticated: async (credential: string) => ({ db: {}, actor: await mocks.authenticate(credential) }),
  }),
}));
vi.mock("@/lib/workspace/cloud-inventory", () => ({ CloudInventoryStore: class { connections = mocks.connections; latest = mocks.latest; configureConnection = mocks.configureConnection; projectConnections = mocks.projectConnections; latestProject = mocks.latestProject; configureProjectConnection = mocks.configureProjectConnection; } }));
vi.mock("@/lib/workspace/cloud-operations", () => ({ CloudDiscoveryOperations: class { connections = mocks.connections; scan = mocks.scan; projectConnections = mocks.projectConnections; scanProject = mocks.scanProject; } }));
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
  for (const bad of [{ ...input, tenantId: "company-b" }, { ...input, credentials: "secret" }, { operation: "scan", connectionId: "aws-a", tenantId: "company-b" }, { ...input, records: [] }, { ...input, accountId: 123456789012 }, { ...input, region: "us-gov-west-1" }, { ...input, connectionId: "../other" }, { ...input, accountId: "123" }]) expect((await POST(req(JSON.stringify(bad)))).status).toBe(400);
  expect(mocks.configureConnection).not.toHaveBeenCalled();
});
it("scans only a saved connection through the authority service without accepting cloud credentials or raw scope", async () => {
  mocks.scan.mockResolvedValue({ completeness: "partial", enforcement: "unverified" });
  const r = await POST(req(JSON.stringify({ operation: "scan", connectionId: "aws-a" }))); expect(r.status).toBe(200); expect(r.headers.get("Cache-Control")).toBe("no-store"); expect(mocks.scan).toHaveBeenCalledWith(actor, "aws-a");
  mocks.scan.mockClear(); for (const bad of [{ operation: "scan", connectionId: "../other" }, { operation: "scan", connectionId: "aws-a", accountId: "123456789012" }, { operation: "scan", connectionId: "aws-a", session: {} }]) expect((await POST(req(JSON.stringify(bad)))).status).toBe(400);
  expect(mocks.scan).not.toHaveBeenCalled();
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

it("project configuration derives tenant and refuses credentials, ambiguous selectors and malformed scope", async () => {
  mocks.projectConnections.mockResolvedValue({ connections: [], enforcement: "unverified" }); mocks.latestProject.mockResolvedValue({ status: "no-scan" }); mocks.configureProjectConnection.mockResolvedValue({ authorityGranted: false });
  for (const query of ["?kind=project", "?kind=project&connectionId=project-a"]) expect((await GET(req(undefined, query))).status).toBe(200);
  expect(mocks.latestProject).toHaveBeenCalledWith(actor, "project-a");
  const google = { operation: "configure-project", provider: "google-agent-engine", connectionId: "project-a", projectId: "company-agents", projectNumber: "123456789012", location: "us-central1" };
  const azure = { operation: "configure-project", provider: "azure-foundry", connectionId: "project-a", directoryId: "12345678-1234-1234-1234-123456789012", endpoint: "https://company.services.ai.azure.com/api/projects/ops" };
  for (const input of [google, azure]) {
    expect((await POST(req(JSON.stringify(input)))).status).toBe(200);
    const scope = { ...input }; delete (scope as Partial<typeof input>).operation;
    expect(mocks.configureProjectConnection).toHaveBeenLastCalledWith(actor, { ...scope, tenantId: "company-a" });
  }
  mocks.configureProjectConnection.mockClear();
  for (const bad of [{ ...google, tenantId: "other" }, { ...google, token: "SECRET" }, { ...google, projectNumber: 123456789012 }, { ...google, location: "global" }, { ...azure, endpoint: "http://localhost" }, { ...azure, directoryId: "bad" }, { ...azure, identity: {} }]) expect((await POST(req(JSON.stringify(bad)))).status).toBe(400);
  expect(mocks.configureProjectConnection).not.toHaveBeenCalled();
  for (const query of ["?kind=project&kind=project", "?kind=other", "?kind=project&tenantId=other", "?kind=project&connectionId=a&connectionId=b"]) expect((await GET(req(undefined, query))).status).toBe(400);
  mocks.projectConnections.mockRejectedValue(Error("SECRET provider connection")); const response = await GET(req(undefined, "?kind=project")); expect(response.status).toBe(503); expect(await response.text()).not.toContain("SECRET");
});

it("project scan dispatch accepts only a saved ID, derives actor and refuses raw scope/secrets", async () => {
  mocks.scanProject.mockResolvedValue({ completeness: "partial", enforcement: "unverified" });
  const r = await POST(req(JSON.stringify({ operation: "scan-project", connectionId: "google-a" })));
  expect(r.status).toBe(200); expect(r.headers.get("Cache-Control")).toBe("no-store"); expect(mocks.scanProject).toHaveBeenCalledWith(actor, "google-a");
  mocks.scanProject.mockClear();
  for (const bad of [{ operation: "scan-project", connectionId: "../foreign" }, { operation: "scan-project", connectionId: "google-a", tenantId: "other" }, { operation: "scan-project", connectionId: "google-a", token: "SECRET" }, { operation: "scan-project", connectionId: "google-a", projectNumber: "123456789012" }]) expect((await POST(req(JSON.stringify(bad)))).status).toBe(400);
  expect(mocks.scanProject).not.toHaveBeenCalled();
  mocks.scanProject.mockRejectedValue(new ControlError(503, "Reviewed discovery access unavailable.")); expect((await POST(req(JSON.stringify({ operation: "scan-project", connectionId: "google-a" })))).status).toBe(503);
});

it("refuses an unavailable installed tenant boundary before accessing business data", async () => {
  mocks.authenticate.mockRejectedValue(new ControlError(503, "Workspace unavailable"));
  const response = await GET(req());
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.connections).not.toHaveBeenCalled();
  expect(mocks.latest).not.toHaveBeenCalled();
});
