// Conservative admission only: this does not attest to throughput or isolation.
export const stagingRoles = ["web", "application-database", "temporal-database", "temporal-service", "worker", "scheduler", "provider-twin", "authorization"] as const;
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonnegative = (value: unknown): value is number => value === 0 || positive(value);

export function stagingHostAdmission(inventory: unknown, plan: unknown, now = Date.now()) {
  const blockers: string[] = [];
  if (!record(inventory) || !positive(inventory.totalBytes) || !nonnegative(inventory.availableBytes) || inventory.availableBytes > inventory.totalBytes || !Array.isArray(inventory.containers) || !Array.isArray(inventory.containerIds) || typeof inventory.observedAt !== "string")
    return { admitted: false, blockers: ["host_inventory_invalid"] };
  const observed = Date.parse(inventory.observedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(now) || observed > now || now - observed > 600_000) blockers.push("host_inventory_stale_or_future");
  const ids = inventory.containerIds;
  if (ids.some(id => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) || new Set(ids).size !== ids.length || inventory.containers.length !== ids.length) blockers.push("container_inventory_incomplete");
  let existingBytes = 0;
  const seen = new Set<string>();
  for (const container of inventory.containers) {
    if (!record(container) || typeof container.id !== "string" || !ids.includes(container.id) || seen.has(container.id) || !nonnegative(container.memoryBytes)) {
      blockers.push("container_inventory_invalid"); continue;
    }
    seen.add(container.id);
    if (container.memoryBytes === 0) blockers.push("existing_container_memory_unbounded");
    existingBytes += container.memoryBytes;
  }
  if (!record(plan) || !positive(plan.hostReserveBytes) || plan.hostReserveBytes < 1024 ** 3 || !Array.isArray(plan.services))
    return { admitted: false, blockers: [...new Set([...blockers, "staging_resource_plan_invalid"])] };
  const roles = new Set<string>();
  let plannedBytes = 0;
  for (const service of plan.services) {
    if (!record(service) || typeof service.role !== "string" || !stagingRoles.some(role => role === service.role) || roles.has(service.role) || !positive(service.memoryBytes)) {
      blockers.push("staging_resource_plan_invalid"); continue;
    }
    roles.add(service.role); plannedBytes += service.memoryBytes;
  }
  if (roles.size !== stagingRoles.length) blockers.push("staging_resource_plan_incomplete");
  const requiredBytes = existingBytes + plannedBytes + plan.hostReserveBytes;
  if (!Number.isSafeInteger(requiredBytes)) blockers.push("resource_budget_overflow");
  if (requiredBytes > inventory.totalBytes) blockers.push("reserved_memory_exceeds_host");
  if (plannedBytes + plan.hostReserveBytes > inventory.availableBytes) blockers.push("available_memory_insufficient");
  return { admitted: blockers.length === 0, blockers: [...new Set(blockers)], existingBytes, plannedBytes, hostReserveBytes: plan.hostReserveBytes, totalBytes: inventory.totalBytes, availableBytes: inventory.availableBytes };
}
