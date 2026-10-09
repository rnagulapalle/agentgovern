import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { recoveryFence, quarantineRestore } from "./recovery";
import { authenticate, tokenHash, authorize } from "./service";
import { transaction } from "./database";
import { NextRequest } from "next/server";
import { memberSession, memberAuthority, WORKSPACE_COOKIE } from "../workspace/identity";
vi.mock("./database",async original=>({...await original<typeof import("./database")>(),database:()=>db}));
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
it("quarantines one restored workspace atomically, revokes stale authority and preserves IDs, budgets and peer tenant", async () => {
  const id = randomUUID(), next = randomUUID(), hash = "a".repeat(64);
  await db.query("INSERT INTO ll_workflow_runs(org_id,id,created_by) VALUES('one',$1,'owner')", [id]);
  await db.query("INSERT INTO ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by,approved_by,approval_until,lease_token,lease_until) VALUES('one',$1,'agent','crm','{}','payload',1,'ready','Approved','owner','peer',now()+interval '1 hour',$2,now()+interval '1 hour')", [id, randomUUID()]);
  await db.query("INSERT INTO ll_actions(org_id,id,agent_id,discount,expected_version,policy_version,payload_hash,state,reason,approved_by) VALUES('one',$1,'agent',5,1,1,'payload','recovered','Historical','peer')", [id]);
  await db.query("INSERT INTO ll_refund_actions(org_id,id,agent_id,payment_id,amount,currency,policy_version,payload_hash,state,reason,approved_by) VALUES('one',$1,'agent','payment',100,'usd',1,'payload','executing','Pending','peer')", [id]);
  await db.query("UPDATE ll_agents SET reserved=7 WHERE org_id='one'");
  await expect(quarantineRestore(db, "one", epoch, hash)).rejects.toThrow("different");
  await expect(quarantineRestore(db, "one", next, "bad")).rejects.toThrow("Valid workspace");
  await expect(quarantineRestore(db, "missing", next, hash)).rejects.toThrow("not found");
  const delayedActor = await authenticate(db, key);
  const result = await quarantineRestore(db, "one", next, hash);
  expect(result).toMatchObject({ tokens: 1, sessions: 1, members: 1, agents: 1, runs: 1, ll_connector_actions: 1, ll_actions: 1, ll_refund_actions: 1 });
  expect(await quarantineRestore(db, "one", next, hash)).toEqual(result);
  await expect(quarantineRestore(db, "one", next, "b".repeat(64))).rejects.toThrow("another archive");
  expect((await db.query("SELECT state,approved_by,approval_until,lease_token FROM ll_connector_actions WHERE id=$1", [id])).rows[0]).toEqual({ state: "uncertain", approved_by: null, approval_until: null, lease_token: null });
  expect((await db.query("SELECT state FROM ll_refund_actions")).rows[0].state).toBe("uncertain");
  expect((await db.query("SELECT state FROM ll_actions")).rows[0].state).toBe("recovered");
  expect((await db.query("SELECT active,reserved FROM ll_agents WHERE org_id='one'")).rows[0]).toEqual({ active: false, reserved: 7 });
  expect((await db.query("SELECT active,version FROM ll_connector_policies WHERE org_id='two'")).rows[0]).toEqual({ active: true, version: 1 });
  expect((await db.query("SELECT count(*)::int AS n FROM ll_workspace_recovery_events")).rows[0].n).toBe(1);
  await expect(db.query("DELETE FROM ll_workspace_recovery_events")).rejects.toThrow("cannot be updated or deleted");
  await expect(authenticate(db, key)).rejects.toThrow("credentials");
  await recoveryFence(db, "one", next);
  await expect(transaction(db, "one", c => authorize(c, delayedActor, ["operator"]))).rejects.toThrow("identity");
});

it("does not allow a runtime database principal to rewrite the recovery fence or quarantine records", async () => {
  const role = `ll_recovery_reader_${randomBytes(6).toString("hex")}`;
  await admin.query(`CREATE ROLE ${role} NOLOGIN`);
  const restricted = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema} -c role=${role}` });
  try {
    await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await db.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
    await db.query(`GRANT UPDATE ON ll_orgs TO ${role}`); // permits the workspace lock, not authority mutation
    await recoveryFence(restricted, "one", epoch);
    await expect(restricted.query("UPDATE ll_workspace_recovery SET epoch=$1", [randomUUID()])).rejects.toThrow("permission denied");
    await expect(restricted.query("INSERT INTO ll_workspace_recovery_events(org_id,epoch,backup_hash,counts) VALUES('one',$1,$2,'{}')", [randomUUID(), "a".repeat(64)])).rejects.toThrow("permission denied");
    await expect(quarantineRestore(restricted, "one", randomUUID(), "a".repeat(64))).rejects.toThrow("permission denied");
    await recoveryFence(db, "one", epoch);
    expect((await db.query("SELECT active FROM ll_tokens WHERE org_id='one'")).rows[0].active).toBe(true);
  } finally { await restricted.end(); await admin.query(`DROP OWNED BY ${role}`); await admin.query(`DROP ROLE ${role}`); }
});


it("quarantines restored scope enrollments and agent grants without reviving their old versions",async()=>{
 const id=randomUUID();await db.query("INSERT INTO ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,created_by) VALUES('one',$1,'2001','alice@example.test',repeat('a',64),'private-record-twin-2','owner')",[id]);
 await db.query("INSERT INTO ll_connector_scope_grants(org_id,scope_id,agent_id,created_by) VALUES('one',$1,'agent','owner')",[id]);
 const counts=await quarantineRestore(db,"one",randomUUID(),"a".repeat(64));expect(counts.ll_connector_scopes).toBe(1);expect(counts.ll_connector_scope_grants).toBe(1);
 expect((await db.query("SELECT active,version FROM ll_connector_scopes")).rows[0]).toEqual({active:false,version:2});expect((await db.query("SELECT active,version FROM ll_connector_scope_grants")).rows[0]).toEqual({active:false,version:2});
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


it("restored member sessions and delayed member authority obey the external fence, including the actual profile route",async()=>{
 const previousStage=process.env.LOOPLABS_TEMPORAL_WORKSPACE,previousEpoch=process.env.LOOPLABS_RECOVERY_EPOCH;
 const session=randomBytes(32).toString("base64url");
 await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'owner',now()+interval '1 hour')",[tokenHash(session)]);
 const request=()=>new NextRequest("https://looplabs.run/api/workspace/session",{headers:{cookie:`${WORKSPACE_COOKIE}=${session}`}});
 try{
  process.env.LOOPLABS_TEMPORAL_WORKSPACE="staging";process.env.LOOPLABS_RECOVERY_EPOCH=epoch;
  const actor=await memberSession(db,session);expect(actor).not.toBeNull();
  expect((await workspaceSession(request())).status).toBe(200);
  const next=randomUUID();process.env.LOOPLABS_RECOVERY_EPOCH=next;
  expect((await workspaceSession(request())).status).toBe(503);
  await expect(memberSession(db,session)).rejects.toThrow("contained");
  await expect(transaction(db,"one",c=>memberAuthority(c,actor!))).rejects.toThrow("contained");
  delete process.env.LOOPLABS_RECOVERY_EPOCH;
  expect((await workspaceSession(request())).status).toBe(503);
  delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;
  expect((await workspaceSession(request())).status).toBe(200);
  process.env.LOOPLABS_RECOVERY_EPOCH=next;
  await quarantineRestore(db,"one",next,"c".repeat(64));
  expect((await workspaceSession(request())).status).toBe(401);
  expect(await memberSession(db,session)).toBeNull();
 }finally{
  if(previousStage===undefined)delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;else process.env.LOOPLABS_TEMPORAL_WORKSPACE=previousStage;
  if(previousEpoch===undefined)delete process.env.LOOPLABS_RECOVERY_EPOCH;else process.env.LOOPLABS_RECOVERY_EPOCH=previousEpoch;
 }
});
