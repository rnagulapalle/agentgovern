import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { emptyCompanyProfile,parseCompanyProfile } from "./company-profile-contract";
export async function installCompanyDirectory(c:PoolClient,role:string,org:string,name:string){
 if(!/^[_a-z][_a-z0-9]{0,62}$/.test(role)||!/^[-_a-zA-Z0-9]{1,64}$/.test(org))throw Error("Exact web role and workspace required.");
 const initial=parseCompanyProfile({...emptyCompanyProfile(),name,revision:1});
 try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");await c.query('SELECT pg_advisory_xact_lock(68391205)');
 if(!(await c.query("SELECT pg_get_userbyid(relowner)=current_user owned FROM pg_class WHERE oid='ll_orgs'::regclass")).rows[0]?.owned)throw Error('Separate table owner required.');
 for(const [version,file]of [[1,'lib/durable/schema.sql'],[3,'lib/workspace/schema.sql']]as const){const expected=createHash('sha256').update(await readFile(file)).digest('hex');if((await c.query('SELECT digest FROM ll_migrations WHERE version=$1',[version])).rows[0]?.digest!==expected)throw Error('Company directory prerequisite missing or changed.');}
 const binding=(await c.query("SELECT b.org_id,b.purpose FROM ll_runtime_workspace_bindings b JOIN pg_roles r ON r.oid=b.login_oid AND r.rolname=b.login_name WHERE b.login_name=$1 AND b.org_id=$2 AND b.purpose='web' AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit",[role,org])).rows[0];if(!binding)throw Error('Exact bound web role required.');
 const sql=await readFile('lib/workspace/company-profile-schema.sql','utf8'),digest=createHash('sha256').update(sql).digest('hex'),old=(await c.query('SELECT digest FROM ll_migrations WHERE version=29')).rows[0];if(old&&old.digest!==digest)throw Error('Applied company directory migration changed.');if(!old){await c.query(sql);await c.query('INSERT INTO ll_migrations(version,digest)VALUES(29,$1)',[digest]);}
 await c.query(`GRANT UPDATE(company_profile) ON ll_orgs TO "${role}"`);
 const seeded=await c.query('UPDATE ll_orgs SET company_profile=$2::jsonb WHERE id=$1 AND company_profile IS NULL',[org,JSON.stringify(initial)]);
 await c.query('COMMIT');return {migration:29,repeated:Boolean(old),seeded:seeded.rowCount===1,metadataColumnGrant:true,actionAuthorityChanged:false,executionAuthorityGranted:false};
 }catch(e){await c.query('ROLLBACK');throw e;}
}
