import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const url = process.env.LOOPLABS_MIGRATION_DATABASE_URL;
  if (!url) throw new Error("Separate migration-owner connection required.");
  const db = new Pool({ connectionString: url, connectionTimeoutMillis: 5000, query_timeout: 7000 }), client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(68391205)");
    const applied = (await client.query("SELECT version,digest FROM ll_migrations")).rows;
    for (const [version, file] of [[1, "lib/durable/schema.sql"], [3, "lib/workspace/schema.sql"], [10, "lib/durable/recovery-schema.sql"], [12, "lib/connectors/scope-schema.sql"], [19, "lib/quotes/schema.sql"], [20, "lib/quotes/authority-schema.sql"], [21, "lib/quotes/plan-v2-schema.sql"]] as const) {
      const old = applied.find(row => row.version === version);
      if (!old) throw new Error(`Apply prerequisite migration ${version} first.`);
      if (old.digest !== createHash("sha256").update(await readFile(file)).digest("hex")) throw new Error(`Applied prerequisite migration ${version} changed.`);
    }
    if (!(await client.query("SELECT pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid=to_regclass('ll_orgs')")).rows[0]?.owned)
      throw new Error("Separate quote-membership owner connection required.");
    const sql = await readFile("lib/quotes/membership-schema.sql", "utf8"), hash = createHash("sha256").update(sql).digest("hex");
    const old = applied.find(row => row.version === 22);
    if (old && old.digest !== hash) throw new Error("Applied migration 22 changed.");
    if (!old) { await client.query(sql); await client.query("INSERT INTO ll_migrations(version,digest) VALUES(22,$1)", [hash]); }
    if ((await client.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")).rows[0]) {
      await client.query("REVOKE ALL ON ll_quote_plans FROM ll_runtime");
      await client.query("GRANT SELECT,INSERT ON ll_quote_plans TO ll_runtime");
      await client.query("REVOKE ALL ON ll_quote_member_generations FROM ll_runtime");
      await client.query("GRANT SELECT ON ll_quote_member_generations TO ll_runtime");
    }
    await client.query("COMMIT");
    console.log("Migration 22 applied. Saved quote membership history only; no execution authorized.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await db.end(); }
}
const safeDiagnostics = new Set([
  "Separate migration-owner connection required.", "Separate quote-membership owner connection required.",
  "Applied migration 22 changed.",
  ...[1,3,10,12,19,20,21].flatMap(version => [`Apply prerequisite migration ${version} first.`, `Applied prerequisite migration ${version} changed.`]),
]);
main().catch(error => {
  const message = error instanceof Error && safeDiagnostics.has(error.message) ? error.message : "Quote membership setup failed; no change confirmed. Review private administrator diagnostics.";
  console.error(message); process.exitCode = 1;
});
