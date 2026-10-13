/** Test-only exact quote setup reused by independent installed API files. */
import { readFile } from 'node:fs/promises';
import { ConnectorControl } from './service';
import { WorkflowControl } from '../workflows/service';
import { QuoteActionBoundary } from './quote-action';
import type { ConnectorProvider } from './contracts';
import { expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInstalledTenantFixture } from '../workspace/installed-tenant-fixture';
import { tokenHash } from '../durable/service';
import { transaction } from '../durable/database';
import { QuoteAuthorityControl, type QuoteDestination } from '../quotes/authority';
import { QuotePlanStore, type QuoteContextLoader } from '../quotes/store';
import type { QuotePlanProposalV2, QuotePlanContextV2 } from '../quotes/plan-v2';

const destination:QuoteDestination={contract:'private-quote-twin-1',workspaceId:'one',quoteId:'quote-42',distributorId:'distributor-7',recipient:'buyer@example.test',sender:'sales@example.test',quoteBinding:'a'.repeat(64),emailBinding:'b'.repeat(64)};
export async function setupQuoteDemoFixture(){
 const keys={owner:randomBytes(32).toString('base64url'),manager:randomBytes(32).toString('base64url'),colleague:randomBytes(32).toString('base64url'),foreign:randomBytes(32).toString('base64url')};
 const installed=await createInstalledTenantFixture({tenants:['one','two'],salesOrg:'one',seed:async owner=>{
  for(const [subject,org,key]of [['owner@example.test','one',keys.owner],['manager@example.test','one',keys.manager],['colleague@example.test','one',keys.colleague],['other@example.test','two',keys.foreign]]){
   await owner.query('INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,$2,$1,\'fixture\')',[subject,org]);
   await owner.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(key),subject]);
  }
 }});
 try{
 const web=(await installed.context.member(keys.owner)).db,owner=(await installed.context.authenticated(keys.owner)).actor,manager=(await installed.context.authenticated(keys.manager)).actor,colleague=(await installed.context.authenticated(keys.colleague)).actor,foreign=(await installed.context.authenticated(keys.foreign)).actor;
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
 return {loader,workflow:new WorkflowControl(web,control,{authority,loadContext:loader,message:emailControl}),boundary,control,emailControl,quoteProvider,emailProvider,save,installed,web,owner,manager,colleague,foreign,authority,scope,store,prepare,pricing,keys};
 }catch(e){await installed.close();throw e;}
}
