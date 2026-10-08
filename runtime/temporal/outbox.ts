import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { WorkflowExecutionAlreadyStartedError, type Client } from "@temporalio/client";
import { transaction } from "../../lib/durable/database";
import { authorize } from "../../lib/durable/service";
import { ControlError, type Actor } from "../../lib/durable/contracts";
import type { RunContract } from "./version-contract";
export class TemporalOutbox {
  constructor(readonly db: Pool,readonly recordBuildId=process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID) {}
  async transfer(actor: Actor, runId: string) {
    return transaction(this.db, actor.orgId, async c => {
      await authorize(c, actor, ["operator"]);
      const p = (await c.query("SELECT p.* FROM ll_enquiry_plans p JOIN ll_enquiry_dispatch d ON d.org_id=p.org_id AND d.plan_id=p.id JOIN ll_members m ON m.org_id=p.org_id AND m.email=p.created_by AND m.active=true JOIN ll_workflow_runs r ON r.org_id=p.org_id AND r.id=p.run_id WHERE p.org_id=$1 AND p.run_id=$2 AND p.created_by=$3 AND r.state='active'", [actor.orgId, runId, actor.subject])).rows[0];
      if (!p) throw new ControlError(403, "Only the active owner may transfer a reviewed run.");
      const scoped=p.plan?.requests?.crm?.version === "prepared-request-2" || p.plan?.requests?.email?.version === "prepared-request-2";
      let route: {id:string;version:number;binding_id:string}|undefined;
      if(scoped){
        if(!this.recordBuildId || !/^ack-[a-f0-9]{64}$/.test(this.recordBuildId))throw new ControlError(409,"An explicit compatible record worker build is required before transfer.");
        if(!(await c.query("SELECT to_regclass('ll_temporal_record_routes') AS present")).rows[0].present)throw new ControlError(409,"Record-scoped workflows require a compatible worker contract. No dispatch ownership was transferred.");
        if(p.plan?.requests?.crm?.version!=="prepared-request-2" || p.plan?.requests?.email?.version!=="prepared-request-2")throw new ControlError(409,"Mixed connector contracts cannot be transferred.");
        route=(await c.query("SELECT id,version,binding_id FROM ll_connector_scopes WHERE org_id=$1 AND id=$2 AND version=$3 AND active=true AND binding_id=$4",[actor.orgId,p.plan.recordEnrollment?.id,p.plan.recordEnrollment?.version,p.plan.connectorBinding])).rows[0];
        if(!route)throw new ControlError(409,"Enrolled record authority changed before transfer.");
        const invalid=(await c.query("SELECT 1 FROM ll_workflow_steps s JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id LEFT JOIN ll_connector_scope_grants g ON g.org_id=a.org_id AND g.agent_id=a.agent_id AND g.scope_id=$3 LEFT JOIN ll_agent_profiles f ON f.org_id=a.org_id AND f.agent_id=a.agent_id LEFT JOIN ll_members m ON m.org_id=f.org_id AND m.email=f.owner AND m.active=true WHERE s.org_id=$1 AND s.run_id=$2 AND (g.active IS DISTINCT FROM true OR m.email IS NULL OR a.payload#>>'{scopeGrant,scopeId}' IS DISTINCT FROM $3::text OR a.payload#>>'{scopeGrant,scopeVersion}' IS DISTINCT FROM $4::text OR a.payload#>>'{scopeGrant,grantVersion}' IS DISTINCT FROM g.version::text)",[actor.orgId,runId,route.id,String(route.version)])).rows[0];
        if(invalid)throw new ControlError(409,"Current exact record grants are required before transfer.");
      }
      const old = (await c.query("SELECT workflow_id FROM ll_temporal_dispatch WHERE org_id=$1 AND plan_id=$2", [actor.orgId, p.id])).rows[0];
      if (old) return old.workflow_id as string;
      const steps = (await c.query("SELECT a.state FROM ll_workflow_steps s JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id WHERE s.org_id=$1 AND s.run_id=$2", [actor.orgId, runId])).rows;
      if (steps.length !== 2 || steps.some(s => !["held", "ready"].includes(s.state))) throw new ControlError(409, "Transfer requires unexecuted held or approved steps.");
      const id = `looplabs:${actor.orgId}:ack:${runId}`;
      await c.query("INSERT INTO ll_temporal_dispatch(org_id,plan_id,workflow_id,plan_hash,plan_version,connector_version) VALUES($1,$2,$3,$4,'acknowledgement-1',$5)", [actor.orgId, p.id, id, p.plan_hash,scoped?"private-record-twin-2":"private-twin-1"]);
      if(route)await c.query("INSERT INTO ll_temporal_record_routes(org_id,plan_id,scope_id,scope_version,binding_id,worker_build_id) VALUES($1,$2,$3,$4,$5,$6)",[actor.orgId,p.id,route.id,route.version,route.binding_id,this.recordBuildId]);
      return id;
    });
  }
  async tick(actor: Actor, client: Client, taskQueue: string) {
    if (actor.role !== "worker" || actor.subject !== "enquiry-temporal") throw new ControlError(403, "Temporal scheduling workload required.");
    const claimed = await transaction(this.db, actor.orgId, async c => {
      await authorize(c, actor, ["worker"], "enquiries");
      const routing=Boolean((await c.query("SELECT to_regclass('ll_temporal_record_routes') AS present")).rows[0].present);
      const routeColumns=routing?"r.worker_build_id":"NULL::text AS worker_build_id",routeJoin=routing?" LEFT JOIN ll_temporal_record_routes r ON r.org_id=d.org_id AND r.plan_id=d.plan_id":"";
      const rows = (await c.query("SELECT d.*,p.run_id,"+routeColumns+" FROM ll_temporal_dispatch d JOIN ll_enquiry_plans p ON p.org_id=d.org_id AND p.id=d.plan_id"+routeJoin+" WHERE d.org_id=$1 AND d.state='pending' AND d.next_attempt<=now() AND (d.lease_until IS NULL OR d.lease_until<now()) ORDER BY d.next_attempt,d.plan_id FOR UPDATE OF d SKIP LOCKED LIMIT 10", [actor.orgId])).rows;
      for (const row of rows) {
        row.lease_token = randomUUID();
        await c.query("UPDATE ll_temporal_dispatch SET lease_token=$3,lease_until=now()+interval '30 seconds',attempts=attempts+1 WHERE org_id=$1 AND plan_id=$2", [actor.orgId, row.plan_id, row.lease_token]);
      }
      return rows;
    });
    let started = 0;
    for (const row of claimed) {
      const contract: RunContract = { runId: row.run_id, planHash: row.plan_hash, planVersion: row.plan_version, connectorVersion: row.connector_version };
      try {
        const scoped=row.connector_version==="private-record-twin-2";
        if(scoped && (typeof row.worker_build_id!=="string" || !/^ack-[a-f0-9]{64}$/.test(row.worker_build_id)))throw new ControlError(409,"Saved compatible worker build is unavailable; no legacy fallback is allowed.");
        await client.workflow.start("pinnedAcknowledgement", { workflowId: row.workflow_id, taskQueue, args: [contract], workflowIdReusePolicy: "REJECT_DUPLICATE", workflowIdConflictPolicy: "USE_EXISTING",...(scoped?{versioningOverride:{pinnedTo:{deploymentName:"looplabs-acknowledgement",buildId:row.worker_build_id}}}:{}) });
      } catch (error) {
        // Already-started open and closed executions are the same scheduling intent.
        if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
          await this.db.query("UPDATE ll_temporal_dispatch SET lease_token=NULL,lease_until=NULL,next_attempt=now()+interval '5 seconds' WHERE org_id=$1 AND plan_id=$2 AND lease_token=$3 AND lease_until>now()", [actor.orgId, row.plan_id, row.lease_token]);
          throw error;
        }
      }
      const done = await this.db.query("UPDATE ll_temporal_dispatch SET state='started',started_at=now(),lease_token=NULL,lease_until=NULL WHERE org_id=$1 AND plan_id=$2 AND lease_token=$3 AND lease_until>now() AND state='pending'", [actor.orgId, row.plan_id, row.lease_token]);
      started += done.rowCount ?? 0;
    }
    return started;
  }
}
