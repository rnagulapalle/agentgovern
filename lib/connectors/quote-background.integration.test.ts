import {spawnOwnedPythonFixture} from '../../scripts/owned-python-fixture';
import { ControlError } from '../durable/contracts';
import { installQuoteWorkloadGrants,installQuoteAdmissionGrants } from '../workspace/quote-workload-installation';
import { scopedPoolOptions } from '../durable/pg-transport';
import { registerTenantPool,tenantPoolBinding } from '../durable/tenant-pool';
import { TemporalQuoteAdmission } from '../../runtime/temporal/quote-outbox';
import { quoteActivities } from '../../runtime/temporal/quote-routing';
import { NativeQuoteConnector } from './native-quote';
import { startNativeQuoteTwin } from '../../scripts/native-quote-twin';
import { Pool } from 'pg';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { NativeQuoteMailConnector } from './native-quote-mail';
import { NativeQuoteEmailTransport,type NativeMailPin } from '../quotes/native-email-transport';
import { FetchSandboxConnectors } from './twin';
import { readFile,mkdtemp,realpath,chmod,writeFile,rm,mkdir } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer as portServer} from 'node:net';
import {createTlsFixture,sha} from '../quotes/tls.test-fixture';
import {BoundedHttpsJsonClient} from '../quotes/https-transport';
import {HttpsJsonBodyTransport,type JsonBodyRequestTransport} from '../quotes/json-body-transport';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {publishQuoteWorkerExecution} from '../workspace/quote-worker-publication';
import {controlsForExistingQuote} from '../quotes/worker-native-controls';
import { ConnectorControl } from './service';
import { WorkflowControl } from '../workflows/service';
import { QuoteActionBoundary } from './quote-action';
import { type ConnectorProvider } from './contracts';
import { expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInstalledTenantFixture } from '../workspace/installed-tenant-fixture';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {Worker} from '@temporalio/worker';
import {resolve} from 'node:path';
import {verifyProfileArtifacts} from '../../runtime/temporal/operations';
import {tickQuoteOutbox} from '../../runtime/temporal/quote-outbox';
import { tokenHash } from '../durable/service';
import { transaction } from '../durable/database';
import { QuoteAuthorityControl, type QuoteDestination } from '../quotes/authority';
import { QuotePlanStore, type QuoteContextLoader } from '../quotes/store';
import type { QuotePlanProposalV2, QuotePlanContextV2 } from '../quotes/plan-v2';

const destination:QuoteDestination={contract:'private-quote-twin-1',workspaceId:'one',quoteId:'quote-42',distributorId:'distributor-7',recipient:'buyer@example.test',sender:'sales@example.test',quoteBinding:'a'.repeat(64),emailBinding:'b'.repeat(64)};
async function setup(){
 const keys={owner:randomBytes(32).toString('base64url'),manager:randomBytes(32).toString('base64url'),colleague:randomBytes(32).toString('base64url'),foreign:randomBytes(32).toString('base64url')};
 const installed=await createInstalledTenantFixture({tenants:['one','two'],salesOrg:'one',seed:async owner=>{
  for(const [subject,org,key]of [['owner@example.test','one',keys.owner],['manager@example.test','one',keys.manager],['colleague@example.test','one',keys.colleague],['other@example.test','two',keys.foreign]]){
   await owner.query('INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,$2,$1,\'fixture\')',[subject,org]);
   await owner.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(key),subject]);
  }
 }});
 let native:Awaited<ReturnType<typeof makeNative>>|undefined;
 try{
 const web=(await installed.context.member(keys.owner)).db,owner=(await installed.context.authenticated(keys.owner)).actor,manager=(await installed.context.authenticated(keys.manager)).actor,colleague=(await installed.context.authenticated(keys.colleague)).actor,foreign=(await installed.context.authenticated(keys.foreign)).actor;
 const authority=new QuoteAuthorityControl(web,destination),scope=randomUUID();
 native=await makeNative();const providerFixture=native;
 const quote={id:'quote-42',distributorId:'distributor-7',recipient:'buyer@example.test',sourceVersion:'v3',currency:'USD' as const,subtotalMinor:100000,lines:[{id:'line-1',quantity:10,unitPriceMinor:10000}]};
 // Actual native scoped HTTP quote read plus separately retained pricing metadata.
 // Capability metadata remains confined to the isolated native fixture, not hosted parity.
 const pricing={workspaceId:'one',requester:owner.subject,quote,approvalGrants:[{member:manager.subject,workspaceId:'one',quoteId:quote.id,policyVersion:3,active:true as const,capability:'quote.discount.approve' as const}],policy:{version:3,delegatedBps:1000,hardCapBps:2000,active:true as const},agents:[{id:'quote-agent',workspaceId:'one',quoteId:quote.id,action:'quote.update' as const,active:true as const},{id:'message-agent',workspaceId:'one',quoteId:quote.id,action:'quote.message' as const,active:true as const}],provider:{workspaceId:'one',quoteId:quote.id,binding:destination.quoteBinding,contract:'quote-conditional-write-1' as const,atomicSourceVersion:true as const,actionIdIdempotency:true as const,effectReadback:true as const},email:{workspaceId:'one',quoteId:quote.id,from:destination.sender,recipient:quote.recipient,actionIdIdempotency:true as const,effectReadback:true as const}};
 const loadPricing=async()=>{const current=await providerFixture.connector.transport.read();if(!current)throw new ControlError(503,'Native source unavailable');const policy=await providerFixture.policy();return {...structuredClone(pricing),policy,quote:{...structuredClone(pricing.quote),sourceVersion:current.sourceVersion,distributorId:current.distributorId,subtotalMinor:current.subtotalMinor}};};
 const loader:QuoteContextLoader=async(c,actor,reference)=>{
  expect(reference).toEqual({quoteId:quote.id,distributorId:quote.distributorId});
  const current=await authority.currentAuthority(c,actor,scope,manager.subject,3);if(!current)throw Error('Current quote proposal authority unavailable');
  return {contract:'quote-plan-context-2',pricing:await loadPricing(),authority:current} satisfies QuotePlanContextV2;
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
 const boundary=new QuoteActionBoundary(web,authority,async(c,actor,plan)=>({contract:'quote-plan-context-2',pricing:await loadPricing(),authority:await authority.currentSavedPlanAuthority(actor,plan.planId,c)}),async(_c,actor,ref)=>({contract:'quote-pricing-policy-1',workspaceId:actor.orgId,quoteId:ref.quoteId,policy:await providerFixture.policy()}));
 const provider=(binding:string)=>({workspaceId:'one',bindingId:binding,source:vi.fn(async()=>null),write:vi.fn(async()=>{throw Error('No provider execution conformance');}),inspect:vi.fn(async()=>{throw Error('No provider execution conformance');})} satisfies ConnectorProvider);
 const quoteProvider=providerFixture.connector,emailProvider=provider(destination.emailBinding),control=new ConnectorControl(web,quoteProvider,boundary),emailControl=new ConnectorControl(web,emailProvider,boundary);
 const save=async()=>{const p=await prepare();await store.save(owner,p);for(const agent of ['quote-agent','message-agent'])await installed.owner.query('INSERT INTO ll_connector_scope_grants(org_id,scope_id,agent_id,created_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',['one',scope,agent,owner.subject]);return store.read(owner,p.planId);};
 return {native:providerFixture,loadPricing,workflow:new WorkflowControl(web,control,{authority,loadContext:loader}),boundary,control,emailControl,quoteProvider,emailProvider,save,installed,web,owner,manager,colleague,foreign,authority,scope,store,prepare,pricing,keys};
 }catch(e){await native?.close();await installed.close();throw e;}
}


async function makeNative(){
 const url=new URL(process.env.LOOPLABS_TEST_DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Owned local provider database required');
 const schema='native_quote_'+randomBytes(8).toString('hex'),role=schema+'_role',password=randomBytes(32).toString('hex');
 const admin=new Pool({connectionString:url.toString(),max:1}),owner=new Pool({connectionString:url.toString(),options:'-c search_path='+schema,max:2});
 await admin.query('CREATE SCHEMA '+schema);const schemaOid=(await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].oid;
 await owner.query(`CREATE TABLE native_quotes(workspace_id text NOT NULL,quote_id text NOT NULL,version bigint NOT NULL CHECK(version>0),result jsonb NOT NULL,PRIMARY KEY(workspace_id,quote_id));CREATE TABLE native_quote_effects(workspace_id text NOT NULL,quote_id text NOT NULL,action_id uuid NOT NULL,request_identity text NOT NULL,effect jsonb NOT NULL,PRIMARY KEY(workspace_id,action_id));ALTER TABLE native_quotes ENABLE ROW LEVEL SECURITY;ALTER TABLE native_quote_effects ENABLE ROW LEVEL SECURITY;CREATE POLICY scoped ON native_quotes USING(workspace_id='one' AND quote_id='quote-42') WITH CHECK(workspace_id='one' AND quote_id='quote-42');CREATE POLICY scoped ON native_quote_effects USING(workspace_id='one' AND quote_id='quote-42') WITH CHECK(workspace_id='one' AND quote_id='quote-42')`);
 await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${password}'`);const roleOid=(await admin.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0].oid;
 await owner.query("CREATE TABLE native_quote_policies(workspace_id text NOT NULL,quote_id text NOT NULL,policy jsonb NOT NULL,PRIMARY KEY(workspace_id,quote_id));ALTER TABLE native_quote_policies ENABLE ROW LEVEL SECURITY;CREATE POLICY scoped ON native_quote_policies USING(workspace_id='one' AND quote_id='quote-42') WITH CHECK(workspace_id='one' AND quote_id='quote-42');INSERT INTO native_quote_policies VALUES('one','quote-42','{\"version\":3,\"delegatedBps\":1000,\"hardCapBps\":2000,\"active\":true}')");
 await owner.query("CREATE TABLE native_pending_mail(workspace_id text NOT NULL,quote_id text NOT NULL,action_id uuid NOT NULL,request_identity text NOT NULL,predecessor_identity text NOT NULL,state text NOT NULL,acceptance jsonb,PRIMARY KEY(workspace_id,action_id));ALTER TABLE native_pending_mail ENABLE ROW LEVEL SECURITY;CREATE POLICY scoped ON native_pending_mail USING(workspace_id='one' AND quote_id='quote-42') WITH CHECK(workspace_id='one' AND quote_id='quote-42')");
 await owner.query(`GRANT SELECT,INSERT,UPDATE(state,acceptance) ON native_pending_mail TO ${role}`);
 await owner.query(`GRANT SELECT ON native_quote_policies TO ${role};GRANT USAGE ON SCHEMA ${schema} TO ${role};GRANT SELECT,UPDATE(version,result) ON native_quotes TO ${role};GRANT SELECT,INSERT ON native_quote_effects TO ${role}`);
 await owner.query("INSERT INTO native_quotes VALUES('one','quote-42',3,$1)",[{distributorId:'distributor-7',currency:'USD',subtotalMinor:100000,discountBps:0,totalMinor:100000}]);
 url.username=role;url.password=password;const provider=new Pool({connectionString:url.toString(),options:'-c search_path='+schema,max:4}),token=randomBytes(32).toString('hex');
 const binding={workspaceId:'one',quoteId:'quote-42',quoteBinding:destination.quoteBinding,emailBinding:destination.emailBinding,token};
 const lost=new Set<string>();let child:ChildProcess|undefined;let server=await startNativeQuoteTwin(provider,binding,{loseReplyActionIds:lost});
 const connector=new NativeQuoteConnector({origin:server.origin,...destinationConfig()},async()=>token,1500,{ownedTestOrigin:true});
 const writes=vi.spyOn(connector.transport,'write'),lookups=vi.spyOn(connector.transport,'lookup');
 return {get connector(){return connector;},enroll:async(pin:NativeMailPin,mail:JsonBodyRequestTransport,faults?:ReadonlySet<string>)=>{const port=Number(new URL(server.origin).port);await server.close();server=await startNativeQuoteTwin(provider,binding,{port,mail:{pins:[pin],transport:mail,failResolutionActionIds:faults}});},policy:async()=>structuredClone((await provider.query("SELECT policy FROM native_quote_policies WHERE workspace_id='one' AND quote_id='quote-42'")).rows[0]?.policy),owner,lost,writes,lookups,provider,schema,role,token,binding,origin:server.origin,
  count:async()=>Number((await owner.query('SELECT count(*) n FROM native_quote_effects')).rows[0].n),
  restart:async(mail?:{pin:NativeMailPin;token:string})=>{await server.close();child=fork('scripts/native-quote-twin-process.ts',[],{execArgv:['--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','ignore','ipc']});const owned=child;let timer:ReturnType<typeof setTimeout>|undefined;try{const message=once(owned,'message');owned.send({url:url.toString(),schema,binding,...(mail?{mail:{pins:[mail.pin],origin:"http://127.0.0.1:8018",token:mail.token,timeoutMs:250}}:{})});const [value]=await Promise.race([message,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned provider startup timed out')),5000);})]);if(!value||typeof value.origin!=='string'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(value.origin))throw Error('Owned provider startup refused');return new NativeQuoteConnector({origin:value.origin,...destinationConfig()},async()=>token,1500,{ownedTestOrigin:true});}finally{clearTimeout(timer);}},
  close:async()=>{if(child){const owned=child;if(!owned.pid||owned.pid===process.pid)throw Error('Owned child identity required');if(owned.exitCode===null&&owned.signalCode===null){const exiting=once(owned,'exit');if(!owned.kill('SIGTERM'))throw Error('Owned child termination refused');let timer:ReturnType<typeof setTimeout>|undefined;try{const [code,signal]=await Promise.race([exiting,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned child exit timed out; teardown refused')),3000);})]);expect(code).toBe(0);expect(signal).toBeNull();}finally{clearTimeout(timer);}}else expect(owned.exitCode).toBe(0);}else await server.close();await provider.end();await owner.end();try{expect((await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].oid).toBe(schemaOid);expect((await admin.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0].oid).toBe(roleOid);await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.query('DROP ROLE '+role);expect((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount).toBe(0);}finally{await admin.end();}}
 };
}
function destinationConfig(){return{workspaceId:destination.workspaceId,quoteId:destination.quoteId,quoteBinding:destination.quoteBinding,emailBinding:destination.emailBinding};}

class NoMail extends FetchSandboxConnectors{calls=0;constructor(){super('http://127.0.0.1:8018','x'.repeat(32),500);}override async request():Promise<unknown>{this.calls++;throw Error('No8018 allocation or mail proof');}}
async function background(run:(f:Awaited<ReturnType<typeof setup>> & {flow:WorkflowControl;message:ConnectorControl;mail:NoMail|OwnedMail;mailProof?:Awaited<ReturnType<typeof ownedMail>>;worker:Pool;scheduler:Pool;workerActor:{orgId:string;subject:string;role:'worker';tokenHash:string};admission:TemporalQuoteAdmission;saved:Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['save']>>})=>Promise<void>,buildId='quote-'+'d'.repeat(64),actualMail=false){
 const f=await setup(),extra=new Map<string,string>(),pools:Pool[]=[];let actual:Awaited<ReturnType<typeof ownedMail>>|undefined;
 try{
 await f.installed.owner.query(await readFile('lib/quotes/background-schema.sql','utf8'));
 const webBinding=tenantPoolBinding(f.web)!;
 await installQuoteAdmissionGrants(f.installed.owner,f.installed.schema,webBinding.role,'one',webBinding.roleOid);
 const purposePools:Partial<Record<'worker'|'scheduler',Pool>>={},purposeOids:Partial<Record<'worker'|'scheduler',string>>={};
 for(const purpose of ['worker','scheduler'] as const){const role='llqt_'+randomBytes(8).toString('hex')+'_'+purpose,password=randomBytes(32).toString('base64url');await f.installed.owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);const oid=(await f.installed.owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0].oid;extra.set(role,oid);purposeOids[purpose]=oid;await installQuoteWorkloadGrants(f.installed.owner,f.installed.schema,role,'one',purpose,oid);const url=new URL(process.env.LOOPLABS_TEST_DATABASE_URL!);url.username=role;url.password=password;const pool=new Pool(await scopedPoolOptions({url:url.href,schema:f.installed.schema,purpose,transport:{mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'}},{kind:'owned-disposable-fixture'}));pools.push(pool);purposePools[purpose]=pool;await registerTenantPool(pool,{org:'one',epoch:webBinding.epoch,role,schema:f.installed.schema,purpose});}
 const workerActor={orgId:'one',subject:'quote-temporal',role:'worker' as const,tokenHash:tokenHash(randomBytes(32).toString('base64url'))};await f.installed.owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','quote-temporal','worker')",[workerActor.tokenHash]);
 const saved=await f.save();if(saved.plan.version!=='distributor-quote-plan-2')throw Error('Bound plan required');const pin={quoteRequest:saved.plan.update.request,messageRequest:saved.plan.message.request};const mail=actualMail?(actual=await ownedMail(pin)).mail:new NoMail();if(actualMail)await f.native.enroll(pin,mail);const provider=new NativeQuoteMailConnector(f.native.connector,pin,new NativeQuoteEmailTransport(pin,f.native.connector.transport,mail)),message=new ConnectorControl(f.web,provider,f.boundary);
 const flow=new WorkflowControl(f.web,f.control,{authority:f.authority,loadContext:async(c,actor)=>({contract:'quote-plan-context-2',pricing:await f.loadPricing(),authority:await f.authority.currentAuthority(c,actor,f.scope,f.manager.subject,3)}),message});
 await flow.createQuote(f.owner,saved.id);
 await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');await message.proposeQuote(f.owner,saved.id,saved.planHash,'message');
 const admission=new TemporalQuoteAdmission(f.web,flow,{buildId,workerRoleOid:purposeOids.worker!,schedulerRoleOid:purposeOids.scheduler!});
 await run({...f,flow,message,mail,mailProof:actual,worker:purposePools.worker!,scheduler:purposePools.scheduler!,workerActor,admission,saved});if(!actualMail)expect(mail.calls).toBe(0);
 }finally{for(const pool of pools)await pool.end();for(const [role,oid]of extra){expect((await f.installed.owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0]?.oid).toBe(oid);await f.installed.owner.query('DELETE FROM ll_quote_workload_roles WHERE role_oid=$1::oid',[oid]);await f.installed.owner.query('DELETE FROM ll_runtime_workspace_bindings WHERE login_oid=$1::oid',[oid]);await f.installed.owner.query(`DROP OWNED BY ${role}`);await f.installed.owner.query(`DROP ROLE ${role}`);}vi.unstubAllEnvs();await actual?.close();await f.native.close();await f.installed.close();}
}
type BackgroundFixture=Parameters<Parameters<typeof background>[0]>[0];
async function workerControls(f:BackgroundFixture){
 if(f.saved.plan.version!=='distributor-quote-plan-2')throw Error('Bound saved plan required');
 const route=(await f.installed.owner.query('SELECT contract FROM ll_quote_background_routes')).rows[0].contract;
 const workerAuthority=new QuoteAuthorityControl(f.worker,destination),workerBoundary=new QuoteActionBoundary(f.worker,workerAuthority,async(c,actor,plan)=>({contract:'quote-plan-context-2',pricing:await f.loadPricing(),authority:await workerAuthority.currentSavedPlanAuthority(actor,plan.planId,c)}),async()=>({contract:'quote-pricing-policy-1',workspaceId:'one',quoteId:'quote-42',policy:await f.native.policy()}));
 const pin={quoteRequest:f.saved.plan.update.request,messageRequest:f.saved.plan.message.request};const provider=new NativeQuoteMailConnector(f.native.connector,pin,new NativeQuoteEmailTransport(pin,f.native.connector.transport,f.mail));
 const quote=new ConnectorControl(f.worker,f.native.connector,workerBoundary),message=new ConnectorControl(f.worker,provider,workerBoundary),flow=new WorkflowControl(f.worker,quote,{authority:workerAuthority,loadContext:async()=>{throw Error('Worker cannot prepare a plan');},message});
 return {route,quote,message,flow,activity:quoteActivities(f.worker,f.workerActor,route.workerBuildId,async()=>flow)};
}
async function approvedTransfer(f:BackgroundFixture){const q=await f.control.read(f.owner,f.saved.plan.update.actionId);await f.control.review(f.manager,q.id,q.payload_hash,true);await f.admission.transfer(f.owner,f.saved.id);return workerControls(f);}
it('real named quote approval transfers exact held downstream intent; genuine scoped worker writes native quote once then waits for separate manager approval',async()=>background(async f=>{
 if(f.saved.plan.version!=='distributor-quote-plan-2')throw Error('Bound saved plan required');
 await expect(f.admission.transfer(f.owner,f.saved.id)).rejects.toMatchObject({status:409});
 const q=await f.control.read(f.owner,f.saved.plan.update.actionId);await f.control.review(f.manager,q.id,q.payload_hash,true);
 const id=await f.admission.transfer(f.owner,f.saved.id);expect(await f.admission.transfer(f.owner,f.saved.id)).toBe(id);
 const route=(await f.installed.owner.query('SELECT contract FROM ll_quote_background_routes')).rows[0].contract;
 const workerAuthority=new QuoteAuthorityControl(f.worker,destination),workerBoundary=new QuoteActionBoundary(f.worker,workerAuthority,async(c,actor,plan)=>({contract:'quote-plan-context-2',pricing:await f.loadPricing(),authority:await workerAuthority.currentSavedPlanAuthority(actor,plan.planId,c)}),async()=>({contract:'quote-pricing-policy-1',workspaceId:'one',quoteId:'quote-42',policy:await f.native.policy()}));
 const pin={quoteRequest:f.saved.plan.update.request,messageRequest:f.saved.plan.message.request};const provider=new NativeQuoteMailConnector(f.native.connector,pin,new NativeQuoteEmailTransport(pin,f.native.connector.transport,f.mail));
 const workerQuote=new ConnectorControl(f.worker,f.native.connector,workerBoundary),workerMessage=new ConnectorControl(f.worker,provider,workerBoundary),workerFlow=new WorkflowControl(f.worker,workerQuote,{authority:workerAuthority,loadContext:async()=>{throw Error('Worker cannot prepare a plan');},message:workerMessage});
 const activity=quoteActivities(f.worker,f.workerActor,route.workerBuildId,async()=>workerFlow);
 expect(await activity.advanceQuoteContract(route)).toBe('awaiting-message-approval');expect(await f.native.count()).toBe(1);
 expect(await activity.advanceQuoteContract(route)).toBe('awaiting-message-approval');expect(await f.native.count()).toBe(1);
 const message=await f.message.read(f.owner,pin.messageRequest.idempotencyKey);expect(message.state).toBe('held');expect(message.approved_by).toBeNull();expect(f.mail.calls).toBe(0);
 await expect(workerMessage.review(f.workerActor,message.id,message.payload_hash,true)).rejects.toMatchObject({status:403});
 await expect(workerFlow.verify(f.workerActor,f.saved.id)).rejects.toMatchObject({status:403});
 await expect(f.control.execute(f.owner,q.id)).rejects.toMatchObject({status:403});
 expect((await f.flow.read(f.owner,f.saved.id)).state).toBe('active');
}),20000);

it('changed exact history refuses before provider effect; named manager cannot borrow owner transfer',async()=>background(async f=>{
 const w=await approvedTransfer(f);await expect(f.admission.transfer(f.manager,f.saved.id)).rejects.toMatchObject({status:409});
 for(const change of [{planHash:'e'.repeat(64)},{messageActionId:randomUUID()},{updateRequestIdentity:'e'.repeat(64)},{workerBuildId:'quote-'+'e'.repeat(64)},{recoveryEpoch:randomUUID()}])await expect(w.activity.advanceQuoteContract({...w.route,...change})).rejects.toMatchObject({status:409});
 expect(await f.native.count()).toBe(0);expect(f.mail.calls).toBe(0);
}),20000);
it('paused graph and expired approval never become a provider effect through background transfer',async()=>background(async f=>{
 const w=await approvedTransfer(f);await f.flow.pause(f.owner,f.saved.id);expect(await w.activity.advanceQuoteContract(w.route)).toBe('contained');expect(await f.native.count()).toBe(0);
}),20000);
it('approval expiry after transfer cancels update without a quote effect or message authority',async()=>background(async f=>{
 const w=await approvedTransfer(f);await expect(f.installed.owner.query("UPDATE ll_connector_actions SET approval_until=now()-interval '1 second' WHERE id=$1",[f.saved.plan.update.actionId])).rejects.toMatchObject({code:'23514'});
 // Simulate elapsed application time, while retaining the real immutable DB approval.
 const action=await f.control.read(f.owner,f.saved.plan.update.actionId);const clock=vi.spyOn(Date,'now').mockReturnValue(new Date(action.approval_until!).getTime()+1);
 try{expect(await w.activity.advanceQuoteContract(w.route)).toBe('contained');expect(await f.native.count()).toBe(0);expect((await f.message.read(f.owner,f.saved.plan.message.actionId)).approved_by).toBeNull();}finally{clock.mockRestore();}
}),20000);
it('committed owner lifecycle revocation after transfer refuses both background steps without reactivation binding',async()=>background(async f=>{
 const w=await approvedTransfer(f);await f.installed.owner.query('UPDATE ll_members SET active=false WHERE email=$1',[f.owner.subject]);
 await expect(w.activity.advanceQuoteContract(w.route)).rejects.toMatchObject({status:409});expect(await f.native.count()).toBe(0);
}),20000);
it('actual lost native quote response reconciles the existing effect and never submits another quote write',async()=>background(async f=>{
 const w=await approvedTransfer(f);f.native.lost.add(f.saved.plan.update.actionId);
 expect(await w.activity.advanceQuoteContract(w.route)).toBe('waiting');expect(await f.native.count()).toBe(1);expect(f.native.writes).toHaveBeenCalledTimes(1);
 expect(await w.activity.advanceQuoteContract(w.route)).toBe('awaiting-message-approval');expect(await f.native.count()).toBe(1);expect(f.native.writes).toHaveBeenCalledTimes(1);expect(f.mail.calls).toBe(0);
}),20000);

// Real registered worker + publication composition; no provider socket opened.
it('existing-only worker factory binds sealed role/database/epoch to exact routed plan and never exposes preparation authority',async()=>background(async f=>{
 const w=await approvedTransfer(f);if(f.saved.plan.version!=='distributor-quote-plan-2')throw Error('Bound plan required');const b=tenantPoolBinding(f.worker)!;
 const root=await realpath(await mkdtemp(join(tmpdir(),'ll_quote_worker_composition_')));await chmod(root,0o700);const dir=join(root,'manual');await mkdir(dir,{mode:0o700});
 try{
 const url=new URL(process.env.LOOPLABS_TEST_DATABASE_URL!);url.username=b.role;url.password=String(f.worker.options.password);
 const config={version:1,installation:'quote_worker_fixture',schema:b.schema,database:f.worker.options.database,transport:{mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'},entries:[{url:url.href,role:b.role,org:b.org,epoch:b.epoch,purpose:'worker'}]};
 const metadata={contract:'quote-worker-execution-1',workspaceId:b.org,recoveryEpoch:b.epoch,roleOid:b.roleOid,databaseOid:b.databaseOid,buildId:w.route.workerBuildId,scopeId:f.scope,quoteId:destination.quoteId,distributorId:destination.distributorId,quoteBinding:destination.quoteBinding,emailBinding:destination.emailBinding,nativeOrigin:'http://127.0.0.1:8019',emailOrigin:'http://127.0.0.1:8018',nativeToken:'n'.repeat(32),emailToken:'m'.repeat(32)};
 const publish=async(m:unknown)=>{const workloads=JSON.stringify(config),execution=JSON.stringify(m);for(const [name,data]of [['workloads.json',workloads],['execution.json',execution],['ready.json',JSON.stringify({installation:config.installation,workloadsSha256:createHash('sha256').update(workloads).digest('hex'),executionSha256:createHash('sha256').update(execution).digest('hex')})]])await writeFile(join(dir,name),data,{mode:0o600});};
 const published=await publishQuoteWorkerExecution(f.installed.owner,join(root,'sealed'),config,metadata,{kind:'owned-disposable-fixture'});expect(published.activated).toBe(false);await expect(publishQuoteWorkerExecution(f.installed.owner,join(root,'sealed'),config,metadata,{kind:'owned-disposable-fixture'})).rejects.toThrow();
 await expect(controlsForExistingQuote(f.worker,f.workerActor,f.saved.plan,join(root,'sealed','execution.json'),{kind:'owned-disposable-fixture'})).resolves.toHaveProperty('workflow.db',f.worker);
 await publish(metadata);await expect(controlsForExistingQuote(f.worker,f.workerActor,f.saved.plan,join(dir,'execution.json'))).rejects.toMatchObject({status:503});
 const controls=await controlsForExistingQuote(f.worker,f.workerActor,f.saved.plan,join(dir,'execution.json'),{kind:'owned-disposable-fixture'});expect(controls.workflow.db).toBe(f.worker);expect(controls.quote.db).toBe(f.worker);expect(controls.message.db).toBe(f.worker);
 await expect(controls.workflow.quotes!.loadContext(undefined as never,f.workerActor,{} as never)).rejects.toMatchObject({status:403});
 await publish({...metadata,roleOid:String(Number(b.roleOid)+1)});await expect(controlsForExistingQuote(f.worker,f.workerActor,f.saved.plan,join(dir,'execution.json'),{kind:'owned-disposable-fixture'})).rejects.toMatchObject({status:503});
 await publish({...metadata,provisionerToken:'p'.repeat(32)});await expect(controlsForExistingQuote(f.worker,f.workerActor,f.saved.plan,join(dir,'execution.json'),{kind:'owned-disposable-fixture'})).rejects.toMatchObject({status:503});
 expect(await f.native.count()).toBe(0);expect(f.mail.calls).toBe(0);
 }finally{await rm(root,{recursive:true,force:true});}
}),20000);

it('actual isolated Temporal scheduler starts the pinned quote once, recorded history replays and replacement worker cannot bypass separate mail approval or recovery epoch',async()=>{
 const manifest=JSON.parse(await readFile('.worker/quote-temporal-manifest.json','utf8'));verifyProfileArtifacts('quote',manifest.buildId,manifest,await readFile('.worker/quote-temporal-service.cjs'),await readFile('.worker/quote-temporal-workflow.cjs'),await readFile('pnpm-lock.yaml'));
 await background(async f=>{
  let env:TestWorkflowEnvironment|undefined;const temporalDir=await realpath(await mkdtemp(join(tmpdir(),'ll_quote_temporal_')));await chmod(temporalDir,0o700);const dbFilename=join(temporalDir,'temporal.sqlite');try{
   const w=await approvedTransfer(f);env=await TestWorkflowEnvironment.createLocal({server:{dbFilename}});const taskQueue='quote-proof-'+randomUUID();
   const create=()=>Worker.create({connection:env!.nativeConnection,namespace:'default',taskQueue,workflowBundle:{codePath:resolve('.worker/quote-temporal-workflow.cjs')},workerDeploymentOptions:{version:{deploymentName:'looplabs-quote',buildId:manifest.buildId},useWorkerVersioning:true,defaultVersioningBehavior:'PINNED'},activities:w.activity,shutdownGraceTime:'1 second'});
   const workflowId=(await f.installed.owner.query('SELECT workflow_id FROM ll_quote_background_routes')).rows[0].workflow_id;let handle=env.client.workflow.getHandle(workflowId);
   const wait=async()=>{const deadline=Date.now()+10000;while(Date.now()<deadline){if((await f.control.read(f.owner,f.saved.plan.update.actionId)).state==='succeeded'&&(await handle.fetchHistory()).events?.some(e=>e.activityTaskCompletedEventAttributes))return;await new Promise(r=>setTimeout(r,50));}throw Error('Actual quote update did not complete');};
   await (await create()).runUntil(async()=>{const deadline=Date.now()+10000;for(;;){try{await env!.client.workflowService.setWorkerDeploymentCurrentVersion({namespace:'default',deploymentName:'looplabs-quote',buildId:manifest.buildId,identity:'owned-quote-fixture'});break;}catch(e){if(Date.now()>=deadline)throw e;await new Promise(r=>setTimeout(r,50));}}expect(await tickQuoteOutbox(f.scheduler,f.workerActor,env!.client,taskQueue)).toBe(1);await wait();});expect(await f.native.count()).toBe(1);expect((await f.message.read(f.owner,f.saved.plan.message.actionId)).state).toBe('held');expect(f.mail.calls).toBe(0);
   const history=await handle.fetchHistory();expect(history.events!.length).toBeGreaterThan(5);const before=JSON.stringify(history);expect(before).not.toContain(f.native.token);expect(before).not.toContain(f.workerActor.tokenHash);
   await Worker.runReplayHistory({workflowBundle:{codePath:resolve('.worker/quote-temporal-workflow.cjs')}},history);expect(await f.native.count()).toBe(1);
   expect(await tickQuoteOutbox(f.scheduler,f.workerActor,env.client,taskQueue)).toBe(0);const original=(await handle.describe()).runId;
   // Owned offline fault: retained intent becomes pending again after lost completion.
   await f.installed.owner.query("UPDATE ll_quote_background_routes SET state='pending',next_attempt=now() WHERE org_id='one'");expect(await tickQuoteOutbox(f.scheduler,f.workerActor,env.client,taskQueue)).toBe(1);expect((await handle.describe()).runId).toBe(original);
   await env.teardown();env=undefined;env=await TestWorkflowEnvironment.createLocal({server:{dbFilename}});handle=env.client.workflow.getHandle(workflowId);expect((await handle.describe()).runId).toBe(original);
   await (await create()).runUntil(async()=>{await handle.signal('quoteWake');await new Promise(r=>setTimeout(r,300));});expect(await f.native.count()).toBe(1);expect(f.mail.calls).toBe(0);
   await expect(w.flow.verify(f.workerActor,f.saved.id)).rejects.toMatchObject({status:403});
   await f.installed.owner.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='one'",[randomUUID()]);await expect(w.activity.advanceQuoteContract(w.route)).rejects.toMatchObject({status:503});expect(await f.native.count()).toBe(1);expect(f.mail.calls).toBe(0);
   await handle.cancel();
  }finally{await env?.teardown();await rm(temporalDir,{recursive:true,force:true});}
 },manifest.buildId);
},60000);

it('real installed scheduler revocation during an awaited start cannot mark dispatch completed or borrow renewed authority',async()=>background(async f=>{
 await approvedTransfer(f);let calls=0;const syntheticClient={workflow:{start:async()=>{calls++;await f.installed.owner.query("UPDATE ll_tokens SET active=false WHERE hash=$1",[f.workerActor.tokenHash]);return {};}}};
 await expect(tickQuoteOutbox(f.scheduler,f.workerActor,syntheticClient as never,'owned-revocation-fixture')).rejects.toMatchObject({status:403});expect(calls).toBe(1);const row=(await f.installed.owner.query('SELECT state,started_at FROM ll_quote_background_routes')).rows[0];expect(row).toEqual({state:'pending',started_at:null});expect(await f.native.count()).toBe(0);expect(f.mail.calls).toBe(0);
 // The delayed-start callback is synthetic; SQL authority/state refusal is real.
}),20000);

class OwnedMail implements JsonBodyRequestTransport{
 calls=0;posts=0;
 constructor(readonly underlying:HttpsJsonBodyTransport){}
 async request(path:string,init:Parameters<JsonBodyRequestTransport['request']>[1]){this.calls++;if(path==='/quote-email/emails'&&init?.method==='POST')this.posts++;return this.underlying.request(path,init);}
}
async function ownedMail(pin:NativeMailPin){
 const tls=await createTlsFixture(),state=join(tls.root,'state'),serverDir=join(tls.root,'mailtls');await mkdir(state,{mode:0o700});await mkdir(serverDir,{mode:0o700});
 const socket=portServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));if([8018,8019].includes(port))throw Error('Reserved port refused');
 const token=randomBytes(32).toString('hex'),provision=randomBytes(32).toString('hex'),execBytes=JSON.stringify({token}),scope={workspaceId:'one',quoteId:'quote-42',quoteBinding:destination.quoteBinding,emailBinding:destination.emailBinding},provisionBytes=JSON.stringify({version:'native-quote-pin-provisioner-1',purpose:'quote-pin-provisioner',...scope,token:provision});
 await writeFile(join(state,'connector-twin-credentials.json'),execBytes,{mode:0o600});await writeFile(join(state,'connector-twin-quote-provisioner.json'),provisionBytes,{mode:0o600});await writeFile(join(state,'connector-twin-quote-provisioner-ready.json'),JSON.stringify({version:1,purpose:'quote-pin-provisioner',sha256:sha(provisionBytes)}),{mode:0o600});
 // Offline exact pin publication is fixture setup, not worker provisioning.
 await writeFile(join(state,'connector-twin-quote-mail.json'),JSON.stringify({version:'native-quote-mail-enrollment-2',pins:[pin]}),{mode:0o600});
 const cert=await readFile(join(tls.dir,'cert.pem')),key=await readFile(join(tls.dir,'key.pem'));await writeFile(join(serverDir,'cert.pem'),cert,{mode:0o600});await writeFile(join(serverDir,'key.pem'),key,{mode:0o600});
 const bytes=JSON.stringify({version:1,purpose:'quote-email-server',...scope,port,certSha256:sha(cert),keySha256:sha(key),executionCredentialSha256:sha(execBytes),provisionerCredentialSha256:sha(provisionBytes)});await writeFile(join(serverDir,'tls.json'),bytes,{mode:0o600});await writeFile(join(serverDir,'ready.json'),JSON.stringify({version:1,purpose:'quote-email-server',sha256:sha(bytes)}),{mode:0o600});
 const origin='https://127.0.0.1:'+port,client=new BoundedHttpsJsonClient({origin,transport:{mode:'verified-tls',trust:'owned-ca',caFile:tls.ca,caSha256:tls.caSha256}},async()=>token,async()=>{}),mail=new OwnedMail(new HttpsJsonBodyTransport(client));let child:ChildProcess|undefined;
 const stop=async()=>{if(!child)return;const current=child;if(current.exitCode===null&&current.signalCode===null){const exit=once(current,'exit');if(!current.kill('SIGTERM'))throw Error('Owned child stop refused');let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([exit,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned mail child exit exceeded budget')),8000);})]);}finally{clearTimeout(timer);}}expect(current.exitCode===0&&current.signalCode===null||current.exitCode===null&&current.signalCode==='SIGTERM').toBe(true);expect(()=>process.kill(current.pid!,0)).toThrow();child=undefined;};
 const start=async()=>{child=await spawnOwnedPythonFixture(['scripts/connector-twin-tls.py','--tls-generation',join(serverDir,'tls.json')],state);const deadline=Date.now()+8000;while(Date.now()<deadline){if(child.exitCode!==null||child.signalCode!==null)throw Error('Owned mail child startup refused');try{const r=await client.request('/quote-email/effects/'+pin.messageRequest.idempotencyKey,{method:'GET',headers:{'x-looplabs-workspace':'one','x-looplabs-quote':'quote-42','x-looplabs-binding':destination.emailBinding}});if([200,403,404].includes(r.status))return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Owned mail readiness exceeded budget');};
 try{await start();return {mail,count:async()=>JSON.parse(await readFile(join(state,'connector-twin-state.json'),'utf8')).email.emails.length,restart:async()=>{await stop();await start();},close:async()=>{await stop();await tls.close();}};}catch(e){await stop();await tls.close();throw e;}
}

it('actual background Temporal quote waits for distinct named email approval, sends one persisted Python TLS acceptance, and requires named final verification',async()=>{
 const manifest=JSON.parse(await readFile('.worker/quote-temporal-manifest.json','utf8'));verifyProfileArtifacts('quote',manifest.buildId,manifest,await readFile('.worker/quote-temporal-service.cjs'),await readFile('.worker/quote-temporal-workflow.cjs'),await readFile('pnpm-lock.yaml'));
 await background(async f=>{
  if(!f.mailProof)throw Error('Actual isolated mail fixture required');const w=await approvedTransfer(f),dir=await realpath(await mkdtemp(join(tmpdir(),'ll_quote_mail_temporal_')));await chmod(dir,0o700);let env:TestWorkflowEnvironment|undefined;
  try{
   env=await TestWorkflowEnvironment.createLocal({server:{dbFilename:join(dir,'temporal.sqlite')}});const queue='quote-mail-proof-'+randomUUID(),workflowId=(await f.installed.owner.query('SELECT workflow_id FROM ll_quote_background_routes')).rows[0].workflow_id,handle=env.client.workflow.getHandle(workflowId);
   const create=()=>Worker.create({connection:env!.nativeConnection,namespace:'default',taskQueue:queue,workflowBundle:{codePath:resolve('.worker/quote-temporal-workflow.cjs')},workerDeploymentOptions:{version:{deploymentName:'looplabs-quote',buildId:manifest.buildId},useWorkerVersioning:true,defaultVersioningBehavior:'PINNED'},activities:w.activity,shutdownGraceTime:'1 second'});
   const wait=async(actionId:string)=>{const deadline=Date.now()+12000;while(Date.now()<deadline){const action=await (actionId===f.saved.plan.update.actionId?f.control:f.message).read(f.owner,actionId);if(action.state==='succeeded')return action;await new Promise(r=>setTimeout(r,50));}throw Error('Actual background action did not complete');};
   await (await create()).runUntil(async()=>{const deadline=Date.now()+10000;for(;;){try{await env!.client.workflowService.setWorkerDeploymentCurrentVersion({namespace:'default',deploymentName:'looplabs-quote',buildId:manifest.buildId,identity:'owned-quote-mail-fixture'});break;}catch(e){if(Date.now()>=deadline)throw e;await new Promise(r=>setTimeout(r,50));}}expect(await tickQuoteOutbox(f.scheduler,f.workerActor,env!.client,queue)).toBe(1);await wait(f.saved.plan.update.actionId);});
   expect(await f.native.count()).toBe(1);expect(await f.mailProof.count()).toBe(0);expect((f.mail as OwnedMail).posts).toBe(0);
   const held=await f.message.read(f.owner,f.saved.plan.message.actionId);expect(held.state).toBe('held');expect(held.approved_by).toBeNull();await expect(f.message.review(f.owner,held.id,held.payload_hash,true)).rejects.toMatchObject({status:403});await expect(w.message.review(f.workerActor,held.id,held.payload_hash,true)).rejects.toMatchObject({status:403});
   const before=await handle.fetchHistory();await Worker.runReplayHistory({workflowBundle:{codePath:resolve('.worker/quote-temporal-workflow.cjs')}},before);expect(await f.mailProof.count()).toBe(0);
   // A real independently authenticated member reviews after predecessor verification.
   await f.message.review(f.manager,held.id,held.payload_hash,true);expect((await f.message.read(f.owner,held.id)).approved_by).toBe(f.manager.subject);
   await (await create()).runUntil(async()=>{await handle.signal('quoteWake');await wait(held.id);await handle.result();});expect(await f.native.count()).toBe(1);expect(await f.mailProof.count()).toBe(1);expect((f.mail as OwnedMail).posts).toBe(1);
   await expect(w.flow.verify(f.workerActor,f.saved.id)).rejects.toMatchObject({status:403});expect((await f.flow.read(f.owner,f.saved.id)).state).toBe('active');
   await f.mailProof.restart();expect((await w.message.reconcile(f.workerActor,held.id)).state).toBe('succeeded');expect(await f.mailProof.count()).toBe(1);expect((f.mail as OwnedMail).posts).toBe(1);
   const verification=await f.flow.verify(f.manager,f.saved.id);expect(verification.verified).toBe(true);expect((await f.flow.quoteVerification(f.manager,f.saved.id)).historical?.verifiedBy).toBe(f.manager.subject);expect((await f.flow.quoteVerification(f.owner,f.saved.id)).current.outcome).toBe('verified');expect((await f.flow.read(f.owner,f.saved.id)).state).toBe('completed');
   const final=await handle.fetchHistory();await Worker.runReplayHistory({workflowBundle:{codePath:resolve('.worker/quote-temporal-workflow.cjs')}},final);expect(await f.native.count()).toBe(1);expect(await f.mailProof.count()).toBe(1);expect((f.mail as OwnedMail).posts).toBe(1);
   expect((await f.web.query('SELECT count(*)::int n FROM ll_workflow_events WHERE quote_verification IS NOT NULL')).rows[0].n).toBe(1);
  }finally{await env?.teardown();await rm(dir,{recursive:true,force:true});}
 },manifest.buildId,true);
},60000);

// Actual named API and installed admission; planner is not invoked by continuation.
import {NextRequest} from 'next/server';
import {POST as quotePost} from '../../app/api/workspace/quotes/route';
import {QuoteDemoControl} from '../quotes/demo-control';
import {configureQuoteDemo} from '../quotes/demo-registry';
import {configureTenantContext} from '../workspace/tenant-context';
import {WORKSPACE_COOKIE} from '../workspace/identity';
it('named quote API records one background intent, reloads it and refuses forged, stale and independent-manager continuation',async()=>background(async f=>{
 configureTenantContext(f.installed.context);
 const deps={store:f.store,planner:{interpret:async()=>{throw Error('Continuation must never invoke planner');}},context:async()=>{throw Error('Continuation cannot prepare a new plan');},controllers:async()=>({quote:f.control,message:f.message,workflow:f.flow}),observeControllers:async()=>({quote:f.control,message:f.message,workflow:f.flow}),backgroundAdmission:async()=>f.admission};
 const facade=new QuoteDemoControl(f.web,f.scope,deps);configureQuoteDemo(facade);
 const id=f.saved.id,planHash=f.saved.planHash,request=(token:string,patch:Record<string,unknown>={})=>new NextRequest('https://looplabs.run/api/workspace/quotes?scope='+f.scope,{method:'POST',headers:{origin:'https://looplabs.run',cookie:WORKSPACE_COOKIE+'='+token,'content-type':'application/json'},body:JSON.stringify({operation:'background',id,planHash,...patch})});
 expect((await quotePost(request(''))).status).toBe(401);
 expect((await quotePost(request(f.keys.owner,{workerRoleOid:'1'}))).status).toBe(400);
 expect((await quotePost(request(f.keys.owner,{planHash:'c'.repeat(64)}))).status).toBe(409);
 expect((await quotePost(request(f.keys.manager))).status).toBe(403);
 expect((await quotePost(request(f.keys.colleague))).status).toBe(404);
 // Current own-scope precheck refuses a foreign installed workspace before facade lookup.
 expect((await quotePost(request(f.keys.foreign))).status).toBe(403);expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_background_routes')).rows[0].n).toBe(0);expect(await f.native.count()).toBe(0);expect(f.mail.calls).toBe(0);
 expect((await quotePost(request(f.keys.owner))).status).toBe(409); // no independent approval
 const action=await transaction(f.web,'one',c=>f.control.get(c,f.owner,f.saved.plan.update.actionId));
 await f.control.review(f.manager,action.id,action.payload_hash,true);
 await f.native.owner.query("UPDATE native_quote_policies SET policy=jsonb_set(policy,'{version}','4')");expect((await quotePost(request(f.keys.owner))).status).toBe(409);expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_background_routes')).rows[0].n).toBe(0);await f.native.owner.query("UPDATE native_quote_policies SET policy=jsonb_set(policy,'{version}','3')");
 await f.native.owner.query('UPDATE native_quotes SET version=4');expect((await quotePost(request(f.keys.owner))).status).toBe(409);expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_background_routes')).rows[0].n).toBe(0);await f.native.owner.query('UPDATE native_quotes SET version=3');
 const response=await quotePost(request(f.keys.owner));expect(response.status).toBe(200);const value=await response.json();expect(value.continuation).toBe('requested');expect(value.background).toEqual({available:true,state:'pending'});expect(value.completion).toBe('not-established');
 expect((await quotePost(request(f.keys.owner))).status).toBe(200);
 const restarted=new QuoteDemoControl(f.web,f.scope,deps);expect((await restarted.resolve(f.owner,id)).background).toEqual({available:true,state:'pending'});expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_background_routes')).rows[0].n).toBe(1);expect(await f.native.count()).toBe(0);expect(f.mail.calls).toBe(0);
 const {backgroundAdmission:omitted,...withoutAdmission}=deps;void omitted;const disabled=new QuoteDemoControl(f.web,f.scope,withoutAdmission);expect((await disabled.resolve(f.owner,id)).background).toEqual({available:false,state:'pending'});await expect(disabled.background(f.owner,id,planHash)).rejects.toMatchObject({status:503});expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_background_routes')).rows[0].n).toBe(1);
 await f.installed.owner.query('UPDATE ll_members SET active=false WHERE email=$1',[f.manager.subject]);await f.installed.owner.query('UPDATE ll_members SET active=true WHERE email=$1',[f.manager.subject]);expect((await quotePost(request(f.keys.owner))).status).toBe(409);expect(await f.native.count()).toBe(0);
}),15000);

it('installed quote admission refuses malformed build/role pins and missing current workload registration without creating routes',async()=>background(async f=>{
 for(const pin of [{...f.admission.pin,buildId:'ack-'+'a'.repeat(64)},{...f.admission.pin,workerRoleOid:'0'},{...f.admission.pin,schedulerRoleOid:f.admission.pin.workerRoleOid}])expect(()=>new TemporalQuoteAdmission(f.web,f.flow,pin)).toThrow(ControlError);
 const absent=new TemporalQuoteAdmission(f.web,f.flow,{...f.admission.pin,schedulerRoleOid:'1'});
 await expect(transaction(f.web,'one',c=>absent.assertReady(c))).rejects.toMatchObject({status:503});
 await expect(transaction(f.worker,'one',c=>f.admission.assertReady(c))).rejects.toMatchObject({status:503});
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_background_routes')).rows[0].n).toBe(0);expect(await f.native.count()).toBe(0);expect(f.mail.calls).toBe(0);
}),20000);

it('actual quote scheduler releases a failed exact start claim and refuses enrollment revoked while start awaits',async()=>background(async f=>{
 await approvedTransfer(f);
 const unavailable=Error('Owned Temporal fixture unavailable'),start=vi.fn(async():Promise<void>=>{throw unavailable;}),client={workflow:{start}} as unknown as import('@temporalio/client').Client;
 await expect(tickQuoteOutbox(f.worker,f.workerActor,client,'owned')).rejects.toMatchObject({status:403});
 await expect(tickQuoteOutbox(f.scheduler,{...f.workerActor,subject:'enquiry-temporal'},client,'owned')).rejects.toMatchObject({status:403});
 await expect(tickQuoteOutbox(f.scheduler,f.workerActor,client,'owned')).rejects.toBe(unavailable);
 expect(start).toHaveBeenCalledTimes(1);
 expect((await f.installed.owner.query('SELECT state,lease_token,lease_until,attempts FROM ll_quote_background_routes')).rows).toEqual([{state:'pending',lease_token:null,lease_until:null,attempts:1}]);
 await f.installed.owner.query("UPDATE ll_quote_background_routes SET next_attempt=now() WHERE org_id='one'");
 const schedulerOid=tenantPoolBinding(f.scheduler)!.roleOid;
 start.mockImplementationOnce(async()=>{await f.installed.owner.query("DELETE FROM ll_quote_workload_roles WHERE role_oid=$1::oid",[schedulerOid]);});
 await expect(tickQuoteOutbox(f.scheduler,f.workerActor,client,'owned')).rejects.toMatchObject({status:403});
 expect(start).toHaveBeenCalledTimes(2);expect((await f.installed.owner.query('SELECT state,attempts FROM ll_quote_background_routes')).rows).toEqual([{state:'pending',attempts:2}]);
 expect(await f.native.count()).toBe(0);expect(f.mail.calls).toBe(0);
}),20000);

it('actual routed authority is rechecked after an awaited controls factory and refuses a different installed pool',async()=>background(async f=>{
 const w=await approvedTransfer(f);
 const wrongPool=quoteActivities(f.worker,f.workerActor,w.route.workerBuildId,async()=>f.flow);
 await expect(wrongPool.advanceQuoteContract(w.route)).rejects.toMatchObject({status:503});
 const revoke=quoteActivities(f.worker,f.workerActor,w.route.workerBuildId,async()=>{await f.installed.owner.query('UPDATE ll_members SET active=false WHERE email=$1',[f.owner.subject]);return w.flow;});
 await expect(revoke.advanceQuoteContract(w.route)).rejects.toMatchObject({status:409});
 expect(await f.native.count()).toBe(0);expect(f.mail.calls).toBe(0);
}),20000);

// Defensive server-callback fault injection on a genuine installed route.
// These callbacks do not establish provider conformance or fake a successful run.
it('quote activity refuses malformed server graph/control composition and contains terminal step observations without final verification',async()=>background(async f=>{
 const w=await approvedTransfer(f),originalRead=w.flow.read.bind(w.flow),read=await originalRead(f.workerActor,f.saved.id);
 const graphSpy=vi.spyOn(w.flow,'read');
 graphSpy.mockResolvedValueOnce({...read,steps:[]});await expect(w.activity.advanceQuoteContract(w.route)).rejects.toMatchObject({status:409});
 const originalMessage=w.flow.quotes!.message;w.flow.quotes!.message=undefined;
 const quoteRead=vi.spyOn(w.quote,'read'),quoteReconcile=vi.spyOn(w.quote,'reconcile');const q=await f.control.read(f.owner,f.saved.plan.update.actionId);
 quoteRead.mockResolvedValue({...q,state:'succeeded'});quoteReconcile.mockResolvedValue({...q,state:'succeeded'});
 await expect(w.activity.advanceQuoteContract(w.route)).rejects.toMatchObject({status:503});w.flow.quotes!.message=originalMessage;
 quoteRead.mockResolvedValueOnce({...q,state:'held'});expect(await w.activity.advanceQuoteContract(w.route)).toBe('waiting');
 quoteRead.mockResolvedValueOnce({...q,state:'conflict'});expect(await w.activity.advanceQuoteContract(w.route)).toBe('contained');
 quoteRead.mockResolvedValueOnce({...q,state:'succeeded'}).mockResolvedValueOnce({...q,state:'cancelled'});expect(await w.activity.advanceQuoteContract(w.route)).toBe('contained');
 graphSpy.mockRestore();quoteRead.mockRestore();quoteReconcile.mockRestore();
 expect((await f.flow.read(f.owner,f.saved.id)).state).toBe('active');expect(await f.native.count()).toBe(0);expect(f.mail.calls).toBe(0);
}),20000);
