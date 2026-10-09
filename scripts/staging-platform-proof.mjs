// One disposable eight-service trial; never uses or deploys a production project.
import {execFileSync,spawn,spawnSync} from "node:child_process";
import {randomUUID,randomBytes} from "node:crypto";
import {mkdtemp,mkdir,writeFile,readFile,cp,access,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {parseEnv} from "node:util";
import assert from "node:assert/strict";
import {generateTemporalConfiguration} from "./staging-temporal-config.mjs";
import {attachPlannerInputs} from "./staging-planner-attachment.mjs";
import {assembleRuntimeInputs} from "./staging-runtime-inputs.mjs";
import {stagingHostAdmission} from "../runtime/temporal/staging-host.ts";
import {safeTrialFailure,safeProviderFailure,safeBrowserFailure,safeRestoreFailure} from "./staging-trial-failure.mjs";
import {stagingBrowserProof} from "./staging-browser-proof.mjs";
import {browserOrigin} from "./staging-browser-tls.mjs";
import {ownedBuilder} from "./staging-owned-builder.mjs";
import {exportTestedImages,reloadAfterTrialRemoval} from "./staging-image-artifact.mjs";
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:600000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const backend=process.env.FETCHSANDBOX_BACKEND_PATH;
assert(process.env.LOOPLABS_STAGING_PLATFORM_PROOF==="isolated"&&backend,"Explicit disposable trial and prepared private source required");
const artifactDirectory=process.env.LOOPLABS_STAGING_IMAGE_ARTIFACT;
assert(artifactDirectory===undefined||(process.env.GITHUB_ACTIONS==="true"&&artifactDirectory.startsWith("/")&&!artifactDirectory.includes("..")),"Private CI absolute image artifact destination required");
const browserOptIn=process.env.LOOPLABS_STAGING_BROWSER_PROOF;
assert(browserOptIn===undefined||browserOptIn==="isolated","Invalid browser proof opt-in");
const browserEnabled=browserOptIn==="isolated";
const typedOptIn=process.env.LOOPLABS_STAGING_TYPED_PLANNER;
assert(typedOptIn===undefined||typedOptIn==="isolated","Invalid typed planner opt-in");
const typedPlanning=typedOptIn==="isolated";
assert(!typedPlanning||(browserEnabled&&process.env.LOOPLABS_STAGING_PLANNER_INPUT),"Typed planning requires HTTPS browser and explicit temporary model input");
if(browserEnabled)assert(process.env.GITHUB_ACTIONS==="true","Fresh isolated CI required for browser trust setup");
assert(process.platform==="linux","Run on a fresh allocated Linux runner; do not resize shared workloads");
const source=JSON.parse(await readFile(resolve(backend,"../fixture-source-manifest.json"),"utf8"));
assert.equal(source.version,1);assert(/^[a-f0-9]{40}$/.test(source.commit));
const parent=await mkdtemp(resolve(tmpdir(),"ll-platform-")),privateDir=resolve(parent,"runtime"),trial=resolve(parent,"trial"),seed=resolve(parent,"seed"),application=resolve(parent,"application");
const project=`ll-platform-${randomBytes(6).toString("hex")}`,images={web:`${project}:web`,worker:`${project}:worker`,twin:`${project}:twin`,provisioner:`${project}:provisioner`};
const env={...process.env,LOOPLABS_STAGING_PRIVATE_DIR:privateDir,LOOPLABS_STAGING_WEB_PORT:"3199",LOOPLABS_STAGING_WEB_IMAGE:images.web,LOOPLABS_STAGING_WORKER_IMAGE:images.worker,LOOPLABS_STAGING_TWIN_IMAGE:images.twin};
const compose=(...args)=>execFileSync("docker",["compose","-p",project,"-f","docker-compose.temporal-platform.yml",...args],{env,encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
const imageBuilder=ownedBuilder(docker,`${project}-build`);
const uid=`${process.getuid()}:${process.getgid()}`,owned=[],built=[];let stage="prepare",controller,controllerExit=null,outcome,retainedArtifact;
async function until(fn,label,seconds=120){for(const end=Date.now()+seconds*1000;Date.now()<end;){if(await fn())return;await wait(500);}throw Error(label);}
const container=service=>compose("ps","-aq",service);
const ready=async services=>until(()=>services.every(s=>{const id=container(s);return id&&docker("inspect","--format","{{.State.Health.Status}}",id)==="healthy";}),"Runtime health unavailable",180);
function runController(name,network,image,args,mounts,files=[]){owned.push(name);return docker("run","--rm","--name",name,"--network",network,"--user",uid,"--memory","512m","--cpus","0.5","--pids-limit","256","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--security-opt","no-new-privileges",...files.flatMap(path=>["--env-file",path]),...mounts.flatMap(m=>["--mount",m]),image,...args);}
try{
 await generateTemporalConfiguration(privateDir,`looplabs-staging-${randomBytes(5).toString("hex")}`);
 for(const path of [trial,seed,application])await mkdir(path,{mode:0o700});
 const recoveryEpoch=randomUUID(),password=randomBytes(32).toString("base64url"),token=randomBytes(32).toString("base64url");
 await writeFile(resolve(privateDir,"application-db.env"),`POSTGRES_USER=ll_stage_owner\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=looplabs_staging\n`,{mode:0o600});
 await writeFile(resolve(parent,"owner.env"),`LOOPLABS_STAGING_BOOTSTRAP=isolated\nLOOPLABS_STAGING_OWNER_URL=postgresql://ll_stage_owner:${password}@application-db:5432/looplabs_staging\nLOOPLABS_RECOVERY_EPOCH=${recoveryEpoch}\n`,{mode:0o600});
 await writeFile(resolve(parent,"namespace.env"),"LOOPLABS_STAGING_BOOTSTRAP=isolated\n",{mode:0o600});
 for(const role of ["web","worker"])await writeFile(resolve(privateDir,`${role}.env`),"",{mode:0o600});
 const records=[{version:"record-scope-1",workspaceId:"local-proof",contactId:"2001",recipient:"customer@example.test"}];
 for(const [file,value] of [["credentials",{token}],["records",{records}],["faults",{loseResponseRecords:["2001"]}]])await writeFile(resolve(seed,`connector-twin-${file}.json`),JSON.stringify(value),{mode:0o600});
 stage="images";imageBuilder.start();
 for(const [role,file] of [["web","Dockerfile"],["worker","Dockerfile.temporal"],["twin","Dockerfile.connector-twin"],["provisioner","Dockerfile.staging-provisioner"]]){imageBuilder.build("-f",file,...(role==="twin"?["--build-context",`fetchsandbox=${backend}`]:[]),"-t",images[role],".");built.push(images[role]);}
 imageBuilder.close();
 const build=JSON.parse(docker("run","--rm","--network","none",images.worker,"node","-e","process.stdout.write(require('fs').readFileSync('.worker/temporal-manifest.json','utf8'))"));
 stage="host-admission";
 const topology=JSON.parse(compose("config","--format","json"));
 const roles={web:"web","application-db":"application-database","temporal-db":"temporal-database",temporal:"temporal-service","temporal-worker":"worker","temporal-scheduler":"scheduler","connector-twin":"provider-twin",authorization:"authorization"};
 assert.equal(Object.keys(topology.services).length,8);
 const inventory=JSON.parse(execFileSync("python3",["scripts/staging-host-inventory.py"],{encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}));
 // Additional reserve allows Chromium/TLS/control processes, not a process memory limit or capacity claim.
 const admission=stagingHostAdmission(inventory,{hostReserveBytes:(browserEnabled?2:1)*1024**3,services:Object.entries(roles).map(([name,role])=>({role,memoryBytes:Number(topology.services[name].mem_limit)}))});
 if(!admission.admitted)console.error(JSON.stringify({failedStage:"host-admission",...admission}));
 assert.equal(admission.admitted,true,"Fresh host must admit all eight bounded roles without changing existing workloads");
 stage="databases";compose("up","-d","application-db","temporal-db");await ready(["application-db","temporal-db"]);
 stage="application-bootstrap";
 runController(`${project}-bootstrap`,`${project}_application`,images.provisioner,["node","--import","tsx","scripts/staging-database-bootstrap.mjs","/run/private/database"],[`type=bind,src=${application},dst=/run/private`],[resolve(parent,"owner.env")]);
 const database=resolve(application,"database");
 const assembly=resolve(parent,"assembled");await writeFile(resolve(parent,"settings.json"),JSON.stringify({origin:browserEnabled?browserOrigin:"https://looplabs-staging.example.test",buildId:build.buildId,taskQueue:`${project}-ack`,records,connectorToken:token}),{mode:0o600});
 await assembleRuntimeInputs(database,privateDir,resolve(parent,"settings.json"),assembly);
 let roleInputs=assembly;
 if(typedPlanning){roleInputs=resolve(parent,"planner-attached");await attachPlannerInputs(assembly,process.env.LOOPLABS_STAGING_PLANNER_INPUT,roleInputs);}
 for(const role of ["web","worker"])await cp(resolve(roleInputs,`${role}.env`),resolve(privateDir,`${role}.env`));
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
 stage="eight-service-start";compose("up","-d");await ready(["web","temporal-worker","temporal-scheduler","connector-twin"]);
 const inspection=JSON.parse(docker("inspect",...Object.keys(roles).map(container)));
 assert.equal(inspection.length,8);
 if(typedPlanning){for(const c of inspection){const cloud=(c.Config.Env||[]).filter(v=>v.startsWith("AWS_")||v.startsWith("LOOPLABS_CHAT_MODEL="));if(c.Name.endsWith("-web-1")){assert.equal(cloud.length,5);assert(cloud.some(v=>v==="LOOPLABS_CHAT_MODEL=us.amazon.nova-lite-v1:0"));}else assert.equal(cloud.length,0,"Non-web roles must not receive cloud credentials");}}
 for(const role of ["web","temporal-worker","temporal-scheduler"]){const c=inspection.find(c=>c.Id===container(role));assert((c.Config.Env||[]).includes(`LOOPLABS_RECOVERY_EPOCH=${recoveryEpoch}`),"All three runtime roles require the enrolled external recovery epoch");}
 for(const c of inspection){assert(c.HostConfig.Memory>0&&c.HostConfig.PidsLimit>0);if(!c.Name.endsWith("-web-1"))assert.equal(Object.keys(c.HostConfig.PortBindings||{}).length,0);}
 stage="api-execution";
 await cp(resolve(database,".local/workspace-accounts.json"),resolve(trial,"accounts.json"));await cp(resolve(privateDir,"worker.env"),resolve(trial,"worker.env"));await cp(resolve(privateDir,"client-tls"),resolve(trial,"tls"),{recursive:true});
 const controlName=`${project}-trial`;owned.push(controlName);
 controller=spawn("docker",["run","--rm","--name",controlName,"--network",`${project}_application`,"--user",uid,"--memory","512m","--read-only","--tmpfs","/tmp","--cap-drop","ALL",...(browserEnabled?["--env",`LOOPLABS_TRIAL_ORIGIN=${browserOrigin}`]:[]),"--mount",`type=bind,src=${trial},dst=/run/trial`,"--mount",`type=bind,src=${resolve("scripts/staging-platform-controller.mjs")},dst=/app/controller.mjs,readonly`,images.worker,"node","controller.mjs"],{stdio:["ignore","pipe","pipe"]});
 let output="";controller.stdout.on("data",b=>{output+=b.toString();});controller.stderr.resume();controller.on("exit",code=>{controllerExit=code??127;});controller.on("error",()=>{controllerExit=127;});
 // Connect the one verification controller to both private runtime networks.
 await until(()=>{try{docker("network","connect",`${project}_orchestration`,controlName);return true;}catch{return false;}},"Trial controller unavailable",15);
 const checkpoint=async file=>until(async()=>{if(controllerExit!==null)throw Error("Trial controller exited");try{await access(resolve(trial,file));return true;}catch{return false;}},"Trial checkpoint unavailable",240);
 await checkpoint("held.json");
 stage="runtime-crash";compose("kill","-s","SIGKILL","web","temporal-worker","temporal-scheduler","connector-twin");compose("start","web","connector-twin");await ready(["web","connector-twin"]);
 await writeFile(resolve(trial,"continue.json"),"",{mode:0o600});await checkpoint("approved.json");
 stage="approved-archive";
 const archivedProvider=JSON.parse(docker("exec",container("connector-twin"),"cat","/state/connector-twin-state.json"));assert.equal(Object.keys(archivedProvider.effects).length,0);
 const archive=execFileSync("docker",["exec",container("application-db"),"pg_dump","-U","ll_stage_owner","-d","looplabs_staging","-Fc"],{timeout:30000,maxBuffer:8*1024*1024,stdio:["ignore","pipe","pipe"]});
 await writeFile(resolve(application,"approved.archive"),archive,{mode:0o600,flag:"wx"});
 compose("start","temporal-worker","temporal-scheduler");await ready(["temporal-worker","temporal-scheduler"]);
 await writeFile(resolve(trial,"execute.json"),"",{mode:0o600});await checkpoint("effects-ready.json");
 await writeFile(resolve(trial,"provider-state.json"),docker("exec",container("connector-twin"),"cat","/state/connector-twin-state.json"),{mode:0o600});
 await until(()=>controllerExit!==null,"Trial did not finish");assert.equal(controllerExit,0);
 const result=JSON.parse(output.trim());assert.equal(result.passed,true);
 let browser;
 if(browserEnabled){stage="browser-https";const observed=await stagingBrowserProof(trial,{typedPlanning});const provider=JSON.parse(docker("exec",container("connector-twin"),"cat","/state/connector-twin-state.json"));assert.equal(Object.keys(provider.effects).length,4);for(const id of observed.actionIds)assert(provider.effects[id]);const {actionIds,...sanitized}=observed;assert.equal(actionIds.length,2);browser=sanitized;}
 stage="archive-restore-containment";
 const expectedEffects=browser?4:2;
 const retainedProvider=JSON.parse(docker("exec",container("connector-twin"),"cat","/state/connector-twin-state.json"));assert.equal(Object.keys(retainedProvider.effects).length,expectedEffects);
 compose("stop","web","temporal-worker","temporal-scheduler");
 for(const role of ["web","temporal-worker","temporal-scheduler"])assert.equal(docker("inspect","--format","{{.State.Running}}",container(role)),"false","All application writers must actually stop before restore");
 const nextEpoch=randomUUID();assert.notEqual(nextEpoch,recoveryEpoch);
 for(const role of ["web","worker"]){const file=resolve(privateDir,`${role}.env`),values=parseEnv(await readFile(file,"utf8"));assert.equal(values.LOOPLABS_RECOVERY_EPOCH,recoveryEpoch);values.LOOPLABS_RECOVERY_EPOCH=nextEpoch;await writeFile(file,Object.entries(values).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{mode:0o600});}
 await cp(resolve(privateDir,"worker.env"),resolve(trial,"worker.env"));
 stage="application-archive-restore";
 execFileSync("docker",["exec","-i",container("application-db"),"pg_restore","--clean","--if-exists","-U","ll_stage_owner","-d","looplabs_staging"],{input:archive,timeout:30000,stdio:["pipe","ignore","pipe"]});
 stage="restored-web-start";
 compose("up","-d","--no-deps","--force-recreate","web");await ready(["web"]);
 const restoreController=(phase)=>JSON.parse(runController(`${project}-restore-${phase}`,`${project}_application`,images.worker,["node","/app/restore-controller.mjs",phase],[`type=bind,src=${trial},dst=/run/trial`,`type=bind,src=${resolve("scripts/staging-restore-controller.mjs")},dst=/app/restore-controller.mjs,readonly`],browserEnabled?[resolve(parent,"restore-origin.env")]:[]));
 if(browserEnabled)await writeFile(resolve(parent,"restore-origin.env"),`LOOPLABS_TRIAL_ORIGIN=${browserOrigin}\n`,{mode:0o600});
 stage="restored-http-before-quarantine";assert.equal(restoreController("before").passed,true);
 const refusePackagedRoles=(variant)=>{for(const role of ["temporal-worker","temporal-scheduler"]){
  const name=`${project}-restore-${variant}-${role}`;owned.push(name);
  let refused=false;try{compose("run","--no-deps","--name",name,role);}catch{refused=true;}
  const state=JSON.parse(docker("inspect","--format","{{json .State}}",name));
  assert(refused&&state.Status==="exited"&&state.ExitCode===1&&!state.OOMKilled,"Packaged workload must actually exit through startup refusal, not observation timeout or resource failure");
  const logs=spawnSync("docker",["logs",name],{encoding:"utf8",timeout:10000,maxBuffer:65536,stdio:["ignore","pipe","pipe"]});
  assert.equal(logs.status,0);assert.equal(`${logs.stdout||""}${logs.stderr||""}`.trim(),"Temporal service stopped; inspect sanitized health signals and saved run state.");
 }};
 stage="restored-packaged-role-refusal";refusePackagedRoles("rotated");
 stage="restored-omitted-epoch-refusal";
 // Removing a staged runtime's epoch must not disable the same boundary.
 const configuredRoleFiles={};
 compose("stop","web");
 for(const role of ["web","worker"]){const file=resolve(privateDir,`${role}.env`);configuredRoleFiles[role]=await readFile(file,"utf8");const values=parseEnv(configuredRoleFiles[role]);delete values.LOOPLABS_RECOVERY_EPOCH;await writeFile(file,Object.entries(values).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{mode:0o600});}
 compose("up","-d","--no-deps","--force-recreate","web");await ready(["web"]);
 assert.equal(restoreController("before").passed,true);refusePackagedRoles("omitted-epoch");
 assert.deepEqual(JSON.parse(docker("exec",container("connector-twin"),"cat","/state/connector-twin-state.json")).effects,retainedProvider.effects);
 compose("stop","web");
 for(const role of ["web","worker"])await writeFile(resolve(privateDir,`${role}.env`),configuredRoleFiles[role],{mode:0o600});
 compose("up","-d","--no-deps","--force-recreate","web");await ready(["web"]);
 compose("stop","web");
 const ownerValues=parseEnv(await readFile(resolve(parent,"owner.env"),"utf8"));
 await writeFile(resolve(parent,"quarantine.env"),`LOOPLABS_MIGRATION_DATABASE_URL=${ownerValues.LOOPLABS_STAGING_OWNER_URL}\nLOOPLABS_WORKSPACE_ID=local-proof\nLOOPLABS_RECOVERY_EPOCH=${nextEpoch}\nLOOPLABS_RESTORE_ARCHIVE=/run/private/approved.archive\nLOOPLABS_RESTORE_ACK=WRITERS_STOPPED_AND_EPOCH_ROTATED\n`,{mode:0o600});
 const quarantine=()=>runController(`${project}-quarantine`,`${project}_application`,images.provisioner,["node","--import","tsx","scripts/workspace-recovery.ts","quarantine"],[`type=bind,src=${application},dst=/run/private,readonly`],[resolve(parent,"quarantine.env")]);
 stage="offline-restore-quarantine";quarantine();quarantine();
 // A stale bootstrap must refuse before it can issue replacement workload keys.
 stage="stale-bootstrap-refusal";let staleBootstrapRefused=false;try{runController(`${project}-stale-bootstrap`,`${project}_application`,images.provisioner,["node","--import","tsx","scripts/staging-database-bootstrap.mjs","/run/private/database"],[`type=bind,src=${application},dst=/run/private`],[resolve(parent,"owner.env")]);}catch{staleBootstrapRefused=true;}assert(staleBootstrapRefused);
 stage="quarantined-http-authority";compose("start","web");await ready(["web"]);assert.equal(restoreController("after").passed,true);
 assert.deepEqual(JSON.parse(docker("exec",container("connector-twin"),"cat","/state/connector-twin-state.json")).effects,retainedProvider.effects);
 const restoreContainment={approvedArchive:true,externalEpochRotated:true,runtimeRoles:3,omittedEpochRefused:true,revivedSessionsRefused:true,restoredApprovalRefused:true,packagedWorkerRefused:true,packagedSchedulerRefused:true,quarantineRevokesAuthority:true,quarantineReplay:true,staleBootstrapRefused:true,retainedEffects:expectedEffects};
 if(artifactDirectory){stage="tested-image-export";retainedArtifact=await exportTestedImages({directory:artifactDirectory,images,buildId:build.buildId,docker});}
 outcome={...result,restoreContainment,...(typedPlanning?{plannerAuthority:{webOnly:true},actualProviderEffects:4}:{}),...(browser?{browser,scope:typedPlanning?"assembled isolated API/runtime and fresh typed HTTPS browser trial":"assembled isolated API/runtime and prepared-plan HTTPS browser trial",notVerified:[...(typedPlanning?[]:["fresh typed chat/model interpretation"]),...result.notVerified.filter(x=>x!=="browser HTTPS and typed chat UX")]}:{}),buildId:build.buildId,sourceCommit:source.commit,images:Object.entries(images).map(([role,image])=>({role,id:docker("image","inspect",image,"--format","{{.Id}}" )})),services:inspection.map(c=>({memoryBytes:c.HostConfig.Memory,readOnly:c.HostConfig.ReadonlyRootfs,pids:c.HostConfig.PidsLimit,health:c.State.Health?.Status??"not-configured"})),admission};
}catch{
 let detail="";
 try {const report=JSON.parse(await readFile(resolve(trial,"failure.json"),"utf8"));detail=safeTrialFailure(report);}catch{}
 try {detail+=safeBrowserFailure(JSON.parse(await readFile(resolve(trial,"browser-failure.json"),"utf8")));}catch{}
 try {detail+=safeRestoreFailure(JSON.parse(await readFile(resolve(trial,"restore-failure.json"),"utf8")));}catch{}
 let provider="";
 try {const id=container("connector-twin");if(id)provider=safeProviderFailure(JSON.parse(docker("inspect","--format","{{json .State}}",id)),(()=>{const r=spawnSync("docker",["logs","--tail","80",id],{encoding:"utf8",timeout:10000,maxBuffer:65536,stdio:["ignore","pipe","pipe"]});return `${r.stdout||""}\n${r.stderr||""}`;})());}catch{}
 console.error(`Complete isolated platform trial failed at ${stage}${detail}${provider}; no acceptance, raw logs or credentials printed.`);process.exitCode=1;
}
finally{
 try{imageBuilder.close();}catch{console.error("Owned image builder cleanup failed; no shared resources modified.");process.exitCode=1;}
 for(const name of owned.reverse())try{docker("rm","-f",name);}catch{}
 controller?.kill("SIGTERM");try{compose("down","--volumes","--remove-orphans");}catch{}
 for(const image of built.reverse())try{docker("image","rm",image);}catch{}
 await rm(parent,{recursive:true,force:true});
}

if(outcome&&!process.exitCode){
 try{
  if(retainedArtifact){
   // Cleanup has removed original trial tags and containers. Loading must not rebuild.
   stage="tested-image-reload";
   await reloadAfterTrialRemoval({directory:artifactDirectory,artifact:retainedArtifact,docker});
   outcome.artifact={...retainedArtifact,reloadedAfterRemoval:true,workerBuildVerified:true};
  }
  console.log(JSON.stringify(outcome,null,2));
 }catch{console.error("Tested image artifact reload failed; no artifact acceptance or credentials printed.");process.exitCode=1;}
}
