import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { digest } from "../lib/workspace/identity";
import { quarantineRestore } from "../lib/durable/recovery";
async function main() {
  const url = process.env.LOOPLABS_MIGRATION_DATABASE_URL, org = process.env.LOOPLABS_WORKSPACE_ID, epoch = process.env.LOOPLABS_RECOVERY_EPOCH;
  if (!url || !org || !epoch || !/^[a-zA-Z0-9_-]{1,64}$/.test(org) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(epoch)) throw Error("Separate migration-owner connection, workspace and v4 recovery epoch required.");
  const db = new Pool({ connectionString: url });
  try {
    if (process.argv[2] === "enroll") {
      const c = await db.connect();
      try {
        await c.query("BEGIN"); await c.query("SELECT pg_advisory_xact_lock(68391204)");
        if (!(await c.query("SELECT 1 FROM ll_migrations WHERE version=9")).rows[0]) throw Error("Temporal migration 9 required first.");
        const sql = await readFile("lib/durable/recovery-schema.sql", "utf8"), hash = digest(sql);
        const old = (await c.query("SELECT digest FROM ll_migrations WHERE version=10")).rows[0];
        if (old && old.digest !== hash) throw Error("Applied migration 10 changed.");
        if (!old) { await c.query(sql); await c.query("INSERT INTO ll_migrations(version,digest) VALUES(10,$1)", [hash]); }
        await c.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES($1,$2) ON CONFLICT DO NOTHING", [org, epoch]);
        if ((await c.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id=$1", [org])).rows[0]?.epoch !== epoch.toLowerCase()) throw Error("Existing recovery fence differs; enrollment cannot rotate or release it.");
        if ((await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")).rows[0]) {
          await c.query("REVOKE ALL ON ll_workspace_recovery,ll_workspace_recovery_events FROM ll_runtime");
          await c.query("GRANT SELECT ON ll_workspace_recovery,ll_workspace_recovery_events TO ll_runtime");
        }
        await c.query("COMMIT");
        console.log("Recovery fence enrolled. Configure the same epoch separately in every web and worker deployment; no credentials printed.");
      } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
    } else if (process.argv[2] === "quarantine" && process.env.LOOPLABS_RESTORE_ACK === "WRITERS_STOPPED_AND_EPOCH_ROTATED" && process.env.LOOPLABS_RESTORE_ARCHIVE) {
      const backupHash = createHash("sha256").update(await readFile(process.env.LOOPLABS_RESTORE_ARCHIVE)).digest("hex");
      console.log("Restore quarantined:", await quarantineRestore(db, org, epoch, backupHash));
    } else throw Error("Choose enroll, or quarantine with verified archive path and explicit stopped-writer/rotated-epoch acknowledgement.");
  } finally { await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
