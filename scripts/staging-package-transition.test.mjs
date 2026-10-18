import {test,expect,vi,beforeEach,afterEach} from "vitest";
import {transitionRuntimePackage} from "./staging-package-transition.mjs";
const id=n=>`sha256:${String(n).repeat(64)}`;
const buildId=`ack-${"a".repeat(64)}`;
const current={buildId,web:id(1),worker:id(2)},target={buildId,web:id(3),worker:id(4)};
const project="ll-platform-aabbccddeeff";
const services=["web","temporal-worker","temporal-scheduler"],retained=["application-db","temporal-db","temporal","authorization","connector-twin"];
let diagnostic;
beforeEach(()=>{diagnostic=vi.spyOn(console,"error").mockImplementation(()=>{});});
afterEach(()=>{diagnostic.mockRestore();});
function fixture(){
 const calls=[],containers={};let serial=0,pendingChecks=0;
 function container(service,image){return {Id:(++serial).toString(16).padStart(64,"0"),Image:image,Config:{Labels:{"com.docker.compose.project":project,"com.docker.compose.service":service},Env:["PRIVATE_AUTHORITY=not-for-output"],User:"node",Cmd:["unchanged"],Entrypoint:["node"],Healthcheck:{Test:["ready"]}},Mounts:[{Source:"owned-data",Destination:"/state",RW:true}],HostConfig:{Memory:512*1024**2,ReadonlyRootfs:true},State:{Running:true,Health:{Status:"healthy"}}};}
 for(const s of [...services,...retained])containers[s]=container(s,s==="web"?current.web:services.includes(s)?current.worker:id(5));
 const environment={LOOPLABS_STAGING_WEB_IMAGE:current.web,LOOPLABS_STAGING_WORKER_IMAGE:current.worker,LOOPLABS_STAGING_PRIVATE_DIR:"/owned/private",OTHER:"unchanged"};
 const docker=(...args)=>{
  calls.push(args);
  if(args[0]==="image")return args[2];
  if(args[0]==="run")return JSON.stringify({buildId});
  if(args[0]==="inspect")return JSON.stringify(Object.values(containers).filter(c=>c.Id===args[1]));
  const command=args[5],options=args.at(-1);
  if(command==="ps")return containers[args[7]]?.Id??"";
  if(command==="stop")for(const s of args.slice(6,-1))containers[s].State.Running=false;
  if(command==="up")for(const s of args.slice(9,-1))containers[s]=container(s,s==="web"?options.env.LOOPLABS_STAGING_WEB_IMAGE:options.env.LOOPLABS_STAGING_WORKER_IMAGE);
  return "";
 };
 const assertPending=async()=>{pendingChecks++;};
 const ready=async(compose,actual)=>{expect(actual).toEqual(services);expect(typeof compose).toBe("function");};
 return {calls,containers,environment,docker,assertPending,ready,checks:()=>pendingChecks};
}
function input(f){return {project,current,target,...f};}
test("switches exact application packages and reverses them while retaining state/configuration and checking pending authority",async()=>{
 const f=fixture(),original=structuredClone(f.environment),before=Object.fromEntries(retained.map(s=>[s,structuredClone(f.containers[s])]));
 const promoted=await transitionRuntimePackage(input(f));
 expect(f.environment).toEqual(original);expect(promoted.environment.OTHER).toBe("unchanged");expect(f.checks()).toBe(3);
 expect(promoted.evidence).toEqual({buildId,from:{web:current.web,worker:current.worker},to:{web:target.web,worker:target.worker},replacedRoles:3,retainedRoles:5,pendingAuthorityChecks:3});
 const reverted=await transitionRuntimePackage({...input(f),environment:promoted.environment,current:target,target:current});
 expect(reverted.environment).toEqual(original);expect(f.checks()).toBe(6);
 for(const s of retained)expect(f.containers[s]).toEqual(before[s]);
 const changes=f.calls.filter(a=>a[0]==="compose"&&["up","stop"].includes(a[5]));
 expect(changes).toHaveLength(4);for(const a of changes)expect(a.slice(a[5]==="up"?9:6,-1)).toEqual(services);
 expect(f.calls.flat().filter(x=>typeof x==="string")).not.toContain("down");
 expect(f.calls.flat().filter(x=>typeof x==="string")).not.toContain("volume");
});
test("malformed packages, stale current selection, no-op replay, foreign project and different build refuse before Docker",async()=>{
 for(const change of [{project:"production"},{target:{...target,buildId:`ack-${"b".repeat(64)}`}},{target:current},{target:{...target,web:[target.web]}},{target:{...target,secret:"private"}},{current:{...current,worker:"latest"}},{environment:{}},{target:null}]){
  const f=fixture();await expect(transitionRuntimePackage({...input(f),...change})).rejects.toThrow();expect(f.calls).toEqual([]);
 }
});
test("wrong loaded identity or packaged build never stops the existing deployment",async()=>{
 for(const failure of ["identity","build"]){const f=fixture(),docker=(...args)=>args[0]===(failure==="identity"?"image":"run")?(failure==="identity"?id(9):JSON.stringify({buildId:`ack-${"b".repeat(64)}`})):f.docker(...args);await expect(transitionRuntimePackage({...input(f),docker})).rejects.toThrow();expect(f.calls.some(a=>a[5]==="stop")).toBe(false);}
});
test("existing foreign, wrong-image, missing or stopped containers refuse before replacement",async()=>{
 for(const change of [f=>{f.containers.web.Config.Labels["com.docker.compose.project"]="shared";},f=>{f.containers.web.Image=id(9);},f=>{delete f.containers.web;},f=>{f.containers.temporal.State.Running=false;}]){const f=fixture();change(f);await expect(transitionRuntimePackage(input(f))).rejects.toThrow();expect(f.calls.some(a=>["stop","up"].includes(a[5]))).toBe(false);}
});
test("failed stop cannot admit new packages; health, retained-state or authority drift contains all writers",async()=>{
 for(const failure of ["stop","health","retained","env","mount","pending","up"]){
  const f=fixture();let stopCount=0;
  const docker=(...args)=>{if(args[0]==="compose"&&args[5]==="stop"&&++stopCount===1&&failure==="stop")return "";if(args[0]==="compose"&&args[5]==="up"&&failure==="up")throw Error("replacement refused");return f.docker(...args);};
  const ready=async()=>{if(failure==="health")f.containers.web.State.Health.Status="unhealthy";if(failure==="retained")f.containers["application-db"].Id="f".repeat(64);if(failure==="env")f.containers.web.Config.Env=["PRIVATE_AUTHORITY=changed"];if(failure==="mount")f.containers.web.Mounts=[];};
  let checks=0;const assertPending=async()=>{if(++checks===3&&failure==="pending")throw Error("pending work advanced");};
  await expect(transitionRuntimePackage({...input(f),docker,ready,assertPending})).rejects.toThrow();
  for(const s of services)expect(f.containers[s].State.Running).toBe(false);
  expect(f.environment.LOOPLABS_STAGING_WEB_IMAGE).toBe(current.web);
  if(failure==="stop")expect(f.calls.some(a=>a[5]==="up")).toBe(false);
  // Containment does not issue approvals, restore data or automatically retry old code.
  expect(f.calls.filter(a=>a[5]==="up").length).toBeLessThanOrEqual(1);
 }
});
test("failed containment is a failure, not a rollback success",async()=>{
 const f=fixture();const docker=(...args)=>{if(args[0]==="compose"&&args[5]==="stop")return "";return f.docker(...args);};
 await expect(transitionRuntimePackage({...input(f),docker})).rejects.toThrow("could not contain");
 expect(diagnostic.mock.calls).toEqual([["Package transition refused at containment-verification; no raw configuration or output printed."]]);
});
test("sanitized checkpoints retain the original failure after successful containment without exposing Docker errors",async()=>{
 const f=fixture(),docker=(...args)=>{if(args[0]==="compose"&&args[5]==="up")throw Error("PRIVATE_AUTHORITY=secret provider payload");return f.docker(...args);};
 await expect(transitionRuntimePackage({...input(f),docker})).rejects.toThrow();
 expect(diagnostic.mock.calls).toEqual([["Package transition refused at replacement-start; no raw configuration or output printed."]]);
 for(const s of services)expect(f.containers[s].State.Running).toBe(false);
});
test("identical unique environment entries may reorder but exact authority values remain bound",async()=>{
 const f=fixture();
 for(const c of Object.values(f.containers))c.Config.Env.push("BOUNDARY=unchanged");
 const ready=async()=>{for(const s of services)f.containers[s].Config.Env=["BOUNDARY=unchanged","PRIVATE_AUTHORITY=not-for-output"];};
 const result=await transitionRuntimePackage({...input(f),ready});
 expect(result.evidence.pendingAuthorityChecks).toBe(3);
 const changed=fixture();await expect(transitionRuntimePackage({...input(changed),ready:async()=>{changed.containers.web.Config.Env=["PRIVATE_AUTHORITY=changed"];}})).rejects.toThrow("Runtime authority");
 for(const s of services)expect(changed.containers[s].State.Running).toBe(false);
});
test("malformed or duplicate environment names refuse before stopping and after replacement",async()=>{
 for(const entries of [["NAME=one","NAME=one"],["NAME=one","NAME=two"],["missing-equals"],["=value"],["INVALID-NAME=value"],["NAME=with\0null"],[null]]){
  const before=fixture();before.containers.web.Config.Env=entries;
  await expect(transitionRuntimePackage(input(before))).rejects.toThrow();
  expect(before.calls.some(a=>a[5]==="stop"||a[5]==="up")).toBe(false);
  const after=fixture();await expect(transitionRuntimePackage({...input(after),ready:async()=>{after.containers.web.Config.Env=entries;}})).rejects.toThrow();
  for(const s of services)expect(after.containers[s].State.Running).toBe(false);
 }
});
test("mount enumeration may reorder for replacement and retained containers without changing any attributes",async()=>{
 const f=fixture(),extra={Source:"owned-second",Destination:"/second",RW:false,Type:"bind"};
 for(const c of Object.values(f.containers))c.Mounts.push(extra);
 const ready=async()=>{
  for(const s of services)f.containers[s].Mounts.push(extra);
  for(const c of Object.values(f.containers))c.Mounts.reverse();
 };
 const result=await transitionRuntimePackage({...input(f),ready});
 expect(result.evidence.retainedRoles).toBe(5);expect(f.checks()).toBe(3);
});
test("changed mount attributes and retained running/identity/configuration drift still contain writers with fixed diagnostics",async()=>{
 for(const [service,key,value,checkpoint] of [["web","Source","different-source","application-mounts"],["web","RW",false,"application-mounts"],["web","Type","volume","application-mounts"],["web","extra","changed","application-mounts"],["application-db","Source","different-source","retained-mounts"]]){
  diagnostic.mockClear();const f=fixture();await expect(transitionRuntimePackage({...input(f),ready:async()=>{f.containers[service].Mounts[0][key]=value;}})).rejects.toThrow();
  for(const s of services)expect(f.containers[s].State.Running).toBe(false);
  expect(diagnostic.mock.calls).toEqual([[`Package transition refused at ${checkpoint}; no raw configuration or output printed.`]]);
 }
 for(const [change,checkpoint] of [[f=>{f.containers.temporal.State.Running=false;},"retained-running"],[f=>{f.containers.temporal.Image=id(9);},"retained-identity"]]){
  diagnostic.mockClear();const f=fixture();await expect(transitionRuntimePackage({...input(f),ready:async()=>change(f)})).rejects.toThrow();
  expect(diagnostic.mock.calls).toEqual([[`Package transition refused at ${checkpoint}; no raw configuration or output printed.`]]);
 }
});
test("malformed, aliased or duplicate mount destinations refuse before replacement and after replacement",async()=>{
 for(const mounts of [[null],[[]],[{Destination:"relative"}],[{Destination:"/state/../state"}],[{Destination:"/state/"}],[{Destination:"/state\0"}],[{Destination:"/state"},{Destination:"/state"}]]){
  const before=fixture();before.containers.web.Mounts=mounts;
  await expect(transitionRuntimePackage(input(before))).rejects.toThrow();expect(before.calls.some(a=>a[5]==="stop"||a[5]==="up")).toBe(false);
  const after=fixture();await expect(transitionRuntimePackage({...input(after),ready:async()=>{after.containers.web.Mounts=mounts;}})).rejects.toThrow();
  for(const s of services)expect(after.containers[s].State.Running).toBe(false);
 }
});
