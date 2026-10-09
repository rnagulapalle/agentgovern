import { expect, test } from "vitest";
import { collectProjectInventory, projectDiscoveryScope, type ProjectDiscoveryScope, type ProjectInventoryApi } from "./cloud-project-discovery";
const azure = { provider: "azure-foundry", tenantId: "workspace", connectionId: "azure", directoryId: "12345678-1234-1234-1234-123456789012", endpoint: "https://company.services.ai.azure.com/api/projects/customer-ops" } as const;
const google = { provider: "google-agent-engine", tenantId: "workspace", connectionId: "google", projectId: "company-agents", projectNumber: "123456789012", location: "us-central1" } as const;
const at = "2026-10-09T18:00:00.000Z", name = `projects/${google.projectNumber}/locations/${google.location}/reasoningEngines/1234`;
const av = { object: "agent.version", name: "customer-ops", id: "av_123", version: "1", definition: { kind: "prompt", instructions: "SECRET" }, metadata: { token: "SECRET" } };
const gd = { name, updateTime: at, etag: "not-a-version", displayName: "SECRET", spec: { identityType: "SERVICE_ACCOUNT", serviceAccount: `worker-agent@${google.projectId}.iam.gserviceaccount.com`, classMethods: [{ secret: "SECRET" }], deploymentSpec: { environment: "SECRET" } } };
const api = (s: ProjectDiscoveryScope, changes: Partial<ProjectInventoryApi> = {}): ProjectInventoryApi => ({
  scopeIdentity: async () => s.provider === "azure-foundry" ? { directoryId: s.directoryId, endpoint: s.endpoint } : { projectId: s.projectId, projectNumber: s.projectNumber },
  list: async () => s.provider === "azure-foundry" ? { data: [{ object: "agent", name: av.name, id: "ag_123" }], has_more: false } : { reasoningEngines: [{ name }] },
  listVersions: async () => ({ data: [av], has_more: false }), get: async () => s.provider === "azure-foundry" ? av : gd, ...changes,
});
test("provider identities remain distinct; descriptions, prompts, tools and secrets are excluded", async () => {
  for (const s of [azure, google]) {
    const calls: unknown[] = []; const client = api(s), original = client.get;
    client.get = async p => { calls.push(p); return original(p); };
    const r = await collectProjectInventory(client, s, at);
    expect(r.completeness).toBe("complete-api-traversal"); expect(r.failures).toEqual([]);
    expect(r.records).toHaveLength(1); expect(JSON.stringify(r)).not.toMatch(/SECRET|instructions|etag|updateTime|classMethods/);
    expect(r.records[0].coverage.enforcement).toBe("unverified");
    expect(r.records[0].version).toBe(s.provider === "azure-foundry" ? "1" : null);
    expect(calls).toEqual([{ resource: r.records[0].resource }]);
  }
});
test("unsupported scope or identity refuses before listing, including endpoint injection", async () => {
  for (const s of [{ ...azure, endpoint: azure.endpoint + "/../other" }, { ...azure, endpoint: "http://localhost" }, { ...azure, directoryId: "bad" }, { ...google, projectId: "../other" }, { ...google, projectNumber: "x" }, { ...google, location: "global" }, { ...google, tenantId: "" }, { ...google, extra: "SECRET" }, null])
    expect(() => projectDiscoveryScope(s as ProjectDiscoveryScope)).toThrow("scope");
  let lists = 0;
  for (const s of [azure, google]) for (const scopeIdentity of [async () => null, async () => ({}), async () => { throw Error("SECRET"); }])
    await expect(collectProjectInventory(api(s, { scopeIdentity, list: async () => { lists++; return {}; } }), s, at)).rejects.toThrow(/identity/);
  expect(lists).toBe(0);
  for (const time of ["bad", "2026-02-30T18:00:00.000Z", "2026-10-09T18:00:00Z"])
    await expect(collectProjectInventory(api(google), google, time)).rejects.toThrow("observation");
});
test("pending identity cannot let caller mutation redirect project collection", async () => {
  const s = { ...google }; let resolve!: (v: unknown) => void;
  const pending = collectProjectInventory(api(google, { scopeIdentity: () => new Promise(r => { resolve = r; }) }), s, at);
  s.projectNumber = "999999999999" as typeof google.projectNumber;
  resolve({ projectId: google.projectId, projectNumber: google.projectNumber });
  expect((await pending).scope).toEqual(google);
});
test("Google Agent Identity, default service agent and cross-project identities are never invented", async () => {
  for (const [spec, kind, principal] of [
    [{ identityType: "AGENT_IDENTITY" }, "agent-identity", null],
    [{ identityType: "SERVICE_ACCOUNT" }, "unknown", null],
    [{}, "unknown", null],
    [{ serviceAccount: gd.spec.serviceAccount }, "service-account", gd.spec.serviceAccount],
    [{ identityType: "IDENTITY_TYPE_UNSPECIFIED", serviceAccount: gd.spec.serviceAccount }, "service-account", gd.spec.serviceAccount],
    [{ identityType: "AGENT_IDENTITY", serviceAccount: gd.spec.serviceAccount }, "unknown", null],
    [{ identityType: "future", serviceAccount: gd.spec.serviceAccount }, "unknown", null],
    [{ serviceAccount: "worker@other-project.iam.gserviceaccount.com" }, "unknown", null],
  ]) {
    const r = await collectProjectInventory(api(google, { get: async () => ({ name, spec }) }), google, at);
    expect(r.records[0].identityKind).toBe(kind); expect(r.records[0].identityReference).toBe(principal);
    expect(r.records[0].gaps).toContain("execution-version-unresolved");
  }
});
test("foreign resources, drafts and duplicate versions refuse without fetching invalid resources", async () => {
  let gets = 0;
  for (const raw of [null, { name: name.replace(google.projectNumber, "999999999999") }, { name: name + "/../other" }]) {
    const r = await collectProjectInventory(api(google, { list: async () => ({ reasoningEngines: [raw] }), get: async () => { gets++; return gd; } }), google, at);
    expect(r.records).toEqual([]); expect(r.failures).toEqual(["invalid-resource"]);
  }
  expect(gets).toBe(0);
  for (const version of [null, { ...av, name: "other" }, { ...av, version: "../other" }, { ...av, draft: true }, { ...av, object: "other" }]) {
    const r = await collectProjectInventory(api(azure, { listVersions: async () => ({ data: [version], has_more: false }) }), azure, at);
    expect(r.records).toEqual([]); expect(r.completeness).toBe("partial");
  }
  const r = await collectProjectInventory(api(azure, { listVersions: async () => ({ data: [av, av], has_more: false }) }), azure, at);
  expect(r.records).toHaveLength(1); expect(r.failures).toEqual(["invalid-resource"]);
});
test("detail changes and permission loss preserve only listed evidence with unknown principal", async () => {
  for (const s of [azure, google]) for (const get of [async () => null, async () => ({}), async () => { throw Error("SECRET"); }, async () => ({ ...av, version: "2", name: "foreign" })]) {
    const r = await collectProjectInventory(api(s, { get }), s, at);
    expect(r.completeness).toBe("partial"); expect(r.records).toHaveLength(1); expect(r.records[0].identityReference).toBe(null);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  }
});
test("native pagination uses only fixed parents and opaque tokens; cycles are incomplete", async () => {
  const calls: unknown[] = [];
  const r = await collectProjectInventory(api(google, { list: async p => { calls.push(p); return p.cursor ? { reasoningEngines: [{ name }] } : { nextPageToken: "opaque+cursor=" }; } }), google, at);
  expect(r.completeness).toBe("complete-api-traversal"); expect(calls[1]).toEqual({ parent: name.slice(0, name.lastIndexOf("/")), limit: 100, cursor: "opaque+cursor=" });
  expect((await collectProjectInventory(api(google, { list: async () => ({ nextPageToken: "same" }) }), google, at)).failures).toEqual(["pagination-cycle"]);
  let n = 0;
  expect((await collectProjectInventory(api(google, { list: async () => ({ nextPageToken: `page-${++n}` }) }), google, at)).failures).toEqual(["page-limit"]);
  const azureCalls: unknown[] = [];
  const ar = await collectProjectInventory(api(azure, { list: async p => { azureCalls.push(p); return { data: [], has_more: false }; } }), azure, at);
  expect(ar.completeness).toBe("complete-api-traversal"); expect(azureCalls).toEqual([{ parent: `${azure.endpoint}/agents`, limit: 100 }]);
  const versions: unknown[] = [];
  const twoVersions = await collectProjectInventory(api(azure, {
    listVersions: async p => { versions.push(p); return p.cursor ? { data: [{ ...av, id: "av_456", version: "2" }], has_more: false } : { data: [av], has_more: true, last_id: av.id }; },
    get: async p => p.resource.endsWith("/2") ? { ...av, id: "av_456", version: "2" } : av,
  }), azure, at);
  expect(twoVersions.records.map(r => r.version)).toEqual(["1", "2"]);
  expect(twoVersions.completeness).toBe("complete-api-traversal");
  expect(versions[1]).toEqual({ parent: `${azure.endpoint}/agents/${av.name}/versions`, limit: 100, cursor: av.id });
});
test("duplicate agent pages and unsupported names do not initiate another version scan", async () => {
  let versions = 0;
  for (const row of [null, { object: "agent", name: "bad_name", id: "ag_123" }, { object: "agent", name: "-bad", id: "ag_123" }]) {
    const r = await collectProjectInventory(api(azure, { list: async () => ({ data: [row], has_more: false }), listVersions: async () => { versions++; return {}; } }), azure, at);
    expect(r.failures).toEqual(["invalid-resource"]);
  }
  expect(versions).toBe(0);
  const r = await collectProjectInventory(api(azure, { list: async () => ({ data: [{ object: "agent", name: av.name, id: "ag_123" }, { object: "agent", name: av.name, id: "ag_123" }], has_more: false }) }), azure, at);
  expect(r.records).toHaveLength(1); expect(r.failures).toEqual(["invalid-resource"]);
});
test("malformed pages and throttled reads cannot be complete empty scans", async () => {
  for (const s of [azure, google]) {
    const r = await collectProjectInventory(api(s, { list: async () => { throw Error("SECRET"); } }), s, at);
    expect(r.failures).toEqual(["list-unavailable"]); expect(JSON.stringify(r)).not.toContain("SECRET");
  }
  for (const page of [null, [], { reasoningEngines: {} }, { reasoningEngines: Array(101).fill({ name }) }, { nextPageToken: "bad cursor" }, { nextPageToken: null }])
    expect((await collectProjectInventory(api(google, { list: async () => page }), google, at)).completeness).toBe("partial");
  for (const page of [{}, { data: [], has_more: "false" }, { data: [], has_more: true, last_id: "x" }, { data: [{ id: "ag_123", name: av.name, object: "agent" }], has_more: true, last_id: "foreign" }])
    expect((await collectProjectInventory(api(azure, { list: async () => page }), azure, at)).completeness).toBe("partial");
  expect((await collectProjectInventory(api(azure, { listVersions: undefined }), azure, at)).failures).toEqual(["list-unavailable"]);
});
