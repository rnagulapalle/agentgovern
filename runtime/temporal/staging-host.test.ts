import { describe, expect, it } from "vitest";
import { stagingHostAdmission, stagingRoles } from "./staging-host";
const gib = 1024 ** 3, now = Date.parse("2026-10-08T12:00:00Z"), id = "a".repeat(64);
const inventory = () => ({ observedAt: new Date(now).toISOString(), totalBytes: 16 * gib, availableBytes: 12 * gib, containerIds: [id], containers: [{ id, memoryBytes: 2 * gib }] });
const plan = () => ({ hostReserveBytes: gib, services: stagingRoles.map(role => ({ role, memoryBytes: gib / 2 })) });
describe("staging host admission", () => {
  it("admits a complete bounded plan with both reserved and actual headroom", () => {
    expect(stagingHostAdmission(inventory(), plan(), now)).toMatchObject({ admitted: true, existingBytes: 2 * gib, plannedBytes: 4 * gib });
  });
  it("refuses uncapped neighbors even when the host looks idle", () => {
    const host = inventory(); host.containers[0].memoryBytes = 0;
    expect(stagingHostAdmission(host, plan(), now).blockers).toContain("existing_container_memory_unbounded");
  });
  it("refuses overcommit even with abundant currently available memory", () => {
    const host = inventory(); host.containers[0].memoryBytes = 12 * gib;
    expect(stagingHostAdmission(host, plan(), now).blockers).toContain("reserved_memory_exceeds_host");
  });
  it("also refuses insufficient current memory and reserves host processes", () => {
    const host = inventory(); host.availableBytes = 4 * gib;
    expect(stagingHostAdmission(host, plan(), now).blockers).toContain("available_memory_insufficient");
    expect(stagingHostAdmission(host, { ...plan(), hostReserveBytes: 1 }, now).admitted).toBe(false);
  });
  it("refuses missing, stale, invalid and future observations", () => {
    for (const observedAt of ["invalid", new Date(now - 600_001).toISOString(), new Date(now + 1).toISOString()])
      expect(stagingHostAdmission({ ...inventory(), observedAt }, plan(), now).blockers).toContain("host_inventory_stale_or_future");
    for (const host of [null, [], {}, { ...inventory(), availableBytes: -1 }, { ...inventory(), availableBytes: 17 * gib }, { ...inventory(), totalBytes: NaN }])
      expect(stagingHostAdmission(host, plan(), now).admitted).toBe(false);
  });
  it("refuses a missing, duplicated, malformed or retargeted container inventory", () => {
    for (const host of [
      { ...inventory(), containerIds: [] },
      { ...inventory(), containerIds: [id, id] },
      { ...inventory(), containerIds: ["not-an-id"] },
      { ...inventory(), containers: [null] },
      { ...inventory(), containers: [{ id: "b".repeat(64), memoryBytes: gib }] },
      { ...inventory(), containers: [{ id, memoryBytes: -1 }] },
      { ...inventory(), containerIds: [id, "b".repeat(64)], containers: [{ id, memoryBytes: gib }, { id, memoryBytes: gib }] },
    ]) expect(stagingHostAdmission(host, plan(), now).admitted).toBe(false);
  });
  it("requires every stack role once, without malformed or unbounded budgets", () => {
    for (const resourcePlan of [null, [], {}, { ...plan(), services: [] }, { ...plan(), services: [...plan().services, plan().services[0]] }, { ...plan(), services: [null] }, { ...plan(), services: [{ role: "unknown", memoryBytes: gib }] }, { ...plan(), services: [{ role: "worker", memoryBytes: 0 }] }])
      expect(stagingHostAdmission(inventory(), resourcePlan, now).admitted).toBe(false);
  });
  it("supports an empty dedicated host and refuses unsafe arithmetic", () => {
    expect(stagingHostAdmission({ ...inventory(), containerIds: [], containers: [] }, plan(), now).admitted).toBe(true);
    expect(stagingHostAdmission(inventory(), { ...plan(), hostReserveBytes: Number.MAX_SAFE_INTEGER }, now).blockers).toContain("resource_budget_overflow");
  });
});
