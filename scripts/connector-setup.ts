import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { digest } from "../lib/workspace/identity";
async function main() {
  const db = new Pool({
    connectionString:
      process.env.LOOPLABS_MIGRATION_DATABASE_URL ||
      process.env.LOOPLABS_DATABASE_URL,
  });
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(68391204)");
    const sql = await readFile("lib/connectors/schema.sql", "utf8"),
      hash = digest(sql);
    const old = (
      await c.query("SELECT digest FROM ll_migrations WHERE version=4")
    ).rows[0];
    if (old && old.digest !== hash)
      throw new Error("Migration 4 changed after application.");
    if (!old) {
      await c.query(sql);
      await c.query("INSERT INTO ll_migrations(version,digest) VALUES(4,$1)", [
        hash,
      ]);
    }
    const workflowSql = await readFile("lib/workflows/schema.sql", "utf8");
    const workflowHash = digest(workflowSql);
    const migration5 = (
      await c.query("SELECT digest FROM ll_migrations WHERE version=5")
    ).rows[0];
    if (migration5 && migration5.digest !== workflowHash)
      throw new Error("Migration 5 changed after application.");
    if (!migration5) {
      await c.query(workflowSql);
      await c.query("INSERT INTO ll_migrations(version,digest) VALUES(5,$1)", [
        workflowHash,
      ]);
    }
    await c.query(
      "INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email') ON CONFLICT DO NOTHING",
    );
    if (
      (await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'"))
        .rows[0]
    ) {
      await c.query(
        "GRANT SELECT,INSERT,UPDATE ON ll_connector_policies,ll_connector_actions TO ll_runtime",
      );
      await c.query(
        "GRANT SELECT,INSERT ON ll_connector_events,ll_workflow_events TO ll_runtime",
      );
      await c.query(
        "GRANT SELECT,INSERT,UPDATE ON ll_workflow_runs TO ll_runtime",
      );
      await c.query("GRANT SELECT,INSERT ON ll_workflow_steps,ll_workflow_agents TO ll_runtime");
      await c.query(
        "GRANT USAGE,SELECT ON SEQUENCE ll_workflow_events_id_seq TO ll_runtime",
      );
      await c.query(
        "GRANT USAGE,SELECT ON SEQUENCE ll_connector_events_id_seq TO ll_runtime",
      );
    }
    await mkdir(".local", { recursive: true, mode: 0o700 });
    try {
      await access(".local/connector-twin-credentials.json");
    } catch {
      await writeFile(
        ".local/connector-twin-credentials.json",
        JSON.stringify({ token: randomBytes(32).toString("base64url") }),
        { mode: 0o600, flag: "wx" },
      );
    }
    const { token } = JSON.parse(
      await readFile(".local/connector-twin-credentials.json", "utf8"),
    );
    const env = await readFile(".env.local", "utf8");
    await writeFile(
      ".env.local",
      env
        .split("\n")
        .filter((l) => !/^LOOPLABS_CONNECTOR_TWIN_(URL|TOKEN)=/.test(l))
        .join("\n") +
        `\nLOOPLABS_CONNECTOR_TWIN_URL=http://127.0.0.1:8018\nLOOPLABS_CONNECTOR_TWIN_TOKEN=${token}\n`,
      { mode: 0o600 },
    );
    await c.query("COMMIT");
    console.log(
      "Sample connectors provisioned. Private credentials preserved and not printed.",
    );
  } catch {
    await c.query("ROLLBACK");
    throw new Error(
      "Connector setup failed; inspect migration and privileged database access.",
    );
  } finally {
    c.release();
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
