import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const url = process.env.LOOPLABS_MIGRATION_DATABASE_URL;
  if (!url) throw new Error("Separate migration-owner connection required.");
  const db = new Pool({ connectionString: url }), client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(68391205)");
    const applied = (await client.query("SELECT version,digest FROM ll_migrations")).rows;
    for (const [version, file] of [[1, "lib/durable/schema.sql"], [3, "lib/workspace/schema.sql"], [10, "lib/durable/recovery-schema.sql"]] as const) {
      const old = applied.find(row => row.version === version);
      if (!old) throw new Error(`Apply prerequisite migration ${version} first.`);
      if (old.digest !== createHash("sha256").update(await readFile(file)).digest("hex")) throw new Error(`Applied prerequisite migration ${version} changed.`);
    }
    if (!(await client.query("SELECT pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid=to_regclass('ll_orgs')")).rows[0]?.owned)
      throw new Error("Separate quote-plan owner connection required.");
    const sql = await readFile("lib/quotes/schema.sql", "utf8"), hash = createHash("sha256").update(sql).digest("hex");
    const old = applied.find(row => row.version === 19);
    if (old && old.digest !== hash) throw new Error("Applied migration 19 changed.");
    if (!old) { await client.query(sql); await client.query("INSERT INTO ll_migrations(version,digest) VALUES(19,$1)", [hash]); }
    if ((await client.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")).rows[0]) {
      await client.query("REVOKE ALL ON ll_quote_plans FROM ll_runtime");
      await client.query("GRANT SELECT,INSERT ON ll_quote_plans TO ll_runtime");
    }
    await client.query("COMMIT");
    console.log("Migration 19 applied. Immutable quote proposals only; no connector called or execution authority granted.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
