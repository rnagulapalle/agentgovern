import {readRecoveredQuoteRequesterDelegation} from './requester-delegation';
import {isDeepStrictEqual} from 'node:util';
import {QuoteTransactionContext} from './transaction-context';
import {readQuoteBackgroundGeneration} from './background-generation';
import {TemporalQuoteAdmission} from '../../runtime/temporal/quote-outbox';
/** Trusted local-fixture integration only. Reuses saved proposals and the same
 * approval/lease/execution engine; no authority is accepted from chat or env flags. */
import type {Pool,PoolClient} from 'pg';
import {ControlError,type Actor} from '../durable/contracts';
import type {ExecutionContext} from '../durable/pg-transport';
import {assertTenantPool} from '../durable/tenant-pool';
import {QuoteAuthorityControl} from './authority';
import {QuotePlanStore,type SavedQuotePlan} from './store';
import type {QuotePlanContext} from './plan';
import {assertBoundQuotePlanContract,type QuotePlanContextV2,type QuotePlanV2} from './plan-v2';
import {QuoteDemoControl,type QuoteIntentPlanner} from './demo-control';
import {BedrockQuotePlanner} from './chat-planner';
import {readQuoteExecutionGeneration} from './execution-generation';
import {readNativeQuoteProvisionerGeneration} from './native-pin-provisioner';
import {NativeQuoteConnector} from '../connectors/native-quote';
import {NativeQuoteMailConnector} from '../connectors/native-quote-mail';
import {NativeQuoteEmailTransport} from './native-email-transport';
import {BoundedHttpsJsonClient} from './https-transport';
import {HttpsJsonBodyTransport} from './json-body-transport';
import {FetchSandboxConnectors} from '../connectors/twin';
import {QuoteActionBoundary} from '../connectors/quote-action';
import {ConnectorControl} from '../connectors/service';
import {WorkflowControl} from '../workflows/service';
function unavailable():never{throw new ControlError(503,'Current independently enrolled quote source, pricing and execution configuration are unavailable.');}
/** Only a source-owned setup/test launcher may supply the disposable context.
 * Production defaults deny because native HTTPS execution is not supported. */
export async function createNativeQuoteDemo(db:Pool,file:string,execution:ExecutionContext={kind:'installed-runtime'},planner:QuoteIntentPlanner=new BedrockQuotePlanner(),backgroundFile?:string){
 const generation=await readQuoteExecutionGeneration(file,execution),m=generation.metadata;
 const binding=await assertTenantPool(db,m.workspaceId);
 if(binding.purpose!=='web'||m.version===2&&(binding.epoch!==m.recoveryEpoch||binding.roleOid!==m.roleOid||binding.databaseOid!==m.databaseOid))unavailable();
 const transactionContext=new QuoteTransactionContext(db);
 const assertDatabaseTransport=async()=>{const c=await transactionContext.connection();await generation.assertWebPool(db,c===db?undefined:c as PoolClient);};
 await assertDatabaseTransport();
 const background=backgroundFile?await readQuoteBackgroundGeneration(backgroundFile):undefined;
 if(background&&(background.workspaceId!==m.workspaceId||background.scopeId!==m.scopeId||background.recoveryEpoch!==binding.epoch||background.databaseOid!==binding.databaseOid))unavailable();
 const provisioner=await readNativeQuoteProvisionerGeneration(m.provisionerFile,execution);
 if(provisioner.workspaceId!==m.workspaceId||provisioner.quoteId!==m.quoteId||provisioner.quoteBinding!==m.quoteBinding||provisioner.emailBinding!==m.emailBinding)unavailable();
 const stable=async()=>{const current=await assertTenantPool(await transactionContext.connection(),m.workspaceId);if(current.purpose!=='web'||m.version===2&&(current.epoch!==m.recoveryEpoch||current.roleOid!==m.roleOid||current.databaseOid!==m.databaseOid))unavailable();await assertDatabaseTransport();await generation.assertStable();await provisioner.assertStable();await background?.assertStable();await transactionContext.connection();};
 const scope=(await db.query("SELECT * FROM ll_connector_scopes WHERE org_id=$1 AND id=$2 AND contract_version='private-quote-twin-1' AND active=true AND quote_id=$3 AND distributor_id=$4 AND binding_id=$5 AND email_binding_id=$6",[m.workspaceId,m.scopeId,m.quoteId,m.distributorId,m.quoteBinding,m.emailBinding])).rows[0];
 if(!scope)unavailable();await stable();
 const delegationReference=scope.created_by===m.requester?undefined:{workspaceId:m.workspaceId,scopeId:m.scopeId,requester:m.requester,createdBy:scope.created_by as string,scopeVersion:scope.version as number};
 const delegation=delegationReference?await readRecoveredQuoteRequesterDelegation(db,delegationReference):undefined;if(delegationReference&&!delegation)unavailable();
 const assertDelegation=async(client:Pool|PoolClient)=>{if(delegationReference&&!isDeepStrictEqual(await readRecoveredQuoteRequesterDelegation(client,delegationReference),delegation))unavailable();};
 await assertDelegation(db);await stable();
 const authority=new QuoteAuthorityControl(db,{contract:'private-quote-twin-1',workspaceId:m.workspaceId,quoteId:m.quoteId,distributorId:m.distributorId,recipient:scope.recipient,sender:scope.sender,quoteBinding:m.quoteBinding,emailBinding:m.emailBinding});
 const provider=new NativeQuoteConnector({origin:m.origin,workspaceId:m.workspaceId,quoteId:m.quoteId,quoteBinding:m.quoteBinding,emailBinding:m.emailBinding},generation.nativeCredential,1500,m.version===2?{https:m.nativeTransport,assertGeneration:stable}:{});
 const pricing=async(c:PoolClient,actor:Actor):Promise<QuotePlanContext>=>transactionContext.run(c,actor,async()=>{
  if(actor.orgId!==m.workspaceId)throw new ControlError(403,'Quote source belongs to another workspace.');
  await stable();await assertDelegation(c);const source=await provider.transport.read(),policy=await provider.transport.policy();await stable();await assertDelegation(c);
  if(!source||!policy||!policy.policy.active||source.quoteId!==m.quoteId||source.distributorId!==m.distributorId||source.subtotalMinor!==generation.subtotalMinor)unavailable();
  const grants=(await c.query("SELECT g.member,g.policy_version FROM ll_quote_manager_grants g JOIN ll_members x ON x.org_id=g.org_id AND x.email=g.member AND x.active=true WHERE g.org_id=$1 AND g.scope_id=$2 AND g.active=true AND g.capability='quote.discount.approve' AND g.policy_version=$3",[m.workspaceId,m.scopeId,policy.policy.version])).rows;
  if(grants.length!==1||grants[0].member===m.requester)unavailable();
  const rows=(await c.query("SELECT a.id,p.role FROM ll_connector_scope_grants g JOIN ll_agents a ON a.org_id=g.org_id AND a.id=g.agent_id AND a.active=true JOIN ll_agent_profiles p ON p.org_id=a.org_id AND p.agent_id=a.id JOIN ll_members x ON x.org_id=p.org_id AND x.email=p.owner AND x.active=true WHERE g.org_id=$1 AND g.scope_id=$2 AND g.active=true AND p.owner=$3 AND ((p.role='quote_agent' AND p.connector='quote_twin' AND 'twin.quote'=ANY(a.tools)) OR (p.role='email_agent' AND p.connector='email_twin' AND 'twin.email'=ANY(a.tools))) AND EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=a.org_id AND t.subject=a.id AND t.role='agent' AND t.active=true)",[m.workspaceId,m.scopeId,m.requester])).rows;
  if(rows.length!==2||rows.filter(r=>r.role==='quote_agent').length!==1||rows.filter(r=>r.role==='email_agent').length!==1)unavailable();
  // Capabilities below are confined to this explicit source-owned fixture setup;
  // they are not advertised metadata proof of a hosted provider integration.
  return {workspaceId:m.workspaceId,requester:m.requester,quote:{id:m.quoteId,distributorId:m.distributorId,recipient:authority.destination.recipient,sourceVersion:source.sourceVersion,currency:source.currency,subtotalMinor:source.subtotalMinor,lines:structuredClone(m.lines)},policy:{...policy.policy,active:true},approvalGrants:[{member:grants[0].member,workspaceId:m.workspaceId,quoteId:m.quoteId,policyVersion:policy.policy.version,active:true,capability:'quote.discount.approve'}],agents:rows.map(r=>({id:r.id,workspaceId:m.workspaceId,quoteId:m.quoteId,active:true,action:r.role==='quote_agent'?'quote.update':'quote.message'})),provider:{workspaceId:m.workspaceId,quoteId:m.quoteId,binding:m.quoteBinding,contract:'quote-conditional-write-1',atomicSourceVersion:true,actionIdIdempotency:true,effectReadback:true},email:{workspaceId:m.workspaceId,quoteId:m.quoteId,from:authority.destination.sender,recipient:authority.destination.recipient,actionIdIdempotency:true,effectReadback:true}};
 });
 const context=async(c:PoolClient,actor:Actor,scopeId:string):Promise<QuotePlanContextV2>=>{
  if(scopeId!==m.scopeId||actor.subject!==m.requester)throw new ControlError(403,'Only the current named requester can prepare this quote.');
  const p=await pricing(c,actor),a=await authority.currentAuthority(c,actor,m.scopeId,p.approvalGrants[0].member,p.policy.version);if(!a)throw new ControlError(409,'Current quote authority changed.');return {contract:'quote-plan-context-2',pricing:p,authority:a};
 };
 const loader=async(c:PoolClient,actor:Actor,ref:Readonly<{quoteId:string;distributorId:string}>)=>{if(ref.quoteId!==m.quoteId||ref.distributorId!==m.distributorId)throw new ControlError(409,'Saved quote source differs from installation.');return context(c,actor,m.scopeId);};
 const savedContext=async(c:PoolClient,actor:Actor,plan:Readonly<QuotePlanV2>)=>{const p=await pricing(c,actor),a=await authority.currentSavedPlanAuthority(actor,plan.planId,c);if(!a)throw new ControlError(409,'Saved quote authority changed.');return {contract:'quote-plan-context-2',pricing:p,authority:a};};
 const boundary=new QuoteActionBoundary(db,authority,savedContext,async(c,actor,ref)=>transactionContext.run(c,actor,async()=>{if(actor.orgId!==m.workspaceId||ref.workspaceId!==m.workspaceId||ref.quoteId!==m.quoteId)unavailable();await stable();const current=await provider.transport.policy();await stable();if(!current)unavailable();return {contract:current.contract,workspaceId:current.workspaceId,quoteId:current.quoteId,policy:current.policy};}),transactionContext);
 const store=new QuotePlanStore(db,loader,(c,actor,ref)=>authority.currentAuthority(c,actor,ref.scopeId,ref.member,ref.policyVersion),authority);
 const buildControllers=async(saved:SavedQuotePlan,enroll:boolean)=>{
  assertBoundQuotePlanContract(saved.plan);const plan=saved.plan as QuotePlanV2;
  if(plan.authority.scopeId!==m.scopeId||plan.workspaceId!==m.workspaceId||saved.createdBy!==m.requester)throw new ControlError(409,'Saved quote is outside this installed source.');
  const pin={quoteRequest:plan.update.request,messageRequest:plan.message.request};await stable();if(enroll)await provisioner.enroll(pin);await stable();
  const mail=m.version===2?new HttpsJsonBodyTransport(new BoundedHttpsJsonClient({origin:m.emailOrigin,transport:m.emailTransport},generation.emailCredential,stable)):new FetchSandboxConnectors('http://127.0.0.1:8018',await generation.emailCredential()),acceptance=new NativeQuoteEmailTransport(pin,provider.transport,mail),messageProvider=new NativeQuoteMailConnector(provider,pin,acceptance);
  const quote=new ConnectorControl(db,provider,boundary),message=new ConnectorControl(db,messageProvider,boundary),workflow=new WorkflowControl(db,quote,{authority,loadContext:async(c,actor)=>savedContext(c,actor,plan),message});return {quote,message,workflow};
 };
 const controllers=(saved:SavedQuotePlan)=>buildControllers(saved,true);
 // Reserved for the fresh receipt GET seam: construction itself does not enroll,
 // admit, approve, resolve pending delivery or send. Provider inspect remains GET-only.
 const observeControllers=(saved:SavedQuotePlan)=>buildControllers(saved,false);
 await stable();return {control:new QuoteDemoControl(db,m.scopeId,{store,planner,context,controllers,observeControllers,...(background?{backgroundAdmission:async(bundle:import('./demo-control').QuoteDemoBundle)=>{await stable();const admission=new TemporalQuoteAdmission(db,bundle.workflow,background.pin);return {assertReady:async(c:PoolClient)=>{await stable();await admission.assertReady(c);},transfer:async(actor:Actor,id:string)=>{await stable();const result=await admission.transfer(actor,id);await stable();return result;}};}}:{})}),assertStable:async()=>{await stable();await assertDelegation(db);},observeControllers};
}
