import type { PoolClient } from "pg";
import type { Actor } from "../durable/contracts";
import { ControlError } from "../durable/contracts";
// No human session or approval is impersonated by the background dispatcher.
export async function managedWorker(c: PoolClient, actor: Actor, id: string, action = false) {
  if (actor.role !== "worker" || actor.subject !== "enquiry-runner" || !(await c.query("SELECT to_regclass('ll_enquiry_dispatch') AS present")).rows[0].present)
    throw new ControlError(403, "This worker cannot operate a reviewed enquiry.");
  const query = action
    ? "SELECT 1 FROM ll_enquiry_dispatch d JOIN ll_enquiry_plans p ON p.org_id=d.org_id AND p.id=d.plan_id JOIN ll_workflow_steps s ON s.org_id=p.org_id AND s.run_id=p.run_id WHERE d.org_id=$1 AND s.action_id=$2"
    : "SELECT 1 FROM ll_enquiry_dispatch d JOIN ll_enquiry_plans p ON p.org_id=d.org_id AND p.id=d.plan_id WHERE d.org_id=$1 AND p.run_id=$2";
  if (!(await c.query(query, [actor.orgId, id])).rows[0]) throw new ControlError(403, "Background dispatch was not requested for this rehearsal.");
}
