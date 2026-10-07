// Isolated fault-injection worker. Refuses non-test database schemas.
import { Worker, NativeConnection } from "@temporalio/worker";
import { Pool } from "pg";
import { resolve } from "node:path";
import { authenticate } from "../lib/durable/service";
import { FetchSandboxConnectors } from "../lib/connectors/twin";
import { ConnectorControl } from "../lib/connectors/service";
import { WorkflowControl } from "../lib/workflows/service";
import { activities } from "../runtime/temporal/activities";
async function main() {
  const schema = process.env.TEMPORAL_PROOF_SCHEMA || "";
  if (!/^temporal_[a-f0-9]{16}$/.test(schema) || !process.env.LOOPLABS_TEST_DATABASE_URL || !process.env.TEMPORAL_PROOF_WORKER_KEY) throw Error("Isolated proof configuration required.");
  const db = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_PROOF_ADDRESS });
  try {
    const actor = await authenticate(db, process.env.TEMPORAL_PROOF_WORKER_KEY);
    const provider = new FetchSandboxConnectors();
    const write = provider.write.bind(provider);
    provider.write = async (action, lost) => {
      const result = await write(action, lost);
      if (process.env.TEMPORAL_PROOF_KILL_AFTER_EFFECT === "1" && action.connector === "crm") process.kill(process.pid, "SIGKILL");
      return result;
    };
    const worker = await Worker.create({ connection, taskQueue: process.env.TEMPORAL_PROOF_QUEUE!, workflowsPath: resolve("runtime/temporal/workflow-v2.ts"), activities: activities(new WorkflowControl(db, new ConnectorControl(db, provider)), actor) });
    console.log("PROOF_WORKER_READY");
    await worker.run();
  } finally { await connection.close(); await db.end(); }
}
main().catch(() => { console.error("Isolated Temporal worker unavailable"); process.exitCode = 1; });
