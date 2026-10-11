// Disposable offline owner only. Workers and runtime controller never receive this URL.
import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {enrollExtractedWorker} from './worker-artifact-enrollment.mjs';
const dir='/run/trial/semantic';let db,phase='opt-in',opted=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const mark=(name,value={})=>writeFile(`${dir}/${name}.json`,JSON.stringify(value),{flag:'wx',mode:0o600});
async function until(fn){for(let end=Date.now()+180000;Date.now()<end;){if(await fn())return;await wait(100);}throw Error('Owner checkpoint unavailable');}
const checkpoint=name=>until(async()=>{try{await access(`${dir}/${name}.json`);return true;}catch{return false;}});
async function main(){
 assert.equal(process.env.LOOPLABS_STAGING_DRAIN_PROOF,'isolated');opted=true;
 assert(process.env.LOOPLABS_MIGRATION_DATABASE_URL&&!process.env.LOOPLABS_DATABASE_URL&&!process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN);
 execFileSync(process.execPath,['--import','tsx','scripts/worker-admission-setup.ts'],{timeout:30000,stdio:['ignore','ignore','pipe']});
 db=new Pool({connectionString:process.env.LOOPLABS_MIGRATION_DATABASE_URL,max:3,query_timeout:10000});
 const input=JSON.parse(await readFile(`${dir}/input.json`,'utf8')),images=JSON.parse(await readFile(`${dir}/inspected-images.json`,'utf8'));
 assert(input.builds.length===2&&images.length===2&&images[0]!==images[1]);phase='enrollment';
 for(const [i,path] of ['/run/baseline','/run/incompatible'].entries()){const enrolled=await enrollExtractedWorker(db,images[i],path);assert.equal(enrolled.buildId,input.builds[i]);}
 await mark('registry-ready');
 phase='admit-first';await checkpoint('admission-row-held');
 const pending=JSON.parse(await readFile(`${dir}/admission-row-held.json`,'utf8'));assert(Number.isSafeInteger(pending.pid)&&pending.pid>0);
 const c=await db.connect();
 try{
  const pid=(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const drain=c.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=now() WHERE worker_build_id=$1",[input.builds[0]]);
  await until(async()=> (await db.query('SELECT $1=ANY(pg_blocking_pids($2)) blocked',[pending.pid,pid])).rows[0].blocked);
  await mark('admission-drain-blocked');await drain;await mark('old-build-drained');
 }finally{c.release();}
 phase='drain-first';const next=await db.connect();
 try{
  await next.query('BEGIN');await next.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=now() WHERE worker_build_id=$1",[input.builds[1]]);
  const pid=(await next.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await mark('new-drain-held');await checkpoint('new-insert-attempt');
  const insert=JSON.parse(await readFile(`${dir}/new-insert-attempt.json`,'utf8'));assert(Number.isSafeInteger(insert.pid)&&insert.pid>0);
  await until(async()=> (await db.query('SELECT $1=ANY(pg_blocking_pids($2)) blocked',[pid,insert.pid])).rows[0].blocked);
  await mark('new-insert-blocked');await next.query('COMMIT');
 }finally{await next.query('ROLLBACK');next.release();}
 await checkpoint('admission-exercised');await mark('owner-drain-completed',{passed:true,admissionFirstBlocked:true,drainFirstBlocked:true});
}
main().catch(async()=>{if(opted)await mark('owner-failure',{phase}).catch(()=>{});console.error('Isolated drain owner refused; no raw database, Docker or credentials printed.');process.exitCode=1;}).finally(async()=>{await db?.end();});
