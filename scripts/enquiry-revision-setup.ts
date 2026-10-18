import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const role=process.env.LOOPLABS_MIGRATION_RUNTIME_ROLE||"ll_runtime";
  if(!/^[a-z_][a-z0-9_]{0,62}$/.test(role))throw new Error("Invalid explicit runtime role.");
  const url = process.env.LOOPLABS_MIGRATION_DATABASE_URL;
  if (!url) throw new Error("Separate migration-owner connection required.");
  const db = new Pool({ connectionString: url, connectionTimeoutMillis: 5000, query_timeout: 7000 }), client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(68391205)");
    const applied = (await client.query("SELECT version,digest FROM ll_migrations")).rows;
    for (const [version, file] of [[1, "lib/durable/schema.sql"], [2, "lib/refunds/schema.sql"], [3, "lib/workspace/schema.sql"], [4, "lib/connectors/schema.sql"], [5, "lib/workflows/schema.sql"], [7, "lib/enquiries/schema.sql"], [8, "lib/enquiries/managed-schema.sql"], [10, "lib/durable/recovery-schema.sql"], [11, "lib/durable/proposal-schema.sql"], [12, "lib/connectors/scope-schema.sql"], [19, "lib/quotes/schema.sql"], [20, "lib/quotes/authority-schema.sql"], [21, "lib/quotes/plan-v2-schema.sql"], [22, "lib/quotes/membership-schema.sql"], [23, "lib/workspace/membership-authority-schema.sql"], [9, "lib/enquiries/temporal-schema.sql"], [13, "lib/enquiries/record-routing-schema.sql"]] as const) {
      const old = applied.find(row => row.version === version);
      if (!old) throw new Error(`Apply prerequisite migration ${version} first.`);
      if (old.digest !== createHash("sha256").update(await readFile(file)).digest("hex")) throw new Error(`Applied prerequisite migration ${version} changed.`);
    }
    for (const table of ["ll_orgs", "ll_members", "ll_connector_actions", "ll_enquiry_plans", "ll_quote_member_generations", "ll_temporal_dispatch", "ll_temporal_record_routes"]) {
      if (!(await client.query("SELECT pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid=to_regclass($1)",[table])).rows[0]?.owned)
        throw new Error("Separate revision owner connection required.");
    }
    const sql = await readFile("lib/enquiries/revision-schema.sql", "utf8"), hash = createHash("sha256").update(sql).digest("hex");
    const old = applied.find(row => row.version === 24);
    if (old && old.digest !== hash) throw new Error("Applied migration 24 changed.");
    if (!old) { await client.query(sql); await client.query("INSERT INTO ll_migrations(version,digest) VALUES(24,$1)", [hash]); }
    // PostgreSQL row locks require UPDATE on at least one column. Released
    // migration22 rejects every email rename; this column-only permission allows
    // locking without granting active/org changes or membership-history writes.
    const runtime=(await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rows[0];
    if(!runtime && process.env.LOOPLABS_MIGRATION_RUNTIME_ROLE)throw new Error("Explicit runtime role is unavailable.");
    if(runtime){
      await client.query(`GRANT SELECT,INSERT ON ll_enquiry_revisions TO "${role}"`);
      await client.query(`GRANT UPDATE(email) ON ll_members TO "${role}"`);
    }
    await client.query("COMMIT");
    console.log("Migration 24 applied. Immutable plan revisions installed; no action approved or executed.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await db.end(); }
}
const safeDiagnostics = new Set([
  "Separate migration-owner connection required.", "Separate revision owner connection required.",
  "Applied migration 24 changed.", "Invalid explicit runtime role.", "Explicit runtime role is unavailable.",
  ...[1,2,3,4,5,7,8,9,10,11,12,13,19,20,21,22,23].flatMap(version => [`Apply prerequisite migration ${version} first.`, `Applied prerequisite migration ${version} changed.`]),
]);
main().catch(error => {
  const message = error instanceof Error && safeDiagnostics.has(error.message) ? error.message : "Plan revision setup failed; no change confirmed. Review private administrator diagnostics.";
  console.error(message); process.exitCode = 1;
});
