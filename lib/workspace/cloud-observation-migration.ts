import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";

/** Owner-only additive installation; never accepts a runtime connection as owner. */
export async function installCloudObservation(client:PoolClient, runtimeRole:string, org?:string) {
 if(!/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeRole))throw Error("Explicit observation runtime role required");
 await client.query("BEGIN");
 try {
  await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL statement_timeout='5s'");
  await client.query("SELECT pg_advisory_xact_lock(68391205)");
  const applied=(await client.query("SELECT version,digest FROM ll_migrations")).rows;
  for(const [version,file]of [[1,"lib/durable/schema.sql"],[3,"lib/workspace/schema.sql"],[10,"lib/durable/recovery-schema.sql"]]as const){
   if(applied.find(v=>v.version===version)?.digest!==createHash("sha256").update(await readFile(file)).digest("hex"))throw Error("Observation prerequisite migration missing or changed");
  }
  for(const table of ["ll_orgs","ll_members","ll_workspace_recovery"]){
   if(!(await client.query("SELECT pg_get_userbyid(relowner)=current_user owned FROM pg_class WHERE oid=to_regclass($1)",[table])).rows[0]?.owned)throw Error("Separate observation migration owner required");
  }
  const role=(await client.query("SELECT oid::text,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolinherit FROM pg_roles WHERE rolname=$1",[runtimeRole])).rows[0];
  if(!role||!role.rolcanlogin||role.rolsuper||role.rolbypassrls||role.rolcreaterole||role.rolcreatedb||role.rolreplication||role.rolinherit)throw Error("Restricted observation runtime role required");
  const scoped=(await client.query("SELECT to_regclass('ll_runtime_workspace_bindings') present")).rows[0]?.present;
  if(scoped){
   if(!org||!/^[-_a-zA-Z0-9]{1,64}$/.test(org))throw Error("Explicit observation workspace required");
   const binding=(await client.query("SELECT 1 FROM ll_runtime_workspace_bindings b JOIN pg_database d ON d.oid=b.database_oid AND d.datname=b.database_name WHERE b.login_name=$1 AND b.login_oid=$2::oid AND b.org_id=$3 AND b.purpose='web' AND d.datname=current_database()",[runtimeRole,role.oid,org])).rows[0];
   if(!binding||!(await client.query("SELECT to_regprocedure('ll_bound_workspace()') present")).rows[0]?.present)throw Error("Scoped observation role binding mismatch");
  }else if(runtimeRole!=="ll_runtime"||org)throw Error("Unscoped installation only permits the existing dedicated runtime role");
  const sql=await readFile("lib/workspace/cloud-observation-schema.sql","utf8"),digest=createHash("sha256").update(sql).digest("hex"),old=applied.find(v=>v.version===28);
  if(old&&old.digest!==digest)throw Error("Applied observation migration changed");
  if(!old){await client.query(sql);await client.query("INSERT INTO ll_migrations(version,digest) VALUES(28,$1)",[digest]);}
  if(!(await client.query("SELECT pg_get_userbyid(relowner)=current_user owned,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='ll_cloud_observation_enrollments'::regclass")).rows.some(v=>v.owned&&(!scoped||(v.relrowsecurity&&v.relforcerowsecurity))))throw Error("Observation installation boundary mismatch");
  await client.query(`GRANT SELECT ON ll_cloud_observation_enrollments TO "${runtimeRole}"`);
  await client.query(`GRANT INSERT(org_id,id,connection_id,scan_id,resource_arn,provider_version,owner_review_id,owner_email,display_name,log_group,mapping,epoch,reviewed_by) ON ll_cloud_observation_enrollments TO "${runtimeRole}"`);
  await client.query("COMMIT");return{migration:28,digest,repeated:Boolean(old),runtimeRole,scope:scoped?"bound-web-role":"dedicated-staging-runtime",executionAuthorityGranted:false};
 }catch(error){await client.query("ROLLBACK");throw error;}
}
