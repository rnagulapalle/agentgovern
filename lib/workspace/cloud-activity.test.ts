import { expect, it, vi } from "vitest";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activityReference, cloudActivitySource, CloudActivityOperations } from "./cloud-activity";
import type { CloudInventoryStore } from "./cloud-inventory";
import type { DiscoveredRuntime } from "./cloud-discovery";
const actor = { orgId: "company-a", subject: "member@example.test", tokenHash: "session", role: "operator" as const };
const scope = { tenantId: actor.orgId, connectionId: "aws-a", accountId: "123456789012", region: "us-west-2" };
const id = "service-1234567890", arn = `arn:aws:bedrock-agentcore:${scope.region}:${scope.accountId}:runtime/${id}`;
const reference = { connectionId: "aws-a", scanId: "00000000-0000-4000-8000-000000000001", resourceArn: arn, version: "1" };
const now = Date.now();
const runtime: DiscoveredRuntime = { scope, source: "aws-agentcore-runtime", resourceId: id, resourceArn: arn, version: "1", observedAt: new Date(now).toISOString(), roleReference: null, workloadIdentityReference: null, gaps: ["runtime-identity-unavailable", "effective-permissions-unknown", "declared-tools-unknown"], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } };
const inventory = () => ({ scope, status: "observed" as const, scanId: reference.scanId, observedAt: runtime.observedAt, stale: false, completeness: "complete-api-traversal" as const, records: [{ record: structuredClone(runtime), observedInCurrentScan: true, stale: false }], failures: [], enforcement: "unverified" as const, historyTruncated: false });
function fixture() {
  const store = { beginScan: vi.fn().mockResolvedValue({ scope, allowed: true }), latest: vi.fn().mockImplementation(async () => inventory()) };
  const source = vi.fn().mockResolvedValue(`/aws/bedrock-agentcore/runtimes/${id}-DEFAULT`);
  const api = { callerIdentity: vi.fn().mockResolvedValue({ Account: scope.accountId }), listEvents: vi.fn().mockResolvedValue({ events: [] }) };
  const binding = vi.fn().mockResolvedValue(api); let clock = now;
  const ops = new CloudActivityOperations(store as unknown as CloudInventoryStore, binding, source, () => clock);
  return { ops, store, api, source, binding, advance: () => { clock += 31000; } };
}
it("requires only an exact saved inventory reference; browser log source, account, authority and credentials are rejected", () => {
  expect(activityReference(reference)).toEqual(reference);
  for (const value of [null, [], "bad", {}, { ...reference, logGroup: "arbitrary" }, { ...reference, session: "SECRET" }, { ...reference, tenantId: "foreign" }, { ...reference, controlsEnabled: true }, { ...reference, version: 1 }, { ...reference, scanId: "bad" }, { ...reference, connectionId: "../bad" }, { ...reference, resourceArn: arn.replace("123456789012", "bad") }]) expect(() => activityReference(value)).toThrow("current AWS inventory");
});
it("matches private source to exact tenant/account/region/connection/runtime/version and refuses unsafe files or log sources", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-activity-source-")), path = join(dir, "source.json");
  const value = { scope, runtimeArn: arn, version: "1", logGroup: `/aws/bedrock-agentcore/runtimes/${id}-DEFAULT` };
  try {
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
    expect(await cloudActivitySource(runtime, path)).toBe(value.logGroup);
    await chmod(path, 0o644); await expect(cloudActivitySource(runtime, path)).rejects.toThrow("not configured"); await chmod(path, 0o600);
    for (const bad of [null, [], { ...value, scope: [] }, { ...value, scope: { ...scope, tenantId: "other" } }, { ...value, scope: { ...scope, region: "us-east-1" } }, { ...value, scope: { ...scope, extra: "x" } }, { ...value, runtimeArn: "other" }, { ...value, version: "2" }, { ...value, logGroup: "/aws/other" }, { ...value, logGroup: value.logGroup + "/payload" }, { ...value, credentials: "SECRET" }]) {
      await writeFile(path, JSON.stringify(bad)); await expect(cloudActivitySource(runtime, path)).rejects.toThrow("not configured");
    }
    await expect(cloudActivitySource(runtime, join(dir, "missing"))).rejects.toThrow("not configured");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it("reads only a server-timed finite window, strips private payloads and revalidates access before returning", async () => {
  const { ops, store, api } = fixture();
  api.listEvents.mockResolvedValue({ events: [{ eventId: "event-1", timestamp: now - 1000, message: JSON.stringify({ resource_arn: arn, account_id: scope.accountId, operation: "InvokeAgentRuntime", request_id: "request-1", session_id: "session-1", payload: "PRIVATE_CUSTOMER_TEXT", output: "SECRET_OUTPUT" }) }] });
  const result = await ops.read(actor, reference);
  expect(result).toMatchObject({ retention: "request-only", completeness: "complete-api-traversal", enforcement: "unverified", toolActivity: "unknown", observations: [{ sourceEventId: "event-1", observation: { effectVerified: false } }] });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_CUSTOMER_TEXT|SECRET_OUTPUT/);
  expect(api.listEvents).toHaveBeenCalledWith({ logGroupName: `/aws/bedrock-agentcore/runtimes/${id}-DEFAULT`, startTime: now - 900000, endTime: now, limit: 100 });
  expect(store.latest).toHaveBeenCalledTimes(2);
});
it("treats empty and denied reads as observation results, never agent success or verified enforcement", async () => {
  const { ops, api } = fixture();
  expect(await ops.read(actor, reference)).toMatchObject({ observations: [], toolActivity: "unknown", enforcement: "unverified" });
  api.listEvents.mockRejectedValue(Error("SECRET credentials"));
  const result = await ops.read(actor, reference); expect(result).toMatchObject({ completeness: "partial", failures: ["read-unavailable"] }); expect(JSON.stringify(result)).not.toContain("SECRET");
});
it("refuses revoked membership, throttle, stale/missing/retained evidence and foreign scope before any AWS call", async () => {
  const { ops, store, binding } = fixture();
  store.beginScan.mockRejectedValueOnce(Error("revoked")); await expect(ops.read(actor, reference)).rejects.toThrow("revoked");
  store.beginScan.mockResolvedValueOnce({ scope, allowed: false }); await expect(ops.read(actor, reference)).rejects.toThrow("Too many");
  for (const altered of [{ ...inventory(), status: "no-scan", records: [] }, { ...inventory(), scanId: "other" }, { ...inventory(), stale: true }, { ...inventory(), records: [] }, { ...inventory(), records: [{ ...inventory().records[0], observedInCurrentScan: false }] }, { ...inventory(), records: [{ ...inventory().records[0], stale: true }] }]) {
    store.latest.mockResolvedValueOnce(altered); await expect(ops.read(actor, reference)).rejects.toThrow("Refresh AWS discovery");
  }
  const changed = inventory(); changed.records[0].record.scope.tenantId = "other";
  store.latest.mockResolvedValueOnce(changed); await expect(ops.read(actor, reference)).rejects.toThrow("scope changed"); expect(binding).not.toHaveBeenCalled();
});
it("refuses foreign account identity, missing bindings and log source drift without disclosing provider errors", async () => {
  const { ops, source, binding, api } = fixture();
  source.mockRejectedValueOnce(Error("source unavailable")); await expect(ops.read(actor, reference)).rejects.toThrow("source unavailable"); expect(binding).not.toHaveBeenCalled();
  binding.mockRejectedValueOnce(Error("binding unavailable")); await expect(ops.read(actor, reference)).rejects.toThrow("binding unavailable");
  api.callerIdentity.mockResolvedValue({ Account: "999999999999" }); await expect(ops.read(actor, reference)).rejects.toThrow("identity or log source"); expect(api.listEvents).not.toHaveBeenCalled();
  source.mockResolvedValueOnce("/aws/wrong-log-group"); await expect(ops.read(actor, reference)).rejects.toThrow("identity or log source");
});
it("rechecks membership and immutable observation after I/O; rejects scan/identity changes and bounds pagination time", async () => {
  const { ops, store, api, advance } = fixture();
  store.latest.mockResolvedValueOnce(inventory()).mockRejectedValueOnce(Error("Member revoked during AWS read")); await expect(ops.read(actor, reference)).rejects.toThrow("revoked during");
  const changed = inventory(); changed.records[0].record.roleReference = "arn:aws:iam::123456789012:role/changed";
  store.latest.mockResolvedValueOnce(inventory()).mockResolvedValueOnce(changed); await expect(ops.read(actor, reference)).rejects.toThrow("changed during");
  api.listEvents.mockImplementationOnce(async () => { advance(); return { events: [], nextToken: "next" }; });
  expect(await ops.read(actor, reference)).toMatchObject({ completeness: "partial", failures: ["read-unavailable"] });
});
