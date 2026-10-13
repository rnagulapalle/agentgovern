import {QuoteTransactionContext} from './transaction-context';
/** Existing-only native quote worker composition. No planner, plan store,
 * provisioner, named-session fabrication or enrollment API is reachable here. */
import type {Pool} from 'pg';
import {isDeepStrictEqual} from 'node:util';
import {ControlError,type Actor} from '../durable/contracts';
import {assertTenantPool} from '../durable/tenant-pool';
import {transaction} from '../durable/database';
import type {ExecutionContext} from '../durable/pg-transport';
import {managedQuoteWorker} from './background';
import {assertBoundQuotePlanContract,type QuotePlanV2} from './plan-v2';
import {QuoteAuthorityControl} from './authority';
import {readQuoteWorkerExecution} from './worker-execution-generation';
import {NativeQuoteConnector} from '../connectors/native-quote';
import {NativeQuoteMailConnector} from '../connectors/native-quote-mail';
import {NativeQuoteEmailTransport} from './native-email-transport';
import {BoundedHttpsJsonClient} from './https-transport';
import {HttpsJsonBodyTransport} from './json-body-transport';
import {FetchSandboxConnectors} from '../connectors/twin';
import {QuoteActionBoundary} from '../connectors/quote-action';
import {ConnectorControl} from '../connectors/service';
import {WorkflowControl} from '../workflows/service';
import type {QuotePlanContext} from './plan';
function unavailable():never{throw new ControlError(503,'Existing quote worker source, policy and sealed execution binding are unavailable.');}
export async function controlsForExistingQuote(db:Pool,actor:Actor,saved:Readonly<QuotePlanV2>,file:string,execution:ExecutionContext={kind:'installed-runtime'}){
 assertBoundQuotePlanContract(saved);
 const binding=await assertTenantPool(db,actor.orgId);if(binding.purpose!=='worker')throw new ControlError(403,'Existing quote requires its dedicated worker pool.');
 const route=await transaction(db,actor.orgId,c=>managedQuoteWorker(c,actor,saved.planId,'plan'));
 if(!isDeepStrictEqual(route.plan,saved))throw new ControlError(409,'Worker may only open its immutable routed plan.');
 const generation=await readQuoteWorkerExecution(file,execution),m=generation.metadata;
 if(m.workspaceId!==binding.org||m.recoveryEpoch!==binding.epoch||m.roleOid!==binding.roleOid||m.databaseOid!==binding.databaseOid||generation.workload.role!==binding.role||generation.installation.schema!==binding.schema||m.buildId!==route.worker_build_id||m.scopeId!==saved.authority.scopeId||m.quoteId!==saved.quote.id||m.distributorId!==saved.quote.distributorId||m.quoteBinding!==saved.authority.quoteBinding||m.emailBinding!==saved.authority.emailBinding)unavailable();
 const transactionContext=new QuoteTransactionContext(db);
 const stable=async()=>{await generation.assertStable();const c=await transactionContext.connection();await assertTenantPool(c,actor.orgId);if(c===db)await transaction(db,actor.orgId,current=>managedQuoteWorker(current,actor,saved.planId,'plan'));else await managedQuoteWorker(c as import('pg').PoolClient,actor,saved.planId,'plan');await generation.assertStable();await transactionContext.connection();};
 const authority=new QuoteAuthorityControl(db,{contract:'private-quote-twin-1',workspaceId:m.workspaceId,quoteId:m.quoteId,distributorId:m.distributorId,recipient:saved.authority.recipient,sender:saved.authority.sender,quoteBinding:m.quoteBinding,emailBinding:m.emailBinding});
 const provider=new NativeQuoteConnector({origin:m.nativeOrigin,workspaceId:m.workspaceId,quoteId:m.quoteId,quoteBinding:m.quoteBinding,emailBinding:m.emailBinding},generation.nativeCredential,1500,m.contract==='quote-worker-execution-2'?{https:m.nativeTransport,assertGeneration:stable}:{});
 const boundary=new QuoteActionBoundary(db,authority,async(c,current,plan)=>transactionContext.run(c,current,async()=>{
  if(current.orgId!==actor.orgId||current.subject!==actor.subject||!isDeepStrictEqual(plan,saved))throw new ControlError(403,'Exact existing quote workload only.');
  await generation.assertStable();const source=await provider.transport.read(),p=await provider.transport.policy();await generation.assertStable();
  if(!source||!p||!p.policy.active||source.distributorId!==saved.quote.distributorId||source.subtotalMinor!==saved.quote.subtotalMinor)unavailable();
  const a=await authority.currentSavedPlanAuthority(current,saved.planId,c);if(!a)throw new ControlError(409,'Current quote authority changed.');
  // These capability declarations apply only to the owned native fixture;
  // policy/grant/agent validity is independently checked by existing boundaries.
  const pricing:QuotePlanContext={workspaceId:saved.workspaceId,requester:saved.requester,quote:{...structuredClone(saved.quote),sourceVersion:source.sourceVersion,currency:source.currency,subtotalMinor:source.subtotalMinor},policy:{...p.policy,active:true},approvalGrants:[{member:saved.approver,workspaceId:saved.workspaceId,quoteId:saved.quote.id,policyVersion:p.policy.version,active:true,capability:'quote.discount.approve'}],agents:[{id:saved.update.agentId,workspaceId:saved.workspaceId,quoteId:saved.quote.id,active:true,action:'quote.update'},{id:saved.message.agentId,workspaceId:saved.workspaceId,quoteId:saved.quote.id,active:true,action:'quote.message'}],provider:{workspaceId:saved.workspaceId,quoteId:saved.quote.id,binding:m.quoteBinding,contract:'quote-conditional-write-1',atomicSourceVersion:true,actionIdIdempotency:true,effectReadback:true},email:{workspaceId:saved.workspaceId,quoteId:saved.quote.id,from:saved.authority.sender,recipient:saved.authority.recipient,actionIdIdempotency:true,effectReadback:true}};
  return {contract:'quote-plan-context-2',pricing,authority:a};
 }),async(c,current,ref)=>transactionContext.run(c,current,async()=>{
  if(current.orgId!==m.workspaceId||ref.workspaceId!==m.workspaceId||ref.quoteId!==m.quoteId)unavailable();
  await generation.assertStable();const p=await provider.transport.policy();await generation.assertStable();if(!p||p.binding!==m.quoteBinding)unavailable();return{contract:p.contract,workspaceId:p.workspaceId,quoteId:p.quoteId,policy:p.policy};
 }),transactionContext);
 const pin={quoteRequest:saved.update.request,messageRequest:saved.message.request};
 const mail=m.contract==='quote-worker-execution-2'?new HttpsJsonBodyTransport(new BoundedHttpsJsonClient({origin:m.emailOrigin,transport:m.emailTransport},generation.emailCredential,stable)):new FetchSandboxConnectors(m.emailOrigin,await generation.emailCredential()),acceptance=new NativeQuoteEmailTransport(pin,provider.transport,mail),messageProvider=new NativeQuoteMailConnector(provider,pin,acceptance);
 const quote=new ConnectorControl(db,provider,boundary),message=new ConnectorControl(db,messageProvider,boundary),workflow=new WorkflowControl(db,quote,{authority,loadContext:async()=>{throw new ControlError(403,'Worker cannot create or prepare quote plans.');},message});
 await stable();return {quote,message,workflow,assertStable:stable};
}
