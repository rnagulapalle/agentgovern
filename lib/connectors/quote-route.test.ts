import { readFile } from 'node:fs/promises';
import { ConnectorControl } from './service';
import { WorkflowControl } from '../workflows/service';
import { QuoteActionBoundary } from './quote-action';
import type { ConnectorProvider } from './contracts';
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


import { NextRequest } from "next/server";
import { configureTenantContext } from "../workspace/tenant-context";
import { WORKSPACE_COOKIE } from "../workspace/identity";
import { GET } from "../../app/api/workspace/quotes/route";
import { QuoteWorkflowReader } from "../quotes/read-service";
it("actual installed named HTTP quote list/read scopes anonymous, foreign, origin and query inputs without actions",async()=>fixture(async f=>{
 configureTenantContext(f.installed.context);
 const saved=await f.save();await f.workflow.createQuote(f.owner,saved.id);
 const reader=new QuoteWorkflowReader(f.web);
 for(const id of ["HEAD",null,3])await expect(reader.read(f.owner,id as string)).rejects.toMatchObject({status:400});
 await expect(new QuoteWorkflowReader(f.installed.owner).read(f.owner,saved.id)).rejects.toMatchObject({status:403});
 await f.installed.owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('legacy-owner-read','one',$1,'operator')",[f.owner.subject]);
 await expect(reader.read({...f.owner,tokenHash:'legacy-owner-read'},saved.id)).rejects.toMatchObject({status:403});
 const request=(key:string|undefined,query="",headers:Record<string,string>={})=>new NextRequest(`https://looplabs.run/api/workspace/quotes${query}`,{headers:{...(key?{cookie:`${WORKSPACE_COOKIE}=${key}`}:{ }),...headers}});
 for(const key of [f.keys.owner,f.keys.manager]){
  const list=await GET(request(key));expect(list.status).toBe(200);expect(list.headers.get("cache-control")).toBe("no-store");expect((await list.json()).quotes).toEqual([{id:saved.id,quoteId:"quote-42",distributorId:"distributor-7",discountBps:1400,totalMinor:86000,manager:f.manager.subject}]);
  const r=await GET(request(key,`?run=${saved.id}`,{origin:"https://looplabs.run"}));expect(r.status).toBe(200);const value=await r.json();expect(value.view).toMatchObject({planId:saved.id,discountBps:1400,delegatedBps:1000,totalMinor:86000,completion:"not-established"});expect(value).not.toHaveProperty("steps");
 }
 for(const key of [f.keys.colleague,f.keys.foreign]){
  const list=await GET(request(key));expect(list.status).toBe(200);expect((await list.json()).quotes).toEqual([]);
  const r=await GET(request(key,`?run=${saved.id}`));expect(r.status).toBe(404);expect(await r.text()).not.toContain("buyer@example.test");
 }
 expect((await GET(request(undefined))).status).toBe(401);
 for(const query of ["?run=HEAD",`?run=${saved.id}&run=${saved.id}`,`?run=${saved.id}&org=two`,"?org=one","?run="]){const r=await GET(request(f.keys.owner,query));expect(r.status).toBe(400);expect(await r.text()).not.toContain("buyer@example.test");}
 for(const headers of [{origin:"https://unrelated.example"},{"sec-fetch-site":"cross-site"}] as Record<string,string>[])expect((await GET(request(f.keys.owner,`?run=${saved.id}`,headers))).status).toBe(403);
 expect((await f.installed.owner.query("SELECT count(*)::int n FROM ll_connector_actions")).rows[0].n).toBe(0);expect(f.quoteProvider.write).not.toHaveBeenCalled();expect(f.quoteProvider.inspect).not.toHaveBeenCalled();
 await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,false,1);await f.authority.setManagerActive(f.owner,f.scope,f.manager.subject,3,true,2);
 expect((await GET(request(f.keys.manager,`?run=${saved.id}`))).status).toBe(409);
 expect((await GET(request(f.keys.owner))).status).toBe(409);
 const policy=(await f.installed.owner.query("SELECT pg_get_expr(polqual,polrelid) AS expression FROM pg_policy WHERE polrelid='ll_connector_scopes'::regclass AND polname='ll_tenant_prototype'")).rows[0].expression;
 await f.installed.owner.query("ALTER POLICY ll_tenant_prototype ON ll_connector_scopes USING(false)");
 try{const r=await GET(request(f.keys.owner,`?run=${saved.id}`));expect(r.status).toBe(503);expect(await r.text()).not.toContain("buyer@example.test");}
 finally{await f.installed.owner.query(`ALTER POLICY ll_tenant_prototype ON ll_connector_scopes USING(${policy})`);}
 // Owner-only schema fault injection; missing destination fields cannot become
 // a guessed contact adapter or an execution-capable provider.
 await f.installed.owner.query("ALTER TABLE ll_connector_scopes RENAME COLUMN sender TO unavailable_sender");
 try{const r=await GET(request(f.keys.owner,`?run=${saved.id}`));expect(r.status).toBe(409);expect(await r.text()).not.toContain("buyer@example.test");}
 finally{await f.installed.owner.query("ALTER TABLE ll_connector_scopes RENAME COLUMN unavailable_sender TO sender");}
 await f.installed.owner.query("ALTER TABLE ll_quote_plans RENAME TO unavailable_quote_plans");
 try{const r=await GET(request(f.keys.owner));expect(r.status).toBe(503);expect(await r.text()).not.toContain("password");}
 finally{await f.installed.owner.query("ALTER TABLE unavailable_quote_plans RENAME TO ll_quote_plans");}
}));
