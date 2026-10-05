import { readFile, writeFile } from "node:fs/promises";
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
    const sql = await readFile("lib/back-office/schema.sql", "utf8"),
      hash = digest(sql);
    const old = (
      await c.query("SELECT digest FROM ll_migrations WHERE version=6")
    ).rows[0];
    if (old && old.digest !== hash) throw Error("Applied migration 6 changed.");
    if (!old) {
      await c.query(sql);
      await c.query("INSERT INTO ll_migrations(version,digest) VALUES(6,$1)", [
        hash,
      ]);
    }
    if (
      (await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'"))
        .rows[0]
    ) {
      await c.query(
        "GRANT SELECT,INSERT,UPDATE ON ll_backoffice_plans,ll_backoffice_cases TO ll_runtime",
      );
      await c.query(
        "GRANT SELECT,INSERT ON ll_backoffice_events TO ll_runtime",
      );
      await c.query(
        "GRANT USAGE,SELECT ON SEQUENCE ll_backoffice_events_id_seq TO ll_runtime",
      );
    }
    let token: string;
    try {
      token = JSON.parse(
        await readFile(".local/backoffice-twin-credentials.json", "utf8"),
      ).token;
    } catch {
      token = randomBytes(32).toString("base64url");
      await writeFile(
        ".local/backoffice-twin-credentials.json",
        JSON.stringify({ token }),
        { mode: 0o600, flag: "wx" },
      );
    }
    const env = await readFile(".env.local", "utf8");
    await writeFile(
      ".env.local",
      env
        .split("\n")
        .filter((l) => !/^LOOPLABS_BACKOFFICE_TWIN_(URL|TOKEN)=/.test(l))
        .join("\n") +
        `\nLOOPLABS_BACKOFFICE_TWIN_URL=http://127.0.0.1:8019\nLOOPLABS_BACKOFFICE_TWIN_TOKEN=${token}\n`,
      { mode: 0o600 },
    );
    await c.query("COMMIT");
    console.log("Back office provisioned; private credentials not printed.");
  } catch {
    await c.query("ROLLBACK");
    throw Error(
      "Back-office setup failed. Check migrations and private database access.",
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
