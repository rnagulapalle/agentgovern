import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {parseEnv} from "node:util";
import assert from "node:assert/strict";
import {generateTemporalConfiguration} from "./staging-temporal-config.mjs";
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const parent=await mkdtemp(resolve(tmpdir(),"ll-stage-service-")),dir=resolve(parent,"installation");
const prefix=`ll-stage-${randomBytes(6).toString("hex")}`,network=prefix,pg=`${prefix}-db`,auth=`${prefix}-auth`,server=`${prefix}-server`;
const owned=[];let networkCreated=false,stage="capacity";
const namespace="looplabs-staging-service-proof";
const until=async(fn)=>{for(let i=0;i<90;i++){try{return await fn();}catch{if(i===89)throw Error("Isolated service did not reach the required state");await sleep(1000);}}};
try {
 const total=Number(docker("info","--format","{{.MemTotal}}"));
 assert(total>=5*1024**3,"Use a disposable host with at least 5 GiB Docker memory; do not resize shared services");
 stage="credential-generation";await generateTemporalConfiguration(dir,namespace);
 docker("network","create","--internal",network);networkCreated=true;
 const run=(name,...args)=>{docker("run","-d","--name",name,"--network",network,...args);owned.push(name);};
 run(pg,"--network-alias","temporal-db","--memory","512m","--cpus","0.5","--pids-limit","256","--env-file",resolve(dir,"temporal-db.env"),"postgres:16");
 await until(async()=>docker("exec",pg,"pg_isready","-U","temporal"));
 stage="persistence-schema";
 for(const [database,kind] of [["temporal","temporal"],["temporal_visibility","visibility"]]) {
  const base=["run","--rm","--network",network,"--memory","256m","--env-file",resolve(dir,"offline/schema.env"),"--entrypoint","temporal-sql-tool","temporalio/admin-tools:1.31.0","--plugin","postgres12","--ep","temporal-db","-u","temporal","-p","5432","--db",database];
  docker(...base,"create");docker(...base,"setup-schema","-v","0.0");docker(...base,"update-schema","-d",`/etc/temporal/schema/postgresql/v12/${kind}/versioned`);
 }
 stage="authorization-service";
 run(auth,"--network-alias","authorization","--memory","128m","--cpus","0.1","--pids-limit","256","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--user","node","--mount",`type=bind,src=${resolve("scripts/staging-authorization.mjs")},dst=/run/staging/authorization.mjs,readonly`,"--mount",`type=bind,src=${resolve(dir,"jwks.json")},dst=/run/staging/jwks.json,readonly`,"node:22-bookworm-slim","node","/run/staging/authorization.mjs");
 stage="temporal-service";
 run(server,"--network-alias","temporal","--env","TEMPORAL_SERVICES=frontend,matching,history,worker,internal-frontend","--memory","1536m","--cpus","1","--pids-limit","256","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--security-opt","no-new-privileges","--mount",`type=bind,src=${resolve(dir,"server.yaml")},dst=/run/staging/server.yaml,readonly`,"--mount",`type=bind,src=${resolve(dir,"server-tls")},dst=/run/server-tls,readonly`,"--entrypoint","temporal-server","temporalio/server:1.31.0","--config-file","/run/staging/server.yaml","start");
 stage="namespace-and-authorization";
 const verify=()=>{const controller=`${prefix}-controller-${randomBytes(4).toString("hex")}`;owned.push(controller);return docker("run","--rm","--name",controller,"--user",`${process.getuid()}:${process.getgid()}`,"--network",network,"--memory","256m","--cpus","0.5","--pids-limit","256","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--mount",`type=bind,src=${resolve("scripts")},dst=/app/scripts,readonly`,"--mount",`type=bind,src=${resolve("node_modules")},dst=/app/node_modules,readonly`,"--mount",`type=bind,src=${dir},dst=/run/installation`,"node:22-bookworm-slim","node","/app/scripts/staging-temporal-service-controller.mjs");};
 assert.equal(JSON.parse(verify()).passed,true);
 // Namespace configuration must survive abrupt service and persistence restarts.
 stage="crash-recovery";
 docker("kill","--signal","KILL",server);docker("kill","--signal","KILL",pg);docker("start",pg);await until(async()=>docker("exec",pg,"pg_isready","-U","temporal"));docker("start",server);
 assert.equal(JSON.parse(verify()).passed,true);
 console.log(JSON.stringify({passed:true,scope:"disposable PostgreSQL-backed staging Temporal service configuration",checks:["generated mTLS and JWKS configuration accepted","namespace creation and idempotent repeat","namespace workload accepted","other namespace, invalid, tampered and expired JWT refused","reader cannot start workflow","namespace and authorization survive service/database SIGKILL"],images:["postgres:16","temporalio/server:1.31.0","temporalio/admin-tools:1.31.0","node:22-bookworm-slim"].map(image=>({image,id:docker("image","inspect",image,"--format","{{.Id}}")})),notVerified:["complete eight-service deployment","application workflows and browser UX","remote allocated staging","sustained capacity, restore and operator alerts"]},null,2));
} catch(error) {
 // Print only daemon diagnostic lines, never command strings, SDK errors or service logs.
 console.error(`Failure category: ${Number.isInteger(error.status)?"docker-exit-"+error.status:"assertion-or-rpc"}`);
 for(const line of String(error.stdout??"").split("\n")) {
  try {const d=JSON.parse(line);if(d.diagnostic==="bootstrap-refusal")console.error(JSON.stringify({diagnostic:d.diagnostic,code:d.code,hint:d.hint}));if(d.diagnostic==="namespace-contract")console.error(JSON.stringify({diagnostic:d.diagnostic,state:d.state,retentionSeconds:d.retentionSeconds}));}catch{}
 }
 const daemon=String(error.stderr??"").split("\n").filter(line=>/^docker: Error response from daemon:|^Error response from daemon:/.test(line));
 for(const line of daemon)console.error(line.slice(0,500));
 if(["namespace-and-authorization","crash-recovery"].includes(stage)) {
  try {
   const privateValues=[...Object.values(parseEnv(await readFile(resolve(dir,"temporal-db.env"),"utf8"))),JSON.parse(await readFile(resolve(dir,"offline/administrator.json"),"utf8")).token].filter(value=>value.length>=16);
   for(const line of docker("logs",server).split("\n").slice(-30)) {
    let entry;try{entry=JSON.parse(line);}catch{continue;}
    if(!["error","fatal"].includes(entry.level))continue;
    let message=JSON.stringify({level:entry.level,msg:entry.msg,error:entry.error});
    for(const secret of privateValues)message=message.replaceAll(secret,"[redacted]");
    if(!/BEGIN |PRIVATE KEY|eyJ[a-zA-Z0-9_-]+\./.test(message))console.error(message.slice(0,1000));
   }
  }catch{}
 }
 // Deliberately do not print raw Docker/SDK errors: their inputs can contain credentials.
 console.error(`Actual staging Temporal service proof failed at ${stage}; no acceptance claimed.`);process.exitCode=1;
} finally {
 for(const name of owned.reverse())try{docker("rm","-f","-v",name);}catch{}
 if(networkCreated)try{docker("network","rm",network);}catch{}
 await rm(parent,{recursive:true,force:true});
}
