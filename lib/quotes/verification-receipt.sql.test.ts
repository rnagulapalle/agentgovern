import { readFile } from 'node:fs/promises';
import { ConnectorControl } from '../connectors/service';
import { QuoteActionBoundary } from '../connectors/quote-action';
import { WorkflowControl } from '../workflows/service';
import { createQuoteVerificationReceipt } from './verification-receipt';
import { quoteRequestIdentity } from './effect';
import { nativeMailIdentity } from './native-email-transport';
import { quotePlanDigest } from './digest';
import { expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInstalledTenantFixture } from '../workspace/installed-tenant-fixture';
import { tokenHash } from '../durable/service';
import { transaction } from '../durable/database';
import { QuoteAuthorityControl, type QuoteDestination } from './authority';
import { QuotePlanStore, type QuoteContextLoader } from './store';
import type { QuotePlanProposalV2, QuotePlanContextV2 } from './plan-v2';

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
  expect(actor.subject).toBe(owner.subject);expect(reference).toEqual({quoteId:quote.id,distributorId:quote.distributorId});
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
 const boundary=new QuoteActionBoundary(web,authority,async(c,actor,plan)=>({contract:'quote-plan-context-2',pricing:structuredClone(pricing),authority:await authority.currentSavedPlanAuthority(actor,plan.planId,c)}),async()=>({contract:'quote-pricing-policy-1',workspaceId:'one',quoteId:quote.id,policy:structuredClone(pricing.policy)}));
 // SQL/role contract fixture only: no provider mutation or successful readback.
 const provider=(bindingId:string)=>({bindingId,workspaceId:'one',source:vi.fn(async()=>null),write:vi.fn(async()=>{throw Error('No provider proof');}),inspect:vi.fn(async()=>{throw Error('No provider proof');})});
 const control=new ConnectorControl(web,provider(destination.quoteBinding),boundary),message=new ConnectorControl(web,provider(destination.emailBinding),boundary),flow=new WorkflowControl(web,control,{authority,loadContext:loader,message});
 const ready=async()=>{const proposal=await prepare(),saved=await store.save(owner,proposal);for(const agent of ['quote-agent','message-agent'])await installed.owner.query('INSERT INTO ll_connector_scope_grants(org_id,scope_id,agent_id,created_by) VALUES($1,$2,$3,$4)',['one',scope,agent,owner.subject]);await flow.createQuote(owner,saved.id);const q=await control.proposeQuote(owner,saved.id,saved.planHash,'update'),m=await message.proposeQuote(owner,saved.id,saved.planHash,'message');await control.review(manager,q.id,q.payload_hash,true);await message.review(manager,m.id,m.payload_hash,true);
 // Owner-only historical-state injection, never product execution proof.
 const references=[randomUUID(),'fixture_mail_42'];for(const [i,a]of [q,m].entries())await installed.owner.query("UPDATE ll_connector_actions SET state='succeeded',evidence=$2 WHERE id=$1",[a.id,{outcome:'verified',detail:'Explicit SQL metadata fixture; no provider effect.',reference:references[i]}]);
 if(saved.plan.version!=='distributor-quote-plan-2')throw Error('Expected bound quote plan');
 const at=(await web.query("SELECT date_trunc('milliseconds',clock_timestamp()) AS at")).rows[0].at.toISOString();
 const receipt=createQuoteVerificationReceipt({workspaceId:'one',runId:saved.id,planHash:saved.planHash,quoteId:quote.id,recoveryEpoch:saved.plan.authority.recoveryEpoch,verifiedBy:owner.subject,verifiedAt:at,steps:[{ordinal:1,actionId:q.id,binding:destination.quoteBinding,requestIdentity:quoteRequestIdentity(saved.plan.update.request)!,payloadHash:q.payload_hash,effectDigest:'c'.repeat(64),providerReference:references[0],sourceAfter:'v4'},{ordinal:2,actionId:m.id,binding:destination.emailBinding,requestIdentity:nativeMailIdentity(saved.plan.message.request)!,payloadHash:m.payload_hash,effectDigest:'d'.repeat(64),providerReference:references[1],sourceAfter:null}]});return{saved,receipt};};
 const insert=(db:typeof web,receipt:ReturnType<typeof createQuoteVerificationReceipt>)=>db.query("INSERT INTO ll_workflow_events(org_id,run_id,kind,subject,at,quote_verification) VALUES($1,$2,'verified',$3,$4,$5)",[receipt.workspaceId,receipt.runId,receipt.verifiedBy,receipt.verifiedAt,receipt]);
 return {installed,web,owner,manager,colleague,foreign,authority,scope,store,prepare,pricing,keys,flow,control,message,ready,insert};
 }catch(e){await installed.close();throw e;}
}
it('installed web retains exact append-only observation metadata; duplicate, poller and foreign writes refuse; read never treats injected completion as provider proof',async()=>fixture(async f=>{
 const {saved,receipt}=await f.ready();await f.web.query("UPDATE ll_workflow_runs SET state='completed' WHERE id=$1",[saved.id]);await f.insert(f.web,receipt);
 expect((await f.flow.quoteVerification(f.owner,saved.id)).historical).toEqual(receipt);expect((await f.flow.quoteVerification(f.manager,saved.id)).current.outcome).toBe('unknown');
 await expect(f.insert(f.web,receipt)).rejects.toMatchObject({code:'23505'});
 await expect(f.web.query("UPDATE ll_workflow_events SET kind='changed' WHERE run_id=$1",[saved.id])).rejects.toMatchObject({code:'42501'});
 await expect(f.installed.owner.query("UPDATE ll_workflow_events SET kind='changed' WHERE run_id=$1",[saved.id])).rejects.toMatchObject({code:'P0001'});
 await expect(f.installed.owner.query("DELETE FROM ll_workflow_events WHERE run_id=$1",[saved.id])).rejects.toMatchObject({code:'P0001'});
 expect((await f.installed.web('two').query('SELECT * FROM ll_workflow_events WHERE run_id=$1',[saved.id])).rows).toEqual([]);
 await expect(f.insert(f.installed.web('two'),receipt)).rejects.toThrow();
 await expect(f.insert(await f.installed.workload('one','worker'),receipt)).rejects.toMatchObject({code:'23514'});
 await expect(f.insert(await f.installed.workload('one','scheduler'),receipt)).rejects.toMatchObject({code:'42501'});
 await expect(f.flow.quoteVerification(f.colleague,saved.id)).rejects.toMatchObject({status:403});await expect(f.flow.quoteVerification(f.foreign,saved.id)).rejects.toMatchObject({status:403});
 expect((await f.web.query('SELECT count(*)::int n FROM ll_workflow_events WHERE quote_verification IS NOT NULL')).rows[0].n).toBe(1);
}));
it('SQL guard rejects missing/foreign/malformed references, exact step and payload/epoch mismatch without an observation event',async()=>fixture(async f=>{
 const {saved,receipt}=await f.ready();await f.web.query("UPDATE ll_workflow_runs SET state='completed' WHERE id=$1",[saved.id]);
 for(const mutate of [(r:typeof receipt)=>{r.planHash='e'.repeat(64);},(r:typeof receipt)=>{r.steps.reverse();},(r:typeof receipt)=>{r.steps[0].payloadHash='f'.repeat(64);},(r:typeof receipt)=>{r.steps[1].providerReference='unknown';},(r:typeof receipt)=>{r.recoveryEpoch=randomUUID();},(r:typeof receipt)=>{r.verifiedBy=f.colleague.subject;},(r:typeof receipt)=>{r.steps[0].sourceAfter='v3';},(r:typeof receipt)=>{r.steps[1].binding=destination.quoteBinding;}]){const changed=structuredClone(receipt);mutate(changed);const {receiptHash:_hash,...body}=changed;void _hash;changed.receiptHash=quotePlanDigest(body);await expect(f.insert(f.web,changed)).rejects.toMatchObject({code:'23514'});}
 await expect(f.web.query("INSERT INTO ll_workflow_events(org_id,run_id,kind,subject) VALUES('one',$1,'verified',$2)",[saved.id,f.owner.subject])).rejects.toMatchObject({code:'23514'});
 expect((await f.web.query('SELECT count(*)::int n FROM ll_workflow_events WHERE quote_verification IS NOT NULL')).rows[0].n).toBe(0);
}));
it('failed record insertion rolls back run completion atomically; paused state and revoked identity never grant current verification',async()=>fixture(async f=>{
 const {saved,receipt}=await f.ready();const bad={...receipt,planHash:'e'.repeat(64)};
 await expect(transaction(f.web,'one',async c=>{await c.query("UPDATE ll_workflow_runs SET state='completed' WHERE id=$1",[saved.id]);await c.query("INSERT INTO ll_workflow_events(org_id,run_id,kind,subject,at,quote_verification) VALUES('one',$1,'verified',$2,$3,$4)",[saved.id,f.owner.subject,receipt.verifiedAt,bad]);})).rejects.toMatchObject({code:'23514'});
 expect((await f.web.query('SELECT state FROM ll_workflow_runs WHERE id=$1',[saved.id])).rows[0].state).toBe('active');
 await f.web.query("UPDATE ll_workflow_runs SET state='completed' WHERE id=$1",[saved.id]);await f.insert(f.web,receipt);await f.web.query("UPDATE ll_workflow_runs SET state='paused' WHERE id=$1",[saved.id]);
 const view=await f.flow.quoteVerification(f.owner,saved.id);expect(view.historical).toEqual(receipt);expect(view.current.outcome).toBe('conflict');await expect(f.flow.verify(f.owner,saved.id)).rejects.toMatchObject({status:409});
 await f.installed.owner.query('UPDATE ll_members SET active=false WHERE email=$1',[f.manager.subject]);await expect(f.flow.quoteVerification(f.manager,saved.id)).rejects.toMatchObject({status:403});expect((await f.web.query('SELECT count(*)::int n FROM ll_workflow_events WHERE quote_verification IS NOT NULL')).rows[0].n).toBe(1);
}));
