import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { digest } from "../lib/workspace/identity";
async function main() {
  const url = process.env.LOOPLABS_MIGRATION_DATABASE_URL, org = process.env.LOOPLABS_WORKSPACE_ID;
  if (!url || !org || !/^[a-zA-Z0-9_-]{1,64}$/.test(org)) throw Error("Existing workspace and separate migration-owner connection required.");
  const db = new Pool({ connectionString: url }), c = await db.connect();
  try {
    await c.query("BEGIN"); await c.query("SELECT pg_advisory_xact_lock(68391204)");
    if (!(await c.query("SELECT 1 FROM ll_migrations WHERE version=8")).rows[0]) throw Error("Managed enquiry migration 8 is required first.");
    const sql = await readFile("lib/enquiries/temporal-schema.sql", "utf8");
    const old = (await c.query("SELECT digest FROM ll_migrations WHERE version=9")).rows[0];
    if (old && old.digest !== digest(sql)) throw Error("Applied migration 9 changed.");
    if (!old) { await c.query(sql); await c.query("INSERT INTO ll_migrations(version,digest) VALUES(9,$1)", [digest(sql)]); }
    if ((await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")).rows[0]) await c.query("GRANT SELECT,INSERT,UPDATE ON ll_temporal_dispatch TO ll_runtime");
    let token = process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN;
    const existing = (await c.query("SELECT hash FROM ll_tokens WHERE org_id=$1 AND subject='enquiry-temporal' AND role='worker' AND active=true", [org])).rows;
    if (existing.length) {
      if (!token || existing.length !== 1 || existing[0].hash !== digest(token)) throw Error("Supply existing Temporal workload credential; no silent rotation.");
    } else {
      token = randomBytes(32).toString("base64url");
      await c.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,'enquiry-temporal','worker')", [digest(token), org]);
    }
    await mkdir(".local", { recursive: true, mode: 0o700 });
    await writeFile(".local/temporal-worker.env", `LOOPLABS_TEMPORAL_WORKER_TOKEN=${token}\n`, { mode: 0o600 });
    await c.query("COMMIT"); console.log("Migration 9 and separate workload provisioned privately. No run transferred or production worker enabled.");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
