import { Pool } from "pg";
import { authenticate } from "../lib/durable/service";
import { ConnectorControl } from "../lib/connectors/service";
import { FetchSandboxConnectors } from "../lib/connectors/twin";
import type { ConnectorAction } from "../lib/connectors/contracts";
// Used only by the isolated crash proof, never as a production supervisor.
async function main() {
  const db = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
    options: `-c search_path=${process.env.LOOPLABS_PROOF_SCHEMA}`,
  });
  try {
    class CrashProvider extends FetchSandboxConnectors {
      override async write(a: ConnectorAction, lose: boolean) {
        if (process.env.LOOPLABS_PROOF_CRASH === "before") {
          process.stdout.write("dispatch-claimed\n");
          await new Promise(() => {});
        }
        return super.write(a, lose);
      }
    }
    const provider = new CrashProvider(
      "http://127.0.0.1:8018",
      process.env.LOOPLABS_CONNECTOR_TWIN_TOKEN,
      30000,
    );
    const actor = await authenticate(
      db,
      process.env.LOOPLABS_PROOF_WORKER_TOKEN || "",
    );
    await new ConnectorControl(db, provider).execute(
      actor,
      process.env.LOOPLABS_PROOF_ACTION || "",
      true,
    );
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error("Isolated proof worker failed.");
  process.exitCode = 1;
});
