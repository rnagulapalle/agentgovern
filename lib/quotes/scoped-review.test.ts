import { expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInstalledTenantFixture } from '../workspace/installed-tenant-fixture';
import { tokenHash } from '../durable/service';
import { transaction } from '../durable/database';
import { quarantineRestore } from '../durable/recovery';
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
 return {installed,web,owner,manager,colleague,foreign,authority,scope,store,prepare,pricing,keys};
 }catch(e){await installed.close();throw e;}
}
it('installed named owner saves exact14% proposal above10%; designated manager reviews same immutable plan with no execution authority',async()=>fixture(async f=>{
 delete process.env.LOOPLABS_RECOVERY_EPOCH;
 const p=await f.prepare(),saved=await f.store.save(f.owner,p);
 expect(saved.plan).toMatchObject({discountBps:1400,totalMinor:86000,decision:'independent-review-required',reason:'above-delegation'});
 expect(saved.plan.policy.delegatedBps).toBe(1000);
 expect(await f.store.readForReview(f.manager,p.planId)).toEqual(saved);expect(await f.store.readForReview(f.owner,p.planId)).toEqual(saved);
 expect(await f.store.save(f.owner,p)).toEqual(saved);expect(await f.store.read(f.owner,p.planId)).toEqual(saved);
 await expect(f.store.read(f.manager,p.planId)).rejects.toMatchObject({status:404});
 for(const table of ['ll_connector_actions','ll_workflow_runs','ll_actions','ll_refund_actions'])expect((await f.installed.owner.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_plans')).rows[0].n).toBe(1);
 expect((await f.installed.owner.query('SELECT requester_membership_generation,manager_membership_generation FROM ll_quote_plans')).rows[0]).toEqual({requester_membership_generation:'1',manager_membership_generation:'1'});
 expect(saved.plan).not.toHaveProperty('approved_by');
}));
it('unrelated member/foreign session/self manager/malformed proposal cannot acquire exact review or grant approval',async()=>fixture(async f=>{
 const p=await f.prepare();await f.store.save(f.owner,p);
 await expect(f.store.readForReview(f.colleague,p.planId)).rejects.toMatchObject({status:404});
 const foreignStore=new QuotePlanStore(f.installed.web('two'),async()=>{throw Error('Never load foreign quote');},undefined,new QuoteAuthorityControl(f.installed.web('two'),{...destination,workspaceId:'two'}));
 await expect(foreignStore.readForReview(f.foreign,p.planId)).rejects.toMatchObject({status:404});
 await expect(f.store.readForReview(f.foreign,p.planId)).rejects.toMatchObject({status:403});
 await expect(f.authority.grantManager(f.owner,f.scope,f.owner.subject,3)).rejects.toMatchObject({status:403});
 await expect(f.store.save(f.owner,{...p,approver:f.owner.subject})).rejects.toThrow();
 await expect(f.store.readForReview(f.manager,'bad')).rejects.toMatchObject({status:400});
 await expect(new QuotePlanStore(f.web,async()=>null).readForReview(f.manager,p.planId)).rejects.toMatchObject({status:409});
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_plans')).rows[0].n).toBe(1);
}));
it('changed source/discount/manager or owner generations never silently rebind an existing plan',async()=>fixture(async f=>{
 const p=await f.prepare();await f.store.save(f.owner,p);
 await expect(f.store.save(f.owner,{...p,discountBps:1500})).rejects.toMatchObject({status:409});
 f.pricing.quote.sourceVersion='v4';await expect(f.store.save(f.owner,p)).rejects.toMatchObject({status:409});f.pricing.quote.sourceVersion='v3';
 await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,false,1);
 await expect(f.store.readForReview(f.manager,p.planId)).rejects.toMatchObject({status:409});
 await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,true,2);
 await expect(f.store.readForReview(f.manager,p.planId)).rejects.toMatchObject({status:409});
 await f.installed.owner.query("UPDATE ll_members SET active=false WHERE email=$1",[f.owner.subject]);
 await f.installed.owner.query("UPDATE ll_members SET active=true WHERE email=$1",[f.owner.subject]);
 await expect(f.store.readForReview(f.manager,p.planId)).rejects.toMatchObject({status:409});
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
}));
it('installed epoch cannot be replaced by global environment, while owner-injected epoch drift and restore refuse exact review',async()=>fixture(async f=>{
 const p=await f.prepare();const saved=await f.store.save(f.owner,p);
 vi.stubEnv('LOOPLABS_RECOVERY_EPOCH',randomUUID());expect(await f.store.readForReview(f.manager,p.planId)).toEqual(saved);
 const current=p.authority.recoveryEpoch;
 await f.installed.owner.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='one'",[randomUUID()]);
 await expect(f.store.readForReview(f.manager,p.planId)).rejects.toMatchObject({status:503});
 await expect(f.store.save(f.owner,p)).rejects.toMatchObject({status:503});
 await f.installed.owner.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='one'",[current]);
 const before=(await f.installed.owner.query('SELECT plan,plan_hash FROM ll_quote_plans')).rows;
 await expect(quarantineRestore(f.installed.owner,'one',randomUUID(),'bad')).rejects.toMatchObject({status:400});
 await quarantineRestore(f.installed.owner,'one',randomUUID(),'a'.repeat(64));
 await expect(f.store.readForReview(f.manager,p.planId)).rejects.toMatchObject({status:503});
 expect((await f.installed.owner.query('SELECT plan,plan_hash FROM ll_quote_plans')).rows).toEqual(before);
}));
it('actual scoped roles enforce exact quote grant/proposal operations and retain forbidden mutation/foreign/workload boundaries',async()=>fixture(async f=>{
 const p=await f.prepare();await f.store.save(f.owner,p);
 const worker=await f.installed.workload('one','worker'),scheduler=await f.installed.workload('one','scheduler');
 for(const pool of [worker,scheduler]){
  await expect(pool.query('INSERT INTO ll_quote_manager_grants(org_id,scope_id,member,policy_version,capability,created_by) VALUES($1,$2,$3,4,\'quote.discount.approve\',$4)',['one',f.scope,f.manager.subject,f.owner.subject])).rejects.toMatchObject({code:'42501'});
  await expect(pool.query('INSERT INTO ll_quote_plans(org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id) SELECT org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id FROM ll_quote_plans')).rejects.toMatchObject({code:'42501'});
 }
 expect((await f.installed.web('two').query('SELECT id FROM ll_quote_plans')).rows).toEqual([]);
 await expect(f.installed.web('two').query("INSERT INTO ll_quote_manager_grants(org_id,scope_id,member,policy_version,capability,created_by) VALUES('one',$1,$2,4,'quote.discount.approve',$3)",[f.scope,f.manager.subject,f.owner.subject])).rejects.toMatchObject({code:'23514'});
 for(const pool of [worker,scheduler])await expect(pool.query('UPDATE ll_quote_manager_grants SET active=false,version=version+1')).rejects.toMatchObject({code:'42501'});
 for(const sql of ["UPDATE ll_quote_plans SET plan_hash=repeat('c',64)",'DELETE FROM ll_quote_plans','TRUNCATE ll_quote_plans',"UPDATE ll_quote_manager_grants SET capability='other'",'DELETE FROM ll_quote_manager_grants','TRUNCATE ll_quote_manager_grants'])await expect(f.web.query(sql)).rejects.toMatchObject({code:'42501'});
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_plans')).rows[0].n).toBe(1);
}));
it('owner membership revocation/reactivation alone invalidates otherwise unchanged saved quote review',async()=>fixture(async f=>{
 const p=await f.prepare();await f.store.save(f.owner,p);
 await f.installed.owner.query('UPDATE ll_members SET active=false WHERE email=$1',[f.owner.subject]);
 await f.installed.owner.query('UPDATE ll_members SET active=true WHERE email=$1',[f.owner.subject]);
 expect((await f.installed.owner.query('SELECT version,active FROM ll_quote_manager_grants')).rows[0]).toEqual({version:1,active:true});
 expect((await f.installed.owner.query('SELECT version,active FROM ll_connector_scopes')).rows[0]).toEqual({version:1,active:true});
 await expect(f.store.readForReview(f.manager,p.planId)).rejects.toMatchObject({status:409});
 await expect(f.store.save(f.owner,p)).rejects.toMatchObject({status:409});
}));
it('designated manager membership cycle revokes its grant and cannot revive saved proposal authority',async()=>fixture(async f=>{
 const p=await f.prepare();await f.store.save(f.owner,p);
 await f.installed.owner.query('UPDATE ll_members SET active=false WHERE email=$1',[f.manager.subject]);
 await f.installed.owner.query('UPDATE ll_members SET active=true WHERE email=$1',[f.manager.subject]);
 await expect(f.store.readForReview(f.manager,p.planId)).rejects.toMatchObject({status:409});
 expect((await f.installed.owner.query('SELECT version,active FROM ll_quote_manager_grants')).rows[0]).toEqual({version:2,active:false});
 await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,true,2);
 await expect(f.store.readForReview(f.manager,p.planId)).rejects.toMatchObject({status:409});
}));
it('privileged historical hash corruption fails exact manager review without returning a forged proposal',async()=>fixture(async f=>{
 const p=await f.prepare();await f.store.save(f.owner,p);
 // Offline archive-corruption injection only; runtime cannot disable triggers.
 await f.installed.owner.query('ALTER TABLE ll_quote_plans DISABLE TRIGGER ll_quote_plan_immutable');
 try{await f.installed.owner.query("UPDATE ll_quote_plans SET plan_hash=repeat('c',64)");}
 finally{await f.installed.owner.query('ALTER TABLE ll_quote_plans ENABLE TRIGGER ll_quote_plan_immutable');}
 await expect(f.store.readForReview(f.manager,p.planId)).rejects.toMatchObject({status:409});
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
}));
it('historical unbound proposals remain owner-readable but cannot become exact manager review authority',async()=>fixture(async f=>{
 const p=await f.prepare();const {authority:ignored,...base}=p;void ignored;
 const legacy=new QuotePlanStore(f.web,async()=>structuredClone(f.pricing),undefined,f.authority);
 const saved=await legacy.save(f.owner,{...base,version:'distributor-quote-plan-1'});
 expect(await legacy.read(f.owner,p.planId)).toEqual(saved);
 for(const actor of [f.owner,f.manager])await expect(legacy.readForReview(actor,p.planId)).rejects.toMatchObject({status:409});
 expect((await f.installed.owner.query('SELECT requester_membership_generation,manager_membership_generation FROM ll_quote_plans')).rows[0]).toEqual({requester_membership_generation:null,manager_membership_generation:null});
 const wrongService=new QuoteAuthorityControl(f.installed.web('two'),{...destination,workspaceId:'two'});
 await expect(new QuotePlanStore(f.web,async()=>null,undefined,wrongService).readForReview(f.manager,p.planId)).rejects.toMatchObject({status:409});
}));
it('review client must have the exact service installation binding and active same-client workspace transaction',async()=>fixture(async f=>{
 const p=await f.prepare();await f.store.save(f.owner,p);
 const connections=vi.spyOn(f.web,'connect');
 try{
  const current=await transaction(f.web,'one',c=>f.authority.currentSavedPlanAuthority(f.manager,p.planId,c));
  expect(current).toEqual(p.authority);expect(connections).toHaveBeenCalledTimes(1);
 }finally{connections.mockRestore();}
 await expect(transaction(f.installed.web('two'),'two',c=>f.authority.currentSavedPlanAuthority(f.manager,p.planId,c))).rejects.toMatchObject({status:403});
 await expect(transaction(f.installed.owner,'one',c=>f.authority.currentSavedPlanAuthority(f.manager,p.planId,c))).rejects.toMatchObject({status:403});
 const unboundControl=new QuoteAuthorityControl(f.installed.owner,destination);
 await expect(transaction(f.web,'one',c=>unboundControl.currentSavedPlanAuthority(f.manager,p.planId,c))).rejects.toMatchObject({status:403});
 await expect(transaction(f.web,'one',c=>f.authority.currentSavedPlanAuthority(f.colleague,p.planId,c))).rejects.toMatchObject({status:404});
 await expect(transaction(f.web,'one',c=>f.authority.currentSavedPlanAuthority({...f.manager,tokenHash:'invalid'},p.planId,c))).rejects.toMatchObject({status:403});
 const standalone=await f.web.connect();
 try{await expect(f.authority.currentSavedPlanAuthority(f.manager,p.planId,standalone)).rejects.toMatchObject({status:503});}finally{standalone.release();}
 const other=await setup();
 try{
  expect(other.owner.orgId).toBe(f.owner.orgId);
  await expect(transaction(other.web,'one',c=>f.authority.currentSavedPlanAuthority(other.manager,p.planId,c))).rejects.toMatchObject({status:403});
 }finally{await other.installed.close();}
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
}));
