import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { digest } from "../lib/workspace/identity";
async function main() {
  if (!process.env.LOOPLABS_MIGRATION_DATABASE_URL) throw Error("A separate migration-owner connection is required.");
  const db = new Pool({ connectionString: process.env.LOOPLABS_MIGRATION_DATABASE_URL });
  const c = await db.connect();
  try {
    const sql = await readFile("lib/enquiries/managed-schema.sql", "utf8");
    await c.query("BEGIN"); await c.query("SELECT pg_advisory_xact_lock(68391204)");
    const old = (await c.query("SELECT digest FROM ll_migrations WHERE version=8")).rows[0];
    if (old && old.digest !== digest(sql)) throw Error("Applied migration 8 changed.");
    if (!old) { await c.query(sql); await c.query("INSERT INTO ll_migrations(version,digest) VALUES(8,$1)", [digest(sql)]); }
    if ((await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")).rows[0]) {
      await c.query("GRANT SELECT,INSERT ON ll_enquiry_dispatch TO ll_runtime");
      await c.query("GRANT SELECT,INSERT,UPDATE ON ll_enquiry_worker_status TO ll_runtime");
    }
    const org = process.env.LOOPLABS_WORKSPACE_ID;
    if (!org || !/^[a-zA-Z0-9_-]{1,64}$/.test(org)) throw Error("Configure the existing workspace ID.");
    let token = process.env.LOOPLABS_ENQUIRY_WORKER_TOKEN;
    const existing = (await c.query("SELECT hash FROM ll_tokens WHERE org_id=$1 AND subject='enquiry-runner' AND role='worker' AND active=true", [org])).rows;
    if (existing.length) {
      if (!token || existing.length !== 1 || existing[0].hash !== digest(token)) throw Error("Existing worker credential must be supplied; no silent rotation.");
    } else {
      token = randomBytes(32).toString("base64url");
      await c.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,'enquiry-runner','worker')", [digest(token), org]);
    }
    await mkdir(".local", { recursive: true, mode: 0o700 });
    await writeFile(".local/enquiry-worker.env", `LOOPLABS_ENQUIRY_WORKER_TOKEN=${token}\n`, { mode: 0o600 });
    await c.query("COMMIT"); console.log("Migration 8 and worker provisioned. Credential saved privately; no value printed.");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
