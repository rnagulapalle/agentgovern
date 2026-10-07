import type { Pool } from "pg";
import type { Actor } from "../../lib/durable/contracts";
import type { activities } from "./activities";
export interface RunContract {
  runId: string;
  planHash: string;
  planVersion: string;
  connectorVersion: string;
}
// History pins representation, never permission. Existing services recheck live authority.
export function versionedActivities(db: Pool, actor: Actor, current: ReturnType<typeof activities>) {
  return { async advanceContract(input: RunContract) {
    if (!input || typeof input.runId !== "string" || typeof input.planHash !== "string" || !/^[a-f0-9-]{36}$/.test(input.runId) || !/^[a-f0-9]{64}$/.test(input.planHash)
      || input.planVersion !== "acknowledgement-1" || input.connectorVersion !== "private-twin-1")
      throw Error("Unsupported run contract");
    const saved = await db.query("SELECT p.plan_hash,EXISTS(SELECT 1 FROM ll_members m WHERE m.org_id=p.org_id AND m.email=p.created_by AND m.active=true) AS owner_active FROM ll_enquiry_plans p WHERE p.org_id=$1 AND p.run_id=$2", [actor.orgId, input.runId]);
    if (saved.rows.length !== 1 || saved.rows[0].plan_hash !== input.planHash) throw Error("Saved plan contract mismatch");
    if (saved.rows[0].owner_active !== true) throw Error("Plan owner is no longer active");
    return current.advance(input.runId);
  } };
}
