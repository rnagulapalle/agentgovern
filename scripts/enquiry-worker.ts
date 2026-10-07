import { Pool } from "pg";
import { authenticate } from "../lib/durable/service";
import { connectorProvider } from "../lib/connectors/hosted";
import { ConnectorControl } from "../lib/connectors/service";
import { WorkflowControl } from "../lib/workflows/service";
import { EnquiryRunner } from "../lib/enquiries/runner";
async function main() {
  if (!process.env.LOOPLABS_DATABASE_URL || !process.env.LOOPLABS_ENQUIRY_WORKER_TOKEN) throw Error("Worker configuration unavailable.");
  const db = new Pool({ connectionString: process.env.LOOPLABS_DATABASE_URL, max: 3, connectionTimeoutMillis: 5000 });
  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; });
  db.on("error", () => { stopping = true; });
  try {
    const actor = await authenticate(db, process.env.LOOPLABS_ENQUIRY_WORKER_TOKEN);
    const runner = new EnquiryRunner(db, new WorkflowControl(db, new ConnectorControl(db, connectorProvider())));
    while (!stopping) {
      await runner.tick(actor);
      if (process.argv.includes("--once")) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } finally { await db.end(); }
}
main().catch(() => { console.error("Enquiry worker stopped. Inspect saved state and configuration before restarting."); process.exitCode = 1; });
