import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { tokenHash } from "../lib/durable/service";

async function main() {
  const url =
    process.env.LOOPLABS_MIGRATION_DATABASE_URL ||
    process.env.LOOPLABS_DATABASE_URL;
  if (!url)
    throw new Error(
      "Set LOOPLABS_DATABASE_URL to a dedicated database before setup.",
    );
  const db = new Pool({ connectionString: url });
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(68391204)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS ll_migrations(version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const schema = await readFile("lib/durable/schema.sql", "utf8");
    const digest = tokenHash(schema);
    const existing = (
      await c.query("SELECT digest FROM ll_migrations WHERE version=1")
    ).rows[0];
    if (existing && existing.digest !== digest)
      throw new Error(
        "Migration 1 changed after application. Create a new migration instead.",
      );
    if (!existing) {
      await c.query(schema);
      await c.query("INSERT INTO ll_migrations(version,digest) VALUES(1,$1)", [
        digest,
      ]);
    }
    await c.query("COMMIT");
    await mkdir(".local", { recursive: true, mode: 0o700 });
    const credentialFile = ".local/durable-credentials.json";
    try {
      await access(credentialFile);
      console.log("Schema verified. Existing credentials preserved.");
      return;
    } catch {
      /* First provision. */
    }
    const orgId = "local-proof";
    const credentials = {
      operator: randomBytes(32).toString("base64url"),
      agent: randomBytes(32).toString("base64url"),
      worker: randomBytes(32).toString("base64url"),
    };
    await c.query("BEGIN");
    await c.query("INSERT INTO ll_orgs(id) VALUES($1) ON CONFLICT DO NOTHING", [
      orgId,
    ]);
    await c.query(
      "INSERT INTO ll_records(org_id) VALUES($1) ON CONFLICT DO NOTHING",
      [orgId],
    );
    await c.query(
      "INSERT INTO ll_agents(org_id,id) VALUES($1,'proof-agent') ON CONFLICT DO NOTHING",
      [orgId],
    );
    for (const [role, token] of Object.entries(credentials)) {
      await c.query(
        "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,$4)",
        [
          tokenHash(token),
          orgId,
          role === "agent" ? "proof-agent" : `local-${role}`,
          role,
        ],
      );
    }
    // Write credentials before commit so failed filesystem operations roll back grants.
    await writeFile(credentialFile, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    await c.query("COMMIT");
    console.log(
      "Durable proof workspace provisioned. Credentials saved privately in .local/durable-credentials.json; none printed.",
    );
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Durable setup failed. Check the dedicated database connection and migration history; credentials were not printed.",
  );
  process.exitCode = 1;
});
