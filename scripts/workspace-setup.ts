import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { Pool } from "pg";
import { passwordHash } from "../lib/workspace/auth";
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
    const sql = await readFile("lib/workspace/schema.sql", "utf8");
    const hash = digest(sql);
    const existing = (
      await c.query("SELECT digest FROM ll_migrations WHERE version=3")
    ).rows[0];
    if (existing && existing.digest !== hash)
      throw new Error("Migration 3 changed; add a new migration.");
    if (!existing) {
      await c.query(sql);
      await c.query("INSERT INTO ll_migrations(version,digest) VALUES(3,$1)", [
        hash,
      ]);
    }
    await mkdir(".local", { recursive: true, mode: 0o700 });
    let accounts: { email: string; name: string; password: string }[];
    try {
      await access(".local/workspace-accounts.json");
      accounts = JSON.parse(
        await readFile(".local/workspace-accounts.json", "utf8"),
      ).accounts;
    } catch {
      accounts = [
        {
          email: "raj.jsp@gmail.com",
          name: "Raj Nagulapalle",
          password: randomBytes(24).toString("base64url"),
        },
        {
          email: "pratibha.er@gmail.com",
          name: "Pratibha Sharma",
          password: randomBytes(24).toString("base64url"),
        },
      ];
      await writeFile(
        ".local/workspace-accounts.json",
        JSON.stringify({ accounts }, null, 2),
        { mode: 0o600, flag: "wx" },
      );
    }
    for (const a of accounts)
      await c.query(
        "INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,'local-proof',$2,$3) ON CONFLICT(email) DO NOTHING",
        [a.email, a.name, passwordHash(a.password)],
      );
    await c.query(
      "INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) SELECT org_id,id,CASE WHEN id='refund-agent' THEN 'Customer refunds agent' ELSE 'Discount agent' END,'raj.jsp@gmail.com',CASE WHEN id='refund-agent' THEN 'refund_agent' ELSE 'discount_agent' END,CASE WHEN id='refund-agent' THEN 'refund_twin' ELSE 'discount_record' END FROM ll_agents WHERE org_id='local-proof' ON CONFLICT DO NOTHING",
    );
    if (
      (await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'"))
        .rows[0]
    ) {
      await c.query("GRANT SELECT ON ll_members TO ll_runtime");
      await c.query("GRANT SELECT,INSERT,DELETE ON ll_sessions TO ll_runtime");
      await c.query(
        "GRANT SELECT,INSERT,UPDATE ON ll_access_attempts,ll_agent_profiles TO ll_runtime",
      );
      await c.query("GRANT INSERT ON ll_agents,ll_tokens TO ll_runtime");
      await c.query("GRANT SELECT,INSERT ON ll_sales_requests TO ll_runtime");
    }
    await c.query("COMMIT");
    console.log(
      "Workspace membership provisioned. Accounts saved privately; no passwords printed.",
    );
  } catch {
    await c.query("ROLLBACK");
    throw new Error(
      "Workspace provisioning failed. Check privileged connection and migration contract.",
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
