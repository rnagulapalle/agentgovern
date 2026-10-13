// Proof-only detached child lease. No process command lines/output are retained.
import {execFile,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const leases=new WeakMap<ChildProcess,{pid:number;start:string}>();
async function leader(pid:number){
 try{const {stdout}=await exec('ps',['-o','pid=,pgid=,lstart=','-p',String(pid)],{timeout:1000,maxBuffer:16384,env:{PATH:process.env.PATH,NODE_ENV:process.env.NODE_ENV,LC_ALL:"C"}});
  const match=stdout.trim().match(/^(\d+)\s+(\d+)\s+([A-Z][a-z]{2} [A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4})$/);
  if(!match||Number(match[1])!==pid||Number(match[2])!==pid)throw Error('Owned detached group identity refused');return match[3];
 }catch(error){if((error as {code?:number}).code===1)return null;throw Error('Owned detached group identity unavailable');}
}
function present(pid:number){try{process.kill(-pid,0);return true;}catch(error){if((error as {code?:string}).code==='ESRCH')return false;throw Error('Owned detached group presence unavailable');}}
export async function captureOwnedChatGroup(child:ChildProcess){
 // Consume bounded chunks without printing or retaining potentially secret logs.
 child.stdout?.on('data',()=>{});child.stderr?.on('data',()=>{});
 if(!child.pid||child.exitCode!==null||child.signalCode!==null||leases.has(child))throw Error('Live owned child required');
 const start=await leader(child.pid);if(!start)throw Error('Live owned group leader required');leases.set(child,{pid:child.pid,start});
}
export function assertOwnedGroupGeneration(current:string|null,captured:string,terminal:boolean){
 // ps lstart has seconds resolution. Any leader occupying a terminal child's
 // PID is a different process, even when that timestamp happens to match.
 if(current!==null&&(terminal||current!==captured))throw Error('Owned group generation changed; signaling refused');
}
export async function stopOwnedChatGroup(child:ChildProcess|undefined){
 if(!child)return;const lease=leases.get(child);if(!lease)throw Error('Owned group lease required; destructive cleanup refused');
 // A detached group may survive its original leader. Never signal a reused
 // leader PID; a still-existing leader must have exactly its captured birth.
 const current=await leader(lease.pid);assertOwnedGroupGeneration(current,lease.start,child.exitCode!==null||child.signalCode!==null);
 if(present(lease.pid)){try{process.kill(-lease.pid,'SIGKILL');}catch(error){if((error as {code?:string}).code!=='ESRCH')throw Error('Owned group shutdown refused');}}
 for(let i=0;i<100;i++){if(!present(lease.pid)&&(child.exitCode!==null||child.signalCode!==null))return;await pause(50);}
 throw Error('Owned group absence unconfirmed; destructive cleanup refused');
}
