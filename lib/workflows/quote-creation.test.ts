import { expect, it, vi } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import type { Actor } from "../durable/contracts";
import { transaction } from "../durable/database";
import { QuotePlanStore, type QuoteContextLoader } from "../quotes/store";
import { QuoteAuthorityControl } from "../quotes/authority";
import type { QuotePlanContext, QuotePlanProposal } from "../quotes/plan";
import type { QuotePlanProposalV2, QuotePlanContextV2 } from "../quotes/plan-v2";
import { ConnectorControl } from "../connectors/service";
import type { ConnectorProvider } from "../connectors/contracts";
import { WorkflowControl } from "./service";
const owner:Actor={orgId:"company-a",subject:"owner@example.test",role:"operator",tokenHash:"session-owner"};
const manager:Actor={...owner,subject:"manager@example.test",tokenHash:"session-manager"};
const foreign:Actor={...owner,orgId:"company-b",subject:"other@example.test",tokenHash:"session-other"};
function data(): { proposal: QuotePlanProposal; context: QuotePlanContext } {
  const quote = { id: "quote-42", distributorId: "distributor-7", recipient: "buyer@example.test", sourceVersion: "v3",
    currency: "USD" as const, subtotalMinor: 100_000, lines: [{ id: "line-1", quantity: 10, unitPriceMinor: 10_000 }] };
  return {
    proposal: { version: "distributor-quote-plan-1", planId: randomUUID(), workspaceId: owner.orgId,
      requester: owner.subject, approver: manager.subject, policyVersion: 3, quote: structuredClone(quote), discountBps: 1400,
      update: { actionId: randomUUID(), agentId: "quote-agent" },
      message: { actionId: randomUUID(), agentId: "message-agent", dependsOn: "" } },
    context: { workspaceId: owner.orgId, requester: owner.subject, quote: structuredClone(quote),
      approvalGrants: [{ member: manager.subject, workspaceId: owner.orgId, quoteId: quote.id, policyVersion: 3, active: true, capability: "quote.discount.approve" }],
      policy: { version: 3, delegatedBps: 1000, hardCapBps: 2000, active: true },
      agents: [
        { id: "quote-agent", workspaceId: owner.orgId, quoteId: quote.id, action: "quote.update", active: true },
        { id: "message-agent", workspaceId: owner.orgId, quoteId: quote.id, action: "quote.message", active: true },
      ],
      provider: { workspaceId: owner.orgId, quoteId: quote.id, contract: "quote-conditional-write-1", binding: "a".repeat(64), atomicSourceVersion: true, actionIdIdempotency: true, effectReadback: true },
      email: { workspaceId: owner.orgId, quoteId: quote.id, from: "sales@example.test", recipient: quote.recipient, actionIdIdempotency: true, effectReadback: true },
    },
  };
}
async function fixture(run:(db:Pool,w:WorkflowControl,p:QuotePlanProposalV2,c:QuotePlanContextV2,control:QuoteAuthorityControl,store:QuotePlanStore)=>Promise<void>) {
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error("Dedicated PostgreSQL required; no skip.");
 const admin=new Pool({connectionString:url}),schema=`quote_graph_${randomBytes(8).toString("hex")}`;let db:Pool|undefined;
 try {
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  for(const file of ["lib/durable/schema.sql","lib/workspace/schema.sql","lib/refunds/schema.sql","lib/connectors/schema.sql","lib/workflows/schema.sql","lib/durable/proposal-schema.sql","lib/durable/recovery-schema.sql","lib/quotes/schema.sql","lib/connectors/scope-schema.sql","lib/quotes/authority-schema.sql","lib/quotes/plan-v2-schema.sql","lib/quotes/membership-schema.sql","lib/connectors/quote-action-schema.sql"])await db.query(await readFile(file,"utf8"));
  const epoch=randomUUID();vi.stubEnv("LOOPLABS_RECOVERY_EPOCH",epoch);
  await db.query("INSERT INTO ll_orgs(id) VALUES('company-a'),('company-b')");
  await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('company-a',$1),('company-b',$1)",[epoch]);
  await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@example.test','company-a','Owner','fixture'),('manager@example.test','company-a','Manager','fixture'),('other@example.test','company-b','Other','fixture')");
  for(const a of [owner,manager,foreign])await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')",[a.tokenHash,a.subject]);
  const d=data();d.proposal.message.dependsOn=d.proposal.update.actionId;
  const control=new QuoteAuthorityControl(db,{contract:"private-quote-twin-1",workspaceId:owner.orgId,quoteId:d.proposal.quote.id,distributorId:d.proposal.quote.distributorId,recipient:d.proposal.quote.recipient,sender:d.context.email.from,quoteBinding:d.context.provider.binding,emailBinding:"b".repeat(64)}),scope=randomUUID();
  await control.enroll(owner,scope);await control.grantManager(owner,scope,manager.subject,3);
  const current=await transaction(db,owner.orgId,c=>control.currentAuthority(c,owner,scope,manager.subject,3));if(!current)throw Error("Fixture current authority missing");
  const p:QuotePlanProposalV2={...d.proposal,version:"distributor-quote-plan-2",authority:current};
  const context:QuotePlanContextV2={contract:"quote-plan-context-2",pricing:d.context,authority:current};
  const load:QuoteContextLoader=async()=>structuredClone(context);
  const store=new QuotePlanStore(db,load,(c,a,r)=>control.currentAuthority(c,a,r.scopeId,r.member,r.policyVersion));await store.save(owner,p);
  for(const [id,tool,role,connector] of [[p.update.agentId,"twin.quote","quote_agent","quote_twin"],[p.message.agentId,"twin.email","email_agent","email_twin"]]) {
   await db.query("INSERT INTO ll_agents(org_id,id,tools) VALUES($1,$2,$3)",[owner.orgId,id,[tool]]);
   await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES($1,$2,$2,$3,$4,$5)",[owner.orgId,id,owner.subject,role,connector]);
   await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,'agent')",[`agent-${id}`,owner.orgId,id]);
  }
  const provider:ConnectorProvider={workspaceId:owner.orgId,bindingId:"c".repeat(64),source:async()=>{throw Error("No provider reads in graph creation");},write:async()=>{throw Error("No provider write in graph creation");},inspect:async()=>{throw Error("No provider inspect in graph creation");}};
  await run(db,new WorkflowControl(db,new ConnectorControl(db,provider),{authority:control,loadContext:load}),p,context,control,store);
 }finally{vi.unstubAllEnvs();await db?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
it("actual concurrent graph creation preserves saved identities, requests and dependency without any action",async()=>fixture(async(db,w,p,_c,_a,store)=>{
 const saved=await store.read(owner,p.planId);const ids=await Promise.all(Array.from({length:5},()=>w.createQuote(owner,p.planId)));expect(ids).toEqual(Array(5).fill(p.planId));
 const rows=(await db.query("SELECT * FROM ll_workflow_steps ORDER BY ordinal")).rows;
 expect(rows.map(s=>s.action_id)).toEqual([p.update.actionId,p.message.actionId]);expect(rows.map(s=>s.dependency_action_id)).toEqual([null,p.update.actionId]);
 expect(rows[0].payload.quoteRequest).toEqual(saved.plan.update.request);expect(rows[1].payload.quoteRequest).toEqual(saved.plan.message.request);
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_events")).rows[0].n).toBe(1);
 expect((await db.query("SELECT count(*)::int n FROM ll_connector_actions")).rows[0].n).toBe(0);
 expect((await db.query("SELECT reserved FROM ll_agents")).rows.every(a=>a.reserved===0)).toBe(true);
 await expect(w.create(owner,p.update.agentId,p.message.agentId,p.planId)).rejects.toThrow("different plan");
 expect((await w.read(owner,p.planId)).quoteView).toMatchObject({planId:p.planId,completion:"not-established"});
}));
it("source/pricing drift, absent admission and foreign/manager identities refuse without graph",async()=>fixture(async(db,w,p,c)=>{
 for(const a of [foreign,manager,{...owner,tokenHash:"wrong"}])await expect(w.createQuote(a,p.planId)).rejects.toThrow();
 await expect(new WorkflowControl(db,w.connectors).createQuote(owner,p.planId)).rejects.toThrow("server-owned");
 for(const id of ["HEAD",null,randomUUID()])await expect(w.createQuote(owner,id as string)).rejects.toThrow();
 c.pricing.quote.sourceVersion="newer";await expect(w.createQuote(owner,p.planId)).rejects.toThrow();
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_runs")).rows[0].n).toBe(0);
}));
it.each(["manager","scope","requester","epoch","agent"])("current %s change refuses exact duplicate graph authority",async(kind)=>fixture(async(db,w,p,_c,a)=>{
 await w.createQuote(owner,p.planId);
 if(kind==="manager"){await a.setManagerActive(owner,p.authority.scopeId,manager.subject,3,false,1);await a.setManagerActive(owner,p.authority.scopeId,manager.subject,3,true,2);}
 if(kind==="scope"){await a.setScopeActive(owner,p.authority.scopeId,false,1);await a.setScopeActive(owner,p.authority.scopeId,true,2);}
 if(kind==="requester"){await db.query("UPDATE ll_members SET active=false WHERE email=$1",[owner.subject]);await db.query("UPDATE ll_members SET active=true WHERE email=$1",[owner.subject]);}
 if(kind==="epoch")vi.stubEnv("LOOPLABS_RECOVERY_EPOCH",randomUUID());
 if(kind==="agent")await db.query("UPDATE ll_agents SET active=false WHERE id=$1",[p.update.agentId]);
 await expect(w.createQuote(owner,p.planId)).rejects.toThrow();
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_runs")).rows[0].n).toBe(1);expect((await db.query("SELECT count(*)::int n FROM ll_connector_actions")).rows[0].n).toBe(0);
}));
it("database exact step guards and existing proposal immutability refuse tamper",async()=>fixture(async(db,w,p)=>{
 await w.createQuote(owner,p.planId);
 for(const sql of ["UPDATE ll_workflow_runs SET quote_plan_hash=repeat('f',64)","UPDATE ll_workflow_steps SET payload='{}'", "UPDATE ll_workflow_steps SET dependency_action_id=NULL WHERE ordinal=2","DELETE FROM ll_workflow_steps", "DELETE FROM ll_workflow_runs"])await expect(db.query(sql)).rejects.toThrow();
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_steps")).rows[0].n).toBe(2);
}));
it("historical v1 and existing run/action ID collisions refuse without new steps or actions",async()=>fixture(async(db,w,p,c,_a,store)=>{
 const old=data();old.proposal.message.dependsOn=old.proposal.update.actionId;
 const legacy=new QuotePlanStore(db,async()=>structuredClone(c.pricing));await legacy.save(owner,old.proposal);
 await expect(w.createQuote(owner,old.proposal.planId)).rejects.toThrow("Historical");
 await db.query("INSERT INTO ll_workflow_runs(org_id,id,created_by) VALUES($1,$2,$3)",[owner.orgId,p.update.actionId,owner.subject]);
 await expect(w.createQuote(owner,p.planId)).rejects.toThrow("identities");
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_steps")).rows[0].n).toBe(0);
 expect((await db.query("SELECT count(*)::int n FROM ll_connector_actions")).rows[0].n).toBe(0);
 expect((await store.read(owner,p.planId)).id).toBe(p.planId);
}));
it("direct SQL quote run forgery and mismatched steps refuse against current saved plan",async()=>fixture(async(db,w,p,_c,a)=>{
 for(const [subject,hash] of [[manager.subject,"a".repeat(64)],[owner.subject,"f".repeat(64)]])await expect(db.query("INSERT INTO ll_workflow_runs(org_id,id,created_by,workflow_kind,quote_plan_id,quote_plan_hash) VALUES($1,$2,$3,'distributor-quote',$2,$4)",[owner.orgId,p.planId,subject,hash])).rejects.toThrow();
 await a.setManagerActive(owner,p.authority.scopeId,manager.subject,3,false,1);
 const saved=(await db.query("SELECT * FROM ll_quote_plans WHERE id=$1",[p.planId])).rows[0];
 await expect(db.query("INSERT INTO ll_workflow_runs(org_id,id,created_by,workflow_kind,quote_plan_id,quote_plan_hash) VALUES($1,$2,$3,'distributor-quote',$2,$4)",[owner.orgId,p.planId,owner.subject,saved.plan_hash])).rejects.toThrow("authority changed");
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_runs")).rows[0].n).toBe(0);
 await expect(w.createQuote(owner,p.planId)).rejects.toThrow("changed");
}));
it("member row contention refuses and rolls back all graph state; same fresh request succeeds after release",async()=>fixture(async(db,w,p)=>{
 const held=await db.connect();try{
  await held.query("BEGIN");await held.query("SELECT email FROM ll_members WHERE email=$1 FOR UPDATE",[manager.subject]);
  await expect(w.createQuote(owner,p.planId)).rejects.toMatchObject({code:"55P03"});
  expect((await db.query("SELECT count(*)::int n FROM ll_workflow_runs")).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int n FROM ll_workflow_agents")).rows[0].n).toBe(0);
  await held.query("ROLLBACK");expect(await w.createQuote(owner,p.planId)).toBe(p.planId);
 }finally{await held.query("ROLLBACK");held.release();}
}));
it("authority changed during awaited server context load is refused and rolled back",async()=>fixture(async(db,w,p)=>{
 const original=w.quotes!;
 const delayed=new WorkflowControl(db,w.connectors,{authority:original.authority,loadContext:async(c,a,r)=>{
  const context=await original.loadContext(c,a,r);
  // Explicit test-owned fault injection through the already-held workspace transaction.
  await c.query("UPDATE ll_members SET active=false WHERE email=$1",[manager.subject]);
  return context;
 }});
 await expect(delayed.createQuote(owner,p.planId)).rejects.toThrow("changed");
 expect((await db.query("SELECT active FROM ll_members WHERE email=$1",[manager.subject])).rows[0].active).toBe(true);
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_runs")).rows[0].n).toBe(0);
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_events")).rows[0].n).toBe(0);
}));
it("direct wrong request, binding, action, agent and dependency cannot become a persisted quote step",async()=>fixture(async(db,_w,p,_c,_a,store)=>{
 const saved=await store.read(owner,p.planId),plan=saved.plan;
 await db.query("INSERT INTO ll_workflow_runs(org_id,id,created_by,workflow_kind,quote_plan_id,quote_plan_hash) VALUES($1,$2,$3,'distributor-quote',$2,$4)",[owner.orgId,p.planId,owner.subject,saved.planHash]);
 const exact={contract:"quote-step-1",planId:p.planId,planHash:saved.planHash,step:"update",quoteRequest:plan.update.request,binding:plan.update.request.binding};
 for(const [action,agent,payload,dependency] of [
  [randomUUID(),p.update.agentId,exact,null],
  [p.update.actionId,p.message.agentId,exact,null],
  [p.update.actionId,p.update.agentId,{...exact,binding:"f".repeat(64)},null],
  [p.update.actionId,p.update.agentId,{...exact,quoteRequest:{...exact.quoteRequest,sourceVersion:"changed"}},null],
  [p.update.actionId,p.update.agentId,exact,p.message.actionId],
 ])await expect(db.query("INSERT INTO ll_workflow_steps(org_id,run_id,ordinal,action_id,agent_id,connector,payload,dependency_action_id) VALUES($1,$2,1,$3,$4,'quote',$5,$6)",[owner.orgId,p.planId,action,agent,JSON.stringify(payload),dependency])).rejects.toThrow("exact saved");
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_steps")).rows[0].n).toBe(0);
}));
