// Test-only child process: the parent kills it at a precise failure boundary.
import { Pool } from "pg";
import { authenticate, DurableControl } from "../lib/durable/service";
async function main() {
  if (
    !process.send ||
    !process.env.LOOPLABS_TEST_DATABASE_URL ||
    !process.env.LOOPLABS_PROBE_TOKEN ||
    !/^proof_[a-f0-9]+$/.test(process.env.LOOPLABS_PROBE_SCHEMA || "")
  )
    throw new Error("This command only runs in the isolated crash test.");
  const db = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
    options: `-c search_path=${process.env.LOOPLABS_PROBE_SCHEMA}`,
  });
  const service = new DurableControl(db);
  const actor = await authenticate(db, process.env.LOOPLABS_PROBE_TOKEN);
  const id = process.env.LOOPLABS_PROBE_ACTION_ID!;
  const a = await service.claim(actor, id);
  if (!a.lease_token) throw new Error("No execution lease acquired.");
  if (process.env.LOOPLABS_PROBE_PHASE === "after-effect")
    await service.applyEffect(actor, id, a.lease_token);
  process.send({ ready: true });
  // Intentionally never finish: the test parent sends SIGKILL.
  setInterval(() => {}, 1000);
}
main().catch(() => {
  process.send?.({ failed: true });
  process.exitCode = 1;
});
