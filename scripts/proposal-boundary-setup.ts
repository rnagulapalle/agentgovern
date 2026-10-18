import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
async function main() {
  const url = process.env.LOOPLABS_MIGRATION_DATABASE_URL;
  if (!url) throw Error("Separate migration-owner connection required.");
  const db = new Pool({ connectionString: url }), c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(68391204)");
    const required = [[1,"lib/durable/schema.sql"],[2,"lib/refunds/schema.sql"],[3,"lib/workspace/schema.sql"],[4,"lib/connectors/schema.sql"],[5,"lib/workflows/schema.sql"],[7,"lib/enquiries/schema.sql"],[8,"lib/enquiries/managed-schema.sql"],[9,"lib/enquiries/temporal-schema.sql"]] as const;
    const versions = (await c.query("SELECT version,digest FROM ll_migrations")).rows;
    for (const [version,file] of required) {
      const applied = versions.find(r => r.version === version);
      if (!applied) throw Error("Apply workspace migrations through 9 first (6 is reserved; 10 is separate recovery enrollment).");
      if (applied.digest !== createHash("sha256").update(await readFile(file)).digest("hex")) throw Error(`Applied prerequisite migration ${version} changed.`);
    }
    const sql = await readFile("lib/durable/proposal-schema.sql", "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const previous = (await c.query("SELECT digest FROM ll_migrations WHERE version=11")).rows[0];
    if (previous && previous.digest !== hash) throw Error("Applied migration 11 changed.");
    if (!previous) {
      await c.query(sql);
      await c.query("INSERT INTO ll_migrations(version,digest) VALUES(11,$1)", [hash]);
    }
    await c.query("COMMIT");
    console.log("Migration 11 applied. Saved proposals preserved; no action approved or dispatched.");
  } catch (error) { await c.query("ROLLBACK"); throw error; }
  finally { c.release(); await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
