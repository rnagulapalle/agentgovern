import {execFileSync} from "node:child_process";
import {randomBytes,randomUUID,sign,createPrivateKey} from "node:crypto";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {parseEnv} from "node:util";
import assert from "node:assert/strict";
import {Connection} from "@temporalio/client";
import {generateTemporalConfiguration} from "./staging-temporal-config.mjs";
import {bootstrapNamespace} from "./staging-namespace-bootstrap.mjs";
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
 run(server,"--network-alias","temporal","--memory","1536m","--cpus","1","--pids-limit","256","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--security-opt","no-new-privileges","--mount",`type=bind,src=${resolve(dir,"server.yaml")},dst=/run/staging/server.yaml,readonly`,"--mount",`type=bind,src=${resolve(dir,"server-tls")},dst=/run/server-tls,readonly`,"-p","127.0.0.1::7233","--entrypoint","temporal-server","temporalio/server:1.31.0","--config-file","/run/staging/server.yaml","start");
 const address=`localhost:${docker("port",server,"7233").split(":").pop()}`;
 const options={address,loopbackProof:true};
 stage="namespace-bootstrap";await until(()=>bootstrapNamespace(dir,options));
 assert.equal((await bootstrapNamespace(dir,options)).retentionSeconds,86400);
 stage="workload-authorization";
 const env=parseEnv(await readFile(resolve(dir,"temporal-auth.env"),"utf8"));
 const tls={serverRootCACertificate:await readFile(resolve(dir,"client-tls/ca.pem")),clientCertPair:{crt:await readFile(resolve(dir,"client-tls/client.pem")),key:await readFile(resolve(dir,"client-tls/client.key"))}};
 const rpc=async(token,fn)=>{const c=await Connection.connect({address,tls,apiKey:token,connectTimeout:"2 seconds"});try{return await fn(c.workflowService);}finally{await c.close();}};
 const key=env.LOOPLABS_TEMPORAL_API_KEY;
 await rpc(key,s=>s.describeNamespace({namespace}));
 const deny=async(token,target)=>assert.rejects(rpc(token,s=>s.describeNamespace({namespace:target})),e=>[7,16].includes(e.code??e.cause?.code));
 await deny(key,"temporal-system");await deny("invalid-jwt",namespace);
 const parts=key.split("."),signature=Buffer.from(parts[2],"base64url");signature[0]^=1;await deny(`${parts[0]}.${parts[1]}.${signature.toString("base64url")}`,namespace);
 const issuer=createPrivateKey(await readFile(resolve(dir,"offline/signing.pem")));
 const signed=(permissions,exp)=>{const body=Buffer.from(JSON.stringify({sub:namespace,permissions,exp})).toString("base64url"),content=`${parts[0]}.${body}`;return `${content}.${sign("RSA-SHA256",Buffer.from(content),issuer).toString("base64url")}`;};
 await deny(signed([`${namespace}:read`],Math.floor(Date.now()/1000)-60),namespace);
 await assert.rejects(rpc(signed([`${namespace}:read`],Math.floor(Date.now()/1000)+300),s=>s.startWorkflowExecution({namespace,workflowId:"reader-must-not-start",workflowType:{name:"pinnedAcknowledgement"},taskQueue:{name:"unpolled"},requestId:randomUUID()})),e=>e.code===7);
 // Namespace configuration must survive abrupt service and persistence restarts.
 stage="crash-recovery";
 docker("kill","--signal","KILL",server);docker("kill","--signal","KILL",pg);docker("start",pg);await until(async()=>docker("exec",pg,"pg_isready","-U","temporal"));docker("start",server);
 await until(()=>bootstrapNamespace(dir,options));await rpc(key,s=>s.describeNamespace({namespace}));await deny(key,"temporal-system");
 console.log(JSON.stringify({passed:true,scope:"disposable PostgreSQL-backed staging Temporal service configuration",checks:["generated mTLS and JWKS configuration accepted","namespace creation and idempotent repeat","namespace workload accepted","other namespace, invalid, tampered and expired JWT refused","reader cannot start workflow","namespace and authorization survive service/database SIGKILL"],images:["postgres:16","temporalio/server:1.31.0","temporalio/admin-tools:1.31.0","node:22-bookworm-slim"].map(image=>({image,id:docker("image","inspect",image,"--format","{{.Id}}")})),notVerified:["complete eight-service deployment","application workflows and browser UX","remote allocated staging","sustained capacity, restore and operator alerts"]},null,2));
} catch {
 // Deliberately do not print raw Docker/SDK errors: their inputs can contain credentials.
 console.error(`Actual staging Temporal service proof failed at ${stage}; no acceptance claimed.`);process.exitCode=1;
} finally {
 for(const name of owned.reverse())try{docker("rm","-f",name);}catch{}
 if(networkCreated)try{docker("network","rm",network);}catch{}
 await rm(parent,{recursive:true,force:true});
}
