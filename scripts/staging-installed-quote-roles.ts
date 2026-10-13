/** Existing installed quote extension for one owned assembled trial. This installs
 * SQL purposes only; provider setup, image execution and approval are separate. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {Pool} from 'pg';
import {readPublishedWebGeneration,readWorkloadInstallation,parseWorkloadInstallation} from '../lib/workspace/tenant-bootstrap';
import {installQuoteWorkloadGrants,installQuoteAdmissionGrants} from '../lib/workspace/quote-workload-installation';
export async function installAssembledQuoteRoles(owner:Pool,files:{webFile:string;workerFile:string},output:string){
 const web=await readPublishedWebGeneration(files.webFile),base=await readWorkloadInstallation(files.workerFile),config=base.config,entry=web.config.web[0];
 assert.equal(web.config.web.length,1);assert.equal(entry.org,'local-proof');assert.equal(config.installation,web.config.installation);assert.equal(config.schema,web.config.schema);assert.equal(config.database,web.config.database);assert.deepEqual(config.transport,web.config.transport);assert.equal(config.transport.mode,'verified-tls');
 const installedWeb=(await owner.query(`SELECT login_oid::text oid,database_oid::text db FROM ${config.schema}.ll_runtime_workspace_bindings WHERE login_name=$1 AND org_id=$2 AND purpose='web'`,[entry.role,entry.org])).rows;assert.equal(installedWeb.length,1);
 await mkdir(output,{mode:0o700});const roles:Record<string,string>={},workloads:Record<string,string>={};
 const close=async()=>{
  for(const [role,oid]of Object.entries(roles)){assert.equal((await owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0]?.oid,oid);assert.equal(Number((await owner.query('SELECT count(*) n FROM pg_stat_activity WHERE usename=$1',[role])).rows[0].n),0);await owner.query('DROP OWNED BY '+role);await owner.query('DROP ROLE '+role);delete roles[role];}
 };
 try{
  for(const purpose of ['worker','scheduler'] as const){
   const role='llqt_'+randomBytes(8).toString('hex')+'_'+purpose,password=randomBytes(32).toString('base64url');
   await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);const oid=(await owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0].oid;roles[role]=oid;
   await installQuoteWorkloadGrants(owner,config.schema,role,entry.org,purpose,oid);
   const url=new URL(config.entries[0].url);url.username=role;url.password=password;
   const generation=parseWorkloadInstallation({...config,entries:[{url:url.href,role,org:entry.org,epoch:entry.epoch,purpose}]}),dir=join(output,purpose);await mkdir(dir,{mode:0o700});
   const bytes=JSON.stringify(generation);await writeFile(join(dir,'workloads.json'),bytes,{mode:0o600,flag:'wx'});await writeFile(join(dir,'ready.json'),JSON.stringify({installation:config.installation,workloadsSha256:createHash('sha256').update(bytes).digest('hex')}),{mode:0o600,flag:'wx'});
   const read=await readWorkloadInstallation(join(dir,'workloads.json'));await read.assertStable();workloads[purpose]=join(dir,'workloads.json');
  }
  await installQuoteAdmissionGrants(owner,config.schema,entry.role,entry.org,installedWeb[0].oid);
  await web.assertStable();await base.assertStable();return {roles:{...roles},files:{workerFile:workloads.worker,schedulerFile:workloads.scheduler},databaseOid:installedWeb[0].db,webRoleOid:installedWeb[0].oid,close,activated:false as const};
 }catch(error){await close();throw error;}
}
