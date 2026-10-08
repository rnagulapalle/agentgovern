import type { Pool, PoolClient } from "pg";
import { ControlError } from "./contracts";
import { transaction } from "./database";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function recoveryFence(db: Pool | PoolClient, org: string, epoch = process.env.LOOPLABS_RECOVERY_EPOCH) {
  // Existing deployments remain compatible until explicitly enrolled. An empty
  // or malformed configured value is never treated as disabled.
  if (epoch === undefined) return;
  if (!uuid.test(epoch)) throw new ControlError(503, "Workspace recovery configuration requires administrator attention.");
  const present = (await db.query("SELECT to_regclass('ll_workspace_recovery') AS present")).rows[0]?.present;
  if (!present || (await db.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id=$1", [org])).rows[0]?.epoch !== epoch.toLowerCase())
    throw new ControlError(503, "Workspace recovery is contained. Contact your administrator.");
}
// Offline migration-owner operation. Never exposed to the app API or runtime
// role. Stop writers and rotate deployment epochs BEFORE restoring an archive.
export async function quarantineRestore(db: Pool, org: string, epoch: string, backupHash: string) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(org) || !uuid.test(epoch) || !/^[0-9a-f]{64}$/.test(backupHash)) throw new ControlError(400, "Valid workspace, new recovery epoch and verified archive hash required.");
  epoch = epoch.toLowerCase();
  return transaction(db, org, async c => {
    if ((await c.query("SELECT current_user AS role")).rows[0].role === "ll_runtime") throw new ControlError(403, "Separate migration-owner connection required.");
    if (!(await c.query("SELECT 1 FROM ll_orgs WHERE id=$1", [org])).rows[0]) throw new ControlError(404, "Workspace not found.");
    const old = (await c.query("SELECT backup_hash,counts FROM ll_workspace_recovery_events WHERE org_id=$1 AND epoch=$2", [org, epoch])).rows[0];
    if (old) {
      if (old.backup_hash !== backupHash) throw new ControlError(409, "Recovery epoch already belongs to another archive.");
      return old.counts;
    }
    const current = (await c.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id=$1", [org])).rows[0];
    if (!current || current.epoch === epoch) throw new ControlError(409, "A different provisioned recovery epoch is required.");
    const counts: Record<string, number> = {};
    counts.tokens = (await c.query("UPDATE ll_tokens SET active=false WHERE org_id=$1 AND active=true", [org])).rowCount || 0;
    counts.sessions = (await c.query("DELETE FROM ll_sessions s USING ll_members m WHERE s.email=m.email AND m.org_id=$1", [org])).rowCount || 0;
    counts.members = (await c.query("UPDATE ll_members SET active=false WHERE org_id=$1 AND active=true", [org])).rowCount || 0;
    counts.agents = (await c.query("UPDATE ll_agents SET active=false WHERE org_id=$1 AND active=true", [org])).rowCount || 0;
    await c.query("UPDATE ll_orgs SET policy_version=policy_version+1 WHERE id=$1", [org]);
    await c.query("UPDATE ll_connector_policies SET active=false,version=version+1 WHERE org_id=$1", [org]);
    counts.runs = (await c.query("UPDATE ll_workflow_runs SET state='paused' WHERE org_id=$1 AND state='active'", [org])).rowCount || 0;
    // Even a held action in an old archive may have taken effect after backup.
    // Keep IDs, budgets and payloads; erase authority, not evidence.
    for (const [table, events] of [["ll_actions", "ll_events"], ["ll_connector_actions", "ll_connector_events"], ["ll_refund_actions", "ll_refund_events"]]) {
      const present = (await c.query("SELECT to_regclass($1) AS present", [table])).rows[0].present;
      if (!present) continue;
      const changed = await c.query(`WITH changed AS (UPDATE ${table} SET state=CASE WHEN state IN ('succeeded','recovered') THEN state ELSE 'uncertain' END,reason='Restored state: verify provider effects; previous approval is invalid.',approved_by=NULL,approval_until=NULL,lease_token=NULL,lease_until=NULL WHERE org_id=$1 RETURNING id) INSERT INTO ${events}(org_id,action_id,kind,subject) SELECT $1,id,'restore_quarantine','recovery-administrator' FROM changed`, [org]);
      counts[table] = changed.rowCount || 0;
    }
    await c.query("UPDATE ll_workspace_recovery SET epoch=$2 WHERE org_id=$1", [org, epoch]);
    await c.query("INSERT INTO ll_workspace_recovery_events(org_id,epoch,backup_hash,counts) VALUES($1,$2,$3,$4)", [org, epoch, backupHash, counts]);
    return counts;
  });
}
