import { createHash } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { ControlError,type Actor } from '../durable/contracts';
import { transaction } from '../durable/database';
import { authorize } from '../durable/service';
import { assertTenantPool } from '../durable/tenant-pool';
import { memberAuthority } from '../workspace/identity';
import { parseTurns } from '../enquiries/chat';
import type { Turn } from '../enquiries/chat-contract';
import { QuotePlanStore,type SavedQuotePlan } from './store';
import { assertBoundQuotePlanContract,type QuotePlanContextV2,type QuotePlanProposalV2,type QuotePlanV2 } from './plan-v2';
import type { ConnectorControl } from '../connectors/service';
import type { QuoteVerificationView } from './verification-receipt';
import type { OrchestrationAdmission } from '../orchestration/admission';
import type { WorkflowControl } from '../workflows/service';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash=/^[a-f0-9]{64}$/;
export interface QuoteIntentPlanner { interpret(turns:readonly Turn[]):Promise<unknown> }
export type QuoteDemoBundle={quote:ConnectorControl;message:ConnectorControl;workflow:WorkflowControl};
/** Trusted bootstrap dependencies, never request fields. Context must independently
 * load actual enrolled source/pricing/authority. The factory pins BOTH saved requests. */
export type QuoteDemoDependencies={store:QuotePlanStore;planner:QuoteIntentPlanner;
 context:(c:PoolClient,actor:Actor,scopeId:string)=>Promise<QuotePlanContextV2>;
 controllers:(saved:SavedQuotePlan)=>Promise<QuoteDemoBundle>;
 observeControllers?:(saved:SavedQuotePlan)=>Promise<QuoteDemoBundle>;
 backgroundAdmission?:(bundle:QuoteDemoBundle)=>Promise<OrchestrationAdmission>};
function id(value:string){if(!uuid.test(value))throw new ControlError(400,'Choose an exact saved quote request.');}
function actionId(planId:string,step:string){const bytes=createHash('sha256').update('looplabs.quote-demo-action-1:'+planId+':'+step).digest();bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const s=bytes.subarray(0,16).toString('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
function intent(value:unknown):{job:'quote-discount'|'unsupported';discountBps:number|null}{
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).sort().join()!=='discountBps,job'||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!('value'in d)||!d.enumerable))throw new ControlError(503,'The quote request could not be interpreted safely. No work was created.');
 const v=value as {job:unknown;discountBps:unknown};if(!['quote-discount','unsupported'].includes(v.job as string)||v.discountBps!==null&&(!Number.isInteger(v.discountBps)||Number(v.discountBps)<0||Number(v.discountBps)>10000))throw new ControlError(503,'The quote request could not be interpreted safely. No work was created.');return v as {job:'quote-discount'|'unsupported';discountBps:number|null};
}
/** Facade over saved proposals and the existing control engine; not a scheduler.
 * No credentials, bindings, manager or pricing values are accepted from chat. */
export class QuoteDemoControl {
 constructor(readonly db:Pool,readonly scopeId:string,private readonly dependencies:QuoteDemoDependencies){id(scopeId);if(dependencies.store.db!==db)throw new ControlError(503,'Quote services must share the installed workspace pool.');}
 private async named(actor:Actor){await assertTenantPool(this.db,actor.orgId);await transaction(this.db,actor.orgId,async c=>{await authorize(c,actor,['operator']);if(!await memberAuthority(c,actor))throw new ControlError(403,'A current named quote member is required.');});}
 async catalog(actor:Actor){await this.named(actor);return transaction(this.db,actor.orgId,async c=>{
  await authorize(c,actor,['operator']);
  const scope=(await c.query("SELECT s.id,s.quote_id,s.distributor_id,s.created_by FROM ll_connector_scopes s WHERE s.org_id=$1 AND s.id=$2 AND s.active=true AND s.contract_version='private-quote-twin-1' AND (s.created_by=$3 OR EXISTS(SELECT 1 FROM ll_quote_manager_grants g WHERE g.org_id=s.org_id AND g.scope_id=s.id AND g.member=$3 AND g.active=true) OR EXISTS(SELECT 1 FROM ll_connector_scope_grants g JOIN ll_agent_profiles p ON p.org_id=g.org_id AND p.agent_id=g.agent_id WHERE g.org_id=s.org_id AND g.scope_id=s.id AND g.active=true AND p.owner=$3))",[actor.orgId,this.scopeId,actor.subject])).rows[0];
  if(!scope)return null;
  // Manager discovery is a read of current explicit enrollment, not requester
  // impersonation. The owner context loader must never receive a forged actor.
  if(scope.created_by!==actor.subject){const grants=(await c.query("SELECT g.member FROM ll_quote_manager_grants g JOIN ll_members m ON m.email=g.member AND m.org_id=g.org_id AND m.active=true WHERE g.org_id=$1 AND g.scope_id=$2 AND g.member=$3 AND g.active=true AND g.capability='quote.discount.approve'",[actor.orgId,this.scopeId,actor.subject])).rows;if(grants.length>1)return null;if(grants.length===1){if(!await memberAuthority(c,actor))throw new ControlError(403,'Current named quote manager required.');return {id:this.scopeId,quoteId:scope.quote_id as string,distributorId:scope.distributor_id as string,manager:actor.subject,canPrepare:false};}}
  const context=await this.dependencies.context(c,actor,this.scopeId);
  if(context.authority.scopeId!==this.scopeId||context.authority.workspaceId!==actor.orgId||context.pricing.quote.id!==scope.quote_id||context.pricing.quote.distributorId!==scope.distributor_id||![context.pricing.requester,context.authority.member].includes(actor.subject))throw new ControlError(403,'Current quote requester or designated manager required.');
  if(!await memberAuthority(c,actor))throw new ControlError(403,'Current named quote member required.');
  return {id:this.scopeId,quoteId:scope.quote_id as string,distributorId:scope.distributor_id as string,manager:context.authority.member,canPrepare:context.pricing.requester===actor.subject};
 });}
 async savedRequests(actor:Actor){await this.named(actor);
  const ids=await transaction(this.db,actor.orgId,async c=>{await authorize(c,actor,['operator']);return (await c.query("SELECT id FROM ll_quote_plans WHERE org_id=$1 AND plan->>'version'='distributor-quote-plan-2' AND plan->'authority'->>'scopeId'=$2 AND (created_by=$3 OR plan->>'approver'=$3) ORDER BY created_at DESC,id LIMIT 30",[actor.orgId,this.scopeId,actor.subject])).rows;});
  const plans=[];for(const row of ids){const saved=await this.dependencies.store.readForReview(actor,row.id);assertBoundQuotePlanContract(saved.plan);if((saved.plan as QuotePlanV2).authority.scopeId!==this.scopeId)throw new ControlError(409,'Saved quote destination changed.');plans.push({id:saved.id,quoteId:saved.plan.quote.id,discountBps:saved.plan.discountBps,totalMinor:saved.plan.totalMinor,manager:saved.plan.approver});}return plans;
 }
 async prepare(actor:Actor,requestId:string,value:unknown){id(requestId);await this.named(actor);const turns=parseTurns(value),requested=intent(await this.dependencies.planner.interpret(turns));
  if(requested.job==='unsupported')throw new ControlError(400,'This quote conversation only prepares a distributor discount and its exact customer confirmation. No work was created.');
  if(requested.discountBps===null)return {clarification:'What discount percentage should the designated manager review?',saved:null};
  const discountBps=requested.discountBps;
  const proposal=await transaction(this.db,actor.orgId,async c=>{await authorize(c,actor,['operator']);if(!await memberAuthority(c,actor))throw new ControlError(403,'A current named quote member is required.');const context=await this.dependencies.context(c,actor,this.scopeId);const a=context.authority,p=context.pricing;
   if(a.scopeId!==this.scopeId||a.workspaceId!==actor.orgId||p.requester!==actor.subject)throw new ControlError(403,'The enrolled quote does not belong to this requester.');
   const select=(action:string)=>{const eligible=p.agents.filter(x=>x.action===action&&x.active&&x.workspaceId===actor.orgId&&x.quoteId===p.quote.id);if(eligible.length!==1)throw new ControlError(409,'Exactly one enrolled assistant for each quote step is required.');return eligible[0].id;};const update=actionId(requestId,'update');
   return {version:'distributor-quote-plan-2',planId:requestId,workspaceId:actor.orgId,requester:actor.subject,approver:a.member,policyVersion:a.policyVersion,quote:p.quote,discountBps,update:{actionId:update,agentId:select('quote.update')},message:{actionId:actionId(requestId,'message'),agentId:select('quote.message'),dependsOn:update},authority:a} satisfies QuotePlanProposalV2;
  });
  // Existing store independently reloads context/membership under the workspace
  // lock after planner and source awaits. Stable IDs do not authorize execution.
  return {saved:await this.dependencies.store.save(actor,proposal),reply:'Quote proposal saved. Review the exact discount and confirmation; neither action is approved.'};
 }
 private async bundle(actor:Actor,planId:string,planHash:string,readOnly=false){id(planId);if(!hash.test(planHash))throw new ControlError(400,'Review the exact saved quote first.');await this.named(actor);const saved=await this.dependencies.store.readForReview(actor,planId);assertBoundQuotePlanContract(saved.plan);
  if((saved.plan as QuotePlanV2).authority.scopeId!==this.scopeId||saved.planHash!==planHash)throw new ControlError(409,'The saved quote or enrolled destination changed.');const factory=readOnly?this.dependencies.observeControllers:this.dependencies.controllers;if(!factory)throw new ControlError(503,'Read-only current quote verification is unavailable.');const b=await factory(saved);
  if(b.quote.db!==this.db||b.message.db!==this.db||b.workflow.db!==this.db||b.workflow.connectors!==b.quote||b.workflow.quotes?.message!==b.message)throw new ControlError(503,'Exact quote and confirmation controls are unavailable.');return {saved,b};
 }
 async submit(actor:Actor,planId:string,planHash:string){const {saved,b}=await this.bundle(actor,planId,planHash);if(saved.createdBy!==actor.subject)throw new ControlError(403,'Only the named requester can submit this saved quote.');await b.workflow.createQuote(actor,planId);try{await b.quote.proposeQuote(actor,planId,planHash,'update');await b.message.proposeQuote(actor,planId,planHash,'message');}catch{const observed=await this.resolve(actor,planId);return {...observed,submission:'partial-recorded' as const,blocker:'Not all actions could be admitted. Review existing saved work before retrying its exact request.'};}return {...await this.resolve(actor,planId),submission:'actions-recorded' as const};}
 async background(actor:Actor,planId:string,planHash:string){
  if(!this.dependencies.backgroundAdmission)throw new ControlError(503,'Compatible quote background continuation is not configured.');
  const {saved,b}=await this.bundle(actor,planId,planHash,true);
  if(saved.createdBy!==actor.subject)throw new ControlError(403,'Only the named requester can request background continuation.');
  if(!b.quote.quoteBoundary)throw new ControlError(503,'Exact current quote authority is unavailable.');
  await transaction(this.db,actor.orgId,async c=>{await authorize(c,actor,['operator']);const current=await b.quote.quoteBoundary!.current(c,actor,planId,planHash,'update',false);if(!await b.quote.quoteBoundary!.currentPolicy(c,actor,current.plan))throw new ControlError(409,'Current quote pricing policy changed.');});
  const admission=await this.dependencies.backgroundAdmission(b);await admission.transfer(actor,planId);
  // A durable scheduling intent is not evidence of a started worker or effect.
  return {...await this.resolve(actor,planId),continuation:'requested' as const};
 }
 async review(actor:Actor,planId:string,planHash:string,step:'update'|'message',payloadHash:string,approve:boolean){if(!['update','message'].includes(step)||!hash.test(payloadHash)||typeof approve!=='boolean')throw new ControlError(400,'Choose an exact quote decision.');const {saved,b}=await this.bundle(actor,planId,planHash);assertBoundQuotePlanContract(saved.plan);return (step==='update'?b.quote:b.message).review(actor,saved.plan[step].actionId,payloadHash,approve);}
 async advance(actor:Actor,planId:string,planHash:string,step:'update'|'message',observeOnly=false){if(!['update','message'].includes(step)||typeof observeOnly!=='boolean')throw new ControlError(400,'Choose an exact quote step.');const {saved,b}=await this.bundle(actor,planId,planHash);assertBoundQuotePlanContract(saved.plan);const control=step==='update'?b.quote:b.message;return observeOnly?control.reconcile(actor,saved.plan[step].actionId):control.execute(actor,saved.plan[step].actionId);}
 /** GET-only provider observation; must not enroll or resolve a pending send. */
 async verification(actor:Actor,planId:string,planHash:string):Promise<QuoteVerificationView>{const {b}=await this.bundle(actor,planId,planHash,true);return b.workflow.quoteVerification(actor,planId);}
 async verify(actor:Actor,planId:string,planHash:string){const {b}=await this.bundle(actor,planId,planHash);return b.workflow.verify(actor,planId);}
 async resolve(actor:Actor,planId:string){id(planId);await this.named(actor);const saved=await this.dependencies.store.readForReview(actor,planId);assertBoundQuotePlanContract(saved.plan);if((saved.plan as QuotePlanV2).authority.scopeId!==this.scopeId)throw new ControlError(404,'Saved quote request not found.');
  // Database observation only. It must not instantiate a provider, invoke its
  // pending-resolution endpoint, save/admit/approve/execute or manufacture IDs.
  const run=await transaction(this.db,actor.orgId,async c=>{await authorize(c,actor,['operator']);return (await c.query('SELECT id,state FROM ll_workflow_runs WHERE org_id=$1 AND id=$2',[actor.orgId,planId])).rows[0]??null;});
  const actions=await transaction(this.db,actor.orgId,async c=>{await authorize(c,actor,['operator']);return (await c.query('SELECT id,connector,payload_hash,state,approved_by,evidence FROM ll_connector_actions WHERE org_id=$1 AND id=ANY($2::uuid[]) ORDER BY id',[actor.orgId,[saved.plan.update.actionId,saved.plan.message.actionId]])).rows;});await this.dependencies.store.readForReview(actor,planId);
  const background=await transaction(this.db,actor.orgId,async c=>{await authorize(c,actor,['operator']);const installed=(await c.query("SELECT to_regclass('ll_quote_background_routes') present")).rows[0]?.present;if(!installed)return {available:false,state:null};const row=(await c.query('SELECT state FROM ll_quote_background_routes WHERE org_id=$1 AND plan_id=$2 AND plan_hash=$3',[actor.orgId,planId,saved.planHash])).rows[0];return {available:!!this.dependencies.backgroundAdmission,state:row?.state??null};});
  return {saved,run,actions,background,completion:'not-established' as const};
 }
}
