import { Pool } from "pg";
import { authenticate, DurableControl } from "../lib/durable/service";

async function main() {
  if (!process.env.LOOPLABS_DATABASE_URL || !process.env.LOOPLABS_WORKER_TOKEN)
    throw new Error("Configure the database and a worker identity.");
  const db = new Pool({ connectionString: process.env.LOOPLABS_DATABASE_URL });
  const service = new DurableControl(db);
  let stopping = false;
  db.on("error", () => {
    stopping = true;
    console.error(
      "Worker database connection interrupted. Persisted execution state requires inspection.",
    );
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  try {
    const actor = await authenticate(db, process.env.LOOPLABS_WORKER_TOKEN);
    if (actor.role !== "worker")
      throw new Error("A worker identity is required.");
    console.log(
      "Controlled-connector worker running. Uncertain effects require operator reconciliation.",
    );
    while (!stopping) {
      const { rows } = await db.query(
        "SELECT id FROM ll_actions WHERE org_id=$1 AND (state='ready' OR (state='executing' AND lease_until<clock_timestamp())) ORDER BY created_at LIMIT 20",
        [actor.orgId],
      );
      for (const row of rows) {
        if (stopping) break;
        await service.execute(actor, row.id);
      }
      if (process.argv.includes("--once")) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Worker stopped on an error. Inspect persisted action state before restarting.",
  );
  process.exitCode = 1;
});
