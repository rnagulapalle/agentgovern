import type { Pool, PoolClient } from "pg";
import type { Actor } from "../durable/contracts";
import { ControlError } from "../durable/contracts";
import { transaction } from "../durable/database";
import { memberAuthority } from "./identity";

export interface CloudOwnerReview {
  id: string;
  provider: "aws-agentcore-runtime" | "azure-foundry" | "google-agent-engine";
  connectionId: string;
  scanId: string;
  resource: string;
  version: string | null;
  owner: string;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function parseCloudOwnerReview(value: unknown): CloudOwnerReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ControlError(400, "Exact cloud observation and invited owner required.");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== "connectionId,id,owner,provider,resource,scanId,version"
    || typeof v.id !== "string" || !uuid.test(v.id) || typeof v.scanId !== "string" || !uuid.test(v.scanId)
    || !["aws-agentcore-runtime", "azure-foundry", "google-agent-engine"].includes(v.provider as string)
    || typeof v.connectionId !== "string" || !(v.provider === "aws-agentcore-runtime" ? /^[a-zA-Z0-9_-]{1,64}$/ : /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/).test(v.connectionId)
    || typeof v.resource !== "string" || !v.resource || v.resource.length > 1024
    || (v.provider === "google-agent-engine" ? v.version !== null : typeof v.version !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(v.version))
    || typeof v.owner !== "string" || v.owner.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(v.owner))
    throw new ControlError(400, "Exact cloud observation and invited owner required.");
  return { ...v, owner: v.owner.toLowerCase() } as unknown as CloudOwnerReview;
}
async function authority(c: PoolClient, actor: Actor) {
  if (!await memberAuthority(c, actor)) throw new ControlError(403, "Current invited member required for owner review.");
}
async function evidence(c: PoolClient, org: string, p: CloudOwnerReview) {
  const aws = p.provider === "aws-agentcore-runtime";
  const scans = aws ? "ll_cloud_scans" : "ll_cloud_project_scans";
  const observations = aws ? "ll_cloud_runtime_observations" : "ll_cloud_project_observations";
  const resource = aws ? "resource_arn" : "resource", version = aws ? "version" : "provider_version";
  const latest = (await c.query(`SELECT s.id,s.canonical_sha256,s.observed_at FROM ${scans} s ${aws ? "" : "JOIN ll_cloud_project_connections c ON c.org_id=s.org_id AND c.id=s.connection_id AND c.provider=$3"} WHERE s.org_id=$1 AND s.connection_id=$2 ORDER BY s.observed_at DESC,s.recorded_at DESC,s.id DESC LIMIT 1`, aws ? [org, p.connectionId] : [org, p.connectionId, p.provider])).rows[0];
  const present = Boolean((await c.query(`SELECT 1 FROM ${observations} WHERE org_id=$1 AND connection_id=$2 AND scan_id=$3 AND ${resource}=$4 AND ${version}=$5`, [org, p.connectionId, p.scanId, p.resource, p.version ?? ""])).rows[0]);
  return { latest, current: Boolean(latest && latest.id === p.scanId && present && Date.now()-latest.observed_at.getTime() <= 900_000 && latest.observed_at.getTime()-Date.now() <= 300_000) };
}
async function available(c: PoolClient) {
  if (!(await c.query("SELECT to_regclass('ll_cloud_owner_reviews') AS present")).rows[0].present) throw new ControlError(503, "Owner review is not enabled in this workspace. Ask your administrator to enable it.");
}
export class CloudOwnerReviewStore {
  constructor(private readonly db: Pool) {}
  async owners(actor: Actor) {
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      await available(c);
      const rows = (await c.query("SELECT email,name FROM ll_members WHERE org_id=$1 AND active=true ORDER BY name,email LIMIT 101", [actor.orgId])).rows;
      return { owners: rows.slice(0,100) as {email:string;name:string}[], truncated: rows.length>100 };
    });
  }
  async review(actor: Actor, input: unknown) {
    const p = parseCloudOwnerReview(input);
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      await available(c);
      const { latest, current } = await evidence(c, actor.orgId, p);
      if (!current) throw new ControlError(409, "Refresh and review the current cloud observation first.");
      if (!(await c.query("SELECT 1 FROM ll_members WHERE org_id=$1 AND email=$2 AND active=true", [actor.orgId, p.owner])).rows[0]) throw new ControlError(400, "Choose an active invited workspace owner.");
      const values = [actor.orgId,p.id,p.provider,p.connectionId,p.scanId,latest.canonical_sha256,p.resource,p.version ?? "",p.owner,actor.subject];
      const old = (await c.query("SELECT provider,connection_id,scan_id,scan_sha256,resource,provider_version,owner_email,reviewed_by FROM ll_cloud_owner_reviews WHERE org_id=$1 AND id=$2", [actor.orgId,p.id])).rows[0];
      if (old && JSON.stringify(Object.values(old)) !== JSON.stringify(values.slice(2))) throw new ControlError(409, "Owner review replay changed the reviewed decision.");
      if (!old) await c.query("INSERT INTO ll_cloud_owner_reviews(org_id,id,provider,connection_id,scan_id,scan_sha256,resource,provider_version,owner_email,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", values);
      return { reviewId: p.id, repeated: Boolean(old), owner: p.owner, scanId: p.scanId, authorityGranted: false as const };
    });
  }
  async status(actor: Actor, input: unknown) {
    const p = parseCloudOwnerReview(input);
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor);
      await available(c);
      const { current } = await evidence(c, actor.orgId, p);
      const row = (await c.query("SELECT r.id,r.scan_id,r.owner_email,r.reviewed_by,m.active AND m.org_id=r.org_id AS owner_active FROM ll_cloud_owner_reviews r JOIN ll_members m ON m.email=r.owner_email WHERE r.org_id=$1 AND r.provider=$2 AND r.connection_id=$3 AND r.resource=$4 AND r.provider_version=$5 ORDER BY r.recorded_at DESC,r.id DESC LIMIT 1", [actor.orgId,p.provider,p.connectionId,p.resource,p.version ?? ""])).rows[0];
      return { ownership: !row ? "unmapped" : current && row.scan_id === p.scanId && row.owner_active ? "reviewed" : "needs-review", reviewId: row?.id ?? null, owner: row?.owner_email ?? null, reviewedBy: row?.reviewed_by ?? null, authorityGranted: false as const, workloadIdentity: "unverified" as const, enforcement: "unverified" as const };
    });
  }
}
