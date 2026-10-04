import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { readFile, writeFile } from "node:fs/promises";
async function main() {
  const migrationUrl =
    process.env.LOOPLABS_MIGRATION_DATABASE_URL ||
    process.env.LOOPLABS_DATABASE_URL;
  if (!migrationUrl)
    throw new Error("Configure a privileged provisioning connection.");
  const db = new Pool({ connectionString: migrationUrl });
  const c = await db.connect();
  try {
    const existing = (
      await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")
    ).rows[0];
    if (existing) {
      console.log(
        "Runtime role already exists; no credential rotation performed.",
      );
      return;
    }
    const password = randomBytes(32).toString("base64url");
    await c.query("BEGIN");
    // Role name is fixed; generated password contains only base64url characters.
    await c.query(`CREATE ROLE ll_runtime LOGIN PASSWORD '${password}'`);
    await c.query("GRANT USAGE ON SCHEMA public TO ll_runtime");
    await c.query(
      "GRANT SELECT,UPDATE ON ll_orgs,ll_agents,ll_records TO ll_runtime",
    );
    await c.query(
      "GRANT SELECT,INSERT,UPDATE ON ll_actions,ll_effects TO ll_runtime",
    );
    await c.query("GRANT SELECT ON ll_tokens TO ll_runtime");
    await c.query("GRANT SELECT,INSERT ON ll_events TO ll_runtime");
    await c.query(
      "GRANT USAGE,SELECT ON SEQUENCE ll_events_id_seq TO ll_runtime",
    );
    const runtimeUrl = new URL(migrationUrl);
    runtimeUrl.username = "ll_runtime";
    runtimeUrl.password = password;
    const old = await readFile(".env.local", "utf8");
    const lines = old
      .split("\n")
      .filter(
        (line) =>
          !line.startsWith("LOOPLABS_DATABASE_URL=") &&
          !line.startsWith("LOOPLABS_MIGRATION_DATABASE_URL="),
      );
    await writeFile(
      ".env.local",
      lines.join("\n") +
        `\nLOOPLABS_MIGRATION_DATABASE_URL=${migrationUrl}\nLOOPLABS_DATABASE_URL=${runtimeUrl.href}\n`,
      { mode: 0o600 },
    );
    await c.query("COMMIT");
    console.log(
      "Least-privilege runtime role configured. Migration credentials remain separate; no credentials printed.",
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
    "Runtime role provisioning failed. Use the dedicated database owner connection.",
  );
  process.exitCode = 1;
});
