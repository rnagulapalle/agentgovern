// Read-only route availability check. Never supplies credentials or execution authority.
import {fileURLToPath} from 'node:url';
export const demoScriptRoutes=Object.freeze([
 ['/','diagram'],['/sign-in','named sign-in'],['/control-plane/agents','onboarding'],
 ['/control-plane/actions','pricing and lost response'],['/control-plane/workflow-runs','dependent workflow'],
 ['/control-plane/history','saved history'],['/control-plane/actions','connector containment'],
]);
export function checkedDemoOrigin(value){
 const u=new URL(value);
 if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||
 !(u.origin==='https://looplabs.run'||u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port))throw Error('Use the canonical production origin or an owned loopback test server.');
 return u.origin;
}
export async function demoScriptPreflight(value){
 const origin=checkedDemoOrigin(value),observations=[];
 for(const [path,beat]of demoScriptRoutes){
  try{const r=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(10000)});
   observations.push({path,beat,status:r.status,routeAvailable:r.status===200});await r.body?.cancel();
  }catch{observations.push({path,beat,status:null,routeAvailable:false});}
 }
 return {scope:'anonymous surface availability only; not authenticated workflow acceptance',observations,
  surfaceRoutesAvailable:observations.every(r=>r.routeAvailable),authenticatedWorkflowAccepted:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=await demoScriptPreflight(process.argv[2]??'https://looplabs.run');
 console.log(JSON.stringify(result,null,2));process.exitCode=result.surfaceRoutesAvailable?0:2;
}
