import { it, expect, vi } from "vitest";
import type { Pool } from "pg";
import { versionedActivities, type RunContract } from "./version-contract";
const valid: RunContract = { runId: "12345678-1234-1234-1234-123456789abc", planHash: "a".repeat(64), planVersion: "acknowledgement-1", connectorVersion: "private-twin-1" };
function setup(rows: unknown[] = [{ plan_hash: valid.planHash, owner_active: true }]) {
  const query = vi.fn().mockResolvedValue({ rows });
  const advance = vi.fn().mockResolvedValue("waiting");
  const a = versionedActivities({ query } as unknown as Pool, { orgId: "tenant-a", subject: "enquiry-runner", role: "worker", tokenHash: "test" }, { advance });
  return { query, advance, a };
}
it("binds immutable plan digest within the worker tenant before current authority checks", async () => {
  const { a, query, advance } = setup();
  expect(await a.advanceContract(valid)).toBe("waiting");
  expect(query.mock.calls[0][1]).toEqual(["tenant-a", valid.runId]);
  expect(advance).toHaveBeenCalledWith(valid.runId);
});
it.each([null, { ...valid, runId: 123 }, { ...valid, planHash: 456 }, { ...valid, runId: "invalid" }, { ...valid, planHash: "bad" }, { ...valid, planVersion: "future" }, { ...valid, connectorVersion: "live" }])("rejects unsupported contract before any database or effect access: %s", async input => {
  const { a, query, advance } = setup();
  await expect(a.advanceContract(input as RunContract)).rejects.toThrow("Unsupported");
  expect(query).not.toHaveBeenCalled(); expect(advance).not.toHaveBeenCalled();
});
it.each([{ rows: [] }, { rows: [{ plan_hash: "b".repeat(64) }] }, { rows: [{ plan_hash: valid.planHash, owner_active: true }, { plan_hash: valid.planHash, owner_active: true }] }])("refuses missing, mismatched or ambiguous saved plans", async ({ rows }) => {
  const { a, advance } = setup(rows);
  await expect(a.advanceContract(valid)).rejects.toThrow("mismatch"); expect(advance).not.toHaveBeenCalled();
});
it("propagates database and authority failures without dispatch fallback", async () => {
  const { a, query, advance } = setup();
  query.mockRejectedValueOnce(Error("database unavailable"));
  await expect(a.advanceContract(valid)).rejects.toThrow("database unavailable"); expect(advance).not.toHaveBeenCalled();
  advance.mockRejectedValueOnce(Error("revoked"));
  await expect(a.advanceContract(valid)).rejects.toThrow("revoked");
});

it("refuses a revoked plan owner before dispatch", async () => {
  const { a, advance } = setup([{ plan_hash: valid.planHash, owner_active: false }]);
  await expect(a.advanceContract(valid)).rejects.toThrow("owner"); expect(advance).not.toHaveBeenCalled();
});
