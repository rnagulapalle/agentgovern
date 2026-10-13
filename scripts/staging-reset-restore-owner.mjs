// Only the disposable copied database; never a shared or production restore target.
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {verifyRestoredPendingReset} from './restored-reset-verification.mjs';
let db;
async function main(){
 assert.equal(process.env.LOOPLABS_STAGING_RESET_PROOF,'isolated');
 assert(!process.env.LOOPLABS_DATABASE_URL&&!process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN&&!Object.keys(process.env).some(k=>k.startsWith('AWS_')));
 const url=new URL(process.env.LOOPLABS_MIGRATION_DATABASE_URL);
 assert(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='application-db'&&url.username==='ll_stage_owner'&&url.password&&/^\/ll_reset_restore_[a-f0-9]{16}$/.test(url.pathname)&&!url.search&&!url.hash);
 const dir='/run/trial/semantic',path=dir+'/pending-reset.archive';
 const stat=await lstat(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>100&&stat.size<=32*1024**2);
 const bytes=await readFile(path);assert.equal(bytes.subarray(0,5).toString(),'PGDMP');
 const input=JSON.parse(await readFile(dir+'/reset-request.json','utf8'));
 db=new Pool({connectionString:url.toString(),max:2,query_timeout:10000});
 assert.equal((await db.query('SELECT current_database() name')).rows[0].name,url.pathname.slice(1));
 const result=await verifyRestoredPendingReset(db,{input,epoch:process.env.LOOPLABS_RECOVERY_EPOCH,backupHash:createHash('sha256').update(bytes).digest('hex')});
 await writeFile(dir+'/pending-reset-restored.json',JSON.stringify(result),{flag:'wx',mode:0o600});
}
main().catch(()=>{console.error('Isolated pending-reset restore refused; no raw archive, authority or database error printed.');process.exitCode=1;}).finally(async()=>{await db?.end();});
