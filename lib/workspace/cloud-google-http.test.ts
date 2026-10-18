import { expect, test, vi } from "vitest";
import { googleProjectInventoryApi, type ProjectReadSession } from "./cloud-google-http";
import { collectProjectInventory } from "./cloud-project-discovery";
const scope = { provider: "google-agent-engine", tenantId: "workspace", connectionId: "google", projectId: "company-agents", projectNumber: "123456789012", location: "us-central1" } as const;
const now = Date.parse("2026-10-09T18:00:00.000Z"), parent = `projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines`, resource = `${parent}/1234`;
const token = "opaque-google-session-secret", credential = () => ({ token, expiresAt: new Date(now + 300_000).toISOString() });
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
const project = { name: `projects/${scope.projectNumber}`, projectId: scope.projectId, state: "ACTIVE" };
function transport(change?: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async (url, init) => {
    const target = String(url);
    if (change) return change(target, init);
    if (target.includes("cloudresourcemanager")) return json(project);
    if (target.includes("pageSize")) return json({ reasoningEngines: [{ name: resource }] });
    return json({ name: resource, spec: { identityType: "AGENT_IDENTITY" }, description: "never-retained" });
  });
}
test("collects native-shaped resources through fixed GETs after native project verification with the same credential", async () => {
  const send = transport(), session = vi.fn(async () => credential());
  const api = googleProjectInventoryApi(scope, session, { fetch: send, now: () => now });
  const result = await collectProjectInventory(api, scope, new Date(now).toISOString());
  expect(result.completeness).toBe("complete-api-traversal"); expect(result.records[0].identityKind).toBe("agent-identity");
  expect(JSON.stringify(result)).not.toMatch(/session-secret|never-retained/);
  expect(session).toHaveBeenCalledTimes(3); expect(send).toHaveBeenCalledTimes(5);
  for (const [url, init] of send.mock.calls) {
    expect(String(url)).toMatch(/^https:\/\/(?:cloudresourcemanager\.googleapis\.com\/v3\/projects\/123456789012|us-central1-aiplatform\.googleapis\.com\/v1\/projects\/123456789012\/locations\/us-central1\/reasoningEngines)/);
    expect(init?.method).toBe("GET"); expect(init?.redirect).toBe("manual"); expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ Authorization: `Bearer ${token}`, Accept: "application/json" }); expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
  expect(send.mock.calls[1][1]?.signal).toBe(send.mock.calls[2][1]?.signal);
});
test("rejects wrong project, inactive native identity and permission loss before resource requests", async () => {
  for (const value of [{ ...project, projectId: "foreign" }, { ...project, name: "projects/999999999999" }, { ...project, state: "DELETE_REQUESTED" }, {}]) {
    const send = transport(() => json(value));
    await expect(googleProjectInventoryApi(scope, async () => credential(), { fetch: send, now: () => now }).list({ parent, limit: 100 })).rejects.toThrow("Verified");
    expect(send).toHaveBeenCalledTimes(1);
  }
  const send = transport(() => json({ error: token }, 403));
  await expect(googleProjectInventoryApi(scope, async () => credential(), { fetch: send, now: () => now }).scopeIdentity()).rejects.toThrow("Verified read-only project access unavailable");
  expect(send).toHaveBeenCalledTimes(1);
});
test("refreshes and verifies each read's token snapshot, not a previously authorized caller", async () => {
  let n = 0; const send = transport();
  const api = googleProjectInventoryApi(scope, async () => ({ ...credential(), token: `google-session-token-${++n}` }), { fetch: send, now: () => now });
  await api.scopeIdentity(); await api.get({ resource });
  expect(send.mock.calls[0][1]?.headers).not.toEqual(send.mock.calls[1][1]?.headers);
  expect(send.mock.calls[1][1]?.headers).toEqual(send.mock.calls[2][1]?.headers);
});
test("broker mutation after identity read cannot substitute another credential", async () => {
  const value = credential(); const send = transport(url => {
    if (url.includes("cloudresourcemanager")) { value.token = "different-unverified-token"; return json(project); }
    return json({ name: resource });
  });
  await googleProjectInventoryApi(scope, async () => value, { fetch: send, now: () => now }).get({ resource });
  expect(send.mock.calls[0][1]?.headers).toEqual(send.mock.calls[1][1]?.headers);
  expect(send.mock.calls[1][1]?.headers).toEqual({ Authorization: `Bearer ${token}`, Accept: "application/json" });
});
test("a stalled broker reaches the actual shared deadline without admitting an HTTP request", async () => {
  const send = transport(); let supplied: AbortSignal | undefined;
  const api = googleProjectInventoryApi(scope, signal => { supplied = signal; return new Promise(() => {}); }, { fetch: send, now: () => now });
  await expect(api.scopeIdentity()).rejects.toThrow("Verified read-only project access unavailable");
  expect(supplied?.aborted).toBe(true); expect(send).not.toHaveBeenCalled();
}, 20_000);
test("expired, malformed or failed broker credentials produce sanitized refusal with no HTTP", async () => {
  const bad = [null, {}, { ...credential(), token: "bad\nAuthorization: injected" }, { ...credential(), extra: "token" }, { ...credential(), expiresAt: "invalid" }, { ...credential(), expiresAt: new Date(now + 29_000).toISOString() }, { ...credential(), expiresAt: new Date(now + 3_600_001).toISOString() }];
  for (const value of bad) {
    const send = transport();
    await expect(googleProjectInventoryApi(scope, async () => value as ProjectReadSession, { fetch: send, now: () => now }).scopeIdentity()).rejects.toThrow("Verified read-only project access unavailable");
    expect(send).not.toHaveBeenCalled();
  }
  await expect(googleProjectInventoryApi(scope, async () => { throw Error(token); }).scopeIdentity()).rejects.toThrow("Verified read-only project access unavailable");
});
test("path, query and scope injection refuse before requesting credentials", async () => {
  const session = vi.fn(async () => credential()), send = transport(), api = googleProjectInventoryApi(scope, session, { fetch: send, now: () => now });
  for (const value of [{ parent: parent + "/../other", limit: 100 }, { parent, limit: 101 }, { parent, limit: 100, cursor: "bad cursor" }, { parent, limit: 100, url: "https://evil.test" }, null])
    await expect(api.list(value as Parameters<typeof api.list>[0])).rejects.toThrow("Invalid");
  for (const value of [{ resource: "https://evil.test" }, { resource: resource + "/../other" }, { resource, extra: token }, null])
    await expect(api.get(value as Parameters<typeof api.get>[0])).rejects.toThrow("Invalid");
  expect(session).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  expect(() => googleProjectInventoryApi({ ...scope, provider: "azure-foundry" } as unknown as typeof scope, session)).toThrow();
  expect(() => googleProjectInventoryApi(scope, null as unknown as typeof session)).toThrow("binding");
});
test("opaque cursors are encoded as data and do not change the fixed destination", async () => {
  const send = transport(); const api = googleProjectInventoryApi(scope, async () => credential(), { fetch: send, now: () => now });
  await api.list({ parent, limit: 100, cursor: "opaque+/cursor=" });
  const url = new URL(String(send.mock.calls[1][0]));
  expect(url.hostname).toBe("us-central1-aiplatform.googleapis.com"); expect(url.searchParams.get("pageToken")).toBe("opaque+/cursor=");
});
test("redirects, malformed JSON, response errors and oversized streamed bodies are refused without forwarding errors", async () => {
  for (const response of [new Response(null, { status: 302, headers: { location: "https://evil.test" } }), json({}, 200, { "content-length": "1048577" }), json({}, 200, { "content-length": "bad" }), new Response("bad json", { headers: { "content-type": "application/json" } }), new Response("{}"), json([]), json(null), new Response(null, { headers: { "content-type": "application/json" } }), new Response("x".repeat(1_048_577), { headers: { "content-type": "application/json" } })]) {
    const send = transport(() => response);
    await expect(googleProjectInventoryApi(scope, async () => credential(), { fetch: send, now: () => now }).scopeIdentity()).rejects.toThrow("Verified read-only project access unavailable");
    expect(send).toHaveBeenCalledTimes(1);
  }
  const send = vi.fn<typeof fetch>(async () => { throw Error(token); });
  await expect(googleProjectInventoryApi(scope, async () => credential(), { fetch: send, now: () => now }).scopeIdentity()).rejects.toThrow("Verified read-only project access unavailable");
});
