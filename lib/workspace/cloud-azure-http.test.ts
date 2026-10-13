import { expect, test, vi } from "vitest";
import { azureProjectInventoryApi, type AzureProjectReadSession } from "./cloud-azure-http";
const scope = { provider: "azure-foundry" as const, tenantId: "company-a", connectionId: "azure-a", directoryId: "12345678-1234-1234-1234-123456789012", endpoint: "https://company.services.ai.azure.com/api/projects/ops" };
const at = Date.now();
const session = (): AzureProjectReadSession => ({ directoryId: scope.directoryId, endpoint: scope.endpoint, audience: "https://ai.azure.com", token: "DUMMY_AZURE_READ_TOKEN_123456789", expiresAt: new Date(at + 600000).toISOString() });
test("uses only fixed project GETs with pinned v1 and excludes draft versions; successful read keeps broker association explicit", async () => {
  const urls: string[] = [], fetcher = vi.fn(async (url: unknown, init: RequestInit | undefined) => {
    urls.push(String(url)); expect(init?.method).toBe("GET"); expect(init?.redirect).toBe("manual"); expect(init?.headers).toEqual({ Authorization: `Bearer ${session().token}`, Accept: "application/json" });
    return Response.json({ data: [], has_more: false });
  });
  const acquire = vi.fn(async () => session()), api = azureProjectInventoryApi(scope, acquire, { now: () => at, fetch: fetcher });
  expect(await api.scopeIdentity()).toEqual({ directoryId: scope.directoryId, endpoint: scope.endpoint });
  await api.list({ parent: scope.endpoint + "/agents", limit: 100 });
  await api.listVersions!({ parent: scope.endpoint + "/agents/customer-ops/versions", limit: 100, cursor: "agent_version_123" });
  await api.get({ resource: scope.endpoint + "/agents/customer-ops/versions/1" });
  expect(urls).toEqual([scope.endpoint + "/agents?api-version=v1&limit=1", scope.endpoint + "/agents?api-version=v1&limit=100", scope.endpoint + "/agents/customer-ops/versions?api-version=v1&limit=100&after=agent_version_123&include_drafts=false", scope.endpoint + "/agents/customer-ops/versions/1?api-version=v1"]); expect(acquire).toHaveBeenCalledTimes(4);
});
test("wrong broker directory, endpoint, audience, expiry and malformed token deny before native access", async () => {
  const fetcher = vi.fn();
  for (const value of [null, "PRIVATE", Object.assign([], session()), { ...session(), directoryId: "99999999-9999-9999-9999-999999999999" }, { ...session(), endpoint: "https://foreign.services.ai.azure.com/api/projects/ops" }, { ...session(), audience: "https://graph.microsoft.com" }, { ...session(), expiresAt: new Date(at - 1).toISOString() }, { ...session(), token: "DUMMY\r\nPRIVATE" }, { ...session(), private: "PRIVATE" }]) {
    const api = azureProjectInventoryApi(scope, async () => value as unknown as AzureProjectReadSession, { now: () => at, fetch: fetcher });
    await expect(api.scopeIdentity()).rejects.toThrow(/^Verified read-only Azure project access unavailable$/);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
test("foreign/traversal paths, injected cursors, unsupported page sizes and preview/command fields refuse before broker or network", async () => {
  const acquire = vi.fn(async () => session()), fetcher = vi.fn(), api = azureProjectInventoryApi(scope, acquire, { now: () => at, fetch: fetcher });
  for (const input of [{ parent: scope.endpoint + "/agents", limit: 1 }, { parent: scope.endpoint + "/agents", limit: 100, cursor: "PRIVATE?url=https://foreign" }, { parent: "https://foreign.example/agents", limit: 100 }, { parent: scope.endpoint + "/agents", limit: 100, include_drafts: true }]) await expect(api.list(input as Parameters<typeof api.list>[0])).rejects.toThrow('Invalid');
  for (const path of [scope.endpoint + "/agents/../versions", scope.endpoint + "/agents/a/versions?url=x", "https://foreign.example/agents/a/versions"]) await expect(api.listVersions!({ parent: path, limit: 100 })).rejects.toThrow('Invalid');
  for (const path of [scope.endpoint + "/agents/a/versions/1?url=other", scope.endpoint + "/agents/a/versions/%2F", "https://foreign.example/agents/a/versions/1"]) await expect(api.get({ resource: path })).rejects.toThrow('Invalid');
  expect(acquire).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
test("native failure or malformed identity listing cannot attest project access or expose provider errors", async () => {
  for (const response of [new Response("PRIVATE", { status: 403 }), new Response(null, { status: 302, headers: { location: "https://foreign.example" } }), Response.json({ data: [], has_more: "false" }), Response.json({ data: [{}, {}], has_more: false })]) {
    const api = azureProjectInventoryApi(scope, async () => session(), { now: () => at, fetch: vi.fn(async () => response) });
    await expect(api.scopeIdentity()).rejects.toThrow(/^Verified read-only Azure project access unavailable$/);
  }
});
