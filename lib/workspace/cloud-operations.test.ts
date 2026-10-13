import { expect, it, vi } from "vitest";
import { CloudDiscoveryOperations } from "./cloud-operations";
import type { CloudInventoryStore } from "./cloud-inventory";
import type { AwsRuntimeInventoryApi, CloudDiscoveryScope } from "./cloud-discovery";
const actor = { orgId: "company-a", subject: "owner@example.test", tokenHash: "session", role: "operator" as const };
const scope = { tenantId: actor.orgId, connectionId: "aws-a", accountId: "123456789012", region: "us-west-2" };
function fixture() {
  const store = { connections: vi.fn().mockResolvedValue({ connections: [{ scope, status: "configured" }], truncated: false, enforcement: "unverified" }), beginScan: vi.fn().mockResolvedValue({ scope, allowed: true }), recordScan: vi.fn().mockResolvedValue({}), latest: vi.fn().mockResolvedValue({ enforcement: "unverified", status: "observed" }) };
  const api = { callerIdentity: vi.fn().mockResolvedValue({ Account: scope.accountId }), listRuntimes: vi.fn().mockResolvedValue({ agentRuntimes: [], nextToken: null }), getRuntime: vi.fn() };
  const binding = vi.fn().mockResolvedValue(api);
  return { store, api, binding, ops: new CloudDiscoveryOperations(store as unknown as CloudInventoryStore, binding) };
}
it("availability inspects reviewed bindings without cloud reads or authority creation", async () => {
  const { ops, store, api, binding } = fixture(); expect(await ops.connections(actor)).toMatchObject({ connections: [{ scanReady: true }], scanningAvailable: true }); expect(api.callerIdentity).not.toHaveBeenCalled(); expect(store.recordScan).not.toHaveBeenCalled();
  binding.mockRejectedValue(new Error("secret binding failure")); expect(await ops.connections(actor)).toMatchObject({ connections: [{ scanReady: false }], scanningAvailable: false });
});
it("saves minimized complete and partial results only after scoped admission, then rereads persisted evidence", async () => {
  const { ops, store, api, binding } = fixture();
  const runtime = { agentRuntimeId: "service-1234567890", agentRuntimeArn: `arn:aws:bedrock-agentcore:${scope.region}:${scope.accountId}:runtime/service-1234567890`, agentRuntimeVersion: "1" };
  api.listRuntimes.mockResolvedValue({ agentRuntimes: [runtime], nextToken: null }); api.getRuntime.mockResolvedValue({ ...runtime, environmentVariables: { private: "must not persist" } });
  expect(await ops.scan(actor, "aws-a")).toMatchObject({ enforcement: "unverified" });
  expect(store.beginScan).toHaveBeenCalledWith(actor, "aws-a"); expect(binding).toHaveBeenCalledWith(scope); expect(api.getRuntime).toHaveBeenCalledWith({ agentRuntimeId: runtime.agentRuntimeId, agentRuntimeVersion: "1" }); expect(store.recordScan.mock.calls[0][2]).toMatchObject({ completeness: "complete-api-traversal", records: [{ resourceId: runtime.agentRuntimeId, version: "1", coverage: { enforcement: "unverified" } }] });
  expect(JSON.stringify(store.recordScan.mock.calls)).not.toContain("must not persist");
  api.listRuntimes.mockRejectedValue(new Error("raw provider credentials")); await ops.scan(actor, "aws-a"); expect(store.recordScan.mock.calls[1][2]).toMatchObject({ completeness: "partial", failures: ["list-unavailable"] }); expect(JSON.stringify(store.recordScan.mock.calls)).not.toContain("credentials");
});
it("denies admission, throttle, missing binding and wrong caller account before saving evidence", async () => {
  const { ops, store, api, binding } = fixture(); store.beginScan.mockRejectedValueOnce(new Error("Current member required")); await expect(ops.scan(actor, "aws-a")).rejects.toThrow("member required"); expect(binding).not.toHaveBeenCalled();
  store.beginScan.mockResolvedValueOnce({ scope, allowed: false }); await expect(ops.scan(actor, "aws-a")).rejects.toThrow("Too many"); expect(binding).not.toHaveBeenCalled();
  binding.mockRejectedValueOnce(new Error("missing")); await expect(ops.scan(actor, "aws-a")).rejects.toThrow("missing");
  api.callerIdentity.mockResolvedValue({ Account: "999999999999" }); await expect(ops.scan(actor, "aws-a")).rejects.toThrow("identity could not be verified"); expect(store.recordScan).not.toHaveBeenCalled();
});
it("time budget stops further real reads, preserves partial evidence and honors authority refusal after collection", async () => {
  const { store, api, binding } = fixture(); const start = Date.now(); let now = start;
  api.callerIdentity.mockImplementation(async () => { now = start + 31000; return { Account: scope.accountId }; });
  const ops = new CloudDiscoveryOperations(store as unknown as CloudInventoryStore, binding as (scope: CloudDiscoveryScope) => Promise<AwsRuntimeInventoryApi>, () => now);
  await ops.scan(actor, "aws-a"); expect(api.listRuntimes).not.toHaveBeenCalled(); expect(store.recordScan.mock.calls[0][2]).toMatchObject({ completeness: "partial", failures: ["list-unavailable"] });
  store.recordScan.mockRejectedValueOnce(new Error("Member revoked during collection")); store.latest.mockClear(); await expect(ops.scan(actor, "aws-a")).rejects.toThrow("revoked"); expect(store.latest).not.toHaveBeenCalled();
});
