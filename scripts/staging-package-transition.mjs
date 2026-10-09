// Disposable-trial application package switch only. No database/schema/authority rollback.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const services=["web","temporal-worker","temporal-scheduler"];
const retained=["application-db","temporal-db","temporal","authorization","connector-twin"];
const imageId=/^sha256:[a-f0-9]{64}$/;
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function packageContract(value){
 assert(value&&typeof value==="object"&&!Array.isArray(value));
 assert.deepEqual(Object.keys(value).sort(),["buildId","web","worker"]);
 assert(typeof value.buildId==="string"&&/^ack-[a-f0-9]{64}$/.test(value.buildId));
 for(const role of ["web","worker"])assert(typeof value[role]==="string"&&imageId.test(value[role]));
 assert.notEqual(value.web,value.worker);
 return {...value};
}
function inspect(docker,compose,service,project){
 const id=compose("ps","-aq",service);
 assert(typeof id==="string"&&/^[a-f0-9]{64}$/.test(id),"Exactly one existing trial container required");
 const list=JSON.parse(docker("inspect",id));assert(Array.isArray(list)&&list.length===1);
 const c=list[0];
 assert(c.Id===id&&c.Config?.Labels?.["com.docker.compose.project"]===project&&c.Config?.Labels?.["com.docker.compose.service"]===service,"Container is outside the owned trial");
 assert(typeof c.Image==="string"&&imageId.test(c.Image));
 assert(typeof c.State?.Running==="boolean");
 assert(Array.isArray(c.Config.Env)&&Array.isArray(c.Mounts));
 return c;
}
function environmentEntries(entries){
 assert(Array.isArray(entries),"Explicit runtime environment entries required");
 const keys=new Set();
 for(const entry of entries){
  assert(typeof entry==="string"&&!entry.includes("\0"),"Malformed runtime environment entry");
  const separator=entry.indexOf("="),key=entry.slice(0,separator);
  assert(separator>0&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)&&!keys.has(key),"Malformed or duplicate runtime environment name");
  keys.add(key);
 }
 // Docker Compose can reorder unique environment entries during recreation.
 // Values remain exact; duplicates are refused because their ordering can matter.
 return [...entries].sort();
}
function configuration(c){
 return {env:environmentEntries(c.Config.Env),user:c.Config.User,command:c.Config.Cmd,entrypoint:c.Config.Entrypoint,healthcheck:c.Config.Healthcheck,mounts:c.Mounts,host:c.HostConfig};
}
function unchangedConfiguration(c){
 // Compare sensitive environment/configuration in memory; return only its digest.
 return hash(configuration(c));
}
export async function transitionRuntimePackage({project,environment,current,target,docker,assertPending,ready}){
 let phase="inputs";
 try{
 assert(typeof project==="string"&&/^ll-platform-[a-f0-9]{12}$/.test(project),"Explicit owned disposable project required");
 const from=packageContract(current),to=packageContract(target);
 assert.equal(from.buildId,to.buildId,"A different worker build needs independent version-compatibility acceptance");
 assert.notEqual(from.web,to.web,"Different retained web packages required");
 assert.notEqual(from.worker,to.worker,"Different retained worker packages required");
 assert(environment&&typeof environment==="object"&&!Array.isArray(environment));
 assert(Object.values(environment).every(v=>typeof v==="string"),"Explicit string runtime environment required");
 assert.equal(environment.LOOPLABS_STAGING_WEB_IMAGE,from.web);assert.equal(environment.LOOPLABS_STAGING_WORKER_IMAGE,from.worker);
 assert(typeof docker==="function"&&typeof assertPending==="function"&&typeof ready==="function");
 const original=Object.freeze({...environment});
 const next=Object.freeze({...original,LOOPLABS_STAGING_WEB_IMAGE:to.web,LOOPLABS_STAGING_WORKER_IMAGE:to.worker});
 const compose=(...args)=>docker("compose","-p",project,"-f","docker-compose.temporal-platform.yml",...args,{env:original});
 const nextCompose=(...args)=>docker("compose","-p",project,"-f","docker-compose.temporal-platform.yml",...args,{env:next});
 // Caller must first verify archive provenance/digests and cold-load both releases.
 // Recheck actual target identities and the packaged worker build before stopping anything.
 phase="target-images";
 for(const id of [to.web,to.worker])assert.equal(docker("image","inspect",id,"--format","{{.Id}}"),id,"Target image identity mismatch");
 phase="target-build";
 const build=JSON.parse(docker("run","--rm","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--memory","128m","--pids-limit","64",to.worker,"node","-e","process.stdout.write(require('fs').readFileSync('.worker/temporal-manifest.json','utf8'))"));
 assert.equal(build.buildId,to.buildId,"Target packaged worker build mismatch");
 phase="current-containers";
 const before=Object.fromEntries([...services,...retained].map(s=>[s,inspect(docker,compose,s,project)]));
 for(const c of Object.values(before))unchangedConfiguration(c);
 for(const s of services){assert(before[s].State.Running,"Current application role must be running");assert.equal(before[s].Image,s==="web"?from.web:from.worker);}
 for(const s of retained)assert(before[s].State.Running,"Retained infrastructure must be running");
 phase="pending-before-stop";await assertPending();
 // Any failure after stopping is containment, not permission to auto-start old code.
 // Do not change the caller's environment until every postcondition has passed.
 let succeeded=false;
 try{
  phase="writer-stop";compose("stop",...services);
  phase="stopped-writers";
  for(const s of services)assert.equal(inspect(docker,compose,s,project).State.Running,false,"All writers must actually stop before package replacement");
  phase="pending-after-stop";await assertPending();
  phase="replacement-start";nextCompose("up","-d","--no-deps","--force-recreate",...services);
  phase="replacement-readiness";await ready(nextCompose,services);
  for(const s of services){
   phase="replacement-identity";
   const after=inspect(docker,nextCompose,s,project);
   assert(after.State.Running&&after.State.Health?.Status==="healthy","Replacement must actually be healthy");
   assert.notEqual(after.Id,before[s].Id,"Application container was not replaced");
   assert.equal(after.Image,s==="web"?to.web:to.worker,"Replacement used an unexpected image");
   phase="application-configuration";
   if(unchangedConfiguration(after)!==unchangedConfiguration(before[s])){
    const old=configuration(before[s]),replacement=configuration(after);
    for(const key of ["env","user","command","entrypoint","healthcheck","mounts","host"]){
     if(hash([old[key]])!==hash([replacement[key]])){phase=`application-${key}`;break;}
    }
   }
   assert(unchangedConfiguration(after)===unchangedConfiguration(before[s]),"Runtime authority, mounts or hardening changed during package replacement");
  }
  phase="retained-infrastructure";
  for(const s of retained){const after=inspect(docker,nextCompose,s,project);assert(after.State.Running&&after.Id===before[s].Id&&after.Image===before[s].Image&&unchangedConfiguration(after)===unchangedConfiguration(before[s]),"Database, provider or orchestration service changed during package replacement");}
  phase="pending-after-replacement";await assertPending();succeeded=true;
 }finally{
  if(!succeeded){
   const failedPhase=phase;
   // An RPC/health/evidence failure is not success. Attempt writer containment;
   // failed containment propagates too. Never restore a database or approvals.
   phase="containment-stop";nextCompose("stop",...services);
   phase="containment-verification";
   for(const s of services)assert.equal(inspect(docker,nextCompose,s,project).State.Running,false,"Failed package transition could not contain application writers");
   phase=failedPhase;
  }
 }
 return {environment:next,evidence:{buildId:to.buildId,from:{web:from.web,worker:from.worker},to:{web:to.web,worker:to.worker},replacedRoles:3,retainedRoles:5,pendingAuthorityChecks:3}};
 }catch(error){
  console.error(`Package transition refused at ${phase}; no raw configuration or output printed.`);
  throw error;
 }
}
