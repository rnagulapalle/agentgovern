import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { recoveryFence, quarantineRestore } from "./recovery";
import { authenticate, tokenHash, authorize } from "./service";
import { transaction } from "./database";
import { NextRequest } from "next/server";
import { memberSession, memberAuthority, WORKSPACE_COOKIE } from "../workspace/identity";
import { createInstalledTenantFixture } from "../workspace/installed-tenant-fixture";
import type { TenantContext } from "../workspace/tenant-context";
let installedContext: TenantContext | undefined;
vi.mock("../workspace/tenant-context",async original=>({...await original<typeof import("../workspace/tenant-context")>(),tenantContext:()=>{if(!installedContext)throw Error("Installed context required");return installedContext;}}));
import { GET as workspaceSession } from "@/app/api/workspace/session/route";
const schema = `recovery_${randomBytes(8).toString("hex")}`;
let db: Pool, admin: Pool;
const key = randomBytes(32).toString("base64url"), epoch = randomUUID();
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL) throw Error("Dedicated PostgreSQL required.");
  admin = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/refunds/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/durable/proposal-schema.sql", "lib/durable/recovery-schema.sql", "lib/connectors/scope-schema.sql"]) await db.query(await readFile(file, "utf8"));
});
beforeEach(async () => {
  await db.query("TRUNCATE ll_orgs CASCADE");
  await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
  await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','owner','operator'),('peer','two','peer','worker')", [tokenHash(key)]);
  await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner','one','Owner','unused'),('peer','two','Peer','unused')");
  await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('session','owner',now()+interval '1 hour'),('other','peer',now()+interval '1 hour')");
  await db.query("INSERT INTO ll_agents(org_id,id) VALUES('one','agent'),('two','peer')");
  await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('one',$1),('two',$1)", [epoch]);
  await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('one','crm'),('two','crm')");
});
afterAll(async () => { await db?.end(); await admin?.query(`DROP SCHEMA ${schema} CASCADE`); await admin?.end(); });
it("fails closed for malformed, absent, missing and mismatched configured fences while preserving explicit compatibility", async () => {
  await recoveryFence(db, "one", epoch);
  await expect(recoveryFence(db, "one", randomUUID())).rejects.toThrow("contained");
  await expect(recoveryFence(db, "missing", epoch)).rejects.toThrow("contained");
  for (const bad of ["", "true", "not-an-epoch"]) await expect(recoveryFence(db, "one", bad)).rejects.toThrow("configuration");
  await db.query("ALTER TABLE ll_workspace_recovery RENAME TO hidden_recovery");
  try {
    await recoveryFence(db, "one", undefined);
    await expect(recoveryFence(db, "one", epoch)).rejects.toThrow("contained");
  } finally { await db.query("ALTER TABLE hidden_recovery RENAME TO ll_workspace_recovery"); }
});
it("checks external recovery epoch at authentication and again before delayed authority", async () => {
  const previous = process.env.LOOPLABS_RECOVERY_EPOCH;
  try {
    process.env.LOOPLABS_RECOVERY_EPOCH = epoch;
    const actor = await authenticate(db, key);
    await transaction(db, "one", c => authorize(c, actor, ["operator"]));
    process.env.LOOPLABS_RECOVERY_EPOCH = randomUUID();
    await expect(authenticate(db, key)).rejects.toThrow("contained");
    await expect(transaction(db, "one", c => authorize(c, actor, ["operator"]))).rejects.toThrow("contained");
    const session = randomBytes(32).toString("base64url");
    await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'owner',now()+interval '1 hour')", [tokenHash(session)]);
    await expect(authenticate(db, session)).rejects.toThrow("contained");
  } finally { if (previous === undefined) delete process.env.LOOPLABS_RECOVERY_EPOCH; else process.env.LOOPLABS_RECOVERY_EPOCH = previous; }
});
async function installedRecovery() {
 const session=randomBytes(32).toString("base64url"),agentKey=randomBytes(32).toString("base64url");
 const fixture=await createInstalledTenantFixture({tenants:["one","two"],salesOrg:"one",seed:async owner=>{
  await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@example.test','one','Owner','fixture'),('reviewer@example.test','one','Reviewer','fixture'),('peer@example.test','two','Peer','fixture')");
  await owner.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'owner@example.test',now()+interval '1 hour'),('other','peer@example.test',now()+interval '1 hour')",[tokenHash(session)]);
  await owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','agent','agent'),('peer','two','peer-agent','worker')",[tokenHash(agentKey)]);
  await owner.query("INSERT INTO ll_agents(org_id,id) VALUES('one','agent'),('two','peer')");
  await owner.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('one','crm'),('two','crm')");
 }});
 return {...fixture,session,agentKey};
}
it("quarantines one installed restored workspace atomically, revokes stale authority and preserves IDs, budgets and peer tenant", async () => {
 const fixture=await installedRecovery();
 try {
  const owner=fixture.owner,web=fixture.web("one"),id=randomUUID(),next=randomUUID(),hash="a".repeat(64);
  const installedEpoch=(await owner.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='one'")).rows[0].epoch;
  await owner.query("INSERT INTO ll_workflow_runs(org_id,id,created_by) VALUES('one',$1,'owner@example.test')",[id]);
  await owner.query("INSERT INTO ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by) VALUES('one',$1,'agent','crm','{}','payload',1,'held','Pending','owner@example.test')",[id]);
  // Only the offline owner injects restored archive state. Approval is a
  // separate update so current server membership snapshots are preserved.
  await owner.query("UPDATE ll_connector_actions SET state='ready',approved_by='reviewer@example.test',approval_until=now()+interval '1 hour' WHERE id=$1",[id]);
  await owner.query("UPDATE ll_connector_actions SET lease_token=$2,lease_until=now()+interval '1 hour' WHERE id=$1",[id,randomUUID()]);
  await owner.query("INSERT INTO ll_actions(org_id,id,agent_id,discount,expected_version,policy_version,payload_hash,state,reason,approved_by) VALUES('one',$1,'agent',5,1,1,'payload','recovered','Historical','reviewer@example.test')",[id]);
  await owner.query("INSERT INTO ll_refund_actions(org_id,id,agent_id,payment_id,amount,currency,policy_version,payload_hash,state,reason,approved_by) VALUES('one',$1,'agent','payment',100,'usd',1,'payload','executing','Pending','reviewer@example.test')",[id]);
  await owner.query("UPDATE ll_agents SET reserved=7 WHERE org_id='one'");
  const before=(await owner.query("SELECT payload,payload_hash,membership_proposal,membership_approval FROM ll_connector_actions WHERE id=$1",[id])).rows[0];
  await expect(quarantineRestore(owner,"one",installedEpoch,hash)).rejects.toThrow("different");
  await expect(quarantineRestore(owner,"one",next,"bad")).rejects.toThrow("Valid workspace");
  await expect(quarantineRestore(owner,"missing",next,hash)).rejects.toThrow("not found");
  const delayedActor=(await fixture.context.authenticated(fixture.session)).actor;
  const result=await quarantineRestore(owner,"one",next,hash);
  expect(result).toMatchObject({tokens:1,sessions:1,members:2,agents:1,runs:1,ll_connector_actions:1,ll_actions:1,ll_refund_actions:1});
  expect(await quarantineRestore(owner,"one",next,hash)).toEqual(result);
  await expect(quarantineRestore(owner,"one",next,"b".repeat(64))).rejects.toThrow("another archive");
  expect((await owner.query("SELECT state,approved_by,approval_until,lease_token FROM ll_connector_actions WHERE id=$1",[id])).rows[0]).toEqual({state:"uncertain",approved_by:null,approval_until:null,lease_token:null});
  expect((await owner.query("SELECT payload,payload_hash,membership_proposal,membership_approval FROM ll_connector_actions WHERE id=$1",[id])).rows[0]).toEqual(before);
  expect((await owner.query("SELECT state FROM ll_refund_actions")).rows[0].state).toBe("uncertain");
  expect((await owner.query("SELECT state FROM ll_actions")).rows[0].state).toBe("recovered");
  expect((await owner.query("SELECT active,reserved FROM ll_agents WHERE org_id='one'")).rows[0]).toEqual({active:false,reserved:7});
  expect((await owner.query("SELECT active,version FROM ll_connector_policies WHERE org_id='two'")).rows[0]).toEqual({active:true,version:1});
  expect((await owner.query("SELECT count(*)::int AS n FROM ll_workspace_recovery_events")).rows[0].n).toBe(1);
  await expect(owner.query("DELETE FROM ll_workspace_recovery_events")).rejects.toThrow("cannot be updated or deleted");
  await expect(fixture.context.authenticated(fixture.agentKey)).rejects.toMatchObject({status:401});
  await expect(fixture.context.authenticated(fixture.session)).rejects.toMatchObject({status:401});
  await recoveryFence(owner,"one",next);
  expect(await transaction(web,"one",c=>memberAuthority(c,delayedActor))).toBe(false);
  await expect(transaction(web,"one",c=>authorize(c,delayedActor,["operator"]))).rejects.toMatchObject({status:503,message:"Scoped database authority changed."});
 }finally{await fixture.close();}
});
it("does not allow actual installed runtime principals to rewrite the recovery fence or quarantine records",async()=>{
 const fixture=await installedRecovery();
 try {
  const current=(await fixture.owner.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='one'")).rows[0].epoch;
  for(const restricted of [fixture.web("one"),await fixture.workload("one","worker"),await fixture.workload("one","scheduler")]){
   await recoveryFence(restricted,"one",current);
   await expect(restricted.query("UPDATE ll_workspace_recovery SET epoch=$1",[randomUUID()])).rejects.toMatchObject({code:"42501"});
   await expect(restricted.query("INSERT INTO ll_workspace_recovery_events(org_id,epoch,backup_hash,counts) VALUES('one',$1,$2,'{}')",[randomUUID(),"a".repeat(64)])).rejects.toMatchObject({code:"42501"});
   await expect(quarantineRestore(restricted,"one",randomUUID(),"a".repeat(64))).rejects.toMatchObject({status:403});
  }
  await recoveryFence(fixture.owner,"one",current);
  expect((await fixture.owner.query("SELECT active FROM ll_tokens WHERE org_id='one'")).rows[0].active).toBe(true);
 }finally{await fixture.close();}
});
it("quarantines installed scope enrollments and agent grants without reviving their old versions",async()=>{
 const fixture=await installedRecovery();
 try{
  const owner=fixture.owner,id=randomUUID();
  await owner.query("INSERT INTO ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,created_by) VALUES('one',$1,'2001','alice@example.test',repeat('a',64),'private-record-twin-2','owner@example.test')",[id]);
  await owner.query("INSERT INTO ll_connector_scope_grants(org_id,scope_id,agent_id,created_by) VALUES('one',$1,'agent','owner@example.test')",[id]);
  const counts=await quarantineRestore(owner,"one",randomUUID(),"a".repeat(64));expect(counts.ll_connector_scopes).toBe(1);expect(counts.ll_connector_scope_grants).toBe(1);
  expect((await owner.query("SELECT active,version FROM ll_connector_scopes")).rows[0]).toEqual({active:false,version:2});
  expect((await owner.query("SELECT active,version FROM ll_connector_scope_grants")).rows[0]).toEqual({active:false,version:2});
 }finally{await fixture.close();}
});

it("staging cannot silently disable its recovery fence by omitting the external epoch",async()=>{
 const previousStage=process.env.LOOPLABS_TEMPORAL_WORKSPACE,previousEpoch=process.env.LOOPLABS_RECOVERY_EPOCH;
 try{
  process.env.LOOPLABS_TEMPORAL_WORKSPACE="staging";delete process.env.LOOPLABS_RECOVERY_EPOCH;
  await expect(recoveryFence(db,"one")).rejects.toThrow("configuration");
  await expect(authenticate(db,key)).rejects.toThrow("configuration");
  process.env.LOOPLABS_RECOVERY_EPOCH=epoch;
  expect((await authenticate(db,key)).orgId).toBe("one");
  delete process.env.LOOPLABS_RECOVERY_EPOCH;delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;
  expect((await authenticate(db,key)).orgId).toBe("one");
 }finally{
  if(previousStage===undefined)delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;else process.env.LOOPLABS_TEMPORAL_WORKSPACE=previousStage;
  if(previousEpoch===undefined)delete process.env.LOOPLABS_RECOVERY_EPOCH;else process.env.LOOPLABS_RECOVERY_EPOCH=previousEpoch;
 }
});


it("legacy member sessions and delayed member authority obey the explicit external fence compatibility contract",async()=>{
 const previousStage=process.env.LOOPLABS_TEMPORAL_WORKSPACE,previousEpoch=process.env.LOOPLABS_RECOVERY_EPOCH;
 const session=randomBytes(32).toString("base64url");
 await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'owner',now()+interval '1 hour')",[tokenHash(session)]);

 try{
  process.env.LOOPLABS_TEMPORAL_WORKSPACE="staging";process.env.LOOPLABS_RECOVERY_EPOCH=epoch;
  const actor=await memberSession(db,session);expect(actor).not.toBeNull();
  expect(await memberSession(db,session)).not.toBeNull();
  const next=randomUUID();process.env.LOOPLABS_RECOVERY_EPOCH=next;
  await expect(memberSession(db,session)).rejects.toThrow("contained");
  await expect(transaction(db,"one",c=>memberAuthority(c,actor!))).rejects.toThrow("contained");
  delete process.env.LOOPLABS_RECOVERY_EPOCH;
  await expect(memberSession(db,session)).rejects.toThrow("configuration");
  delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;
  expect(await memberSession(db,session)).not.toBeNull();

 }finally{
  if(previousStage===undefined)delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;else process.env.LOOPLABS_TEMPORAL_WORKSPACE=previousStage;
  if(previousEpoch===undefined)delete process.env.LOOPLABS_RECOVERY_EPOCH;else process.env.LOOPLABS_RECOVERY_EPOCH=previousEpoch;
 }
});

it("actual installed profile route cannot disable its bound epoch and rejects restored sessions and delayed authority",async()=>{
 const fixture=await installedRecovery(),previousStage=process.env.LOOPLABS_TEMPORAL_WORKSPACE,previousEpoch=process.env.LOOPLABS_RECOVERY_EPOCH;
 installedContext=fixture.context;
 const request=()=>new NextRequest("https://looplabs.run/api/workspace/session",{headers:{cookie:`${WORKSPACE_COOKIE}=${fixture.session}`}});
 try{
  const web=fixture.web("one"),actor=(await fixture.context.member(fixture.session)).actor;
  const current=(await fixture.owner.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='one'")).rows[0].epoch;
  process.env.LOOPLABS_TEMPORAL_WORKSPACE="staging";delete process.env.LOOPLABS_RECOVERY_EPOCH;
  expect((await workspaceSession(request())).status).toBe(200); // installed epoch exists independently of environment
  delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;
  await fixture.owner.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='one'",[randomUUID()]);
  expect((await workspaceSession(request())).status).toBe(503);
  await expect(memberSession(web,fixture.session)).rejects.toMatchObject({status:503});
  await expect(transaction(web,"one",c=>memberAuthority(c,actor))).rejects.toMatchObject({status:503});
  await fixture.owner.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='one'",[current]);
  expect((await workspaceSession(request())).status).toBe(200);
  await quarantineRestore(fixture.owner,"one",randomUUID(),"c".repeat(64));
  expect((await workspaceSession(request())).status).toBe(401);
  expect(await memberSession(web,fixture.session)).toBeNull();
  expect((await fixture.owner.query("SELECT active FROM ll_members WHERE email='peer@example.test'")).rows[0].active).toBe(true);
 }finally{
  installedContext=undefined;
  if(previousStage===undefined)delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;else process.env.LOOPLABS_TEMPORAL_WORKSPACE=previousStage;
  if(previousEpoch===undefined)delete process.env.LOOPLABS_RECOVERY_EPOCH;else process.env.LOOPLABS_RECOVERY_EPOCH=previousEpoch;
  await fixture.close();
 }
});
