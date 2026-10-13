// Actual full custom archive into a fresh, owned copy on the disposable PG service.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
function target({project,database,docker}){
 assert.equal(process.env.LOOPLABS_STAGING_RESET_PROOF,'isolated');assert(/^ll-platform-[a-f0-9]{12}$/.test(project));assert(/^[a-f0-9]{64}$/.test(database));assert.equal(typeof docker,'function');
 const c=JSON.parse(docker('inspect',database))[0];assert.equal(c.Id,database);assert.equal(c.State.Running,true);assert.equal(c.Config.Labels?.['com.docker.compose.project'],project);assert.equal(c.Config.Labels?.['com.docker.compose.service'],'application-db');
 return c;
}
function archivePath(trial){assert(typeof trial==='string'&&trial.startsWith('/')&&!trial.includes('..')&&!/[\r\n\0,]/.test(trial));return resolve(trial,'semantic','pending-reset.archive');}
export async function capturePendingResetArchive(input){
 target(input);const path=archivePath(input.trial);
 const bytes=execFileSync('docker',['exec',input.database,'pg_dump','-U','ll_stage_owner','-d','looplabs_staging','--format=custom'],{timeout:30000,maxBuffer:32*1024**2,stdio:['ignore','pipe','pipe']});
 assert(bytes.length>100&&bytes.subarray(0,5).toString()==='PGDMP');
 await writeFile(path,bytes,{flag:'wx',mode:0o600});return createHash('sha256').update(bytes).digest('hex');
}
export async function restorePendingResetArchive({project,database,trial,ownerURL,images,docker,writers,ownerLabel}){
 target({project,database,docker});const path=archivePath(trial),stat=await lstat(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>100&&stat.size<=32*1024**2);
 assert(Array.isArray(writers)&&writers.length===2&&writers[0]!==writers[1]);assert(/^[a-f0-9]{48}$/.test(ownerLabel));
 for(const id of writers){assert(/^[a-f0-9]{64}$/.test(id));const c=JSON.parse(docker('inspect',id))[0];assert.equal(c.Id,id);assert.equal(c.Config.Labels?.['looplabs.semantic.owner'],ownerLabel);assert.equal(c.State.Running,false,'Stop every semantic worker before recovery');}
 assert(new RegExp(`^${project}:[a-z-]+$`).test(images.controller));
 const url=new URL(ownerURL);assert(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='application-db'&&url.username==='ll_stage_owner'&&url.password&&url.pathname==='/looplabs_staging'&&!url.search&&!url.hash);
 assert.equal(docker('exec',database,'psql','-U','ll_stage_owner','-d','looplabs_staging','-Atc',"SELECT current_user,current_database(),rolcreatedb OR rolsuper FROM pg_roles WHERE rolname=current_user"),'ll_stage_owner|looplabs_staging|t');
 const copy='ll_reset_restore_'+randomBytes(8).toString('hex'),epoch=randomUUID(),env=resolve(trial,'..',project+'-reset-restore-owner.env'),name=project+'-reset-restore-owner';let created=false,started=false;
 const bytes=await readFile(path);assert.equal(bytes.subarray(0,5).toString(),'PGDMP');const backupHash=createHash('sha256').update(bytes).digest('hex');
 url.pathname='/'+copy;
 // The new copy's independent deployment epoch exists before archive restoration.
 await writeFile(env,`LOOPLABS_STAGING_RESET_PROOF=isolated\nLOOPLABS_MIGRATION_DATABASE_URL=${url}\nLOOPLABS_RECOVERY_EPOCH=${epoch}\nLOOPLABS_RESTORE_ACK=WRITERS_STOPPED_AND_EPOCH_ROTATED\n`,{flag:'wx',mode:0o600});
 try{
  docker('exec',database,'createdb','-U','ll_stage_owner','--template=template0',copy);created=true;
  execFileSync('docker',['exec','-i',database,'pg_restore','-U','ll_stage_owner','--dbname',copy,'--exit-on-error','--single-transaction'],{input:bytes,timeout:30000,maxBuffer:4*1024**2,stdio:['pipe','pipe','pipe']});
  started=true;
  docker('run','--rm','--name',name,'--label',`looplabs.semantic.owner=${ownerLabel}`,'--network',project+'-semantic','--user',`${process.getuid()}:${process.getgid()}`,'--memory','268435456','--cpus','0.75','--pids-limit','256','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--env-file',env,'--mount',`type=bind,src=${trial},dst=/run/trial`,images.controller,'node','--import','tsx','scripts/staging-reset-restore-owner.mjs');
  const receipt=JSON.parse(await readFile(resolve(trial,'semantic','pending-reset-restored.json'),'utf8'));
  assert(receipt.passed===true&&receipt.staleResetRefused===true&&receipt.replacementIntentRefused===true&&receipt.restoredAuthorityRevoked===true&&receipt.actionIdentitiesPreserved===true&&receipt.reservationsPreserved===true);
  assert.equal(receipt.buildsDraining,2);assert(receipt.actions>=4);assert.equal(receipt.backupSha256,backupHash);
  return {...receipt,isolatedCopy:true,externalEpochRotatedBeforeRestore:true};
 }finally{
  if(started){const remaining=docker('container','ls','-aq','--filter',`name=^/${name}$`);if(remaining){const c=JSON.parse(docker('inspect',remaining))[0];assert.equal(c.Config.Labels?.['looplabs.semantic.owner'],ownerLabel);docker('rm','-f',remaining);}}
  if(created){target({project,database,docker});docker('exec',database,'dropdb','-U','ll_stage_owner',copy);}
 }
}
