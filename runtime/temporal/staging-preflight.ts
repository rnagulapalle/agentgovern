import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import type {Pool} from "pg";
import {operationsConfig} from "./operations";
import {recordCatalog} from "../../lib/connectors/catalog";
import {FetchSandboxConnectors} from "../../lib/connectors/twin";

// Prerequisite inspection only. No migration, enrollment, approval or dispatch.
export const scopedMigrations=[
 [1,"lib/durable/schema.sql"],[2,"lib/refunds/schema.sql"],[3,"lib/workspace/schema.sql"],
 [4,"lib/connectors/schema.sql"],[5,"lib/workflows/schema.sql"],[7,"lib/enquiries/schema.sql"],
 [8,"lib/enquiries/managed-schema.sql"],[9,"lib/enquiries/temporal-schema.sql"],
 [11,"lib/durable/proposal-schema.sql"],[12,"lib/connectors/scope-schema.sql"],
 [13,"lib/enquiries/record-routing-schema.sql"],
] as const;
export async function migrationDigests(){
 return Promise.all(scopedMigrations.map(async([version,file])=>({version,digest:createHash("sha256").update(await readFile(file)).digest("hex")})));
}
export function stagingConfiguration(env:Record<string,string|undefined>){
 const blockers:string[]=[];
 const org=env.LOOPLABS_WORKSPACE_ID;
 if(!org||!/^[a-zA-Z0-9_-]{1,64}$/.test(org))blockers.push("workspace_configuration_missing_or_invalid");
 if(env.LOOPLABS_TEMPORAL_WORKSPACE!=="staging")blockers.push("staging_opt_in_missing");
 try{
  const config=operationsConfig(env,"worker");
  if(config.insecureLoopback)blockers.push("authenticated_tls_required");
  if(!/^ack-[a-f0-9]{64}$/.test(config.buildId)||env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID!==config.buildId)blockers.push("scoped_build_pin_missing_or_mismatched");
 }catch{blockers.push("temporal_configuration_missing_or_invalid");}
 if(!env.LOOPLABS_TEMPORAL_WORKER_TOKEN||!/^[a-zA-Z0-9_-]{32,128}$/.test(env.LOOPLABS_TEMPORAL_WORKER_TOKEN))blockers.push("workload_configuration_missing_or_invalid");
 try{
  if(env.LOOPLABS_FETCHSANDBOX_BINDING)throw Error("Hosted record execution is unsupported");
  const records=recordCatalog(org||"",env.LOOPLABS_RECORD_CATALOG);
  if(!records.length)throw Error("No isolated records");
  for(const record of records)new FetchSandboxConnectors(env.LOOPLABS_CONNECTOR_TWIN_URL,env.LOOPLABS_CONNECTOR_TWIN_TOKEN,1500,record.scope);
 }catch{blockers.push("isolated_record_binding_missing_or_invalid");}
 return blockers;
}
export async function stagingDatabase(db:Pool,expected:{version:number;digest:string}[],org:string,token:string){
 const c=await db.connect();
 try{
  await c.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await c.query("SET LOCAL statement_timeout='5s'");
  const blockers:string[]=[];
  const role=(await c.query("SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
  const schema=(await c.query("SELECT has_schema_privilege(current_user,current_schema(),'CREATE') AS can_create")).rows[0];
  if(!role||role.rolsuper||role.rolcreaterole||role.rolcreatedb||role.rolbypassrls||schema.can_create)blockers.push("runtime_database_role_privileged");
  const present=(await c.query("SELECT to_regclass('ll_migrations') IS NOT NULL AS present")).rows[0].present;
  if(!present)blockers.push("workspace_schema_missing");
  else{
   const rows=(await c.query("SELECT version,digest FROM ll_migrations")).rows;
   for(const migration of expected){
    const old=rows.find(r=>r.version===migration.version);
    if(!old)blockers.push(`migration_${migration.version}_missing`);
    else if(old.digest!==migration.digest)blockers.push(`migration_${migration.version}_digest_mismatch`);
   }
   const owns=(await c.query("SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relkind IN ('r','p') AND t.relname LIKE 'll_%' AND pg_has_role(current_user,t.relowner,'USAGE') LIMIT 1")).rows.length>0;
   if(owns&&!blockers.includes("runtime_database_role_privileged"))blockers.push("runtime_database_role_privileged");
   if(!blockers.some(b=>b.startsWith("migration_")||b==="workspace_schema_missing")){
    const active=(await c.query("SELECT 1 FROM ll_tokens t JOIN ll_orgs o ON o.id=t.org_id WHERE t.hash=$1 AND t.org_id=$2 AND t.subject='enquiry-temporal' AND t.role='worker' AND t.active=true",[createHash("sha256").update(token).digest("hex"),org])).rows.length===1;
    if(!active)blockers.push("scoped_workload_not_active_in_workspace");
    const members=(await c.query("SELECT count(*)::int n FROM ll_members WHERE org_id=$1 AND active=true",[org])).rows[0].n;
    if(members<2)blockers.push("independent_named_members_missing");
   }
  }
  await c.query("COMMIT");return blockers;
 }catch(error){await c.query("ROLLBACK");throw error;}finally{c.release();}
}
