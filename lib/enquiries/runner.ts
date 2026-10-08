import type { Pool } from "pg";
import type { Actor } from "../durable/contracts";
import { ControlError } from "../durable/contracts";
import { transaction } from "../durable/database";
import { WorkflowControl } from "../workflows/service";
export class EnquiryRunner {
  constructor(readonly db: Pool, readonly workflows: WorkflowControl) {}
  async tick(actor: Actor) {
    const ids = await transaction(this.db, actor.orgId, async c => {
      await this.workflows.connectors.authority(c, actor, ["worker"]);
      if (actor.subject !== "enquiry-runner") throw new ControlError(403, "Use the dedicated enquiry worker.");
      await c.query("INSERT INTO ll_enquiry_worker_status(org_id,last_tick) VALUES($1,clock_timestamp()) ON CONFLICT(org_id) DO UPDATE SET last_tick=clock_timestamp()", [actor.orgId]);
      const cursor = (await c.query("SELECT last_plan FROM ll_enquiry_worker_status WHERE org_id=$1", [actor.orgId])).rows[0].last_plan;
      const routed = Boolean((await c.query("SELECT to_regclass('ll_temporal_dispatch') AS present")).rows[0].present);
      const scoped = " AND COALESCE(p.plan#>>'{requests,crm,version}','')<>'prepared-request-2' AND COALESCE(p.plan#>>'{requests,email,version}','')<>'prepared-request-2'";
      const exclude = scoped + (routed ? " AND NOT EXISTS(SELECT 1 FROM ll_temporal_dispatch t WHERE t.org_id=d.org_id AND t.plan_id=d.plan_id)" : "");
      const pending = (await c.query("SELECT p.run_id, d.plan_id FROM ll_enquiry_dispatch d JOIN ll_enquiry_plans p ON p.org_id=d.org_id AND p.id=d.plan_id JOIN ll_workflow_runs r ON r.org_id=p.org_id AND r.id=p.run_id WHERE d.org_id=$1 AND r.state='active'" + exclude + " ORDER BY CASE WHEN d.plan_id>$2::uuid THEN 0 ELSE 1 END,d.plan_id LIMIT 10", [actor.orgId, cursor])).rows;
      if (pending.length) await c.query("UPDATE ll_enquiry_worker_status SET last_plan=$2 WHERE org_id=$1", [actor.orgId, pending[pending.length - 1].plan_id]);
      return pending;
    });
    let progressed = 0;
    for (const { run_id: id } of ids) {
      try {
        // Reads current saved state every time. Restarting does not invent a new action ID.
        let run = await this.workflows.read(actor, id);
        for (const step of run.steps) {
          if (step.state === "ready") {
            await this.workflows.connectors.execute(actor, step.action_id);
            progressed++;
          } else if (["uncertain", "executing"].includes(step.state)) {
            await this.workflows.connectors.reconcile(actor, step.action_id);
          }
          const current = await this.workflows.connectors.read(actor, step.action_id);
          if (current.state !== "succeeded") break;
        }
        run = await this.workflows.read(actor, id);
        if (run.steps.length === 2 && run.steps.every((s: { state: string }) => s.state === "succeeded")) await this.workflows.verify(actor, id);
      } catch (e) {
        // A missing proposal, approval, conflict, active lease or revoked authority contains this
        // run. One held run must not prevent independent saved runs from progressing.
        if (!(e instanceof ControlError)) throw e;
      }
    }
    return progressed;
  }
}
