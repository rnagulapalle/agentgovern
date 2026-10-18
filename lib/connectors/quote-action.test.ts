import { readFile } from 'node:fs/promises';
import { ConnectorControl } from './service';
import { WorkflowControl } from '../workflows/service';
import { QuoteActionBoundary } from './quote-action';
import { parseConnectorProposal, type ConnectorProvider } from './contracts';
import { expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInstalledTenantFixture } from '../workspace/installed-tenant-fixture';
import { tokenHash } from '../durable/service';
import { transaction } from '../durable/database';
import { QuoteAuthorityControl, type QuoteDestination } from '../quotes/authority';
import { QuotePlanStore, type QuoteContextLoader } from '../quotes/store';
import type { QuotePlanProposalV2, QuotePlanContextV2 } from '../quotes/plan-v2';

const destination:QuoteDestination={contract:'private-quote-twin-1',workspaceId:'one',quoteId:'quote-42',distributorId:'distributor-7',recipient:'buyer@example.test',sender:'sales@example.test',quoteBinding:'a'.repeat(64),emailBinding:'b'.repeat(64)};
async function fixture(run:(f:Awaited<ReturnType<typeof setup>>)=>Promise<void>){const f=await setup();try{await run(f);}finally{vi.unstubAllEnvs();await f.installed.close();}}
async function setup(){
 const keys={owner:randomBytes(32).toString('base64url'),manager:randomBytes(32).toString('base64url'),colleague:randomBytes(32).toString('base64url'),foreign:randomBytes(32).toString('base64url')};
 const installed=await createInstalledTenantFixture({tenants:['one','two'],salesOrg:'one',seed:async owner=>{
  for(const [subject,org,key]of [['owner@example.test','one',keys.owner],['manager@example.test','one',keys.manager],['colleague@example.test','one',keys.colleague],['other@example.test','two',keys.foreign]]){
   await owner.query('INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,$2,$1,\'fixture\')',[subject,org]);
   await owner.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(key),subject]);
  }
 }});
 try{
 const web=installed.web('one'),owner=(await installed.context.authenticated(keys.owner)).actor,manager=(await installed.context.authenticated(keys.manager)).actor,colleague=(await installed.context.authenticated(keys.colleague)).actor,foreign=(await installed.context.authenticated(keys.foreign)).actor;
 const authority=new QuoteAuthorityControl(web,destination),scope=randomUUID();
 const quote={id:'quote-42',distributorId:'distributor-7',recipient:'buyer@example.test',sourceVersion:'v3',currency:'USD' as const,subtotalMinor:100000,lines:[{id:'line-1',quantity:10,unitPriceMinor:10000}]};
 // Test-owned source/pricing/capability snapshot for proposal validation only.
 // No actual provider read/write or atomic conformance is established here.
 const pricing={workspaceId:'one',requester:owner.subject,quote,approvalGrants:[{member:manager.subject,workspaceId:'one',quoteId:quote.id,policyVersion:3,active:true as const,capability:'quote.discount.approve' as const}],policy:{version:3,delegatedBps:1000,hardCapBps:2000,active:true as const},agents:[{id:'quote-agent',workspaceId:'one',quoteId:quote.id,action:'quote.update' as const,active:true as const},{id:'message-agent',workspaceId:'one',quoteId:quote.id,action:'quote.message' as const,active:true as const}],provider:{workspaceId:'one',quoteId:quote.id,binding:destination.quoteBinding,contract:'quote-conditional-write-1' as const,atomicSourceVersion:true as const,actionIdIdempotency:true as const,effectReadback:true as const},email:{workspaceId:'one',quoteId:quote.id,from:destination.sender,recipient:quote.recipient,actionIdIdempotency:true as const,effectReadback:true as const}};
 const loader:QuoteContextLoader=async(c,actor,reference)=>{
  expect(reference).toEqual({quoteId:quote.id,distributorId:quote.distributorId});
  const current=await authority.currentAuthority(c,actor,scope,manager.subject,3);if(!current)throw Error('Current quote proposal authority unavailable');
  return {contract:'quote-plan-context-2',pricing:structuredClone(pricing),authority:current} satisfies QuotePlanContextV2;
 };
 const store=new QuotePlanStore(web,loader,(c,actor,ref)=>authority.currentAuthority(c,actor,ref.scopeId,ref.member,ref.policyVersion),authority);
 const prepare=async()=>{
  await authority.enroll(owner,scope);await authority.grantManager(owner,scope,manager.subject,3);
  const current=await transaction(web,'one',c=>authority.currentAuthority(c,owner,scope,manager.subject,3));if(!current)throw Error('Current quote scope required');
  const action=randomUUID();return {version:'distributor-quote-plan-2',planId:randomUUID(),workspaceId:'one',requester:owner.subject,approver:manager.subject,policyVersion:3,quote:structuredClone(quote),discountBps:1400,update:{actionId:action,agentId:'quote-agent'},message:{actionId:randomUUID(),agentId:'message-agent',dependsOn:action},authority:current} satisfies QuotePlanProposalV2;
 };
 await installed.owner.query(await readFile('lib/connectors/quote-action-schema.sql','utf8'));
 for(const [id,tool,role,connector]of [['quote-agent','twin.quote','quote_agent','quote_twin'],['message-agent','twin.email','email_agent','email_twin']]){
  await installed.owner.query('INSERT INTO ll_agents(org_id,id,tools) VALUES($1,$2,$3)',['one',id,[tool]]);
  await installed.owner.query('INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES($1,$2,$2,$3,$4,$5)',['one',id,owner.subject,role,connector]);
  await installed.owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one',$2,'agent')",[tokenHash(randomBytes(32).toString('base64url')),id]);
 }
 for(const connector of ['quote','email'])await installed.owner.query("INSERT INTO ll_connector_policies(org_id,connector,version) VALUES('one',$1,3) ON CONFLICT(org_id,connector) DO UPDATE SET version=3",[connector]);
 const boundary=new QuoteActionBoundary(web,authority,async(c,actor,plan)=>({contract:'quote-plan-context-2',pricing:structuredClone(pricing),authority:await authority.currentSavedPlanAuthority(actor,plan.planId,c)}));
 const provider=(binding:string)=>({workspaceId:'one',bindingId:binding,source:vi.fn(async()=>null),write:vi.fn(async()=>{throw Error('No provider execution conformance');}),inspect:vi.fn(async()=>{throw Error('No provider execution conformance');})} satisfies ConnectorProvider);
 const quoteProvider=provider(destination.quoteBinding),emailProvider=provider(destination.emailBinding),control=new ConnectorControl(web,quoteProvider,boundary),emailControl=new ConnectorControl(web,emailProvider,boundary);
 const save=async()=>{const p=await prepare();await store.save(owner,p);for(const agent of ['quote-agent','message-agent'])await installed.owner.query('INSERT INTO ll_connector_scope_grants(org_id,scope_id,agent_id,created_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',['one',scope,agent,owner.subject]);return store.read(owner,p.planId);};
 return {workflow:new WorkflowControl(web,control,{authority,loadContext:loader}),boundary,control,emailControl,quoteProvider,emailProvider,save,installed,web,owner,manager,colleague,foreign,authority,scope,store,prepare,pricing,keys};
 }catch(e){await installed.close();throw e;}
}

it('server derives exact saved14percent quote action; duplicate reserves once; only designated independent manager reviews for15minutes',async()=>fixture(async f=>{
 const saved=await f.save();const a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 expect(a).toMatchObject({id:saved.plan.update.actionId,connector:'quote',state:'held',policy_version:3,proposed_by:f.owner.subject,payload:{contract:'quote-step-1',quoteRequest:saved.plan.update.request}});
 expect(await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update')).toMatchObject({id:a.id,payload_hash:a.payload_hash});
 expect((await f.installed.owner.query("SELECT reserved FROM ll_agents WHERE org_id='one' AND id='quote-agent'")).rows[0].reserved).toBe(1);
 await expect(f.control.review(f.owner,a.id,a.payload_hash,true)).rejects.toMatchObject({status:403});
 await expect(f.control.review(f.colleague,a.id,a.payload_hash,true)).rejects.toMatchObject({status:404});
 await expect(f.control.review(f.manager,a.id,'f'.repeat(64),true)).rejects.toMatchObject({status:409});
 const ready=await f.control.review(f.manager,a.id,a.payload_hash,true);
 expect(ready).toMatchObject({state:'ready',approved_by:f.manager.subject});expect(new Date(ready.approval_until!).getTime()-Date.now()).toBeGreaterThan(890000);
 await expect(f.control.execute(f.owner,a.id)).rejects.toMatchObject({status:503});
 expect((await f.control.read(f.owner,a.id)).state).toBe('ready');expect(f.quoteProvider.write).not.toHaveBeenCalled();
}));
it('quote email retains exact saved versioned request and cannot fall through acknowledgement adapter',async()=>fixture(async f=>{
 const saved=await f.save();const a=await f.emailControl.proposeQuote(f.owner,saved.id,saved.planHash,'message');
 expect(a).toMatchObject({connector:'email',payload:{contract:'quote-step-1',step:'message',quoteRequest:saved.plan.message.request}});
 expect(a.payload.request).toBeUndefined();await f.emailControl.review(f.manager,a.id,a.payload_hash,true);
 await expect(f.emailControl.execute(f.owner,a.id)).rejects.toMatchObject({status:503});expect(f.emailProvider.write).not.toHaveBeenCalled();
 await expect(f.control.proposeQuote(f.owner,saved.id,saved.planHash,'message')).rejects.toMatchObject({status:409});
}));
it('generic untrusted proposal rejects injected quote/bindings for both explicitquote and emailvariant',async()=>fixture(async f=>{
 const saved=await f.save();const p={actionId:saved.plan.update.actionId,agentId:'quote-agent',connector:'quote',payload:{contract:'quote-step-1',planId:saved.id,planHash:saved.planHash,step:'update',quoteRequest:saved.plan.update.request,binding:destination.quoteBinding}};
 expect(()=>parseConnectorProposal(p)).toThrow();expect(()=>parseConnectorProposal({...p,connector:'email'})).toThrow();
 await expect(f.control.propose(f.owner,p)).rejects.toMatchObject({status:400});expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
}));
it('source/policy/grant/member drift and altered hashes refuse preparation/review without provider write',async()=>fixture(async f=>{
 const saved=await f.save();await expect(f.control.proposeQuote(f.manager,saved.id,saved.planHash,'update')).rejects.toMatchObject({status:403});
 await expect(f.control.proposeQuote(f.foreign,saved.id,saved.planHash,'update')).rejects.toMatchObject({status:403});
 await expect(f.control.proposeQuote(f.owner,saved.id,'e'.repeat(64),'update')).rejects.toMatchObject({status:409});
 f.pricing.quote.sourceVersion='v4';await expect(f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update')).rejects.toMatchObject({status:409});f.pricing.quote.sourceVersion='v3';
 const a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 await f.installed.owner.query("UPDATE ll_connector_scope_grants SET active=false,version=version+1 WHERE org_id='one' AND agent_id='quote-agent'");
 await f.installed.owner.query("UPDATE ll_connector_scope_grants SET active=true,version=version+1 WHERE org_id='one' AND agent_id='quote-agent'");
 expect((await f.control.review(f.manager,a.id,a.payload_hash,true)).state).toBe('cancelled');
 expect(f.quoteProvider.write).not.toHaveBeenCalled();
}));
it('direct SQL cannot rebind saved quote request or approve with an unrelated named operator',async()=>fixture(async f=>{
 const saved=await f.save();const a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 await expect(f.web.query("UPDATE ll_connector_actions SET approved_by=$3,approval_until=clock_timestamp()+interval '15 minutes' WHERE org_id=$1 AND id=$2",['one',a.id,f.colleague.subject])).rejects.toMatchObject({code:'23514'});
 await expect(f.web.query("UPDATE ll_connector_actions SET payload=jsonb_set(payload,'{quoteRequest,body,discountBps}','1500') WHERE org_id=$1 AND id=$2",['one',a.id])).rejects.toMatchObject({code:'42501'});
 const worker=await f.installed.workload('one','worker');await expect(worker.query("UPDATE ll_connector_actions SET approved_by=$3,approval_until=clock_timestamp()+interval '15 minutes' WHERE org_id=$1 AND id=$2",['one',a.id,f.manager.subject])).rejects.toMatchObject({code:'42501'});
 expect((await f.control.read(f.owner,a.id))).toMatchObject({state:'held',approved_by:null,payload:a.payload});
}));

it('current connector policy version and active identity are required; containment cancels old ready approvals',async()=>fixture(async f=>{
 const saved=await f.save();await f.installed.owner.query("UPDATE ll_connector_policies SET version=4 WHERE org_id='one' AND connector='quote'");
 await expect(f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update')).rejects.toMatchObject({status:403});
 await f.installed.owner.query("UPDATE ll_connector_policies SET version=3 WHERE org_id='one' AND connector='quote'");
 const a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');await f.control.review(f.manager,a.id,a.payload_hash,true);
 await f.control.contain(f.owner,'quote');expect((await f.control.read(f.owner,a.id)).state).toBe('cancelled');
 await f.control.enable(f.owner,'quote');await expect(f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update')).rejects.toMatchObject({status:409});
 expect(f.quoteProvider.write).not.toHaveBeenCalled();
}));
it('revoked and reactivated manager membership never restores saved plan approval authority',async()=>fixture(async f=>{
 const saved=await f.save();const a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 await f.installed.owner.query('UPDATE ll_members SET active=false WHERE email=$1',[f.manager.subject]);
 await f.installed.owner.query('UPDATE ll_members SET active=true WHERE email=$1',[f.manager.subject]);
 await expect(f.control.review(f.manager,a.id,a.payload_hash,true)).rejects.toMatchObject({status:409});
 expect((await f.control.read(f.owner,a.id))).toMatchObject({state:'held',approved_by:null});
}));
it('unconfigured boundary, malformed step, wrong agent owner and exhausted allowance refuse without rows',async()=>fixture(async f=>{
 const saved=await f.save();
 await expect(new ConnectorControl(f.web,f.quoteProvider).proposeQuote(f.owner,saved.id,saved.planHash,'update')).rejects.toMatchObject({status:503});
 await expect(f.control.proposeQuote(f.owner,'malformed',saved.planHash,'update')).rejects.toMatchObject({status:400});
 await expect(f.control.proposeQuote(f.owner,saved.id,saved.planHash,'other' as 'update')).rejects.toMatchObject({status:400});
 await f.installed.owner.query("UPDATE ll_agents SET reserved=action_limit WHERE org_id='one' AND id='quote-agent'");
 await expect(f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update')).rejects.toMatchObject({status:403});
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
}));

it('SQL exact plan insertion and15minute expiry cannot be spoofed or extended',async()=>fixture(async f=>{
 const saved=await f.save();const a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 await expect(f.web.query("INSERT INTO ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by) SELECT org_id,id,agent_id,connector,jsonb_set(payload,'{quoteRequest,body,discountBps}','1500'),payload_hash,policy_version,'held',reason,proposed_by FROM ll_connector_actions WHERE org_id=$1 AND id=$2",['one',a.id])).rejects.toMatchObject({code:'23514'});
 await expect(f.web.query("UPDATE ll_connector_actions SET approved_by=$3,approval_until=clock_timestamp()+interval '16 minutes' WHERE org_id=$1 AND id=$2",['one',a.id,f.manager.subject])).rejects.toMatchObject({code:'23514'});
 const ready=await f.control.review(f.manager,a.id,a.payload_hash,true);
 await expect(f.web.query("UPDATE ll_connector_actions SET approval_until=approval_until+interval '1 minute' WHERE org_id=$1 AND id=$2",['one',a.id])).rejects.toMatchObject({code:'23514'});
 expect((await f.control.read(f.owner,a.id)).approval_until).toEqual(ready.approval_until);
}));
it('stale installed recovery epoch refuses both existing action review and fresh submission',async()=>fixture(async f=>{
 const saved=await f.save();const a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 await f.installed.owner.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='one'",[randomUUID()]);
 await expect(f.control.review(f.manager,a.id,a.payload_hash,true)).rejects.toMatchObject({status:503});
 await expect(f.control.proposeQuote(f.owner,saved.id,saved.planHash,'message')).rejects.toMatchObject({status:503});
 expect((await f.installed.owner.query('SELECT state,approved_by FROM ll_connector_actions')).rows).toEqual([{state:'held',approved_by:null}]);expect(f.quoteProvider.write).not.toHaveBeenCalled();
}));
it('actual installed boundary refuses malformed/cross-action authority and propagates unavailable trusted evidence',async()=>fixture(async f=>{
 const saved=await f.save(),a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 expect(()=>new QuoteActionBoundary(f.installed.owner,f.authority,async()=>null)).toThrow();
 const verify=(action:typeof a,provider:ConnectorProvider=f.quoteProvider)=>transaction(f.web,'one',c=>f.boundary.matches(c,f.owner,action,provider));
 for(const changed of [
  {...a,connector:'crm' as const,payload:{lifecycle:'customer' as const}},
  {...a,payload:null} as unknown as typeof a,
  {...a,payload:{lifecycle:'customer' as const}},
  {...a,id:randomUUID()}, {...a,agent_id:'message-agent'}, {...a,connector:'email' as const},
  {...a,policy_version:4}, {...a,proposed_by:f.manager.subject}, {...a,payload_hash:'e'.repeat(64)},
  {...a,approved_by:f.colleague.subject},
  {...a,payload:{...a.payload,extra:true}},
 ])expect(await verify(changed)).toBe(false);
 expect(await verify(a,{...f.quoteProvider,workspaceId:'two'})).toBe(false);
 await transaction(f.web,'one',async c=>{
  await expect(f.boundary.reviewer(c,f.manager,{...a,connector:'email',payload:{template:'case_received'}})).rejects.toMatchObject({status:409});
  await expect(f.boundary.reviewer(c,f.owner,a)).rejects.toMatchObject({status:403});
 });
 f.pricing.policy.delegatedBps=1500;expect(await verify(a)).toBe(false);f.pricing.policy.delegatedBps=1000;
 await f.installed.owner.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='one'",[randomUUID()]);
 await expect(verify(a)).rejects.toMatchObject({status:503});
}));

it('installed graph and exact quote actions compose without implicit authority or provider effects',async()=>fixture(async f=>{
 const saved=await f.save();
 expect(await Promise.all([f.workflow.createQuote(f.owner,saved.id),f.workflow.createQuote(f.owner,saved.id)])).toEqual([saved.id,saved.id]);
 const steps=(await f.web.query('SELECT * FROM ll_workflow_steps WHERE org_id=$1 AND run_id=$2 ORDER BY ordinal',['one',saved.id])).rows;
 expect(steps.map(s=>s.action_id)).toEqual([saved.plan.update.actionId,saved.plan.message.actionId]);
 expect(steps.map(s=>s.dependency_action_id)).toEqual([null,saved.plan.update.actionId]);
 expect((await f.web.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
 const quote=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 const message=await f.emailControl.proposeQuote(f.owner,saved.id,saved.planHash,'message');
 expect(quote.id).toBe(steps[0].action_id);expect(message.id).toBe(steps[1].action_id);
 await expect(f.control.review(f.owner,quote.id,quote.payload_hash,true)).rejects.toMatchObject({status:403});
 await f.control.review(f.manager,quote.id,quote.payload_hash,true);
 await f.emailControl.review(f.manager,message.id,message.payload_hash,true);
 await expect(f.control.execute(f.owner,quote.id)).rejects.toMatchObject({status:503});
 await expect(f.emailControl.execute(f.owner,message.id)).rejects.toMatchObject({status:503});
 expect(f.quoteProvider.write).not.toHaveBeenCalled();expect(f.emailProvider.write).not.toHaveBeenCalled();
 expect((await f.web.query('SELECT kind FROM ll_workflow_events WHERE org_id=$1 AND run_id=$2',['one',saved.id])).rows).toEqual([{kind:'created'}]);
}));
it('installed graph creation refuses foreign, manager and revoked agent; workload cannot insert graph',async()=>fixture(async f=>{
 const saved=await f.save();
 for(const actor of [f.foreign,f.manager,f.colleague])await expect(f.workflow.createQuote(actor,saved.id)).rejects.toThrow();
 const worker=await f.installed.workload('one','worker');
 await expect(worker.query("INSERT INTO ll_workflow_runs(org_id,id,created_by,workflow_kind,quote_plan_id,quote_plan_hash) VALUES('one',$1,$2,'distributor-quote',$1,$3)",[saved.id,f.owner.subject,saved.planHash])).rejects.toMatchObject({code:'42501'});
 await f.installed.owner.query("UPDATE ll_agents SET active=false WHERE org_id='one' AND id='quote-agent'");
 await expect(f.workflow.createQuote(f.owner,saved.id)).rejects.toMatchObject({status:403});
 expect((await f.web.query('SELECT count(*)::int n FROM ll_workflow_runs')).rows[0].n).toBe(0);
 expect((await f.web.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
}));
it('installed read-only quote view permits actual owner/designated manager and never creates actions or grants approval',async()=>fixture(async f=>{
 const saved=await f.save();await f.workflow.createQuote(f.owner,saved.id);
 for(const actor of [f.owner,f.manager]){
  const view=(await f.workflow.read(actor,saved.id)).quoteView;
  expect(view).toMatchObject({contract:'quote-workflow-view-1',quoteId:'quote-42',discountBps:1400,delegatedBps:1000,totalMinor:86000,manager:f.manager.subject,completion:'not-established'});
  expect(view.steps.map((s: {status:string})=>s.status)).toEqual(['Manager approval required','Waiting for verified quote and separate approval']);
 }
 for(const actor of [f.colleague,f.foreign,{...f.owner,tokenHash:'wrong'}])await expect(f.workflow.read(actor,saved.id)).rejects.toThrow();
 const token=(await f.installed.owner.query("SELECT hash FROM ll_tokens WHERE org_id='one' AND subject='quote-agent' AND role='agent'")).rows[0];
 await expect(f.workflow.read({...f.owner,role:'agent',subject:'quote-agent',tokenHash:token.hash},saved.id)).rejects.toMatchObject({status:403});
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
 expect(f.quoteProvider.source).not.toHaveBeenCalled();expect(f.quoteProvider.inspect).not.toHaveBeenCalled();expect(f.quoteProvider.write).not.toHaveBeenCalled();
}));
it('recorded success/observations alone cannot promote readonly quote view to verified completion',async()=>fixture(async f=>{
 const saved=await f.save();await f.workflow.createQuote(f.owner,saved.id);
 const a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');await f.control.review(f.manager,a.id,a.payload_hash,true);
 expect((await f.workflow.read(f.manager,saved.id)).quoteView.steps[0].status).toBe('Exact approval recorded; execution checks pending');
 // Explicit owner fault injection represents stored state, not provider evidence.
 await f.installed.owner.query("UPDATE ll_connector_actions SET state='succeeded',evidence=$2 WHERE id=$1",[a.id,JSON.stringify({outcome:'verified',reference:'recorded-fixture-only',detail:'Fixture observation, not current verification'})]);
 const view=(await f.workflow.read(f.owner,saved.id)).quoteView;
 expect(view.completion).toBe('not-established');expect(view.steps[0].status).toBe('Quote effect recorded; current verification required');expect(view.steps[1].status).toContain('Waiting for verified quote');
 await f.installed.owner.query("UPDATE ll_connector_actions SET state='uncertain' WHERE id=$1",[a.id]);
 expect((await f.workflow.read(f.manager,saved.id)).quoteView.steps[0].status).toBe('Outcome awaiting verification');
 expect(f.quoteProvider.inspect).not.toHaveBeenCalled();expect(f.quoteProvider.write).not.toHaveBeenCalled();
}));
it('revoked or silently reactivated designated manager cannot regain exact graph review visibility',async()=>fixture(async f=>{
 const saved=await f.save();await f.workflow.createQuote(f.owner,saved.id);
 await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,false,1);
 await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,true,2);
 for(const actor of [f.owner,f.manager])await expect(f.workflow.read(actor,saved.id)).rejects.toMatchObject({status:409});
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
}));
it('all stored action phases keep readonly business status and never infer final verification',async()=>fixture(async f=>{
 const saved=await f.save();await f.workflow.createQuote(f.owner,saved.id);
 const q=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');const e=await f.emailControl.proposeQuote(f.owner,saved.id,saved.planHash,'message');
 await f.control.review(f.manager,q.id,q.payload_hash,true);await f.emailControl.review(f.manager,e.id,e.payload_hash,true);
 const cases=[
  ['held','Manager approval required','Waiting for verified quote and separate approval'],
  ['ready','Exact approval recorded; execution checks pending','Exact approval recorded; waiting for verified quote'],
  ['executing','Outcome awaiting verification','Outcome awaiting verification'],
  ['uncertain','Outcome awaiting verification','Outcome awaiting verification'],
  ['succeeded','Quote effect recorded; current verification required','Message acceptance recorded; final verification pending'],
  ['conflict','Needs review; dependent work stays held','Needs review; dependent work stays held'],
  ['rejected','Needs review; dependent work stays held','Needs review; dependent work stays held'],
  ['cancelled','Needs review; dependent work stays held','Needs review; dependent work stays held'],
 ];
 for(const [state,quoteStatus,emailStatus] of cases){
  // Owner fixture fault injection tests presentation; no provider outcome is fabricated.
  await f.installed.owner.query("UPDATE ll_connector_actions SET state=$1 WHERE id=ANY($2::uuid[])",[state,[q.id,e.id]]);
  const view=(await f.workflow.read(f.manager,saved.id)).quoteView;
  expect(view.steps.map((s:{status:string})=>s.status)).toEqual([quoteStatus,emailStatus]);expect(view.completion).toBe('not-established');
 }
 expect(f.quoteProvider.inspect).not.toHaveBeenCalled();expect(f.emailProvider.inspect).not.toHaveBeenCalled();
}));
