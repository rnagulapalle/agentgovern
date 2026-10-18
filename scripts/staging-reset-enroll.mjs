// Offline opt-in provisioning only; no worker token, reset RPC or approval grant.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {resetAssemblyArtifacts,enrollResetAssembly} from './reset-assembly-enrollment.mjs';
let db;
async function main(){
 assert.equal(process.env.LOOPLABS_STAGING_RESET_PROOF,'isolated');
 assert.equal(process.env.LOOPLABS_STAGING_DRAIN_PROOF,'isolated');
 assert(!process.env.LOOPLABS_DATABASE_URL&&!process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN);
 const url=new URL(process.env.LOOPLABS_MIGRATION_DATABASE_URL);
 assert(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='application-db'&&url.username==='ll_stage_owner'&&url.password&&url.pathname==='/looplabs_staging'&&!url.search&&!url.hash);
 const args=process.argv.slice(2);assert.equal(args.length,2);
 const directories=['/run/baseline','/run/incompatible'];
 await resetAssemblyArtifacts(directories,args);
 for(const script of ['scripts/worker-admission-setup.ts','scripts/reset-intent-setup.ts'])execFileSync(process.execPath,['--import','tsx',script],{timeout:30000,stdio:['ignore','ignore','pipe']});
 db=new Pool({connectionString:url.toString(),max:2,query_timeout:10000});
 const result=await enrollResetAssembly(db,directories,args);
 assert.equal(result.resetIntents,0,'Fresh assembly must start with no reset intents');
 console.log(JSON.stringify(result));
}
main().catch(()=>{console.error('Isolated reset assembly enrollment refused; no raw configuration printed.');process.exitCode=1;}).finally(async()=>{await db?.end();});
