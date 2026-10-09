import { expect, test, vi } from "vitest";
import { CloudDiscoveryOperations } from "./cloud-operations";
import type { CloudInventoryStore } from "./cloud-inventory";
const actor = { orgId: "company-a", subject: "owner@example.test", tokenHash: "session", role: "operator" as const };
const scope = { provider: "google-agent-engine" as const, tenantId: actor.orgId, connectionId: "google-a", projectId: "company-agents", projectNumber: "123456789012", location: "us-central1" };
function fixture() {
  const store = { projectConnections: vi.fn().mockResolvedValue({ connections: [{ scope, status: "configured" }], truncated: false, enforcement: "unverified" }), beginProjectScan: vi.fn().mockResolvedValue({ scope, allowed: true }), recordProjectScan: vi.fn().mockResolvedValue({}), latestProject: vi.fn().mockResolvedValue({ status: "observed", enforcement: "unverified" }) };
  const api = { scopeIdentity: vi.fn().mockResolvedValue({ projectId: scope.projectId, projectNumber: scope.projectNumber }), list: vi.fn().mockResolvedValue({ reasoningEngines: [] }), get: vi.fn() };
  const binding = vi.fn().mockResolvedValue(api); let at = Date.now();
  return { store, api, binding, time: (value: number) => { at = value; }, now: () => at, ops: new CloudDiscoveryOperations(store as unknown as CloudInventoryStore, undefined, () => at, binding) };
}
test("project availability checks server configuration without cloud reads, observations or execution authority", async () => {
  const { store, api, binding, ops } = fixture();
  expect(await ops.projectConnections(actor)).toMatchObject({ connections: [{ scanReady: true }], scanningAvailable: true });
  expect(api.scopeIdentity).not.toHaveBeenCalled(); expect(store.recordProjectScan).not.toHaveBeenCalled();
  binding.mockRejectedValue(Error("PRIVATE credential unavailable")); expect(await ops.projectConnections(actor)).toMatchObject({ connections: [{ scanReady: false }], scanningAvailable: false });
});
test("scoped Google scan saves minimized unknown-authority observations and failed pages remain partial", async () => {
  const { store, api, ops } = fixture(), name = `projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines/1234`;
  api.list.mockResolvedValue({ reasoningEngines: [{ name }] }); api.get.mockResolvedValue({ name, description: "PRIVATE_PROMPT", spec: { serviceAccount: `agent-reader@${scope.projectId}.iam.gserviceaccount.com`, environmentVariables: { secret: "PRIVATE" } } });
  await ops.scanProject(actor, scope.connectionId);
  expect(store.beginProjectScan).toHaveBeenCalledWith(actor, scope.connectionId);
  expect(store.recordProjectScan.mock.calls[0][2]).toMatchObject({ completeness: "complete-api-traversal", records: [{ resource: name, version: null, coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } }] });
  expect(JSON.stringify(store.recordProjectScan.mock.calls)).not.toContain("PRIVATE");
  api.list.mockRejectedValue(Error("PRIVATE provider response")); await ops.scanProject(actor, scope.connectionId);
  expect(store.recordProjectScan.mock.calls[1][2]).toMatchObject({ completeness: "partial", failures: ["list-unavailable"] });
});
test("membership, throttle, binding and native identity refusal cannot save scan evidence", async () => {
  const { store, api, binding, ops } = fixture();
  store.beginProjectScan.mockRejectedValueOnce(Error("Current member required")); await expect(ops.scanProject(actor, scope.connectionId)).rejects.toThrow('member required'); expect(binding).not.toHaveBeenCalled();
  store.beginProjectScan.mockResolvedValueOnce({ scope, allowed: false }); await expect(ops.scanProject(actor, scope.connectionId)).rejects.toThrow('Too many'); expect(binding).not.toHaveBeenCalled();
  binding.mockRejectedValueOnce(Error("unavailable")); await expect(ops.scanProject(actor, scope.connectionId)).rejects.toThrow('unavailable'); expect(api.scopeIdentity).not.toHaveBeenCalled();
  api.scopeIdentity.mockResolvedValue({ projectId: 'foreign', projectNumber: scope.projectNumber }); await expect(ops.scanProject(actor, scope.connectionId)).rejects.toThrow('identity could not be verified'); expect(api.list).not.toHaveBeenCalled(); expect(store.recordProjectScan).not.toHaveBeenCalled();
});
test("budget exhaustion preserves partial observation and post-network revocation blocks persistence/readback", async () => {
  const { store, api, ops, time, now } = fixture(), start = now();
  api.scopeIdentity.mockImplementation(async () => { time(start + 31000); return { projectId: scope.projectId, projectNumber: scope.projectNumber }; });
  await ops.scanProject(actor, scope.connectionId); expect(api.list).not.toHaveBeenCalled(); expect(store.recordProjectScan.mock.calls[0][2]).toMatchObject({ completeness: "partial", failures: ["list-unavailable"] });
  store.recordProjectScan.mockRejectedValueOnce(Error("Member revoked during cloud read")); store.latestProject.mockClear();
  await expect(ops.scanProject(actor, scope.connectionId)).rejects.toThrow('revoked'); expect(store.latestProject).not.toHaveBeenCalled();
});
