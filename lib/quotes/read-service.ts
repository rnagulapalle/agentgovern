import type { Pool } from "pg";
import { transaction } from "../durable/database";
import { authorize } from "../durable/service";
import { ControlError,type Actor } from "../durable/contracts";
import { assertTenantPool } from "../durable/tenant-pool";
import { memberAuthority } from "../workspace/identity";
import { ConnectorControl } from "../connectors/service";
import type { ConnectorProvider } from "../connectors/contracts";
import { WorkflowControl } from "../workflows/service";
import { QuoteAuthorityControl,type QuoteDestination } from "./authority";
import { assertBoundQuotePlanContract } from "./plan-v2";
import type { QuoteWorkflowView } from "./workflow-view";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function named(db:Pool,actor:Actor){
 await assertTenantPool(db,actor.orgId);
 return transaction(db,actor.orgId,async c=>{await authorize(c,actor,["operator"]);if(!await memberAuthority(c,actor))throw new ControlError(403,"A current named quote owner or manager is required.");});
}
/** Authority metadata only; cannot report a source or execute/inspect effects. */
async function unavailable():Promise<never>{throw new ControlError(503,"This read-only quote view cannot call or execute a provider.");}
export function quoteReadMetadata(destination:Readonly<QuoteDestination>):ConnectorProvider {
 return {workspaceId:destination.workspaceId,bindingId:destination.quoteBinding,source:unavailable,write:unavailable,inspect:unavailable};
}
/** Authenticated read-only routing. Persisted scoped enrollment owns destinations.
 * The adapter is authority metadata only; all provider operations explicitly fail. */
export class QuoteWorkflowReader {
 constructor(readonly db:Pool){}
 async read(actor:Actor,id:string):Promise<QuoteWorkflowView>{
  if(typeof id!=="string" || !uuid.test(id))throw new ControlError(400,"Choose an exact saved quote workflow.");
  await named(this.db,actor);
  const destination=await transaction(this.db,actor.orgId,async c=>{
   await authorize(c,actor,["operator"]);
   const row=(await c.query("SELECT p.plan,p.created_by FROM ll_workflow_runs r JOIN ll_quote_plans p ON p.org_id=r.org_id AND p.id=r.quote_plan_id WHERE r.org_id=$1 AND r.id=$2 AND r.workflow_kind='distributor-quote' AND (p.created_by=$3 OR p.plan->>'approver'=$3)",[actor.orgId,id,actor.subject])).rows[0];
   if(!row)throw new ControlError(404,"Quote workflow not found.");
   assertBoundQuotePlanContract(row.plan);
   const scope=(await c.query("SELECT * FROM ll_connector_scopes WHERE org_id=$1 AND id=$2 AND contract_version='private-quote-twin-1'",[actor.orgId,row.plan.authority.scopeId])).rows[0];
   if(!scope)throw new ControlError(503,"The enrolled quote and message destination is unavailable.");
   return {contract:"private-quote-twin-1" as const,workspaceId:scope.org_id,quoteId:scope.quote_id,distributorId:scope.distributor_id,recipient:scope.recipient,sender:scope.sender,quoteBinding:scope.binding_id,emailBinding:scope.email_binding_id};
  });
  const authority=new QuoteAuthorityControl(this.db,destination);
  const metadata=quoteReadMetadata(authority.destination);
  const workflow=new WorkflowControl(this.db,new ConnectorControl(this.db,metadata),{authority,loadContext:unavailable});
  const run=await workflow.read(actor,id);
  if(!run.quoteView)throw new ControlError(409,"An exact quote workflow view is required.");
  return run.quoteView;
 }
 async list(actor:Actor){
  await named(this.db,actor);
  const ids=await transaction(this.db,actor.orgId,async c=>{
   await authorize(c,actor,["operator"]);
   return (await c.query("SELECT r.id FROM ll_workflow_runs r JOIN ll_quote_plans p ON p.org_id=r.org_id AND p.id=r.quote_plan_id WHERE r.org_id=$1 AND r.workflow_kind='distributor-quote' AND (p.created_by=$2 OR p.plan->>'approver'=$2) ORDER BY r.created_at DESC,r.id LIMIT 30",[actor.orgId,actor.subject])).rows.map(r=>r.id as string);
  });
  // Each exact read freshly validates current manager/member/scope/epoch. Never
  // turn an inaccessible or stale row into a plausible current summary.
  const views:QuoteWorkflowView[]=[];for(const id of ids)views.push(await this.read(actor,id));
  return {quotes:views.map(v=>({id:v.planId,quoteId:v.quoteId,distributorId:v.distributorId,discountBps:v.discountBps,totalMinor:v.totalMinor,manager:v.manager}))};
 }
}
