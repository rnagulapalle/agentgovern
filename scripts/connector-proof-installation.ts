// Offline disposable proof helper only. Product launchers use installed-runtime.
import type { ChildProcess } from 'node:child_process';
import { bootstrapTenantContext, readWorkloadInstallation } from '../lib/workspace/tenant-bootstrap';
import { createWorkloadPool } from '../lib/durable/workload-pool';
export function proofChildEnvironment(values:Readonly<Record<string,string>>){
 if(Object.keys(values).some(key=>['HOME','PATH','NODE_ENV'].includes(key)))throw Error('Reserved child environment field');
 return {PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test' as const,...values};
}
function fixture(){if(process.env.NODE_ENV!=='test')throw Error('Disposable proof context required');}
export async function proofWebInstallation(file:string){fixture();return bootstrapTenantContext(file,true,false,undefined,{kind:'owned-disposable-fixture'});}
export async function proofWorkerInstallation(file:string){
 fixture();const loaded=await readWorkloadInstallation(file),c=loaded.config;
 if(c.entries.length!==1||c.entries[0].purpose!=='worker')throw Error('Single worker publication required');
 const entry=c.entries[0];await loaded.assertStable();
 const db=await createWorkloadPool({LOOPLABS_WORKLOAD_INSTALLATION_FILE:file,LOOPLABS_DATABASE_URL:entry.url,LOOPLABS_WORKSPACE_ID:entry.org,LOOPLABS_RECOVERY_EPOCH:entry.epoch,LOOPLABS_TENANT_DATABASE_ROLE:entry.role,LOOPLABS_TENANT_DATABASE_SCHEMA:c.schema},'worker',3,undefined,{kind:'owned-disposable-fixture'});
 try{await loaded.assertStable();return db;}catch{await db.end();throw Error('Worker publication changed');}
}

/** Only the captured owned child; never a process-name/port based kill. */
export async function stopProofChild(child:ChildProcess|undefined,signal:'SIGTERM'|'SIGKILL'='SIGTERM'){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 const wait=(milliseconds:number)=>new Promise<boolean>(resolve=>{
  if(child.exitCode!==null||child.signalCode!==null){resolve(true);return;}
  const done=()=>{clearTimeout(timer);resolve(true);};
  const timer=setTimeout(()=>{child.removeListener('exit',done);resolve(false);},milliseconds);
  child.once('exit',done);
 });
 child.kill(signal);if(await wait(3000))return;
 child.kill('SIGKILL');if(!await wait(3000))throw Error('Owned proof child cleanup unverified');
}
