import { ControlError } from '../durable/contracts';
import { NativeQuoteTransport } from '../quotes/native-transport';
import { NativeQuoteConnector } from './native-quote';
import { startNativeQuoteTwin } from '../../scripts/native-quote-twin';
import { Pool } from 'pg';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { ConnectorControl } from './service';
import { WorkflowControl } from '../workflows/service';
import { QuoteActionBoundary } from './quote-action';
import { type ConnectorProvider } from './contracts';
import { expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInstalledTenantFixture } from '../workspace/installed-tenant-fixture';
import { tokenHash } from '../durable/service';
import { transaction } from '../durable/database';
import { QuoteAuthorityControl, type QuoteDestination } from '../quotes/authority';
import { QuotePlanStore, type QuoteContextLoader } from '../quotes/store';
import type { QuotePlanProposalV2, QuotePlanContextV2 } from '../quotes/plan-v2';

const destination:QuoteDestination={contract:'private-quote-twin-1',workspaceId:'one',quoteId:'quote-42',distributorId:'distributor-7',recipient:'buyer@example.test',sender:'sales@example.test',quoteBinding:'a'.repeat(64),emailBinding:'b'.repeat(64)};
async function fixture(run:(f:Awaited<ReturnType<typeof setup>>)=>Promise<void>){const f=await setup();try{await run(f);}finally{vi.unstubAllEnvs();await f.native.close();await f.installed.close();}}
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
 const web=installed.web('one'),owner=(await installed.context.authenticated(keys.owner)).actor,manager=(await installed.context.authenticated(keys.manager)).actor,colleague=(await installed.context.authenticated(keys.colleague)).actor,foreign=(await installed.context.authenticated(keys.foreign)).actor;
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
 await owner.query(`GRANT SELECT ON native_quote_policies TO ${role};GRANT USAGE ON SCHEMA ${schema} TO ${role};GRANT SELECT,UPDATE(version,result) ON native_quotes TO ${role};GRANT SELECT,INSERT ON native_quote_effects TO ${role}`);
 await owner.query("INSERT INTO native_quotes VALUES('one','quote-42',3,$1)",[{distributorId:'distributor-7',currency:'USD',subtotalMinor:100000,discountBps:0,totalMinor:100000}]);
 url.username=role;url.password=password;const provider=new Pool({connectionString:url.toString(),options:'-c search_path='+schema,max:4}),token=randomBytes(32).toString('hex');
 const binding={workspaceId:'one',quoteId:'quote-42',quoteBinding:destination.quoteBinding,emailBinding:destination.emailBinding,token};
 const lost=new Set<string>();let child:ChildProcess|undefined;const server=await startNativeQuoteTwin(provider,binding,{loseReplyActionIds:lost});
 const connector=new NativeQuoteConnector({origin:server.origin,...destinationConfig()},async()=>token,1500,{ownedTestOrigin:true});
 const writes=vi.spyOn(connector.transport,'write'),lookups=vi.spyOn(connector.transport,'lookup');
 return {policy:async()=>structuredClone((await provider.query("SELECT policy FROM native_quote_policies WHERE workspace_id='one' AND quote_id='quote-42'")).rows[0]?.policy),connector,owner,lost,writes,lookups,provider,schema,role,token,binding,origin:server.origin,
  count:async()=>Number((await owner.query('SELECT count(*) n FROM native_quote_effects')).rows[0].n),
  restart:async()=>{await server.close();child=fork('scripts/native-quote-twin-process.ts',[],{execArgv:['--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','ignore','ipc']});const owned=child;let timer:ReturnType<typeof setTimeout>|undefined;try{const message=once(owned,'message');owned.send({url:url.toString(),schema,binding});const [value]=await Promise.race([message,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned provider startup timed out')),5000);})]);if(!value||typeof value.origin!=='string'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(value.origin))throw Error('Owned provider startup refused');return new NativeQuoteConnector({origin:value.origin,...destinationConfig()},async()=>token,1500,{ownedTestOrigin:true});}finally{clearTimeout(timer);}},
  close:async()=>{if(child){const owned=child;if(!owned.pid||owned.pid===process.pid)throw Error('Owned child identity required');if(owned.exitCode===null&&owned.signalCode===null){const exiting=once(owned,'exit');if(!owned.kill('SIGTERM'))throw Error('Owned child termination refused');let timer:ReturnType<typeof setTimeout>|undefined;try{const [code,signal]=await Promise.race([exiting,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned child exit timed out; teardown refused')),3000);})]);expect(code).toBe(0);expect(signal).toBeNull();}finally{clearTimeout(timer);}}else expect(owned.exitCode).toBe(0);}else await server.close();await provider.end();await owner.end();try{expect((await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].oid).toBe(schemaOid);expect((await admin.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0].oid).toBe(roleOid);await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.query('DROP ROLE '+role);expect((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount).toBe(0);}finally{await admin.end();}}
 };
}
function destinationConfig(){return{workspaceId:destination.workspaceId,quoteId:destination.quoteId,quoteBinding:destination.quoteBinding,emailBinding:destination.emailBinding};}
async function ready(f:Awaited<ReturnType<typeof setup>>){const saved=await f.save(),a=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');return{saved,a:await f.control.review(f.manager,a.id,a.payload_hash,true)};}
it('actual installed quote action uses existing lease engine and native conditional HTTP/update/readback; duplicate does not resend',async()=>fixture(async f=>{
 const {a,saved}=await ready(f);expect(a.state).toBe('ready');
 const email=await f.emailControl.proposeQuote(f.owner,saved.id,saved.planHash,'message');await f.emailControl.review(f.manager,email.id,email.payload_hash,true);
 const completed=await f.control.execute(f.owner,a.id);expect(completed).toMatchObject({state:'succeeded',evidence:{outcome:'verified',reference:expect.any(String)}});
 expect(await f.native.count()).toBe(1);expect(f.native.writes).toHaveBeenCalledTimes(1);expect((await f.quoteProvider.transport.read())?.sourceVersion).toBe('v4');
 expect((await f.control.execute(f.owner,a.id)).state).toBe('succeeded');expect(f.native.writes).toHaveBeenCalledTimes(1);
 expect((await f.control.reconcile(f.owner,a.id)).state).toBe('succeeded');expect(await f.native.count()).toBe(1);
 await expect(f.emailControl.execute(f.owner,email.id)).rejects.toMatchObject({status:503});expect(f.emailProvider.write).not.toHaveBeenCalled();
}));
it('actual lost response commits once, stays uncertain, then retained readback resolves without resend across provider and controller restart',async()=>fixture(async f=>{
 const {a}=await ready(f);f.native.lost.add(a.id);
 expect((await f.control.execute(f.owner,a.id)).state).toBe('uncertain');expect(await f.native.count()).toBe(1);expect(f.native.writes).toHaveBeenCalledTimes(1);
 expect((await f.control.execute(f.owner,a.id)).state).toBe('uncertain');expect(f.native.writes).toHaveBeenCalledTimes(1);
 const restarted=new ConnectorControl(f.web,await f.native.restart(),f.boundary);
 expect((await restarted.reconcile(f.owner,a.id)).state).toBe('succeeded');expect(await f.native.count()).toBe(1);expect(f.native.writes).toHaveBeenCalledTimes(1);
}));
it('real source change after review cancels before conditional update; no effects or downstream requests',async()=>fixture(async f=>{
 const {a}=await ready(f);await f.native.owner.query("UPDATE native_quotes SET version=4 WHERE workspace_id='one'");
 expect((await f.control.execute(f.owner,a.id)).state).toBe('cancelled');expect(await f.native.count()).toBe(0);expect(f.native.writes).not.toHaveBeenCalled();expect(f.emailProvider.write).not.toHaveBeenCalled();
}));
it('manager grant revoke/reactivate and policy drift invalidate pending approvals without a quote write',async()=>fixture(async f=>{
 const {a}=await ready(f);await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,false,1);await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,true,2);
 expect((await f.control.execute(f.owner,a.id)).state).toBe('cancelled');expect(await f.native.count()).toBe(0);expect(f.native.writes).not.toHaveBeenCalled();
}));
it('later same-value provider write is a genuine readback conflict, never success from earlier action state',async()=>fixture(async f=>{
 const {a,saved}=await ready(f);expect((await f.control.execute(f.owner,a.id)).state).toBe('succeeded');
 const r=saved.plan.update.request;expect((await f.quoteProvider.transport.write({...r,sourceVersion:'v4',idempotencyKey:randomUUID()})).status).toBe('observed');
 expect((await f.control.reconcile(f.owner,a.id)).state).toBe('conflict');expect(await f.native.count()).toBe(2);expect(f.native.writes).toHaveBeenCalledTimes(2);
}));

it('concurrent execute observes the existing lease; active verification refuses until the sole actual write completes',async()=>fixture(async f=>{
 const {a}=await ready(f);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r),original=NativeQuoteTransport.prototype.write;
 f.native.writes.mockImplementationOnce(async request=>{enter();await gate;return original.call(f.quoteProvider.transport,request);});
 const pending=f.control.execute(f.owner,a.id);try{await entered;
  expect((await f.control.execute(f.owner,a.id)).state).toBe('executing');await expect(f.control.reconcile(f.owner,a.id)).rejects.toMatchObject({status:409});expect(f.native.writes).toHaveBeenCalledTimes(1);
 }finally{release();}expect((await pending).state).toBe('succeeded');expect(await f.native.count()).toBe(1);
}));
it('authority revoke after network claim contains an actual committed effect as uncertain and never restores approval by reactivation',async()=>fixture(async f=>{
 const {a}=await ready(f);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r),original=NativeQuoteTransport.prototype.write;
 f.native.writes.mockImplementationOnce(async request=>{enter();await gate;return original.call(f.quoteProvider.transport,request);});
 const pending=f.control.execute(f.owner,a.id);try{await entered;await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,false,1);}finally{release();}
 expect(await pending).toMatchObject({state:'uncertain',evidence:{outcome:'verified'}});expect(await f.native.count()).toBe(1);
 await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,true,2);expect((await f.control.reconcile(f.owner,a.id)).state).toBe('uncertain');expect((await f.control.execute(f.owner,a.id)).state).toBe('uncertain');expect(f.native.writes).toHaveBeenCalledTimes(1);
}));
it('expired in-flight lease remains uncertain despite committed evidence; fresh readback resolves without resend',async()=>fixture(async f=>{
 const {a}=await ready(f);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r),original=NativeQuoteTransport.prototype.write;
 f.native.writes.mockImplementationOnce(async request=>{enter();await gate;return original.call(f.quoteProvider.transport,request);});
 const pending=f.control.execute(f.owner,a.id);try{await entered;await f.installed.owner.query("UPDATE ll_connector_actions SET lease_until=clock_timestamp()-interval '1 second' WHERE org_id='one' AND id=$1",[a.id]);}finally{release();}
 expect((await pending).state).toBe('uncertain');expect(await f.native.count()).toBe(1);expect((await f.control.reconcile(f.owner,a.id)).state).toBe('succeeded');expect(f.native.writes).toHaveBeenCalledTimes(1);
}));
it('missing approval expiry and policy change cancel before any actual native mutation',async()=>fixture(async f=>{
 const {a}=await ready(f);await f.installed.owner.query("UPDATE ll_connector_actions SET approval_until=NULL WHERE org_id='one' AND id=$1",[a.id]);
 expect((await f.control.execute(f.owner,a.id)).state).toBe('cancelled');expect(await f.native.count()).toBe(0);expect(f.native.writes).not.toHaveBeenCalled();
}));
it('real malformed HTTP lookup after committed mutation cannot certify success',async()=>fixture(async f=>{
 const {a}=await ready(f);const proxy=createServer(async(req,res)=>{try{if(req.url?.startsWith('/quote-effects/')){res.writeHead(200,{'content-type':'application/json'});res.end('{"contract":"quote-effect-lookup-1","status":"available","effects":[{}],"current":{}}');return;}const parts:Buffer[]=[];for await(const b of req)parts.push(Buffer.from(b));const method=req.method??'GET',response=await fetch(f.native.origin+(req.url??''),{method,headers:req.headers as Record<string,string>,...(method==='GET'?{}:{body:Buffer.concat(parts)})});res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());}catch{res.writeHead(503,{'content-type':'application/json'});res.end('{}');}});
 await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));const address=proxy.address();if(!address||typeof address==='string')throw Error('Owned proxy required');
 try{const connected=new NativeQuoteConnector({origin:'http://127.0.0.1:'+address.port,...destinationConfig()},async()=>f.native.token,1500,{ownedTestOrigin:true}),control=new ConnectorControl(f.web,connected,f.boundary);
  expect((await control.execute(f.owner,a.id)).state).toBe('uncertain');expect(await f.native.count()).toBe(1);expect((await control.reconcile(f.owner,a.id)).state).toBe('uncertain');expect(await f.native.count()).toBe(1);
 }finally{await new Promise<void>((resolve,reject)=>{proxy.close(e=>e?reject(e):resolve());proxy.closeIdleConnections();});}
}));
it('adapter independently rejects nonquote/changedaction/binding and unsupported source requests before provider mutation',async()=>fixture(async f=>{
 const {a}=await ready(f);expect(await f.quoteProvider.source('quote')).toBe('v3');await expect(f.quoteProvider.source('email')).rejects.toMatchObject({status:409});
 const p=a.payload;if(!('contract' in p)||p.contract!=='quote-step-1')throw Error('Exact quote step required');
 for(const action of [{...a,connector:'email' as const},{...a,id:randomUUID()},{...a,payload:{...p,binding:'e'.repeat(64)}},{...a,payload:{...p,step:'message' as const}},{...a,payload:{...p,quoteRequest:{...p.quoteRequest,body:{}}}} as unknown as typeof a])await expect(f.quoteProvider.write(action)).rejects.toMatchObject({status:409});
 expect(await f.native.count()).toBe(0);expect(f.native.writes).not.toHaveBeenCalled();
}));
it('authenticated source mismatch in adapter prevents PATCH and conditional race refuses atomically',async()=>fixture(async f=>{
 const {a}=await ready(f);await f.native.owner.query("UPDATE native_quotes SET version=4 WHERE workspace_id='one'");
 expect((await f.quoteProvider.write(a)).outcome).toBe('conflict');expect(f.native.writes).not.toHaveBeenCalled();expect(await f.native.count()).toBe(0);
 await f.native.owner.query("UPDATE native_quotes SET version=3 WHERE workspace_id='one'");let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r),original=NativeQuoteTransport.prototype.write;
 f.native.writes.mockImplementationOnce(async request=>{enter();await gate;return original.call(f.quoteProvider.transport,request);});
 const pending=f.control.execute(f.owner,a.id);try{await entered;await f.native.owner.query("UPDATE native_quotes SET version=4 WHERE workspace_id='one'");}finally{release();}
 expect((await pending).state).toBe('conflict');expect(await f.native.count()).toBe(0);expect(f.native.writes).toHaveBeenCalledTimes(1);
}));
it('native authentication failure is unknown evidence with zero provider mutation, never fallback execution',async()=>fixture(async f=>{
 const {a}=await ready(f);const wrong=new NativeQuoteConnector({origin:f.native.origin,...destinationConfig()},async()=>randomBytes(32).toString('hex'),1500,{ownedTestOrigin:true});
 expect(await wrong.source('quote')).toBeNull();const control=new ConnectorControl(f.web,wrong,f.boundary);
 expect((await control.execute(f.owner,a.id)).state).toBe('uncertain');expect((await control.reconcile(f.owner,a.id)).state).toBe('uncertain');expect(await f.native.count()).toBe(0);
}));
it('controlled acknowledgement loss uses the same uncertainty/readback path with no retry',async()=>fixture(async f=>{
 const {a}=await ready(f);expect((await f.control.execute(f.owner,a.id,true)).state).toBe('uncertain');expect(await f.native.count()).toBe(1);expect((await f.control.reconcile(f.owner,a.id)).state).toBe('succeeded');expect(f.native.writes).toHaveBeenCalledTimes(1);
}));

it('actual pricing metadata changes after dispatch contain a committed quote and cannot revive old approval',async()=>fixture(async f=>{
 const {a}=await ready(f);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r),original=NativeQuoteTransport.prototype.write;
 f.native.writes.mockImplementationOnce(async request=>{enter();await gate;return original.call(f.quoteProvider.transport,request);});
 const pending=f.control.execute(f.owner,a.id);try{await entered;await f.native.owner.query("UPDATE native_quote_policies SET policy=jsonb_set(policy,'{hardCapBps}','1300') WHERE workspace_id='one'");}finally{release();}
 expect(await pending).toMatchObject({state:'uncertain',evidence:{outcome:'verified'}});expect(await f.native.count()).toBe(1);
 expect((await f.control.reconcile(f.owner,a.id)).state).toBe('uncertain');expect((await f.control.execute(f.owner,a.id)).state).toBe('uncertain');expect(f.native.writes).toHaveBeenCalledTimes(1);
}));

it('unavailable pricing metadata before dispatch is unsupported and preserves ready state without a lease or write',async()=>fixture(async f=>{
 const {a}=await ready(f);await f.native.owner.query('DROP TABLE native_quote_policies');
 await expect(f.control.execute(f.owner,a.id)).rejects.toMatchObject({status:503});expect((await f.control.read(f.owner,a.id))).toMatchObject({state:'ready',lease_until:null});expect(await f.native.count()).toBe(0);expect(f.native.writes).not.toHaveBeenCalled();
}));
it('lost independent pricing read after dispatch retains committed evidence as uncertain, never resends',async()=>fixture(async f=>{
 const {a}=await ready(f);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r),original=NativeQuoteTransport.prototype.write;
 f.native.writes.mockImplementationOnce(async request=>{enter();await gate;return original.call(f.quoteProvider.transport,request);});
 const pending=f.control.execute(f.owner,a.id);try{await entered;await f.native.owner.query('DROP TABLE native_quote_policies');}finally{release();}
 expect(await pending).toMatchObject({state:'uncertain',evidence:{outcome:'verified'}});expect(await f.native.count()).toBe(1);expect((await f.control.reconcile(f.owner,a.id)).state).toBe('uncertain');expect(f.native.writes).toHaveBeenCalledTimes(1);
}));
it('native execution requires a separately configured policy reader; malformed or foreign metadata cannot authorize a lease',async()=>fixture(async f=>{
 const {a}=await ready(f);const context=async(c:Parameters<QuoteContextLoader>[0],actor:Parameters<QuoteContextLoader>[1],plan:Readonly<import('../quotes/plan-v2').QuotePlanV2>)=>({contract:'quote-plan-context-2',pricing:await f.loadPricing(),authority:await f.authority.currentSavedPlanAuthority(actor,plan.planId,c)});
 const absent=new ConnectorControl(f.web,f.quoteProvider,new QuoteActionBoundary(f.web,f.authority,context));await expect(absent.execute(f.owner,a.id)).rejects.toMatchObject({status:503});
 for(const value of [null,{contract:'quote-pricing-policy-1',workspaceId:'two',quoteId:'quote-42',policy:{version:3,delegatedBps:1000,hardCapBps:2000,active:true}},{contract:'quote-pricing-policy-1',workspaceId:'one',quoteId:'quote-42',policy:{},extra:true}]){
  const control=new ConnectorControl(f.web,f.quoteProvider,new QuoteActionBoundary(f.web,f.authority,context,async()=>value));await expect(control.execute(f.owner,a.id)).rejects.toMatchObject({status:503});
 }
 expect((await f.control.read(f.owner,a.id)).state).toBe('ready');expect(await f.native.count()).toBe(0);expect(f.native.writes).not.toHaveBeenCalled();
}));


it('actual installed saved quote graph executes its exact approved first step once and keeps downstream unavailable',async()=>fixture(async f=>{
 const saved=await f.save();expect(await f.workflow.createQuote(f.owner,saved.id)).toBe(saved.id);
 const action=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 await f.control.review(f.manager,action.id,action.payload_hash,true);
 expect((await f.control.execute(f.owner,action.id)).state).toBe('succeeded');
 expect((await f.control.execute(f.owner,action.id)).state).toBe('succeeded');
 expect(await f.native.count()).toBe(1);expect(f.native.writes).toHaveBeenCalledTimes(1);
 const run=await f.workflow.read(f.owner,saved.id);expect(run.quoteView?.completion).toBe('not-established');
 expect(run.steps).toHaveLength(2);expect(run.steps[0].state).toBe('succeeded');
 expect(run.steps[1].state).toBeNull();expect(f.emailProvider.write).not.toHaveBeenCalled();
}));
it('pausing the actual installed quote graph refuses approved dispatch before any provider mutation',async()=>fixture(async f=>{
 const saved=await f.save();await f.workflow.createQuote(f.owner,saved.id);
 const action=await f.control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
 await f.control.review(f.manager,action.id,action.payload_hash,true);
 expect(await f.workflow.pause(f.owner,saved.id)).toEqual({paused:true});
 await expect(f.control.execute(f.owner,action.id)).rejects.toMatchObject({status:409});
 expect((await f.control.read(f.owner,action.id)).state).toBe('ready');
 expect(await f.native.count()).toBe(0);expect(f.native.writes).not.toHaveBeenCalled();expect(f.emailProvider.write).not.toHaveBeenCalled();
}));
