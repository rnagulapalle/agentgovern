import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "../durable/database";
import { ControlError, type Actor } from "../durable/contracts";
import { memberAuthority } from "./identity";
import { tenantPoolBinding } from "../durable/tenant-pool";
import { throttle } from "./auth";
import { preserveRuntimeInventory, type CloudDiscoveryScope, type DiscoveredRuntime, type RuntimeInventoryScan } from "./cloud-discovery";
import { projectDiscoveryScope, type ProjectDiscoveryScope, type ProjectInventoryScan, type ProjectObservation } from "./cloud-project-discovery";
import { canonicalProjectScan } from "./cloud-project-evidence";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const failures = ["list-unavailable", "invalid-page", "invalid-resource", "detail-unavailable", "invalid-detail", "pagination-cycle", "page-limit"];
async function authority(c: PoolClient, actor: Actor) {
  if (!await memberAuthority(c, actor)) throw new ControlError(403, "Current invited member required for discovery evidence.");
}
function canonicalScan(input: RuntimeInventoryScan): RuntimeInventoryScan {
  if (!input || Object.keys(input).sort().join() !== "completeness,failures,observedAt,records,scope"
    || !Array.isArray(input.records) || input.records.length > 2000
    || !Array.isArray(input.failures) || input.failures.length > 2020 || input.failures.some(f => !failures.includes(f))
    || (input.completeness === "complete-api-traversal" && input.failures.length))
    throw new ControlError(400, "Valid minimized discovery evidence required.");
  const validated = preserveRuntimeInventory(null, input);
  const records = validated.records.map(r => r.record).sort((a, b) => `${a.resourceArn}:${a.version}`.localeCompare(`${b.resourceArn}:${b.version}`));
  if (records.length !== input.records.length) throw new ControlError(400, "Duplicate discovery observation identity.");
  const keys = new Set<string>();
  for (const r of records) {
    const key = `${r.resourceArn}:${r.version}`;
    if (r.observedAt !== input.observedAt || keys.has(key)) throw new ControlError(400, "Discovery observation identity differs.");
    keys.add(key);
  }
  return { scope: validated.scope, observedAt: validated.observedAt, completeness: validated.completeness,
    records: records.map(r => ({ scope: { ...validated.scope }, source: r.source, resourceId: r.resourceId, resourceArn: r.resourceArn, version: r.version, observedAt: r.observedAt, roleReference: r.roleReference, workloadIdentityReference: r.workloadIdentityReference, gaps: [...r.gaps], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } })), failures: [...input.failures] };
}
async function connection(c: PoolClient, org: string, id: string): Promise<CloudDiscoveryScope> {
  const row = (await c.query("SELECT account_id,region FROM ll_cloud_connections WHERE org_id=$1 AND id=$2", [org, id])).rows[0];
  if (!row) throw new ControlError(404, "Discovery connection unavailable.");
  return { tenantId: org, connectionId: id, accountId: row.account_id, region: row.region };
}
function projectRow(org: string, row: Record<string, string>): ProjectDiscoveryScope {
  return projectDiscoveryScope(row.provider === "azure-foundry"
    ? { provider: "azure-foundry", tenantId: org, connectionId: row.id, directoryId: row.directory_id, endpoint: row.endpoint }
    : { provider: "google-agent-engine", tenantId: org, connectionId: row.id, projectId: row.project_id, projectNumber: row.project_number, location: row.location });
}
async function projectConnection(c: PoolClient, org: string, id: string) {
  const row = (await c.query("SELECT * FROM ll_cloud_project_connections WHERE org_id=$1 AND id=$2", [org, id])).rows[0];
  if (!row) throw new ControlError(404, "Project discovery connection unavailable.");
  return projectRow(org, row);
}
export class CloudInventoryStore {
  constructor(private readonly db: Pool) {}
  epoch(scope: CloudDiscoveryScope) {
    const binding=tenantPoolBinding(this.db);
    if (!binding || binding.org!==scope.tenantId || binding.purpose!=="web") throw new ControlError(503,"Scoped AWS authorization context unavailable.");
    return binding.epoch;
  }
  async configureProjectConnection(actor: Actor, input: ProjectDiscoveryScope) {
    let scope: ProjectDiscoveryScope;
    try { scope = projectDiscoveryScope(input); } catch { throw new ControlError(400, "Valid project discovery scope required."); }
    if (scope.tenantId !== actor.orgId) throw new ControlError(403, "Project discovery tenant differs.");
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const row = (await c.query("SELECT * FROM ll_cloud_project_connections WHERE org_id=$1 AND id=$2", [actor.orgId, scope.connectionId])).rows[0];
      if (row && JSON.stringify(projectRow(actor.orgId, row)) !== JSON.stringify(scope)) throw new ControlError(409, "Project discovery connection identity is immutable.");
      if (!row) await c.query("INSERT INTO ll_cloud_project_connections(org_id,id,provider,directory_id,endpoint,project_id,project_number,location,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [actor.orgId, scope.connectionId, scope.provider, scope.provider === "azure-foundry" ? scope.directoryId : null, scope.provider === "azure-foundry" ? scope.endpoint : null,
          scope.provider === "google-agent-engine" ? scope.projectId : null, scope.provider === "google-agent-engine" ? scope.projectNumber : null, scope.provider === "google-agent-engine" ? scope.location : null, actor.subject]);
      return { scope, status: "configured" as const, authorityGranted: false as const };
    });
  }
  async projectConnections(actor: Actor) {
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const rows = (await c.query("SELECT * FROM ll_cloud_project_connections WHERE org_id=$1 ORDER BY created_at,id LIMIT 101", [actor.orgId])).rows;
      return { connections: rows.slice(0, 100).map(row => ({ scope: projectRow(actor.orgId, row), status: "configured" as const })), truncated: rows.length > 100, scanningAvailable: false as const, enforcement: "unverified" as const };
    });
  }
  async beginProjectScan(actor: Actor, id: string) {
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const scope = await projectConnection(c, actor.orgId, id);
      return { scope, allowed: await throttle(c, `cloud-project-discovery:${actor.orgId}:${id}`, 3, 60) };
    });
  }
  async recordProjectScan(actor: Actor, scanId: string, input: ProjectInventoryScan) {
    if (!uuid.test(scanId)) throw new ControlError(400, "Stable project scan identity required.");
    let scan: ProjectInventoryScan;
    try { scan = canonicalProjectScan(input); } catch { throw new ControlError(400, "Valid minimized project discovery evidence required."); }
    if (scan.scope.tenantId !== actor.orgId || Date.parse(scan.observedAt) > Date.now() + 300_000) throw new ControlError(400, "Project discovery scope or observation time differs.");
    const hash = createHash("sha256").update(JSON.stringify(scan)).digest("hex");
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const scope = await projectConnection(c, actor.orgId, scan.scope.connectionId);
      if (JSON.stringify(scope) !== JSON.stringify(scan.scope)) throw new ControlError(409, "Project discovery connection scope differs.");
      const old = (await c.query("SELECT canonical_sha256 FROM ll_cloud_project_scans WHERE org_id=$1 AND connection_id=$2 AND id=$3", [actor.orgId, scope.connectionId, scanId])).rows[0];
      if (old) {
        if (old.canonical_sha256 !== hash) throw new ControlError(409, "Project discovery scan replay changed evidence.");
        return { scanId, repeated: true, authorityGranted: false as const };
      }
      await c.query("INSERT INTO ll_cloud_project_scans(org_id,connection_id,id,observed_at,completeness,failures,canonical_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)", [actor.orgId, scope.connectionId, scanId, scan.observedAt, scan.completeness, scan.failures, hash]);
      for (const r of scan.records) await c.query("INSERT INTO ll_cloud_project_observations(org_id,connection_id,scan_id,resource,provider_version,identity_kind,identity_reference) VALUES($1,$2,$3,$4,$5,$6,$7)", [actor.orgId, scope.connectionId, scanId, r.resource, r.version ?? "", r.identityKind, r.identityReference]);
      return { scanId, repeated: false, authorityGranted: false as const };
    });
  }
  async latestProject(actor: Actor, id: string) {
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const scope = await projectConnection(c, actor.orgId, id);
      const latest = (await c.query("SELECT id,observed_at,completeness,failures FROM ll_cloud_project_scans WHERE org_id=$1 AND connection_id=$2 ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1", [actor.orgId, id])).rows[0];
      if (!latest) return { scope, status: "no-scan" as const, records: [], enforcement: "unverified" as const };
      const rows = (await c.query("SELECT DISTINCT ON(o.resource,o.provider_version) o.*,s.observed_at FROM ll_cloud_project_observations o JOIN ll_cloud_project_scans s ON s.org_id=o.org_id AND s.connection_id=o.connection_id AND s.id=o.scan_id WHERE o.org_id=$1 AND o.connection_id=$2 ORDER BY o.resource,o.provider_version,s.observed_at DESC,s.recorded_at DESC,s.id DESC LIMIT 2001", [actor.orgId, id])).rows;
      const records = rows.slice(0, 2000).map(row => {
        const version = scope.provider === "azure-foundry" ? row.provider_version : null;
        const record: ProjectObservation = { scope: { ...scope }, resource: row.resource, version, identityKind: row.identity_kind, identityReference: row.identity_reference, observedAt: row.observed_at.toISOString(),
          gaps: [...(!row.identity_reference ? ["workload-principal-unresolved"] : []), ...(version === null ? ["execution-version-unresolved"] : []), "effective-permissions-unknown", "declared-tools-unknown"], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } };
        return { record, observedInCurrentScan: row.scan_id === latest.id, stale: Date.now() - row.observed_at.getTime() > 900_000 };
      });
      return { scope, status: "observed" as const, scanId: latest.id, observedAt: latest.observed_at.toISOString(), stale: Date.now() - latest.observed_at.getTime() > 900_000, completeness: latest.completeness as ProjectInventoryScan["completeness"], failures: latest.failures as ProjectInventoryScan["failures"], records, historyTruncated: rows.length > 2000, enforcement: "unverified" as const };
    });
  }
  async connections(actor: Actor) {
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const rows = (await c.query("SELECT id,account_id,region FROM ll_cloud_connections WHERE org_id=$1 ORDER BY created_at,id LIMIT 101", [actor.orgId])).rows;
      return { connections: rows.slice(0, 100).map(row => ({ scope: { tenantId: actor.orgId, connectionId: row.id, accountId: row.account_id, region: row.region }, status: "configured" as const })), truncated: rows.length > 100, scanningAvailable: false as const, enforcement: "unverified" as const };
    });
  }
  async beginScan(actor: Actor, connectionId: string) {
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const scope = await connection(c, actor.orgId, connectionId);
      const allowed = await throttle(c, `cloud-discovery:${actor.orgId}:${connectionId}`, 3, 60);
      // Return the decision so the throttle counter commits even on refusal.
      return { scope, allowed };
    });
  }
  async configureConnection(actor: Actor, scope: CloudDiscoveryScope) {
    // Validating an empty evidence shape reuses the collector's scope contract.
    const checked = canonicalScan({ scope, observedAt: new Date().toISOString(), completeness: "partial", records: [], failures: [] }).scope;
    if (checked.tenantId !== actor.orgId) throw new ControlError(403, "Discovery tenant differs.");
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const old = (await c.query("SELECT account_id,region FROM ll_cloud_connections WHERE org_id=$1 AND id=$2", [actor.orgId, checked.connectionId])).rows[0];
      if (old && (old.account_id !== checked.accountId || old.region !== checked.region)) throw new ControlError(409, "Discovery connection identity is immutable.");
      if (!old) await c.query("INSERT INTO ll_cloud_connections(org_id,id,account_id,region,created_by) VALUES($1,$2,$3,$4,$5)", [actor.orgId, checked.connectionId, checked.accountId, checked.region, actor.subject]);
      return { scope: checked, status: "configured" as const, authorityGranted: false as const };
    });
  }
  async recordScan(actor: Actor, scanId: string, input: RuntimeInventoryScan) {
    if (!uuid.test(scanId)) throw new ControlError(400, "Stable discovery scan identity required.");
    const scan = canonicalScan(input), observed = Date.parse(scan.observedAt);
    if (scan.scope.tenantId !== actor.orgId || observed > Date.now() + 300_000) throw new ControlError(400, "Discovery scope or observation time differs.");
    const hash = createHash("sha256").update(JSON.stringify(scan)).digest("hex");
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const scope = await connection(c, actor.orgId, scan.scope.connectionId);
      if (JSON.stringify(scope) !== JSON.stringify(scan.scope)) throw new ControlError(409, "Discovery connection scope differs.");
      const old = (await c.query("SELECT canonical_sha256 FROM ll_cloud_scans WHERE org_id=$1 AND connection_id=$2 AND id=$3", [actor.orgId, scope.connectionId, scanId])).rows[0];
      if (old) {
        if (old.canonical_sha256 !== hash) throw new ControlError(409, "Discovery scan replay changed evidence.");
        return { scanId, repeated: true, authorityGranted: false as const };
      }
      await c.query("INSERT INTO ll_cloud_scans(org_id,connection_id,id,observed_at,completeness,failures,canonical_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)", [actor.orgId, scope.connectionId, scanId, scan.observedAt, scan.completeness, scan.failures, hash]);
      for (const record of scan.records) await c.query("INSERT INTO ll_cloud_runtime_observations(org_id,connection_id,scan_id,resource_id,resource_arn,version,role_reference,workload_identity_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [actor.orgId, scope.connectionId, scanId, record.resourceId, record.resourceArn, record.version, record.roleReference, record.workloadIdentityReference]);
      return { scanId, repeated: false, authorityGranted: false as const };
    });
  }
  async latest(actor: Actor, connectionId: string) {
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      const scope = await connection(c, actor.orgId, connectionId);
      const latest = (await c.query("SELECT id,observed_at,completeness,failures FROM ll_cloud_scans WHERE org_id=$1 AND connection_id=$2 ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1", [actor.orgId, connectionId])).rows[0];
      if (!latest) return { scope, status: "no-scan" as const, records: [], enforcement: "unverified" as const };
      const rows = (await c.query("SELECT DISTINCT ON(o.resource_id,o.version) o.*,s.observed_at FROM ll_cloud_runtime_observations o JOIN ll_cloud_scans s ON s.org_id=o.org_id AND s.connection_id=o.connection_id AND s.id=o.scan_id WHERE o.org_id=$1 AND o.connection_id=$2 ORDER BY o.resource_id,o.version,s.observed_at DESC,s.recorded_at DESC,s.id DESC LIMIT 2001", [actor.orgId, connectionId])).rows;
      const records = rows.slice(0, 2000).map(row => {
        const record: DiscoveredRuntime = { scope: { ...scope }, source: "aws-agentcore-runtime", resourceId: row.resource_id, resourceArn: row.resource_arn, version: row.version, observedAt: row.observed_at.toISOString(), roleReference: row.role_reference, workloadIdentityReference: row.workload_identity_reference,
          gaps: [...(!row.role_reference || !row.workload_identity_reference ? ["runtime-identity-unavailable" as const] : []), "effective-permissions-unknown", "declared-tools-unknown"], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } };
        return { record, observedInCurrentScan: row.scan_id === latest.id, stale: Date.now() - row.observed_at.getTime() > 900_000 };
      });
      return { scope, status: "observed" as const, scanId: latest.id, observedAt: latest.observed_at.toISOString(), stale: Date.now() - latest.observed_at.getTime() > 900_000, completeness: latest.completeness as RuntimeInventoryScan["completeness"], failures: latest.failures as RuntimeInventoryScan["failures"], records, historyTruncated: rows.length > 2000, enforcement: "unverified" as const };
    });
  }
}
