import type { Pool, PoolClient } from "pg";
import type { Client } from "@temporalio/client";
import { dispatchOwnedOutbox } from "./outbox";
import { randomUUID } from "node:crypto";
import { transaction } from "../../lib/durable/database";
import { assertTenantPool } from "../../lib/durable/tenant-pool";
import { authorize } from "../../lib/durable/service";
import { memberAuthority } from "../../lib/workspace/identity";
import { ControlError, type Actor } from "../../lib/durable/contracts";
import type { WorkflowControl } from "../../lib/workflows/service";
import type { OrchestrationAdmission } from "../../lib/orchestration/admission";
import { assertQuoteRunContract, type QuoteRunContract } from "../../lib/orchestration/quote-contract";
import { quoteRequestIdentity } from "../../lib/quotes/effect";
import { nativeMailIdentity } from "../../lib/quotes/native-email-transport";
import { assertBoundQuotePlanContract } from "../../lib/quotes/plan-v2";
import { isDeepStrictEqual } from "node:util";
export type QuoteWorkerPin=Readonly<{buildId:string;workerRoleOid:string;schedulerRoleOid:string}>;
export class TemporalQuoteAdmission implements OrchestrationAdmission {
 constructor(readonly db:Pool,readonly workflows:WorkflowControl,readonly pin:QuoteWorkerPin){
  if(workflows.db!==db || !workflows.quotes || !/^quote-[a-f0-9]{64}$/.test(pin.buildId)||![pin.workerRoleOid,pin.schedulerRoleOid].every(v=>/^[1-9][0-9]*$/.test(v))||pin.workerRoleOid===pin.schedulerRoleOid)throw new ControlError(503,"Explicit distinct quote workload roles and build are required.");
 }
 async assertReady(c:PoolClient){
  const b=await assertTenantPool(c);
  if(b.purpose!=="web" || !(await c.query("SELECT to_regclass('ll_quote_background_routes') present")).rows[0].present)throw new ControlError(503,"Compatible quote background installation required.");
  const roles=(await c.query("SELECT q.role_oid::text oid,q.purpose FROM ll_quote_workload_roles q JOIN pg_roles r ON r.oid=q.role_oid WHERE q.org_id=$1 AND q.role_oid=ANY($2::oid[]) AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication) AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)",[b.org,[this.pin.workerRoleOid,this.pin.schedulerRoleOid]])).rows;
  if(roles.length!==2||!roles.some(r=>r.oid===this.pin.workerRoleOid&&r.purpose==="worker")||!roles.some(r=>r.oid===this.pin.schedulerRoleOid&&r.purpose==="scheduler"))throw new ControlError(503,"Current quote workload role bindings required.");
 }
 async transfer(actor:Actor,runId:string){
  // Existing graph read preserves exact saved step/request/dependency validation.
  const view=await this.workflows.read(actor,runId);
  if(view.workflow_kind!=="distributor-quote")throw new ControlError(409,"Only the saved quote graph can use this admission.");
  return transaction(this.db,actor.orgId,async c=>{
   await this.assertReady(c);await authorize(c,actor,["operator"]);
   if(!await memberAuthority(c,actor))throw new ControlError(403,"Current named quote requester required.");
   const row=(await c.query("SELECT * FROM ll_quote_plans WHERE org_id=$1 AND id=$2 AND created_by=$3",[actor.orgId,runId,actor.subject])).rows[0];
   if(!row || !await this.workflows.quotes!.authority.currentSavedPlanAuthority(actor,row.id,c))throw new ControlError(409,"Current exact quote authority required.");
   const plan=row.plan;assertBoundQuotePlanContract(plan);
   const b=await assertTenantPool(c,actor.orgId);
   const contract:QuoteRunContract={contract:"quote-background-1",planId:row.id,runId,planHash:row.plan_hash,planVersion:"distributor-quote-plan-2",connectorVersion:"native-quote-mail-1",recoveryEpoch:b.epoch,updateActionId:plan.update.actionId,messageActionId:plan.message.actionId,updateRequestIdentity:quoteRequestIdentity(plan.update.request)!,messageRequestIdentity:nativeMailIdentity(plan.message.request)!,workerBuildId:this.pin.buildId};assertQuoteRunContract(contract);
   const old=(await c.query("SELECT *,worker_role_oid::text AS worker_role_oid,scheduler_role_oid::text AS scheduler_role_oid FROM ll_quote_background_routes WHERE org_id=$1 AND plan_id=$2",[actor.orgId,row.id])).rows[0];
   if(old){if(!isDeepStrictEqual(old.contract,contract)||old.worker_role_oid!==this.pin.workerRoleOid||old.scheduler_role_oid!==this.pin.schedulerRoleOid)throw new ControlError(409,"Existing quote dispatch has different immutable identity.");return old.workflow_id as string;}
   const run=(await c.query("SELECT state FROM ll_workflow_runs WHERE org_id=$1 AND id=$2",[actor.orgId,runId])).rows[0];
   const update=await this.workflows.connectors.get(c,actor,plan.update.actionId);const message=await this.workflows.quotes!.message?.get(c,actor,plan.message.actionId);
   if(run?.state!=="active"||update.state!=="ready"||!message||message.state!=="held"||message.approved_by!==null||message.approval_until!==null||!await this.workflows.connectors.valid(c,actor,update,true,true)||!await this.workflows.quotes!.message!.valid(c,actor,message,false,false))throw new ControlError(409,"Transfer needs the independently approved quote and exact unapproved held message.");
   const workflowId=`looplabs:${actor.orgId}:quote:${runId}`;
   await c.query("INSERT INTO ll_quote_background_routes(org_id,plan_id,plan_hash,recovery_epoch,worker_role_oid,scheduler_role_oid,worker_build_id,workflow_id,authority,contract) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[actor.orgId,row.id,row.plan_hash,b.epoch,this.pin.workerRoleOid,this.pin.schedulerRoleOid,this.pin.buildId,workflowId,plan.authority,contract]);
   return workflowId;
  });
 }
}
// Same Temporal durable-start/outbox semantics as acknowledgement scheduling;
// the separate immutable row is required because the old table FK is enquiries.
export async function tickQuoteOutbox(db:Pool,actor:Actor,client:Client,taskQueue:string){
 const b=await assertTenantPool(db,actor.orgId);
 if(actor.role!=="worker"||actor.subject!=="quote-temporal"||b.purpose!=="scheduler")throw new ControlError(403,"Scoped quote scheduler required.");
 if(!(await db.query("SELECT 1 FROM ll_quote_workload_roles WHERE org_id=$1 AND role_oid=$2::oid AND purpose='scheduler'",[actor.orgId,b.roleOid])).rowCount)throw new ControlError(403,"Dedicated quote scheduler installation required.");
 const rows=await transaction(db,actor.orgId,async c=>{
  await authorize(c,actor,["worker"],"quotes");
  const rows=(await c.query("SELECT * FROM ll_quote_background_routes WHERE org_id=$1 AND scheduler_role_oid=$2::oid AND recovery_epoch=$3::uuid AND state='pending' AND next_attempt<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt,plan_id FOR UPDATE SKIP LOCKED LIMIT 10",[actor.orgId,b.roleOid,b.epoch])).rows;
  for(const row of rows){row.lease_token=randomUUID();await c.query("UPDATE ll_quote_background_routes SET lease_token=$3,lease_until=now()+interval '30 seconds',attempts=attempts+1 WHERE org_id=$1 AND plan_id=$2",[actor.orgId,row.plan_id,row.lease_token]);}return rows;
 });
 const recheck=<T>(mutation:(c:PoolClient)=>Promise<T>)=>transaction(db,actor.orgId,async c=>{const current=await assertTenantPool(c,actor.orgId);if(current.purpose!=="scheduler"||current.roleOid!==b.roleOid||current.epoch!==b.epoch)throw new ControlError(409,"Quote scheduler installation changed while starting history.");await authorize(c,actor,["worker"],"quotes");if(!(await c.query("SELECT 1 FROM ll_quote_workload_roles WHERE org_id=$1 AND role_oid=$2::oid AND purpose='scheduler'",[actor.orgId,b.roleOid])).rowCount)throw new ControlError(403,"Quote scheduler authority changed.");return mutation(c);});
 return dispatchOwnedOutbox(client,{
  claim:async()=>rows,
  intent:row=>{assertQuoteRunContract(row.contract);return {workflow:"pinnedQuote",options:{workflowId:row.workflow_id,taskQueue,args:[row.contract],workflowIdReusePolicy:"REJECT_DUPLICATE",workflowIdConflictPolicy:"USE_EXISTING",versioningOverride:{pinnedTo:{deploymentName:"looplabs-quote",buildId:row.worker_build_id}}}};},
  release:async row=>{await recheck(c=>c.query("UPDATE ll_quote_background_routes SET lease_token=NULL,lease_until=NULL,next_attempt=now()+interval '5 seconds' WHERE org_id=$1 AND plan_id=$2 AND lease_token=$3 AND lease_until>now()",[actor.orgId,row.plan_id,row.lease_token]));},
  complete:async row=>{const done=await recheck(c=>c.query("UPDATE ll_quote_background_routes SET state='started',started_at=now(),lease_token=NULL,lease_until=NULL WHERE org_id=$1 AND plan_id=$2 AND lease_token=$3 AND lease_until>now() AND state='pending'",[actor.orgId,row.plan_id,row.lease_token]));return done.rowCount??0;}
 });
}
