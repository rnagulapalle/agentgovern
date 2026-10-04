// Privileged provisioning command. Database credentials remain server-side.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { transaction } from "../lib/durable/database";
import { tokenHash } from "../lib/durable/service";
async function main() {
  const id = process.argv[2];
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id))
    throw new Error("Supply an agent ID.");
  const url =
    process.env.LOOPLABS_MIGRATION_DATABASE_URL ||
    process.env.LOOPLABS_DATABASE_URL;
  if (!url) throw new Error("Configure the database.");
  const db = new Pool({ connectionString: url });
  const token = randomBytes(32).toString("base64url");
  try {
    await mkdir(".local", { recursive: true, mode: 0o700 });
    await transaction(db, "local-proof", async (c) => {
      const org = (
        await c.query("SELECT 1 FROM ll_orgs WHERE id='local-proof'")
      ).rows[0];
      if (!org) throw new Error("Provision the workspace first.");
      await c.query(
        "INSERT INTO ll_agents(org_id,id) VALUES('local-proof',$1)",
        [id],
      );
      await c.query(
        "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,'agent')",
        [tokenHash(token), id],
      );
      await c.query(
        "INSERT INTO ll_events(org_id,kind,subject) VALUES('local-proof','agent_registered','provisioning-command')",
      );
      await writeFile(
        `.local/agent-${id}.json`,
        JSON.stringify({ agentId: id, token }, null, 2),
        { mode: 0o600, flag: "wx" },
      );
    });
    console.log(
      "Agent registered. Scoped credentials saved privately; no token printed.",
    );
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Agent registration failed. Check the ID, workspace, and provisioning permissions.",
  );
  process.exitCode = 1;
});
