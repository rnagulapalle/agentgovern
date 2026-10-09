import {readFile} from "node:fs/promises";
import {createHash,randomBytes} from "node:crypto";
import {Pool} from "pg";
import {afterAll,beforeAll,beforeEach,expect,it} from "vitest";
import {migrationDigests,scopedMigrations,stagingConfiguration,stagingDatabase} from "./staging-preflight";
const build=`ack-${"a".repeat(64)}`,token="t".repeat(40),epoch="11111111-1111-4111-8111-111111111111";
const env={LOOPLABS_RECOVERY_EPOCH:epoch,LOOPLABS_WORKSPACE_ID:"one",LOOPLABS_TEMPORAL_WORKSPACE:"staging",LOOPLABS_TEMPORAL_ADDRESS:"temporal.example.test:7233",LOOPLABS_TEMPORAL_NAMESPACE:"isolated",LOOPLABS_TEMPORAL_TASK_QUEUE:"ack",LOOPLABS_TEMPORAL_BUILD_ID:build,LOOPLABS_TEMPORAL_RECORD_BUILD_ID:build,LOOPLABS_TEMPORAL_API_KEY:"private-fixture-key",LOOPLABS_TEMPORAL_WORKER_TOKEN:token,LOOPLABS_CONNECTOR_TWIN_URL:"http://connector-twin:8018",LOOPLABS_CONNECTOR_TWIN_TOKEN:"c".repeat(40),LOOPLABS_RECORD_CATALOG:JSON.stringify({records:[{version:"record-scope-1",workspaceId:"one",contactId:"2001",recipient:"alice@example.test"}]})};
it("reports only sanitized configuration prerequisites, without claiming runtime acceptance",()=>{
 expect(stagingConfiguration(env)).toEqual([]);
 expect(stagingConfiguration({})).toEqual(["workspace_configuration_missing_or_invalid","recovery_epoch_missing_or_invalid","staging_opt_in_missing","temporal_configuration_missing_or_invalid","workload_configuration_missing_or_invalid","isolated_record_binding_missing_or_invalid"]);
 for(const override of [{LOOPLABS_RECOVERY_EPOCH:""},{LOOPLABS_RECOVERY_EPOCH:"old"},{LOOPLABS_RECOVERY_EPOCH:undefined},{LOOPLABS_WORKSPACE_ID:""},{LOOPLABS_WORKSPACE_ID:"bad space"},{LOOPLABS_TEMPORAL_WORKSPACE:"production"},{LOOPLABS_TEMPORAL_RECORD_BUILD_ID:"old"},{LOOPLABS_TEMPORAL_BUILD_ID:"old",LOOPLABS_TEMPORAL_RECORD_BUILD_ID:"old"},{LOOPLABS_TEMPORAL_WORKER_TOKEN:""},{LOOPLABS_TEMPORAL_WORKER_TOKEN:"bad"},{LOOPLABS_RECORD_CATALOG:"bad"},{LOOPLABS_RECORD_CATALOG:""},{LOOPLABS_WORKSPACE_ID:"other"},{LOOPLABS_FETCHSANDBOX_BINDING:"private-missing-guarantee"},{LOOPLABS_CONNECTOR_TWIN_URL:"http://evil.test"},{LOOPLABS_CONNECTOR_TWIN_TOKEN:"bad"}]){
  const result=stagingConfiguration({...env,...override});expect(result.length).toBeGreaterThan(0);expect(JSON.stringify(result)).not.toContain(env.LOOPLABS_TEMPORAL_API_KEY);
 }
 expect(stagingConfiguration({...env,LOOPLABS_TEMPORAL_API_KEY:undefined,LOOPLABS_TEMPORAL_ADDRESS:"127.0.0.1:7233",LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK:"true"})).toContain("authenticated_tls_required");
});
const schema=`preflight_${randomBytes(8).toString("hex")}`,role=`preflight_${randomBytes(8).toString("hex")}`;
let admin:Pool,owner:Pool,runtime:Pool,expected:{version:number;digest:string}[];
beforeAll(async()=>{
 if(!process.env.LOOPLABS_TEST_DATABASE_URL)throw Error("Dedicated PostgreSQL is required; preflight tests cannot be skipped.");
 admin=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 owner=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 await owner.query("CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL)");
 for(const [,file] of scopedMigrations)await owner.query(await readFile(file,"utf8"));
 expected=await migrationDigests();for(const m of expected)await owner.query("INSERT INTO ll_migrations VALUES($1,$2)",[m.version,m.digest]);
 const password=randomBytes(24).toString("hex");await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
 const url=new URL(process.env.LOOPLABS_TEST_DATABASE_URL);url.username=role;url.password=password;
 runtime=new Pool({connectionString:url.toString(),options:`-c search_path=${schema}`});
});
beforeEach(async()=>{
 await owner.query("TRUNCATE ll_orgs CASCADE");await owner.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
 await owner.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('one',$1),('two',$1)",[epoch]);
 await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('requester','one','Requester','fixture'),('reviewer','one','Reviewer','fixture')");
 await owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','enquiry-temporal','worker')",[createHash("sha256").update(token).digest("hex")]);
});
afterAll(async()=>{await runtime?.end();await owner?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.query(`DROP ROLE IF EXISTS ${role}`);await admin.end();}});
it("reads exact migration hashes, independent members and workload scope using an actual restricted connection",async()=>{
 const before=(await owner.query("SELECT row_to_json(t) FROM ll_tokens t")).rows;
 expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toEqual([]);
 expect((await owner.query("SELECT row_to_json(t) FROM ll_tokens t")).rows).toEqual(before);
 expect(await stagingDatabase(runtime,expected,"two",token,epoch)).toEqual(["scoped_workload_not_active_in_workspace","independent_named_members_missing"]);
 await owner.query("UPDATE ll_tokens SET active=false");expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toEqual(["scoped_workload_not_active_in_workspace"]);
 await owner.query("UPDATE ll_members SET active=false WHERE email='reviewer'");expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toContain("independent_named_members_missing");
});
it("refuses an old or corrupted migration ledger without inferring authority",async()=>{
 await owner.query("DELETE FROM ll_migrations WHERE version=13");expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toEqual(["migration_13_missing"]);
 await owner.query("INSERT INTO ll_migrations VALUES(13,'corrupt')");expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toEqual(["migration_13_digest_mismatch"]);
 await owner.query("UPDATE ll_migrations SET digest=$1 WHERE version=13",[expected.find(m=>m.version===13)!.digest]);
});
it("refuses privileged, schema-creating and table-owning runtime identities",async()=>{
 expect(await stagingDatabase(owner,expected,"one",token,epoch)).toContain("runtime_database_role_privileged");
 await admin.query(`GRANT CREATE ON SCHEMA ${schema} TO ${role}`);expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toContain("runtime_database_role_privileged");
 await runtime.query("CREATE TABLE ll_runtime_owned(id integer)");await admin.query(`REVOKE CREATE ON SCHEMA ${schema} FROM ${role}`);
 expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toContain("runtime_database_role_privileged");await owner.query("DROP TABLE ll_runtime_owned");
 expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toEqual([]);
});
it("reports a missing schema and rolls back failed inspections without weakening grants",async()=>{
 const empty=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:'-c search_path=pg_catalog'});
 try{expect(await stagingDatabase(empty,expected,"one",token,epoch)).toContain("workspace_schema_missing");}finally{await empty.end();}
 await admin.query(`REVOKE SELECT ON ${schema}.ll_migrations FROM ${role}`);await expect(stagingDatabase(runtime,expected,"one",token,epoch)).rejects.toThrow();
 await admin.query(`GRANT SELECT ON ${schema}.ll_migrations TO ${role}`);expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toEqual([]);
});

it("refuses missing or restored epochs and cannot rewrite the offline authority fence",async()=>{
 for(const value of [undefined,"", "not-an-epoch","22222222-2222-4222-8222-222222222222"])
  expect(await stagingDatabase(runtime,expected,"one",token,value)).toContain("recovery_fence_missing_or_mismatched");
 await expect(runtime.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='one'",[epoch])).rejects.toMatchObject({code:"42501"});
 await owner.query("DELETE FROM ll_workspace_recovery WHERE org_id='one'");
 expect(await stagingDatabase(runtime,expected,"one",token,epoch)).toContain("recovery_fence_missing_or_mismatched");
 expect(await stagingDatabase(runtime,expected,"two",token,epoch)).not.toContain("recovery_fence_missing_or_mismatched");
});
