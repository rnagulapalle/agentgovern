import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
async function main() {
  const url = process.env.LOOPLABS_MIGRATION_DATABASE_URL;
  if (!url) throw new Error("Separate migration-owner connection required.");
  const db = new Pool({ connectionString: url }), c = await db.connect();
  try {
    await c.query("BEGIN"); await c.query("SELECT pg_advisory_xact_lock(68391204)");
    const applied = (await c.query("SELECT version,digest FROM ll_migrations")).rows;
    for (const [version, file] of [[1, "lib/durable/schema.sql"], [3, "lib/workspace/schema.sql"], [10, "lib/durable/recovery-schema.sql"]] as const) {
      const old = applied.find(r => r.version === version);
      if (!old) throw new Error(`Apply prerequisite migration ${version} first.`);
      if (old.digest !== createHash("sha256").update(await readFile(file)).digest("hex")) throw new Error(`Applied prerequisite migration ${version} changed.`);
    }
    if (!(await c.query("SELECT pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid=to_regclass('ll_orgs')")).rows[0]?.owned)
      throw new Error("Separate inventory-owner connection required.");
    const sql = await readFile("lib/workspace/cloud-inventory-schema.sql", "utf8"), hash = createHash("sha256").update(sql).digest("hex"), old = applied.find(r => r.version === 16);
    if (old && old.digest !== hash) throw new Error("Applied migration 16 changed.");
    if (!old) { await c.query(sql); await c.query("INSERT INTO ll_migrations(version,digest) VALUES(16,$1)", [hash]); }
    if ((await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")).rows[0]) {
      await c.query("REVOKE ALL ON ll_cloud_connections,ll_cloud_scans,ll_cloud_runtime_observations FROM ll_runtime");
      await c.query("GRANT SELECT,INSERT ON ll_cloud_connections,ll_cloud_scans,ll_cloud_runtime_observations TO ll_runtime");
    }
    await c.query("COMMIT"); console.log("Migration 16 applied. Discovery evidence only; no cloud called, agent enrolled or execution authority granted.");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
