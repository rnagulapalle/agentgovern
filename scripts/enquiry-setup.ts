import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { digest } from "../lib/workspace/identity";
async function main() {
  const db = new Pool({ connectionString: process.env.LOOPLABS_MIGRATION_DATABASE_URL || process.env.LOOPLABS_DATABASE_URL });
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(68391204)");
    const sql = await readFile("lib/enquiries/schema.sql", "utf8");
    const hash = digest(sql);
    const old = (await c.query("SELECT digest FROM ll_migrations WHERE version=7")).rows[0];
    if (old && old.digest !== hash) throw new Error("Migration 7 changed after application.");
    if (!old) {
      await c.query(sql);
      await c.query("INSERT INTO ll_migrations(version,digest) VALUES(7,$1)", [hash]);
    }
    if ((await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")).rows[0]) {
      await c.query("GRANT SELECT,INSERT ON ll_enquiry_plans TO ll_runtime");
      await c.query("GRANT UPDATE(run_id) ON ll_enquiry_plans TO ll_runtime");
    }
    await c.query("COMMIT");
    console.log("Saved enquiry plans provisioned. No credentials printed.");
  } catch {
    await c.query("ROLLBACK");
    throw new Error("Enquiry setup failed. Check migration-owner access and existing connector migrations.");
  } finally { c.release(); await db.end(); }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
