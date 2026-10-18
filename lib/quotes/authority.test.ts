import { expect, it, vi } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { transaction } from "../durable/database";
import type { Actor } from "../durable/contracts";
import { ScopeControl, scopeEnrollment, currentScopeGrant } from "../connectors/scopes";
import type { ConnectorProvider } from "../connectors/contracts";
import { QuoteAuthorityControl, sameQuoteAuthority, type QuoteDestination } from "./authority";
const owner: Actor = {orgId:"one",subject:"owner@example.test",role:"operator",tokenHash:"owner-session"};
const foreign: Actor = {orgId:"two",subject:"other@example.test",role:"operator",tokenHash:"other-session"};
const member="manager@example.test";
const configured: QuoteDestination = {contract:"private-quote-twin-1",workspaceId:"one",quoteId:"quote-42",distributorId:"distributor-7",recipient:"buyer@example.test",sender:"sales@example.test",quoteBinding:"a".repeat(64),emailBinding:"b".repeat(64)};
async function fixture(run:(db:Pool,control:QuoteAuthorityControl,id:string,schema:string)=>Promise<void>) {
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error("Dedicated PostgreSQL required; no skip.");
 const admin=new Pool({connectionString:url}),schema=`quote_authority_${randomBytes(8).toString("hex")}`;let db:Pool|undefined;
 try {
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  for(const path of ["lib/durable/schema.sql","lib/workspace/schema.sql","lib/durable/recovery-schema.sql","lib/connectors/schema.sql","lib/connectors/scope-schema.sql","lib/quotes/authority-schema.sql"])await db.query(await readFile(path,"utf8"));
  await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");const epoch=randomUUID();vi.stubEnv("LOOPLABS_RECOVERY_EPOCH",epoch);
  await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('one',$1),('two',$1)",[epoch]);
  await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@example.test','one','Owner','fixture'),('manager@example.test','one','Manager','fixture'),('other@example.test','two','Other','fixture')");
  await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('owner-session','owner@example.test',now()+interval '1 hour'),('other-session','other@example.test',now()+interval '1 hour')");
  await run(db,new QuoteAuthorityControl(db,configured),randomUUID(),schema);
 }finally{vi.unstubAllEnvs();await db?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
async function snapshot(db:Pool,c:QuoteAuthorityControl,id:string){return transaction(db,owner.orgId,client=>c.currentAuthority(client,owner,id,member,3));}
it("concurrent enrollment/grants are exact idempotent and never authorize actions",async()=>fixture(async(db,c,id)=>{
 const rows=await Promise.all(Array.from({length:5},()=>c.enroll(owner,id)));rows.forEach(r=>expect(r).toEqual(rows[0]));
 expect(await c.read(owner,id)).toEqual(rows[0]);expect(await c.list(owner)).toEqual([rows[0]]);
 const grants=await Promise.all(Array.from({length:5},()=>c.grantManager(owner,id,member,3)));grants.forEach(g=>expect(g).toEqual(grants[0]));
 const current=await snapshot(db,c,id);expect(current).toMatchObject({scopeVersion:1,grantVersion:1,quoteBinding:configured.quoteBinding,emailBinding:configured.emailBinding,member,policyVersion:3});
 expect(sameQuoteAuthority(structuredClone(current),current)).toBe(true);expect(sameQuoteAuthority({},current)).toBe(false);expect(sameQuoteAuthority({},null)).toBe(false);
 expect((await db.query("SELECT kind FROM ll_connector_scope_events ORDER BY id")).rows.map(r=>r.kind)).toEqual(["quote_enrolled","quote_manager_granted"]);
 expect((await db.query("SELECT count(*)::int n FROM ll_actions")).rows[0].n).toBe(0);
}));
it("changed destination, ID collision and wrong resource reads refuse",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await expect(c.enroll(owner,randomUUID())).rejects.toThrow("another scope");
 for(const override of [{emailBinding:"c".repeat(64)},{quoteId:"other"},{recipient:"different@example.test"},{sender:"different@example.test"},{distributorId:"different"}]){
  const other=new QuoteAuthorityControl(db,{...configured,...override});await expect(other.enroll(owner,id)).rejects.toThrow("not found");await expect(other.read(owner,id)).rejects.toThrow("not found");await expect(other.list(owner)).rejects.toThrow("not found");
 }
 await expect(c.read(owner,randomUUID())).rejects.toThrow("not found");
}));
it("revocation/reactivation never revives saved snapshots or changes exact bindings",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await c.grantManager(owner,id,member,3);const old=await snapshot(db,c,id);
 await c.setManagerActive(owner,id,member,3,false,1);expect(await snapshot(db,c,id)).toBeNull();expect((await c.grantManager(owner,id,member,3)).active).toBe(false);
 await c.setManagerActive(owner,id,member,3,true,2);expect((await snapshot(db,c,id))?.grantVersion).toBe(3);expect(sameQuoteAuthority(old,await snapshot(db,c,id))).toBe(false);
 await c.setScopeActive(owner,id,false,1);expect(await snapshot(db,c,id)).toBeNull();expect((await c.enroll(owner,id)).active).toBe(false);
 await c.setScopeActive(owner,id,true,2);expect((await snapshot(db,c,id))?.scopeVersion).toBe(3);expect(sameQuoteAuthority(old,await snapshot(db,c,id))).toBe(false);
 expect((await c.read(owner,id)).email_binding_id).toBe(configured.emailBinding);
}));
it("optimistic versions refuse stale no-op and concurrent authority changes",async()=>fixture(async(_db,c,id)=>{
 await c.enroll(owner,id);await c.grantManager(owner,id,member,3);
 expect((await c.setScopeActive(owner,id,true,1)).version).toBe(1);expect((await c.setManagerActive(owner,id,member,3,true,1)).version).toBe(1);
 const results=await Promise.allSettled([c.setScopeActive(owner,id,false,1),c.setScopeActive(owner,id,false,1)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 await expect(c.setScopeActive(owner,id,false,1)).rejects.toThrow("changed");await c.setScopeActive(owner,id,true,2);
 const grants=await Promise.allSettled([c.setManagerActive(owner,id,member,3,false,1),c.setManagerActive(owner,id,member,3,false,1)]);expect(grants.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 await expect(c.setManagerActive(owner,id,member,3,false,1)).rejects.toThrow("changed");
}));
it("current named session, recovery and workspace guard every read/mutation",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);
 for(const actor of [foreign,{...owner,tokenHash:"invalid"},{...owner,role:"agent" as const}])for(const op of [()=>c.enroll(actor,id),()=>c.read(actor,id),()=>c.list(actor),()=>c.grantManager(actor,id,member,3),()=>c.setScopeActive(actor,id,false,1),()=>c.setManagerActive(actor,id,member,3,false,1),()=>transaction(db,actor.orgId,client=>c.currentAuthority(client,actor,id,member,3))])await expect(op()).rejects.toThrow();
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[owner.subject]);await expect(c.read(owner,id)).rejects.toThrow();
 await db.query("UPDATE ll_members SET active=true WHERE email=$1",[owner.subject]);await db.query("UPDATE ll_sessions SET expires_at=now()-interval '1 second' WHERE hash=$1",[owner.tokenHash]);await expect(c.list(owner)).rejects.toThrow();
 await db.query("UPDATE ll_sessions SET expires_at=now()+interval '1 hour'");vi.stubEnv("LOOPLABS_RECOVERY_EPOCH",randomUUID());await expect(c.read(owner,id)).rejects.toThrow();
}));
it("manager eligibility is explicit scoped capability; member invitations are insufficient",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);expect(await snapshot(db,c,id)).toBeNull();
 for(const m of [owner.subject,foreign.subject,"absent@example.test"])await expect(c.grantManager(owner,id,m,3)).rejects.toThrow();
 await c.grantManager(owner,id,member,3);expect(await transaction(db,"one",client=>c.currentAuthority(client,owner,id,member,4))).toBeNull();
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[member]);expect(await snapshot(db,c,id)).toBeNull();await expect(c.grantManager(owner,id,member,3)).rejects.toThrow();
 expect((await c.setManagerActive(owner,id,member,3,false,2)).version).toBe(2);await expect(c.setManagerActive(owner,id,member,3,true,2)).rejects.toThrow("same-workspace");
 await db.query("UPDATE ll_members SET active=true,org_id='two' WHERE email=$1",[member]);expect(await snapshot(db,c,id)).toBeNull();await expect(c.setManagerActive(owner,id,member,3,true,2)).rejects.toThrow("same-workspace");
}));
it("inactive scope cannot grant/reactivate manager; absent grants and malformed input refuse",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await expect(c.setManagerActive(owner,id,member,3,false,1)).rejects.toThrow("not found");
 await c.setScopeActive(owner,id,false,1);await expect(c.grantManager(owner,id,member,3)).rejects.toThrow("same-workspace");
 for(const v of [0,-1,NaN,2_147_483_648]){await expect(c.setScopeActive(owner,id,false,v)).rejects.toThrow();await expect(c.grantManager(owner,id,member,v)).rejects.toThrow();await expect(c.setManagerActive(owner,id,member,3,false,v)).rejects.toThrow();}
 for(const bad of ["bad",null])await expect(c.read(owner,bad as string)).rejects.toThrow("scope ID");
 expect(await transaction(db,"one",client=>c.currentAuthority(client,owner,id,"bad",3))).toBeNull();expect(await transaction(db,"one",client=>c.currentAuthority(client,owner,id,owner.subject,3))).toBeNull();
 await expect(c.setScopeActive(owner,id,"yes" as unknown as boolean,1)).rejects.toThrow();await expect(c.setManagerActive(owner,id,owner.subject,3,false,1)).rejects.toThrow();
}));
it("SQL immutable, cross-workspace and exact legacy record constraints hold",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await c.grantManager(owner,id,member,3);
 for(const sql of ["UPDATE ll_connector_scopes SET email_binding_id=repeat('c',64)","DELETE FROM ll_connector_scopes","UPDATE ll_quote_manager_grants SET capability='other'","UPDATE ll_quote_manager_grants SET version=version+1","DELETE FROM ll_quote_manager_grants","TRUNCATE ll_quote_manager_grants"])await expect(db.query(sql)).rejects.toThrow();
 await expect(db.query("INSERT INTO ll_quote_manager_grants(org_id,scope_id,member,policy_version,capability,created_by) VALUES('one',$1,$2,4,'quote.discount.approve',$3)",[id,foreign.subject,owner.subject])).rejects.toThrow("same-workspace");
 await expect(db.query("INSERT INTO ll_quote_manager_grants(org_id,scope_id,member,policy_version,capability,created_by) VALUES('one',$1,$2,4,'quote.discount.approve',$3)",[id,member,foreign.subject])).rejects.toThrow("same-workspace");
 for(const contact of [null,"1001","abc"])await expect(db.query("INSERT INTO ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,created_by) VALUES('one',$1,$2,'buyer@example.test',repeat('c',64),'private-record-twin-2',$3)",[randomUUID(),contact,owner.subject])).rejects.toThrow();
 const legacy=randomUUID();await db.query("INSERT INTO ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,created_by) VALUES('one',$1,'2001','buyer@example.test',repeat('c',64),'private-record-twin-2',$2)",[legacy,owner.subject]);
 await expect(db.query("UPDATE ll_connector_scopes SET contact_id='2002' WHERE id=$1",[legacy])).rejects.toThrow();
 await expect(c.read(owner,legacy)).rejects.toThrow("not found");
}));
it("legacy record controller cannot enroll, read grant or mutate quote through matching binding",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);
 const provider:ConnectorProvider={workspaceId:"one",bindingId:configured.quoteBinding,contactId:"2001",recordScope:{version:"record-scope-1",workspaceId:"one",contactId:"2001",recipient:configured.recipient},source:async()=>"v1",write:async()=>({outcome:"unknown",detail:"unused"}),inspect:async()=>({outcome:"unknown",detail:"unused"})};
 const legacy=new ScopeControl(db,provider);
 expect(await transaction(db,"one",client=>scopeEnrollment(client,"one",provider))).toBeNull();expect(await transaction(db,"one",client=>currentScopeGrant(client,"one","agent",provider))).toBeNull();
 await expect(legacy.enroll(owner,id)).rejects.toThrow("another scope");await expect(legacy.grant(owner,id,"agent")).rejects.toThrow("enrollment");await expect(legacy.setActive(owner,id,false)).rejects.toThrow("not found");await expect(legacy.setActive(owner,id,false,"agent")).rejects.toThrow("not found");
 expect((await c.read(owner,id)).version).toBe(1);
}));
it("legacy enrollment and grant revocation/reactivation still work after additive migration",async()=>fixture(async(db)=>{
 const provider:ConnectorProvider={workspaceId:"one",bindingId:"c".repeat(64),contactId:"2001",recordScope:{version:"record-scope-1",workspaceId:"one",contactId:"2001",recipient:configured.recipient},source:async()=>"v1",write:async()=>({outcome:"unknown",detail:"unused"}),inspect:async()=>({outcome:"unknown",detail:"unused"})};
 const legacy=new ScopeControl(db,provider),id=randomUUID();await legacy.enroll(owner,id);
 await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('one','crm',ARRAY['twin.crm'],5)");
 await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES('one','crm','CRM',$1,'crm_agent','crm_twin')",[owner.subject]);
 await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('agent-key','one','crm','agent')");
 await legacy.grant(owner,id,"crm");await legacy.setActive(owner,id,false,"crm");await legacy.setActive(owner,id,true,"crm");
 expect((await legacy.grant(owner,id,"crm")).version).toBe(3);
 await legacy.setActive(owner,id,false);await legacy.setActive(owner,id,true);
 expect((await legacy.enroll(owner,id)).version).toBe(3);
 const misconfigured=new ScopeControl(db,{...provider,recordScope:{...provider.recordScope!,contactId:"2002"}});await expect(misconfigured.setActive(owner,id,false)).rejects.toThrow("not found");
}));
it("server descriptor snapshots survive caller mutation and fresh service restart",async()=>fixture(async(db,_c,id,schema)=>{
 const mutable=structuredClone(configured),c=new QuoteAuthorityControl(db,mutable);mutable.emailBinding="c".repeat(64);await c.enroll(owner,id);await c.grantManager(owner,id,member,3);const old=await snapshot(db,c,id);
 const restarted=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`});try{expect(await snapshot(restarted,new QuoteAuthorityControl(restarted,configured),id)).toEqual(old);}finally{await restarted.end();}
}));
it.each([null,{}, {...configured,extra:true},{...configured,emailBinding:configured.quoteBinding},{...configured,recipient:"live@example.com"},{...configured,quoteId:"../q"},{...configured,contract:"other"}])("malformed configured destination refuses %j",value=>{
 expect(()=>new QuoteAuthorityControl({} as Pool,value as QuoteDestination)).toThrow("server-owned");
});

it("member reactivation and workspace return cannot resurrect saved manager capability",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await c.grantManager(owner,id,member,3);const old=await snapshot(db,c,id);
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[member]);
 await db.query("UPDATE ll_members SET active=true WHERE email=$1",[member]);
 expect(await snapshot(db,c,id)).toBeNull();expect((await c.grantManager(owner,id,member,3)).active).toBe(false);
 await c.setManagerActive(owner,id,member,3,true,2);expect(sameQuoteAuthority(old,await snapshot(db,c,id))).toBe(false);
 await db.query("UPDATE ll_members SET org_id='two' WHERE email=$1",[member]);
 await db.query("UPDATE ll_members SET org_id='one' WHERE email=$1",[member]);
 expect(await snapshot(db,c,id)).toBeNull();expect((await c.grantManager(owner,id,member,3)).version).toBe(4);
}));

it("direct SQL reactivation requires current member workspace/activity and scope",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await c.grantManager(owner,id,member,3);
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[member]);
 const activate=()=>db.query("UPDATE ll_quote_manager_grants SET active=true,version=version+1 WHERE org_id='one' AND scope_id=$1",[id]);
 await expect(activate()).rejects.toThrow("same-workspace");
 await db.query("UPDATE ll_members SET active=true,org_id='two' WHERE email=$1",[member]);await expect(activate()).rejects.toThrow("same-workspace");
 await db.query("UPDATE ll_members SET org_id='one' WHERE email=$1",[member]);await c.setScopeActive(owner,id,false,1);await expect(activate()).rejects.toThrow("same-workspace");
 expect((await db.query("SELECT active,version FROM ll_quote_manager_grants")).rows).toEqual([{active:false,version:2}]);
}));
it("membership mutation waits for workspace-authority reader and then revokes only its active grants once",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await c.grantManager(owner,id,member,3);
 await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('second@example.test','one','Second','fixture')");await c.grantManager(owner,id,"second@example.test",3);
 const reader=await db.connect(),mutator=await db.connect();let update:Promise<unknown>|undefined;
 try{
  await reader.query("BEGIN");await reader.query("SELECT id FROM ll_orgs WHERE id='one' FOR UPDATE");
  expect(await c.currentAuthority(reader,owner,id,member,3)).not.toBeNull();
  const pid=(await mutator.query("SELECT pg_backend_pid() pid")).rows[0].pid;
  update=mutator.query("UPDATE ll_members SET active=false WHERE email=$1",[member]);
  let waiting=false;for(let i=0;i<100;i++){
   waiting=(await reader.query("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting===true;
   if(waiting)break;await new Promise(resolve=>setTimeout(resolve,5));
  }
  expect(waiting).toBe(true);await reader.query("COMMIT");await update;update=undefined;
  expect(await snapshot(db,c,id)).toBeNull();
  await db.query("UPDATE ll_members SET active=false WHERE email=$1",[member]);await db.query("UPDATE ll_members SET active=true WHERE email=$1",[member]);
  expect((await db.query("SELECT member,active,version FROM ll_quote_manager_grants ORDER BY member")).rows).toEqual([{member,active:false,version:2},{member:"second@example.test",active:true,version:1}]);
 }finally{await reader.query("ROLLBACK");await update;reader.release();mutator.release();}
}));
it("concurrent manager enrollment and direct revocation never leave revived authority",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);
 const outcomes=await Promise.allSettled([c.grantManager(owner,id,member,3),db.query("UPDATE ll_members SET active=false WHERE email=$1",[member])]);
 expect(outcomes[1].status).toBe("fulfilled");expect(await snapshot(db,c,id)).toBeNull();
 await db.query("UPDATE ll_members SET active=true WHERE email=$1",[member]);
 // If granting won serialization the mutation revoked it; if mutation won no grant exists.
 expect(await snapshot(db,c,id)).toBeNull();
 const grants=(await db.query("SELECT active FROM ll_quote_manager_grants")).rows;expect(grants.every(g=>g.active===false)).toBe(true);
}));

it("restored authority remains contained across external epoch rotation and matching restored metadata",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await c.grantManager(owner,id,member,3);const old=await snapshot(db,c,id);
 const next=randomUUID();vi.stubEnv("LOOPLABS_RECOVERY_EPOCH",next);await expect(snapshot(db,c,id)).rejects.toThrow();
 await db.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='one'",[next]);expect(sameQuoteAuthority(old,await snapshot(db,c,id))).toBe(false);
 vi.stubEnv("LOOPLABS_RECOVERY_EPOCH","");await expect(c.read(owner,id)).rejects.toThrow();
}));

it("two UPDATE lock inversion aborts direct contender and lets workspace-owning service finish",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await c.grantManager(owner,id,member,3);
 const service=await db.connect(),direct=await db.connect(),gate=await db.connect();
 const key=randomBytes(4).readUInt32BE() & 0x7fffffff;let contender:Promise<unknown>|undefined,serviceUpdate:Promise<unknown>|undefined;
 try{
  // Test-only probe holds the direct contender after its grant-row lock but
  // before the production NOWAIT workspace boundary. No application hook exists.
  await db.query(`CREATE FUNCTION ll_test_update_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${key}); RETURN NEW; END $$`);
  await db.query("CREATE TRIGGER ll_000_test_probe BEFORE UPDATE ON ll_quote_manager_grants FOR EACH ROW EXECUTE FUNCTION ll_test_update_probe()");
  await gate.query("SELECT pg_advisory_lock($1)",[key]);
  await service.query("BEGIN");await service.query("SELECT id FROM ll_orgs WHERE id='one' FOR UPDATE");
  const directPid=(await direct.query("SELECT pg_backend_pid() pid")).rows[0].pid,servicePid=(await service.query("SELECT pg_backend_pid() pid")).rows[0].pid;
  contender=direct.query("UPDATE ll_quote_manager_grants SET active=false,version=version+1 WHERE scope_id=$1",[id]).then(()=>({ok:true}),error=>({ok:false,code:error.code}));
  const waitForLock=async(pid:number)=>{for(let i=0;i<100;i++){if((await gate.query("SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting)return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error("Expected actual row/lock contention");};
  await waitForLock(directPid); // direct holds grant; service holds workspace
  serviceUpdate=service.query("UPDATE ll_quote_manager_grants SET active=false,version=version+1 WHERE scope_id=$1",[id]);await waitForLock(servicePid);
  const started=Date.now();await gate.query("SELECT pg_advisory_unlock($1)",[key]);
  expect(await contender).toEqual({ok:false,code:"55P03"});contender=undefined;await serviceUpdate;serviceUpdate=undefined;
  expect(Date.now()-started).toBeLessThan(1500);
  // Only the service revocation committed; a failed direct revocation is not success.
  await service.query("COMMIT");expect(await snapshot(db,c,id)).toBeNull();expect((await c.grantManager(owner,id,member,3)).version).toBe(2);
 }finally{await gate.query("SELECT pg_advisory_unlock($1)",[key]);await service.query("ROLLBACK");await contender;await serviceUpdate;service.release();direct.release();gate.release();}
}));
it("direct quote scope UPDATE cannot commit across held workspace authority snapshot",async()=>fixture(async(db,c,id)=>{
 await c.enroll(owner,id);await c.grantManager(owner,id,member,3);
 const reader=await db.connect(),direct=await db.connect();
 try{
  await reader.query("BEGIN");await reader.query("SELECT id FROM ll_orgs WHERE id='one' FOR UPDATE");const before=await c.currentAuthority(reader,owner,id,member,3);
  await expect(direct.query("UPDATE ll_connector_scopes SET active=false,version=version+1 WHERE id=$1",[id])).rejects.toMatchObject({code:"55P03"});
  expect(await c.currentAuthority(reader,owner,id,member,3)).toEqual(before);await reader.query("COMMIT");
  await direct.query("UPDATE ll_connector_scopes SET active=false,version=version+1 WHERE id=$1",[id]);expect(await snapshot(db,c,id)).toBeNull();
 }finally{await reader.query("ROLLBACK");reader.release();direct.release();}
}));

it("ordinary invited member domains can manage quote authority without widening twin destinations",async()=>fixture(async(db,c,id)=>{
 const realOwner:Actor={...owner,subject:"owner@company.example",tokenHash:"real-owner-session"},realManager="manager@company.example";
 await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@company.example','one','Owner','fixture'),('manager@company.example','one','Manager','fixture'),('foreign@company.example','two','Foreign','fixture')");
 await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('real-owner-session','owner@company.example',now()+interval '1 hour')");
 await c.enroll(realOwner,id);expect((await c.grantManager(realOwner,id,realManager,3)).member).toBe(realManager);
 expect(await transaction(db,"one",client=>c.currentAuthority(client,realOwner,id,realManager,3))).toMatchObject({member:realManager,recipient:configured.recipient,sender:configured.sender});
 for(const m of [realOwner.subject,"foreign@company.example","Bad@company.example","manager@company.example ","not-an-email"])
  await expect(c.grantManager(realOwner,id,m,3)).rejects.toThrow();
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[realManager]);await expect(c.grantManager(realOwner,id,realManager,3)).rejects.toThrow("same-workspace");
 expect(await transaction(db,"one",client=>c.currentAuthority(client,realOwner,id,realManager,3))).toBeNull();
 for(const change of [{sender:"sales@company.example"},{recipient:"buyer@company.example"}])expect(()=>new QuoteAuthorityControl(db,{...configured,...change})).toThrow("server-owned");
}));
