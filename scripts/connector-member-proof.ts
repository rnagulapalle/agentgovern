/** Extension of connector-proof.ts's existing installed PostgreSQL / private HTTP
 * fixture. No server, provider, dispatcher or parallel proof runner is created. */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import type {TenantContext} from '../lib/workspace/tenant-context';
import {passwordHash} from '../lib/workspace/auth';
import {installConnectorMemberAccess} from '../lib/workspace/connector-member-access-migration';
import type {ConnectorMemberAccess} from '../lib/workspace/connector-member-access';
import {ConnectorControl} from '../lib/connectors/service';
import {ScopeControl} from '../lib/connectors/scopes';
import {WorkflowControl} from '../lib/workflows/service';
import type {FetchSandboxConnectors} from '../lib/connectors/twin';
import type {Actor} from '../lib/durable/contracts';
type Check=(name:string,run:()=>Promise<void>,limit:string)=>Promise<void>;
export async function proveConnectorMembers(input:{owner:Pool;web:Pool;context:TenantContext;provider:FetchSandboxConnectors;check:Check;effectCount:()=>Promise<number>}){
 const {owner,web,context,provider,check,effectCount}=input,org=provider.workspaceId;
 const entries=[['admin','person-001'],['requester','person-142'],['reviewer','person-141'],['executor','person-143'],['observer','person-144']] as const;
 const actors:Record<string,Actor>={};
 for(const [role] of entries){const email=role+'@fetchsandbox.example',password=randomBytes(24).toString('base64url');await owner.query('INSERT INTO ll_members(org_id,email,name,password_hash)VALUES($1,$2,$3,$4)',[org,email,'FetchSandbox '+role,passwordHash(password)]);const token=await context.login({email,password});actors[role]=(await context.authenticated(token)).actor;}
 const admin=actors.admin,requester=actors.requester,reviewer=actors.reviewer,executor=actors.executor,observer=actors.observer;
 await owner.query("INSERT INTO ll_connector_policies(org_id,connector)VALUES($1,'crm'),($1,'email') ON CONFLICT DO NOTHING",[org]);
 for(const [id,tool,role,connector]of [['fs-crm','twin.crm','crm_agent','crm_twin'],['fs-email','twin.email','email_agent','email_twin']]){
  await owner.query('INSERT INTO ll_agents(org_id,id,tools,action_limit)VALUES($1,$2,$3,100)',[org,id,[tool]]);
  await owner.query('INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector)VALUES($1,$2,$2,$3,$4,$5)',[org,id,requester.subject,role,connector]);
  await owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role)VALUES($1,$2,$3,'agent')",[randomBytes(32).toString('hex'),org,id]);
 }
 const scopes=new ScopeControl(web,provider),scopeId=randomUUID();await scopes.enroll(admin,scopeId);for(const agent of ['fs-crm','fs-email'])await scopes.grant(admin,scopeId,agent);
 const control=new ConnectorControl(web,provider),flows=new WorkflowControl(web,control);
 let enrolled=false;
 const proposed=async()=>{
  if(!enrolled)return control.propose(requester,{actionId:randomUUID(),agentId:'fs-crm',connector:'crm',payload:{lifecycle:'customer'}});
  const id=randomUUID();await flows.create(requester,'fs-crm','fs-email',id);const step=(await flows.read(requester,id)).steps[0];return control.propose(requester,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});
 };
 let historical!:Awaited<ReturnType<typeof proposed>>,historicalApproval:unknown;
 await check('FetchSandbox before enrollment: ordinary invited observer shares operator review authority',async()=>{
  historical=await proposed();assert.equal((await control.review(observer,historical.id,historical.payload_hash,true)).state,'ready');historicalApproval=(await owner.query('SELECT membership_approval FROM ll_connector_actions WHERE org_id=$1 AND id=$2',[org,historical.id])).rows[0].membership_approval;
 },'Measured legacy configuration gap; approval only, no provider effect. This is not pre-change native-agent acceptance.');
 const permissions={requester:['read','propose'],reviewer:['read','review'],executor:['read','execute','reconcile'],observer:['read']} as const;
 const policy:ConnectorMemberAccess={contract:'connector-member-access-1',version:1,administrators:[admin.subject],members:entries.filter(([role])=>role!=='admin').map(([role,personId])=>({subject:actors[role].subject,personId,grants:([['fs-crm','crm'],['fs-email','email']] as const).map(([agentId,connector])=>({agentId,connector,scopeId,bindingId:provider.bindingId,permissions:[...permissions[role as keyof typeof permissions]],expiresAt:new Date(Date.now()+3600000).toISOString()}))}))};
 const update=async(mutate:(p:ConnectorMemberAccess)=>void)=>{const next=structuredClone(policy);next.version++;mutate(next);await installConnectorMemberAccess(owner,org,next);Object.assign(policy,next);};
 await check('FetchSandbox authority enrollment is owner-only and repeat-safe; retained approval is fenced without rewriting history',async()=>{
  await assert.rejects(()=>installConnectorMemberAccess(web,org,policy));assert.equal((await installConnectorMemberAccess(owner,org,policy)).version,1);assert.equal((await installConnectorMemberAccess(owner,org,policy)).repeated,true);
  assert.deepEqual((await owner.query('SELECT membership_approval FROM ll_connector_actions WHERE org_id=$1 AND id=$2',[org,historical.id])).rows[0].membership_approval,historicalApproval);
  const before=await effectCount();assert.equal((await control.execute(executor,historical.id)).state,'cancelled');assert.equal(await effectCount(),before);
  await assert.rejects(()=>web.query('UPDATE ll_orgs SET connector_member_access=$2 WHERE id=$1',[org,JSON.stringify({...policy,version:2})]));
 },'Existing identities and membership generations reused. No new runtime, permissions API or historical receipt rewrite.');
 await check('FetchSandbox scoped members cannot approve, execute, administer or impersonate outside their assigned operation',async()=>{
  const a=await proposed();await assert.rejects(()=>control.review(observer,a.id,a.payload_hash,true));await assert.rejects(()=>control.review(requester,a.id,a.payload_hash,true));await assert.rejects(()=>control.execute(requester,a.id));await assert.rejects(()=>control.contain(observer,'crm'));await assert.rejects(()=>scopes.grant(observer,scopeId,'fs-crm'));
  await assert.rejects(()=>control.propose(requester,{actionId:randomUUID(),agentId:'fs-crm',connector:'email',payload:{template:'case_received'}}));
  await assert.rejects(()=>control.propose(requester,{actionId:randomUUID(),agentId:'fs-crm',connector:'crm',payload:{lifecycle:'customer',recipient:'wrong@example.test'}}));
  const wrong=Object.create(provider) as FetchSandboxConnectors;Object.defineProperty(wrong,'recordScope',{value:{...provider.recordScope,contactId:'9999',recipient:'wrong@example.test'}});await assert.rejects(()=>new ConnectorControl(web,wrong).propose(requester,{actionId:randomUUID(),agentId:'fs-crm',connector:'crm',payload:{lifecycle:'customer'}}));
  const foreign={...requester,orgId:'local-proof'};await assert.rejects(()=>control.read(foreign,a.id));
 },'Denied cases produce no new effects. Provider destinations and recipients are server-owned; no client-selected fallback.');
 let runId:string,completed:unknown;
 await check('FetchSandbox existing CRM-to-message graph: named requester, independent reviewer, scoped executor, two actual private HTTP effects and replay',async()=>{
  const before=await effectCount();runId=randomUUID();await flows.create(requester,'fs-crm','fs-email',runId);
  const run=await flows.read(requester,runId);assert.equal(run.steps.length,2);
  for(const step of run.steps){const a=await control.propose(requester,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});await control.review(reviewer,a.id,a.payload_hash,true);const outcome=await control.execute(executor,a.id);console.log('FETCHSANDBOX_STEP',JSON.stringify({connector:step.connector,state:outcome.state}));assert.equal(outcome.state,'succeeded');}
  console.log('FETCHSANDBOX_EFFECT_COUNT',JSON.stringify({before,after:await effectCount()}));assert.equal((await flows.verify(executor,runId)).verified,true);completed=await flows.read(executor,runId);assert.equal((completed as {state:string}).state,'completed');enrolled=true;assert.equal(await effectCount(),before+2);
  const reload=new ConnectorControl(web,provider);for(const step of run.steps)assert.equal((await reload.execute(executor,step.action_id)).state,'succeeded');assert.equal(await effectCount(),before+2);
  const contact=await provider.contact();console.log('FETCHSANDBOX_CONTACT_MATCH',JSON.stringify({record:contact.id===provider.contactId,lifecycle:contact.properties.lifecyclestage==='customer'}));assert.equal(contact.id,provider.contactId);assert.equal(contact.properties.lifecyclestage,'customer');
 },'Real HTTP to private HubSpot/Resend twins; simulated email, no live CRM or delivery. Same existing graph and execution owner; plain named operators, not native LLM-agent acceptance.');
 await check('FetchSandbox revocation and restoration cannot release retained approval; fresh work can be reviewed',async()=>{
  const a=await proposed();await control.review(reviewer,a.id,a.payload_hash,true);const before=await effectCount();
  const saved=structuredClone(policy.members.find(m=>m.subject===requester.subject)!.grants);
  await update(p=>{p.members.find(m=>m.subject===requester.subject)!.grants=[];});await assert.rejects(()=>proposed());
  await update(p=>{p.members.find(m=>m.subject===requester.subject)!.grants=saved;});assert.equal((await control.execute(executor,a.id)).state,'cancelled');assert.equal(await effectCount(),before);
  const fresh=await proposed();assert.equal((await control.review(reviewer,fresh.id,fresh.payload_hash,true)).state,'ready');
 },'Current policy/generation checked; restore grants never updates the retained action or approval snapshot.');
 await check('FetchSandbox executor revocation during actual HTTP write preserves uncertainty and forbids resend',async()=>{
  const a=await proposed();await control.review(reviewer,a.id,a.payload_hash,true);const before=await effectCount();
  const delayed=Object.create(provider) as FetchSandboxConnectors;delayed.write=async(action,lose)=>{const result=await provider.write(action,lose);await update(p=>{p.members.find(m=>m.subject===executor.subject)!.grants=[];});return result;};
  const result=await new ConnectorControl(web,delayed).execute(executor,a.id);assert.equal(result.state,'uncertain');assert.equal((result.evidence as {outcome?:string}|null)?.outcome,'verified');assert.equal(await effectCount(),before+1);await assert.rejects(()=>control.execute(executor,a.id));assert.equal(await effectCount(),before+1);
  assert.equal((await control.read(admin,a.id)).id,a.id);
 },'Revocation injected after native fixture mutation, before completion. Outcome retained as evidence, not current authority or success; no resend.');
 return {company:'FetchSandbox',org,scopeId,runId:runId!,state:(completed as {state:string}).state,identities:entries.length,authorityVersion:policy.version,nativeAgentAcceptance:false,liveProvider:false};
}
