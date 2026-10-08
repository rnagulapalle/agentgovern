// One disposable eight-service trial; never uses or deploys a production project.
import {execFileSync,spawn,spawnSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {mkdtemp,mkdir,writeFile,readFile,cp,access,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {generateTemporalConfiguration} from "./staging-temporal-config.mjs";
import {assembleRuntimeInputs} from "./staging-runtime-inputs.mjs";
import {stagingHostAdmission} from "../runtime/temporal/staging-host.ts";
import {safeTrialFailure,safeProviderFailure} from "./staging-trial-failure.mjs";
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:600000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const backend=process.env.FETCHSANDBOX_BACKEND_PATH;
assert(process.env.LOOPLABS_STAGING_PLATFORM_PROOF==="isolated"&&backend,"Explicit disposable trial and prepared private source required");
assert(process.platform==="linux","Run on a fresh allocated Linux runner; do not resize shared workloads");
const source=JSON.parse(await readFile(resolve(backend,"../fixture-source-manifest.json"),"utf8"));
assert.equal(source.version,1);assert(/^[a-f0-9]{40}$/.test(source.commit));
const parent=await mkdtemp(resolve(tmpdir(),"ll-platform-")),privateDir=resolve(parent,"runtime"),trial=resolve(parent,"trial"),seed=resolve(parent,"seed"),application=resolve(parent,"application");
const project=`ll-platform-${randomBytes(6).toString("hex")}`,images={web:`${project}:web`,worker:`${project}:worker`,twin:`${project}:twin`,provisioner:`${project}:provisioner`};
const env={...process.env,LOOPLABS_STAGING_PRIVATE_DIR:privateDir,LOOPLABS_STAGING_WEB_PORT:"3199",LOOPLABS_STAGING_WEB_IMAGE:images.web,LOOPLABS_STAGING_WORKER_IMAGE:images.worker,LOOPLABS_STAGING_TWIN_IMAGE:images.twin};
const compose=(...args)=>execFileSync("docker",["compose","-p",project,"-f","docker-compose.temporal-platform.yml",...args],{env,encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
const uid=`${process.getuid()}:${process.getgid()}`,owned=[],built=[];let stage="prepare",controller,controllerExit=null;
async function until(fn,label,seconds=120){for(const end=Date.now()+seconds*1000;Date.now()<end;){if(await fn())return;await wait(500);}throw Error(label);}
const container=service=>compose("ps","-aq",service);
const ready=async services=>until(()=>services.every(s=>{const id=container(s);return id&&docker("inspect","--format","{{.State.Health.Status}}",id)==="healthy";}),"Runtime health unavailable",180);
function runController(name,network,image,args,mounts,files=[]){owned.push(name);return docker("run","--rm","--name",name,"--network",network,"--user",uid,"--memory","512m","--cpus","0.5","--pids-limit","256","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--security-opt","no-new-privileges",...files.flatMap(path=>["--env-file",path]),...mounts.flatMap(m=>["--mount",m]),image,...args);}
try{
 await generateTemporalConfiguration(privateDir,`looplabs-staging-${randomBytes(5).toString("hex")}`);
 for(const path of [trial,seed,application])await mkdir(path,{mode:0o700});
 const password=randomBytes(32).toString("base64url"),token=randomBytes(32).toString("base64url");
 await writeFile(resolve(privateDir,"application-db.env"),`POSTGRES_USER=ll_stage_owner\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=looplabs_staging\n`,{mode:0o600});
 await writeFile(resolve(parent,"owner.env"),`LOOPLABS_STAGING_BOOTSTRAP=isolated\nLOOPLABS_STAGING_OWNER_URL=postgresql://ll_stage_owner:${password}@application-db:5432/looplabs_staging\n`,{mode:0o600});
 await writeFile(resolve(parent,"namespace.env"),"LOOPLABS_STAGING_BOOTSTRAP=isolated\n",{mode:0o600});
 for(const role of ["web","worker"])await writeFile(resolve(privateDir,`${role}.env`),"",{mode:0o600});
 const records=[{version:"record-scope-1",workspaceId:"local-proof",contactId:"2001",recipient:"customer@example.test"}];
 for(const [file,value] of [["credentials",{token}],["records",{records}],["faults",{loseResponseRecords:["2001"]}]])await writeFile(resolve(seed,`connector-twin-${file}.json`),JSON.stringify(value),{mode:0o600});
 stage="images";
 for(const [role,file] of [["web","Dockerfile"],["worker","Dockerfile.temporal"],["twin","Dockerfile.connector-twin"],["provisioner","Dockerfile.staging-provisioner"]]){docker("build","-f",file,...(role==="twin"?["--build-context",`fetchsandbox=${backend}`]:[]),"-t",images[role],".");built.push(images[role]);}
 const build=JSON.parse(docker("run","--rm","--network","none",images.worker,"node","-e","process.stdout.write(require('fs').readFileSync('.worker/temporal-manifest.json','utf8'))"));
 stage="host-admission";
 const topology=JSON.parse(compose("config","--format","json"));
 const roles={web:"web","application-db":"application-database","temporal-db":"temporal-database",temporal:"temporal-service","temporal-worker":"worker","temporal-scheduler":"scheduler","connector-twin":"provider-twin",authorization:"authorization"};
 assert.equal(Object.keys(topology.services).length,8);
 const inventory=JSON.parse(execFileSync("python3",["scripts/staging-host-inventory.py"],{encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}));
 const admission=stagingHostAdmission(inventory,{hostReserveBytes:1024**3,services:Object.entries(roles).map(([name,role])=>({role,memoryBytes:Number(topology.services[name].mem_limit)}))});
 assert.equal(admission.admitted,true,"Fresh host must admit all eight bounded roles without changing existing workloads");
 stage="databases";compose("up","-d","application-db","temporal-db");await ready(["application-db","temporal-db"]);
 stage="application-bootstrap";
 runController(`${project}-bootstrap`,`${project}_application`,images.provisioner,["node","--import","tsx","scripts/staging-database-bootstrap.mjs","/run/private/database"],[`type=bind,src=${application},dst=/run/private`],[resolve(parent,"owner.env")]);
 const database=resolve(application,"database");
 const assembly=resolve(parent,"assembled");await writeFile(resolve(parent,"settings.json"),JSON.stringify({origin:"https://looplabs-staging.example.test",buildId:build.buildId,taskQueue:`${project}-ack`,records,connectorToken:token}),{mode:0o600});
 await assembleRuntimeInputs(database,privateDir,resolve(parent,"settings.json"),assembly);
 for(const role of ["web","worker"])await cp(resolve(assembly,`${role}.env`),resolve(privateDir,`${role}.env`));
 stage="temporal-schemas";
 for(const [name,kind] of [["temporal","temporal"],["temporal_visibility","visibility"]]){
  const args=["run","--rm","--network",`${project}_orchestration`,"--memory","256m","--env-file",resolve(privateDir,"offline/schema.env"),"--entrypoint","temporal-sql-tool","temporalio/admin-tools:1.31.0","--plugin","postgres12","--ep","temporal-db","-u","temporal","-p","5432","--db",name];
  docker(...args,"create");docker(...args,"setup-schema","-v","0.0");docker(...args,"update-schema","-d",`/etc/temporal/schema/postgresql/v12/${kind}/versioned`);
 }
 stage="provider-seed";compose("create","connector-twin");
 const seedCode="from pathlib import Path; import os,shutil; d=Path('/state'); os.chown(d,1000,1000); os.chmod(d,0o700); [(shutil.copyfile(f,d/f.name),os.chown(d/f.name,1000,1000),os.chmod(d/f.name,0o600)) for f in Path('/seed').glob('*.json')]";
 docker("run","--rm","--network","none","--read-only","--user","0","--memory","128m","--cap-drop","ALL","--cap-add","CHOWN","--cap-add","DAC_OVERRIDE","--cap-add","FOWNER","--mount",`type=volume,src=${project}_provider-data,dst=/state`,"--mount",`type=bind,src=${seed},dst=/seed,readonly`,"--entrypoint","python",images.twin,"-c",seedCode);
 stage="secure-service";compose("up","-d","authorization","temporal");await ready(["authorization"]);
 const namespaceDir=resolve(parent,"namespace");await mkdir(namespaceDir,{mode:0o700});await mkdir(resolve(namespaceDir,"offline"),{mode:0o700});
 for(const file of ["temporal-installation.json","offline/administrator.json"])await cp(resolve(privateDir,file),resolve(namespaceDir,file));
 await cp(resolve(privateDir,"client-tls"),resolve(namespaceDir,"client-tls"),{recursive:true});
 const mounts=[`type=bind,src=${resolve("scripts")},dst=/app/scripts,readonly`,`type=bind,src=${namespaceDir},dst=/run/installation`];
 await until(()=>{try{runController(`${project}-namespace`,`${project}_orchestration`,images.worker,["node","scripts/staging-namespace-bootstrap.mjs","/run/installation"],mounts,[resolve(parent,"namespace.env")]);return true;}catch{return false;}},"Authenticated namespace unavailable");
 stage="eight-service-start";compose("up","-d");await ready(["web","temporal-worker","temporal-scheduler"]);
 const inspection=JSON.parse(docker("inspect",...Object.keys(roles).map(container)));
 assert.equal(inspection.length,8);for(const c of inspection){assert(c.HostConfig.Memory>0&&c.HostConfig.PidsLimit>0);if(!c.Name.endsWith("-web-1"))assert.equal(Object.keys(c.HostConfig.PortBindings||{}).length,0);}
 stage="api-execution";
 await cp(resolve(database,".local/workspace-accounts.json"),resolve(trial,"accounts.json"));await cp(resolve(privateDir,"worker.env"),resolve(trial,"worker.env"));await cp(resolve(privateDir,"client-tls"),resolve(trial,"tls"),{recursive:true});
 const controlName=`${project}-trial`;owned.push(controlName);
 controller=spawn("docker",["run","--rm","--name",controlName,"--network",`${project}_application`,"--user",uid,"--memory","512m","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--mount",`type=bind,src=${trial},dst=/run/trial`,"--mount",`type=bind,src=${resolve("scripts/staging-platform-controller.mjs")},dst=/app/controller.mjs,readonly`,images.worker,"node","controller.mjs"],{stdio:["ignore","pipe","pipe"]});
 let output="";controller.stdout.on("data",b=>{output+=b.toString();});controller.stderr.resume();controller.on("exit",code=>{controllerExit=code??127;});controller.on("error",()=>{controllerExit=127;});
 // Connect the one verification controller to both private runtime networks.
 await until(()=>{try{docker("network","connect",`${project}_orchestration`,controlName);return true;}catch{return false;}},"Trial controller unavailable",15);
 const checkpoint=async file=>until(async()=>{if(controllerExit!==null)throw Error("Trial controller exited");try{await access(resolve(trial,file));return true;}catch{return false;}},"Trial checkpoint unavailable",240);
 await checkpoint("held.json");
 stage="runtime-crash";compose("kill","-s","SIGKILL","web","temporal-worker","temporal-scheduler","connector-twin");compose("start","web","temporal-worker","temporal-scheduler","connector-twin");await ready(["web","temporal-worker","temporal-scheduler"]);
 await writeFile(resolve(trial,"continue.json"),"",{mode:0o600});await checkpoint("effects-ready.json");
 await writeFile(resolve(trial,"provider-state.json"),docker("exec",container("connector-twin"),"cat","/state/connector-twin-state.json"),{mode:0o600});
 await until(()=>controllerExit!==null,"Trial did not finish");assert.equal(controllerExit,0);
 const result=JSON.parse(output.trim());assert.equal(result.passed,true);
 console.log(JSON.stringify({...result,buildId:build.buildId,sourceCommit:source.commit,images:Object.entries(images).map(([role,image])=>({role,id:docker("image","inspect",image,"--format","{{.Id}}" )})),services:inspection.map(c=>({memoryBytes:c.HostConfig.Memory,readOnly:c.HostConfig.ReadonlyRootfs,pids:c.HostConfig.PidsLimit})),admission},null,2));
}catch{
 let detail="";
 try {const report=JSON.parse(await readFile(resolve(trial,"failure.json"),"utf8"));detail=safeTrialFailure(report);}catch{}
 let provider="";
 try {const id=container("connector-twin");if(id)provider=safeProviderFailure(JSON.parse(docker("inspect","--format","{{json .State}}",id)),(()=>{const r=spawnSync("docker",["logs","--tail","80",id],{encoding:"utf8",timeout:10000,maxBuffer:65536,stdio:["ignore","pipe","pipe"]});return `${r.stdout||""}\n${r.stderr||""}`;})());}catch{}
 console.error(`Complete isolated platform trial failed at ${stage}${detail}${provider}; no acceptance, raw logs or credentials printed.`);process.exitCode=1;
}
finally{
 for(const name of owned.reverse())try{docker("rm","-f",name);}catch{}
 controller?.kill("SIGTERM");try{compose("down","--volumes","--remove-orphans");}catch{}
 for(const image of built.reverse())try{docker("image","rm",image);}catch{}
 await rm(parent,{recursive:true,force:true});
}
