import type { Pool, PoolClient } from "pg";
import { ControlError, type Actor } from "../../lib/durable/contracts";
import type { OrchestrationAdmission } from "../../lib/orchestration/admission";
import { TemporalOutbox } from "./outbox";

export class TemporalAdmission implements OrchestrationAdmission {
  constructor(readonly db: Pool, readonly buildId = process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID) {}
  async available(client: Pick<PoolClient, "query"> = this.db): Promise<boolean> {
    return typeof this.buildId === "string" && /^ack-[a-f0-9]{64}$/.test(this.buildId)
      && Boolean((await client.query("SELECT to_regclass('ll_temporal_record_routes') AS present")).rows[0].present);
  }
  async assertReady(client: PoolClient): Promise<void> {
    if (!(await this.available(client))) throw new ControlError(409, "Record-scoped background execution needs a compatible worker contract. No new work was submitted.");
  }
  async transfer(actor: Actor, runId: string): Promise<string> {
    // The outbox independently revalidates exact authority, grants and worker routing.
    return new TemporalOutbox(this.db, this.buildId).transfer(actor, runId);
  }
}
