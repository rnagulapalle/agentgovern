import { expect, test } from "vitest";
import { collectAwsRuntimeInventory, preserveRuntimeInventory, type AwsRuntimeInventoryApi } from "./cloud-discovery";
const scope = { tenantId: "company-a", connectionId: "cloud-a", accountId: "123456789012", region: "us-west-2" };
const at = "2026-10-09T12:00:00.000Z";
const raw = (id = "Assistant-abcdefghij", v = "1") => ({ agentRuntimeId: id, agentRuntimeVersion: v,
  agentRuntimeArn: `arn:aws:bedrock-agentcore:${scope.region}:${scope.accountId}:runtime/${id}` });
const detail = () => ({ ...raw(), roleArn: `arn:aws:iam::${scope.accountId}:role/customer-agent`,
  workloadIdentityDetails: { workloadIdentityArn: `arn:aws:bedrock-agentcore:${scope.region}:${scope.accountId}:workload-identity-directory/default/workload-identity/agent-a` },
  environmentVariables: { PASSWORD: "must-never-be-retained" }, description: "private description", authorizerConfiguration: { token: "private token" } });
const api = (change: Partial<AwsRuntimeInventoryApi> = {}): AwsRuntimeInventoryApi => ({
  callerIdentity: async () => ({ Account: scope.accountId }), listRuntimes: async () => ({ agentRuntimes: [raw()] }), getRuntime: async () => detail(), ...change });
test("native-shaped inventory keeps scoped identity references without secrets, tools or execution authority", async () => {
  const calls: unknown[] = [];
  const client = api({ listRuntimes: async p => { calls.push(p); return { agentRuntimes: [raw()] }; }, getRuntime: async p => { calls.push(p); return detail(); } });
  const result = await collectAwsRuntimeInventory(client, scope, at);
  expect(result.completeness).toBe("complete-api-traversal"); expect(result.failures).toEqual([]);
  expect(calls).toEqual([{ maxResults: 100 }, { agentRuntimeId: raw().agentRuntimeId, agentRuntimeVersion: "1" }]);
  expect(result.records[0].coverage).toEqual({ ownership: "unmapped", activity: "unconnected", enforcement: "unverified" });
  expect(result.records[0].gaps).toEqual(["effective-permissions-unknown", "declared-tools-unknown"]);
  expect(JSON.stringify(result)).not.toMatch(/must-never|private description|private token|environmentVariables|authorizerConfiguration/);
});
test("identity mismatch and unavailable identity refuse before any listing", async () => {
  let calls = 0;
  for (const callerIdentity of [async () => ({ Account: "999999999999" }), async () => null, async () => { throw Error("secret"); }])
    await expect(collectAwsRuntimeInventory(api({ callerIdentity, listRuntimes: async () => { calls++; return {}; } }), scope, at)).rejects.toThrow(/identity|account/);
  expect(calls).toBe(0);
});
test("invalid scopes and observation times default-deny", async () => {
  for (const bad of [{ ...scope, tenantId: "../other" }, { ...scope, connectionId: "" }, { ...scope, accountId: "1" }, { ...scope, region: "other" }, { ...scope, extra: "token" }, null])
    await expect(collectAwsRuntimeInventory(api(), bad as typeof scope, at)).rejects.toThrow("scope");
  for (const time of ["invalid", "2026-02-30T12:00:00.000Z", "2026-10-09T12:00:00Z"])
    await expect(collectAwsRuntimeInventory(api(), scope, time)).rejects.toThrow("observation");
});
test("caller mutation while identity is pending cannot redirect collection", async () => {
  const input = { ...scope }; let resolve!: (v: unknown) => void;
  const pending = collectAwsRuntimeInventory(api({ callerIdentity: () => new Promise(r => { resolve = r; }) }), input, at);
  input.accountId = "999999999999"; input.tenantId = "other"; resolve({ Account: scope.accountId });
  expect((await pending).records[0].scope).toEqual(scope);
});
test("pagination uses exact opaque cursors; cycles and page limits remain visibly incomplete", async () => {
  const seen: unknown[] = [];
  const result = await collectAwsRuntimeInventory(api({ listRuntimes: async p => { seen.push(p); return p.nextToken ? { agentRuntimes: [raw()] } : { agentRuntimes: [], nextToken: "opaque+cursor=" }; } }), scope, at);
  expect(result.completeness).toBe("complete-api-traversal"); expect(seen[1]).toEqual({ maxResults: 100, nextToken: "opaque+cursor=" });
  const cycle = await collectAwsRuntimeInventory(api({ listRuntimes: async () => ({ agentRuntimes: [], nextToken: "same" }) }), scope, at);
  expect(cycle.failures).toEqual(["pagination-cycle"]); expect(cycle.completeness).toBe("partial");
  let n = 0;
  expect((await collectAwsRuntimeInventory(api({ listRuntimes: async () => ({ agentRuntimes: [], nextToken: `page-${++n}` }) }), scope, at)).failures).toEqual(["page-limit"]);
});
test("throttled listing and malformed pages cannot appear as complete empty inventories", async () => {
  const failed = await collectAwsRuntimeInventory(api({ listRuntimes: async () => { throw Error("token and endpoint"); } }), scope, at);
  expect(failed.failures).toEqual(["list-unavailable"]); expect(JSON.stringify(failed)).not.toContain("token and endpoint");
  for (const page of [null, [], {}, { agentRuntimes: Array(101).fill(raw()) }, { agentRuntimes: [], nextToken: "" }, { agentRuntimes: [], nextToken: 1 }, { agentRuntimes: [], nextToken: "bad cursor" }])
    expect((await collectAwsRuntimeInventory(api({ listRuntimes: async () => page }), scope, at)).completeness).toBe("partial");
});
test("foreign resources, malformed versions and duplicate resources are refused", async () => {
  let details = 0;
  for (const invalid of [null, [], { ...raw(), agentRuntimeId: "bad/path" }, { ...raw(), agentRuntimeVersion: "latest" }, { ...raw(), agentRuntimeArn: raw().agentRuntimeArn.replace(scope.accountId, "999999999999") }]) {
    const result = await collectAwsRuntimeInventory(api({ listRuntimes: async () => ({ agentRuntimes: [invalid] }), getRuntime: async () => { details++; return detail(); } }), scope, at);
    expect(result.records).toEqual([]); expect(result.failures).toEqual(["invalid-resource"]);
  }
  expect(details).toBe(0);
  const repeated = await collectAwsRuntimeInventory(api({ listRuntimes: async () => ({ agentRuntimes: [raw(), raw()] }) }), scope, at);
  expect(repeated.records).toHaveLength(1); expect(repeated.completeness).toBe("partial");
});
test("failed or changed detail preserves listing evidence with unknown identity and no effective permissions", async () => {
  for (const getRuntime of [async () => { throw Error("private credential"); }, async () => null, async () => ({ ...detail(), agentRuntimeVersion: "2" }), async () => ({ ...detail(), agentRuntimeArn: "foreign" })]) {
    const result = await collectAwsRuntimeInventory(api({ getRuntime }), scope, at);
    expect(result.completeness).toBe("partial"); expect(result.records[0].roleReference).toBe(null);
    expect(result.records[0].gaps).toContain("runtime-identity-unavailable"); expect(JSON.stringify(result)).not.toContain("private credential");
  }
  for (const value of [{ ...raw() }, { ...detail(), roleArn: "foreign", workloadIdentityDetails: {} }, { ...detail(), workloadIdentityDetails: { workloadIdentityArn: "foreign" } }]) {
    const result = await collectAwsRuntimeInventory(api({ getRuntime: async () => value }), scope, at);
    expect(result.records[0].gaps).toContain("runtime-identity-unavailable");
  }
});
test("partial and complete empty scans retain prior resources without declaring removal or enforcement", async () => {
  const prior = await collectAwsRuntimeInventory(api(), scope, at);
  for (const listRuntimes of [async () => { throw Error("offline"); }, async () => ({ agentRuntimes: [] })]) {
    const current = await collectAwsRuntimeInventory(api({ listRuntimes }), scope, "2026-10-09T13:00:00.000Z");
    const merged = preserveRuntimeInventory(prior, current);
    expect(merged.records).toHaveLength(1); expect(merged.records[0].observedInCurrentScan).toBe(false);
    expect(merged.records[0].record.observedAt).toBe(at); expect(merged.records[0].record.coverage.enforcement).toBe("unverified");
  }
  const first = preserveRuntimeInventory(null, prior); expect(first.records[0].observedInCurrentScan).toBe(true);
  first.records[0].record.version = "2"; expect(prior.records[0].version).toBe("1");
  expect(() => preserveRuntimeInventory({ ...prior, scope: { ...scope, tenantId: "other" } }, prior)).toThrow("scope");
  expect(() => preserveRuntimeInventory({ ...prior, records: [{ ...prior.records[0], scope: { ...scope, connectionId: "other" } }] }, prior)).toThrow("scope");
  expect(() => preserveRuntimeInventory({ ...prior, records: [{ ...prior.records[0], resourceArn: "foreign" }] }, prior)).toThrow("scope");
});
test("stored inventory cannot inject authority, raw metadata or hide missing evidence", async () => {
  const scan = await collectAwsRuntimeInventory(api(), scope, at);
  const changes = [
    (r: Record<string, unknown>) => { r.coverage = { ownership: "mapped", activity: "connected", enforcement: "verified" }; },
    (r: Record<string, unknown>) => { r.environmentVariables = { token: "private" }; },
    (r: Record<string, unknown>) => { r.gaps = []; },
    (r: Record<string, unknown>) => { r.roleReference = "foreign"; },
    (r: Record<string, unknown>) => { r.observedAt = "invalid"; },
    (r: Record<string, unknown>) => { r.source = "unknown"; },
  ];
  for (const change of changes) {
    const candidate = structuredClone(scan); change(candidate.records[0] as unknown as Record<string, unknown>);
    expect(() => preserveRuntimeInventory(candidate, scan)).toThrow();
  }
  expect(() => preserveRuntimeInventory(null, { ...scan, completeness: "unknown" } as unknown as typeof scan)).toThrow("completeness");
});
