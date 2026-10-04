import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { Pool } from "pg";
import { tokenHash } from "../lib/durable/service";
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
    const sql = await readFile("lib/refunds/schema.sql", "utf8");
    const digest = tokenHash(sql);
    const old = (
      await c.query("SELECT digest FROM ll_migrations WHERE version=2")
    ).rows[0];
    if (old && old.digest !== digest)
      throw new Error("Migration 2 changed; use a new migration.");
    if (!old) {
      await c.query(sql);
      await c.query("INSERT INTO ll_migrations(version,digest) VALUES(2,$1)", [
        digest,
      ]);
    }
    await c.query(
      "INSERT INTO ll_refund_policies(org_id) VALUES('local-proof') ON CONFLICT DO NOTHING",
    );
    await c.query(
      "INSERT INTO ll_agents(org_id,id,tools) VALUES('local-proof','refund-agent',ARRAY['stripe.refund']) ON CONFLICT DO NOTHING",
    );
    await mkdir(".local", { recursive: true, mode: 0o700 });
    try {
      await access(".local/refund-agent.json");
    } catch {
      const token = randomBytes(32).toString("base64url");
      await c.query(
        "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','refund-agent','agent')",
        [tokenHash(token)],
      );
      await writeFile(
        ".local/refund-agent.json",
        JSON.stringify({ agentId: "refund-agent", token }, null, 2),
        { mode: 0o600, flag: "wx" },
      );
    }
    const role = (
      await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")
    ).rowCount;
    if (role) {
      await c.query(
        "GRANT SELECT,INSERT,UPDATE ON ll_refund_actions,ll_refund_policies TO ll_runtime",
      );
      await c.query("GRANT SELECT,INSERT ON ll_refund_events TO ll_runtime");
      await c.query(
        "GRANT USAGE,SELECT ON SEQUENCE ll_refund_events_id_seq TO ll_runtime",
      );
    }
    await c.query("COMMIT");
    try {
      await access(".local/refund-twin-credentials.json");
    } catch {
      await writeFile(
        ".local/refund-twin-credentials.json",
        JSON.stringify({
          token: `sk_test_${randomBytes(32).toString("base64url")}`,
        }),
        { mode: 0o600, flag: "wx" },
      );
    }
    const { token } = JSON.parse(
      await readFile(".local/refund-twin-credentials.json", "utf8"),
    );
    const env = await readFile(".env.local", "utf8");
    await writeFile(
      ".env.local",
      env
        .split("\n")
        .filter((l) => !/^LOOPLABS_REFUND_TWIN_(URL|TOKEN)=/.test(l))
        .join("\n") +
        `\nLOOPLABS_REFUND_TWIN_URL=http://127.0.0.1:8017\nLOOPLABS_REFUND_TWIN_TOKEN=${token}\n`,
      { mode: 0o600 },
    );
    console.log(
      "Refund workspace provisioned. Private twin and scoped agent credentials saved; no secrets printed.",
    );
  } catch {
    await c.query("ROLLBACK");
    throw new Error(
      "Refund setup failed; check migration and private database configuration.",
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
