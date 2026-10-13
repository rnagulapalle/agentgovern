import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { installQuoteWorkloadGrants } from '../workspace/quote-workload-installation';
import { scopedPoolOptions } from '../durable/pg-transport';
import { registerTenantPool,tenantPoolBinding } from '../durable/tenant-pool';
import { quoteRequestIdentity } from './effect';
import { nativeMailIdentity } from './native-email-transport';
import type { QuoteRunContract } from '../orchestration/quote-contract';
import { managedQuoteWorker } from './background';
import { expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInstalledTenantFixture } from '../workspace/installed-tenant-fixture';
import { tokenHash } from '../durable/service';
import { transaction } from '../durable/database';
import { QuoteAuthorityControl, type QuoteDestination } from './authority';
import { QuotePlanStore, type QuoteContextLoader } from './store';
import type { QuotePlanProposalV2, QuotePlanContextV2 } from './plan-v2';

const destination:QuoteDestination={contract:'private-quote-twin-1',workspaceId:'one',quoteId:'quote-42',distributorId:'distributor-7',recipient:'buyer@example.test',sender:'sales@example.test',quoteBinding:'a'.repeat(64),emailBinding:'b'.repeat(64)};
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

async function workerFixture(run:(f:Awaited<ReturnType<typeof setup>>,worker:Pool,actor:{orgId:string;subject:string;role:'worker';tokenHash:string},saved:Awaited<ReturnType<QuotePlanStore['save']>>)=>Promise<void>,bad=false){
 const f=await setup();let pool:Pool|undefined,roleOid:string|undefined,schedulerOid:string|undefined;const role='llqt_'+randomBytes(8).toString('hex')+'_worker',scheduler=role.replace('_worker','_scheduler');
 try{
 const saved=await f.store.save(f.owner,await f.prepare());if(saved.plan.version!=='distributor-quote-plan-2')throw Error('Bound plan required');
 await f.installed.owner.query(await readFile('lib/quotes/background-schema.sql','utf8'));
 const password=randomBytes(32).toString('base64url');await f.installed.owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
 roleOid=(await f.installed.owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0].oid;
 await installQuoteWorkloadGrants(f.installed.owner,f.installed.schema,role,'one','worker',roleOid!);
 await f.installed.owner.query(`CREATE ROLE ${scheduler} LOGIN PASSWORD '${randomBytes(32).toString('base64url')}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);schedulerOid=(await f.installed.owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[scheduler])).rows[0].oid;await installQuoteWorkloadGrants(f.installed.owner,f.installed.schema,scheduler,'one','scheduler',schedulerOid!);
 const epoch=tenantPoolBinding(f.web)!.epoch;
 const url=new URL(process.env.LOOPLABS_TEST_DATABASE_URL!);url.username=role;url.password=password;
 pool=new Pool(await scopedPoolOptions({url:url.href,schema:f.installed.schema,purpose:'worker',transport:{mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'}},{kind:'owned-disposable-fixture'}));
 await registerTenantPool(pool,{org:'one',epoch,role,schema:f.installed.schema,purpose:'worker'});
 const actor={orgId:'one',subject:'quote-temporal',role:'worker' as const,tokenHash:tokenHash(randomBytes(32).toString('base64url'))};
 await f.installed.owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','quote-temporal','worker')",[actor.tokenHash]);
 const contract:QuoteRunContract={contract:'quote-background-1',planId:saved.id,runId:saved.id,planHash:saved.planHash,planVersion:'distributor-quote-plan-2',connectorVersion:'native-quote-mail-1',recoveryEpoch:epoch,updateActionId:saved.plan.update.actionId,messageActionId:saved.plan.message.actionId,updateRequestIdentity:quoteRequestIdentity(saved.plan.update.request)!,messageRequestIdentity:nativeMailIdentity(saved.plan.message.request)!,workerBuildId:'quote-'+'d'.repeat(64)};
 // Owner-only fixture attribution, NOT evidence of named transfer/approval.
 // These cases prove worker read authority and default-deny integrity only.
 await f.installed.owner.query('INSERT INTO ll_quote_background_routes(org_id,plan_id,plan_hash,recovery_epoch,worker_role_oid,scheduler_role_oid,worker_build_id,workflow_id,authority,contract) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',['one',saved.id,saved.planHash,epoch,bad?String(Number(roleOid)+1):roleOid,schedulerOid,'quote-'+'d'.repeat(64),'fixture:'+saved.id,saved.plan.authority,contract]);
 await run(f,pool,actor,saved);
 }finally{
 await pool?.end();if(schedulerOid){expect((await f.installed.owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[scheduler])).rows[0]?.oid).toBe(schedulerOid);await f.installed.owner.query('DELETE FROM ll_quote_workload_roles WHERE role_oid=$1::oid',[schedulerOid]);await f.installed.owner.query('DELETE FROM ll_runtime_workspace_bindings WHERE login_oid=$1::oid',[schedulerOid]);await f.installed.owner.query(`DROP OWNED BY ${scheduler}`);await f.installed.owner.query(`DROP ROLE ${scheduler}`);}if(roleOid){expect((await f.installed.owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0]?.oid).toBe(roleOid);await f.installed.owner.query('DELETE FROM ll_quote_workload_roles WHERE role_oid=$1::oid',[roleOid]);await f.installed.owner.query('DELETE FROM ll_runtime_workspace_bindings WHERE login_oid=$1::oid',[roleOid]);await f.installed.owner.query(`DROP OWNED BY ${role}`);await f.installed.owner.query(`DROP ROLE ${role}`);expect((await f.installed.owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows).toEqual([]);}vi.unstubAllEnvs();await f.installed.close();}
}
it('genuine dedicated workload reads common saved-plan authority without a human session, approval or effect',async()=>workerFixture(async(f,worker,actor,saved)=>{
 const authority=new QuoteAuthorityControl(worker,destination);expect(await authority.currentSavedPlanAuthority(actor,saved.id)).toEqual(saved.plan.version==='distributor-quote-plan-2'?saved.plan.authority:null);
 await expect(authority.enroll(actor,f.scope)).rejects.toMatchObject({status:403});
 await expect(new QuoteAuthorityControl(f.web,destination).currentSavedPlanAuthority({...actor,subject:f.owner.subject},saved.id)).rejects.toMatchObject({status:403});
 for(const table of ['ll_connector_actions','ll_workflow_runs','ll_actions','ll_refund_actions'])expect((await f.installed.owner.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
}));
it('mismatched persisted worker role OID cannot inherit saved owner authority',async()=>workerFixture(async(_f,worker,actor,saved)=>{
 await expect(new QuoteAuthorityControl(worker,destination).currentSavedPlanAuthority(actor,saved.id)).rejects.toMatchObject({status:409});
},true));
it('committed manager lifecycle invalidation revokes common workload authority rather than rebinding approved identity',async()=>workerFixture(async(f,worker,actor,saved)=>{
 await f.installed.owner.query("UPDATE ll_members SET active=false WHERE email=$1",[f.manager.subject]);
 expect(await new QuoteAuthorityControl(worker,destination).currentSavedPlanAuthority(actor,saved.id)).toBeNull();
 expect((await f.installed.owner.query('SELECT requester_membership_generation,manager_membership_generation FROM ll_quote_plans')).rows[0]).toEqual({requester_membership_generation:'1',manager_membership_generation:'1'});
}));
it('immutable background identity cannot be rewritten even by an owner fixture; execution role has no such grant',async()=>workerFixture(async(f,worker,actor,saved)=>{
 const before=(await f.installed.owner.query('SELECT * FROM ll_quote_background_routes')).rows;
 await expect(f.installed.owner.query("UPDATE ll_quote_background_routes SET contract='{}'")).rejects.toMatchObject({code:'23514'});
 await expect(worker.query("UPDATE ll_quote_background_routes SET contract='{}'")).rejects.toMatchObject({code:'42501'});
 expect((await f.installed.owner.query('SELECT * FROM ll_quote_background_routes')).rows).toEqual(before);
 expect(await transaction(worker,'one',c=>managedQuoteWorker(c,actor,saved.id,'plan'))).toHaveProperty('plan_id',saved.id);
}));
