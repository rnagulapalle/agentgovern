import {once} from 'node:events';
import type {ChildProcess} from 'node:child_process';
export async function awaitOwnedProcessExit(child:ChildProcess,timeoutMs=30000){
 if(child.exitCode!==null||child.signalCode!==null)return;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([once(child,'exit'),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned process termination unconfirmed')),timeoutMs);})]);}
 finally{clearTimeout(timer);}
 if(child.exitCode===null&&child.signalCode===null)throw Error('Owned process termination unconfirmed');
}
export async function stopOwnedProcess(child:ChildProcess){
 if(child.exitCode!==null||child.signalCode!==null)return;
 child.kill('SIGTERM');try{await awaitOwnedProcessExit(child,20000);}catch{child.kill('SIGKILL');await awaitOwnedProcessExit(child,5000);}
}
// Caller owns exact resource handles. Any uncertain stage withholds destructive database cleanup.
export async function quiesceOwnedProof(input:{stopContainers:()=>Promise<void>;children:ChildProcess[];stopProviders:()=>Promise<void>;closePools:()=>Promise<void>}){
 const failures:string[]=[];
 try{await input.stopContainers();}catch{failures.push('owned-containers-unconfirmed');}
 for(const child of input.children)try{await stopOwnedProcess(child);}catch{failures.push('owned-child-unconfirmed');}
 try{await input.stopProviders();}catch{failures.push('owned-provider-unconfirmed');}
 try{await input.closePools();}catch{failures.push('owned-pool-unconfirmed');}
 if(failures.length)throw Error([...new Set(failures)].join(','));
}
