import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const command = promisify(execFile);
import { beforeAll, afterAll, it, expect } from "vitest";
import { quarantineRestore } from "./recovery";
const schema = `proposals_${randomBytes(8).toString("hex")}`;
const role = `ll_proposals_${randomBytes(6).toString("hex")}`;
let admin: Pool, db: Pool, runtime: Pool;
const id = randomUUID(), run = randomUUID(), epoch = randomUUID();
async function setup(noOwner = false) {
  const url = new URL(process.env.LOOPLABS_TEST_DATABASE_URL!);
  url.searchParams.set("options",`-c search_path=${schema}`);
  const env: NodeJS.ProcessEnv = {...process.env,LOOPLABS_MIGRATION_DATABASE_URL:url.href};
  if (noOwner) delete env.LOOPLABS_MIGRATION_DATABASE_URL;
  return command(process.execPath,["--import","tsx","scripts/proposal-boundary-setup.ts"],{env});
}
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL) throw Error("Dedicated PostgreSQL required.");
  admin = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  for (const file of ["lib/durable/schema.sql","lib/workspace/schema.sql","lib/refunds/schema.sql","lib/connectors/schema.sql","lib/workflows/schema.sql","lib/enquiries/schema.sql","lib/enquiries/managed-schema.sql","lib/enquiries/temporal-schema.sql","lib/durable/recovery-schema.sql"])
    await db.query(await readFile(file,"utf8"));
  await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
  await db.query("INSERT INTO ll_agents(org_id,id) VALUES('one','agent'),('one','another'),('two','agent')");
  await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('one','crm'),('one','email')");
  await db.query("INSERT INTO ll_actions(org_id,id,agent_id,discount,expected_version,policy_version,payload_hash,state,reason) VALUES('one',$1,'agent',20,1,1,'hash','held','Awaiting approval')",[id]);
  await db.query("INSERT INTO ll_refund_actions(org_id,id,agent_id,payment_id,amount,currency,policy_version,payload_hash,state,reason) VALUES('one',$1,'agent','payment',100,'usd',1,'hash','held','Awaiting approval')",[id]);
  await db.query("INSERT INTO ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by) VALUES('one',$1,'agent','crm',$2,'hash',1,'held','Awaiting approval','owner')",[id,{lifecycle:'lead',sourceVersion:'v1',binding:'a'.repeat(64)}]);
  await db.query("INSERT INTO ll_workflow_runs(org_id,id,created_by) VALUES('one',$1,'owner')",[run]);
  await db.query("INSERT INTO ll_workflow_steps(org_id,run_id,ordinal,action_id,agent_id,connector,payload) VALUES('one',$1,1,$2,'agent','crm',$3)",[run,id,{lifecycle:'lead'}]);
  await db.query("INSERT INTO ll_effects(org_id,action_id,before_discount,after_discount,after_version) VALUES('one',$1,0,20,2)",[id]);
  // Apply over existing proposals: the migration must not rewrite them.
  await db.query("CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL)");
  for (const [version,file] of [[1,"lib/durable/schema.sql"],[2,"lib/refunds/schema.sql"],[3,"lib/workspace/schema.sql"],[4,"lib/connectors/schema.sql"],[5,"lib/workflows/schema.sql"],[7,"lib/enquiries/schema.sql"],[8,"lib/enquiries/managed-schema.sql"],[9,"lib/enquiries/temporal-schema.sql"]] as const)
    await db.query("INSERT INTO ll_migrations VALUES($1,$2)",[version,createHash("sha256").update(await readFile(file)).digest("hex")]);
  await setup(); await setup();
  await admin.query(`CREATE ROLE ${role} NOLOGIN`);
  await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ll_actions,ll_refund_actions,ll_connector_actions,ll_workflow_runs,ll_workflow_steps,ll_effects TO ${role}`);
  runtime = new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema} -c role=${role}`});
});
afterAll(async () => {
  await runtime?.end(); await db?.end();
  await admin?.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin?.query(`DROP OWNED BY ${role}`); await admin?.query(`DROP ROLE ${role}`); await admin?.end();
});
it("refuses direct identity, scope, policy, hash, source and payload rewrites for all saved action kinds",async () => {
  for (const table of ['ll_actions','ll_refund_actions','ll_connector_actions']) {
    for (const mutation of ["id=gen_random_uuid()","org_id='two'","agent_id='another'","policy_version=2","payload_hash='new'","created_at=now()+interval '1 day'"])
      await expect(runtime.query(`UPDATE ${table} SET ${mutation} WHERE id=$1`,[id])).rejects.toMatchObject({code:'23514'});
  }
  for (const [table,mutation] of [
    ['ll_actions','discount=30'],['ll_actions','expected_version=2'],
    ['ll_refund_actions',"payment_id='other'"],['ll_refund_actions','amount=200'],
    ['ll_connector_actions',"connector='email'"],['ll_connector_actions',"proposed_by='peer'"],
    ['ll_connector_actions',`payload='{"lifecycle":"customer"}'::jsonb`],
  ]) await expect(runtime.query(`UPDATE ${table} SET ${mutation} WHERE id=$1`,[id])).rejects.toMatchObject({code:'23514'});
  expect((await db.query("SELECT payload_hash,payload FROM ll_connector_actions WHERE id=$1",[id])).rows[0]).toEqual({payload_hash:'hash',payload:{lifecycle:'lead',sourceVersion:'v1',binding:'a'.repeat(64)}});
});
it("freezes workflow steps, run ownership and observed effect values", async () => {
  for (const mutation of ["ordinal=2","action_id=gen_random_uuid()","agent_id='another'","connector='email'",`payload='{}'::jsonb`])
    await expect(runtime.query(`UPDATE ll_workflow_steps SET ${mutation} WHERE run_id=$1`,[run])).rejects.toMatchObject({code:'23514'});
  await expect(runtime.query("UPDATE ll_workflow_runs SET created_by='peer' WHERE id=$1",[run])).rejects.toMatchObject({code:'23514'});
  for (const mutation of ['before_discount=10','after_discount=30','after_version=3'])
    await expect(runtime.query(`UPDATE ll_effects SET ${mutation} WHERE action_id=$1`,[id])).rejects.toMatchObject({code:'23514'});
  // No-op updates remain valid; equality includes JSON rather than its textual ordering.
  await runtime.query("UPDATE ll_workflow_steps SET payload=payload WHERE run_id=$1",[run]);
});
it("refuses deletion, runtime truncation and disabling the boundary",async () => {
  for (const table of ['ll_actions','ll_refund_actions','ll_connector_actions','ll_workflow_steps','ll_workflow_runs','ll_effects']) {
    await expect(runtime.query(`DELETE FROM ${table}`)).rejects.toMatchObject({code:'23514'});
    await expect(runtime.query(`TRUNCATE ${table} CASCADE`)).rejects.toMatchObject({code:'42501'});
    await expect(runtime.query(`ALTER TABLE ${table} DISABLE TRIGGER ALL`)).rejects.toMatchObject({code:'42501'});
  }
  await expect(runtime.query("SET session_replication_role='replica'")).rejects.toMatchObject({code:'42501'});
});
it("allows approval, lease, evidence and compensation state while preserving the proposal",async () => {
  for (const table of ['ll_actions','ll_refund_actions','ll_connector_actions']) {
    await runtime.query(`UPDATE ${table} SET state='ready',approved_by='peer',approval_until=now()+interval '15 minutes' WHERE id=$1`,[id]);
    await runtime.query(`UPDATE ${table} SET state='executing',lease_token=$2,lease_until=now()+interval '30 seconds' WHERE id=$1`,[id,randomUUID()]);
    await runtime.query(`UPDATE ${table} SET state='uncertain',reason='Read back effect',lease_token=NULL,lease_until=NULL WHERE id=$1`,[id]);
  }
  await runtime.query("UPDATE ll_connector_actions SET evidence=$2 WHERE id=$1",[id,{outcome:'verified',reference:'fixture'}]);
  await runtime.query("UPDATE ll_refund_actions SET provider_id='fixture',provider_status='succeeded' WHERE id=$1",[id]);
  await runtime.query("UPDATE ll_effects SET recovered=true WHERE action_id=$1",[id]);
  await runtime.query("UPDATE ll_workflow_runs SET state='paused' WHERE id=$1",[run]);
  expect((await db.query("SELECT discount,expected_version,payload_hash FROM ll_actions WHERE id=$1",[id])).rows[0]).toEqual({discount:20,expected_version:1,payload_hash:'hash'});
});
it("keeps new unknown columns immutable by default",async () => {
  await db.query("ALTER TABLE ll_connector_actions ADD COLUMN future_scope text NOT NULL DEFAULT 'original'");
  await expect(runtime.query("UPDATE ll_connector_actions SET future_scope='changed' WHERE id=$1",[id])).rejects.toMatchObject({code:'23514'});
});
it("allows real restore quarantine to revoke old authority without changing saved proposals",async () => {
  await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('one',$1)",[epoch]);
  const result=await quarantineRestore(db,'one',randomUUID(),'a'.repeat(64));
  expect(result).toMatchObject({ll_actions:1,ll_refund_actions:1,ll_connector_actions:1});
  expect((await db.query("SELECT state,approved_by,payload_hash FROM ll_connector_actions WHERE id=$1",[id])).rows[0]).toEqual({state:'uncertain',approved_by:null,payload_hash:'hash'});
  expect((await db.query("SELECT count(*)::int AS n FROM ll_workflow_steps WHERE run_id=$1",[run])).rows[0].n).toBe(1);
});

it("requires provisioning prerequisites and refuses a changed applied migration without changing proposals",async () => {
  await expect(setup(true)).rejects.toMatchObject({code:1});
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=11");
  try { await expect(setup()).rejects.toMatchObject({code:1}); }
  finally { await db.query("UPDATE ll_migrations SET digest=$1 WHERE version=11",[createHash("sha256").update(await readFile("lib/durable/proposal-schema.sql")).digest("hex")]); }
  const original=(await db.query("SELECT digest FROM ll_migrations WHERE version=4")).rows[0].digest;
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=4");
  try { await expect(setup()).rejects.toMatchObject({code:1}); }
  finally { await db.query("UPDATE ll_migrations SET digest=$1 WHERE version=4",[original]); }
  const saved=(await db.query("DELETE FROM ll_migrations WHERE version=9 RETURNING *")).rows[0];
  try { await expect(setup()).rejects.toMatchObject({code:1}); }
  finally { await db.query("INSERT INTO ll_migrations VALUES($1,$2)",[saved.version,saved.digest]); }
  await Promise.all([setup(),setup()]);
  expect((await db.query("SELECT count(*)::int AS n FROM ll_migrations WHERE version=11")).rows[0].n).toBe(1);
});
