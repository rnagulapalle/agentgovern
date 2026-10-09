// Real Docker checkpoints for two content-distinct workers. No shared cleanup or cutover.
import assert from "node:assert/strict";
import {mkdir,readFile,writeFile,access,chmod} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import {parseEnv} from "node:util";
import {resolve} from "node:path";
import {spawn} from "node:child_process";
import {semanticArtifact,semanticPair} from "./temporal-semantic-replay.mjs";
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export function semanticHostContract({project,trial,privateDir,images,database,temporal}){
 assert(/^ll-platform-[a-f0-9]{12}$/.test(project));
 for(const path of [trial,privateDir])assert(typeof path==="string"&&path.startsWith("/")&&!path.includes("..")&&!path.includes(",")&&!/[\r\n\0]/.test(path));
 assert(images&&Object.keys(images).sort().join() === "baseline,controller,incompatible,twin");
 for(const image of Object.values(images))assert(new RegExp(`^${project}:[a-z-]+$`).test(image));
 assert.notEqual(images.baseline,images.incompatible);
 for(const id of [database,temporal])assert(/^[a-f0-9]{64}$/.test(id));assert.notEqual(database,temporal);
 return {network:`${project}-semantic`,volume:`${project}-semantic-provider`,taskQueue:`${project}-semantic`,memory:{worker:768*1024**2,provider:256*1024**2,controller:512*1024**2}};
}
export async function stagingSemanticLifecycle(input){
 const plan=semanticHostContract(input),{project,trial,privateDir,images,database,temporal,docker}=input;
 assert(typeof docker==="function");
 const dir=resolve(trial,"semantic"),names=[],attached=[],uid=`${process.getuid()}:${process.getgid()}`;
 let networkOwned=false,volumeOwned=false,child,exit=null,phase="inputs";
 const ownerLabel="looplabs.semantic.owner",owner=randomBytes(24).toString("hex");
 const inspect=name=>JSON.parse(docker("inspect",name))[0];
 async function until(fn,seconds=180){for(const end=Date.now()+seconds*1000;Date.now()<end;){if(await fn())return;await wait(300);}throw Error("Semantic runtime observation expired");}
 const checkpoint=async name=>until(async()=>{try{await access(resolve(dir,`${name}.json`));return true;}catch{if(exit!==null)throw Error("Semantic controller exited before checkpoint");return false;}});
 const mark=(name,value={})=>writeFile(resolve(dir,`${name}.json`),JSON.stringify(value),{flag:"wx",mode:0o600});
 const state=()=>JSON.parse(docker("exec",`${project}-semantic-twin`,"cat","/state/connector-twin-state.json"));
 const hardened=(memory)=>["--label",`${ownerLabel}=${owner}`,"--network",plan.network,"--memory",String(memory),"--cpus","0.75","--pids-limit","256","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--security-opt","no-new-privileges"];
 function bound(name,memory,image){const c=inspect(name);assert.equal(c.Config.Labels?.[ownerLabel],owner);assert.equal(c.Image,docker("image","inspect",image,"--format","{{.Id}}"));assert.equal(c.HostConfig.Memory,memory);assert.equal(c.HostConfig.PidsLimit,256);assert(c.HostConfig.ReadonlyRootfs);assert.equal(Object.keys(c.HostConfig.PortBindings||{}).length,0);assert.deepEqual(Object.keys(c.NetworkSettings.Networks),[plan.network]);assert(!(c.Config.Env||[]).some(v=>v.startsWith("AWS_")||v.startsWith("LOOPLABS_CHAT_MODEL=")));return c;}
 try{
  for(const [id,service] of [[database,"application-db"],[temporal,"temporal"]]){const c=inspect(id);assert.equal(c.Config.Labels?.["com.docker.compose.project"],project);assert.equal(c.Config.Labels?.["com.docker.compose.service"],service);}
  await mkdir(dir,{mode:0o700});
  phase="artifact-extraction";
  const artifacts=[];
  for(const role of ["baseline","incompatible"]){
   const target=resolve(dir,role);await mkdir(target,{mode:0o700});
   const name=`${project}-semantic-extract-${role}`;names.push(name);
   docker("create","--name",name,"--label",`${ownerLabel}=${owner}`,"--network","none","--memory","134217728","--pids-limit","64","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges",images[role],"node","-e","process.exit(0)");
   for(const [from,to] of [["/app/.worker/temporal-manifest.json","temporal-manifest.json"],["/app/.worker/temporal-service.cjs","temporal-service.cjs"],["/app/.worker/temporal-workflow.cjs","temporal-workflow.cjs"],["/app/pnpm-lock.yaml","pnpm-lock.yaml"]]){docker("cp",`${name}:${from}`,resolve(target,to));await chmod(resolve(target,to),0o600);}
   artifacts.push(await semanticArtifact(target));docker("rm",name);
  }
  semanticPair(artifacts);
  const workerEnv=parseEnv(await readFile(resolve(trial,"worker.env"),"utf8"));
  assert.equal(workerEnv.LOOPLABS_TEMPORAL_ADDRESS,"temporal:7233");assert.equal(new URL(workerEnv.LOOPLABS_DATABASE_URL).hostname,"application-db");
  assert(!Object.keys(workerEnv).some(k=>k.startsWith("AWS_")||k==="LOOPLABS_MIGRATION_DATABASE_URL"));
  const token=randomBytes(32).toString("base64url"),records=[{contactId:"3001",recipient:"old-version@example.test"},{contactId:"3002",recipient:"new-version@example.test"}];
  await mark("input",{taskQueue:plan.taskQueue,builds:artifacts.map(a=>a.buildId),records});
  await writeFile(resolve(dir,"connector-twin-credentials.json"),JSON.stringify({token}),{flag:"wx",mode:0o600});
  const seed=resolve(dir,"seed");await mkdir(seed,{mode:0o700});
  for(const [name,value] of [["credentials",{token}],["records",{records:records.map(r=>({version:"record-scope-1",workspaceId:"local-proof",...r}))}],["faults",{loseResponseRecords:["3001"]}]])await writeFile(resolve(seed,`connector-twin-${name}.json`),JSON.stringify(value),{flag:"wx",mode:0o600});
  phase="private-network";
  docker("network","create","--internal","--label",`${ownerLabel}=${owner}`,plan.network);networkOwned=true;
  for(const [id,alias] of [[database,"application-db"],[temporal,"temporal"]]){docker("network","connect","--alias",alias,plan.network,id);attached.push(id);}
  assert(!docker("volume","ls","--format","{{.Name}}").split("\n").includes(plan.volume));
  docker("volume","create","--label",`${ownerLabel}=${owner}`,plan.volume);volumeOwned=true;
  phase="provider-seed";
  const seeder=`${project}-semantic-seed`;names.push(seeder);
  docker("run","--rm","--name",seeder,"--label",`${ownerLabel}=${owner}`,"--network","none","--memory","134217728","--pids-limit","64","--read-only","--user","0","--cap-drop","ALL","--cap-add","CHOWN","--cap-add","DAC_OVERRIDE","--cap-add","FOWNER","--mount",`type=volume,src=${plan.volume},dst=/state`,"--mount",`type=bind,src=${seed},dst=/seed,readonly`,"--entrypoint","python",images.twin,"-c","from pathlib import Path; import os,shutil; d=Path('/state'); os.chown(d,1000,1000); os.chmod(d,0o700); [(shutil.copyfile(f,d/f.name),os.chown(d/f.name,1000,1000),os.chmod(d/f.name,0o600)) for f in Path('/seed').glob('*.json')]");
  const twin=`${project}-semantic-twin`;names.push(twin);
  docker("run","-d","--name",twin,...hardened(plan.memory.provider),"--network-alias","connector-twin","--env","LOOPLABS_TWIN_CONTAINER=1","--env","LOOPLABS_CONNECTOR_STATE_DIR=/state","--mount",`type=volume,src=${plan.volume},dst=/state`,images.twin);
  await until(()=>{try{docker("exec",twin,"python","/app/scripts/check-connector-health.py");return true;}catch{return false;}});bound(twin,plan.memory.provider,images.twin);
  phase="workers";
  const start=async role=>{
   const i=role==="baseline"?0:1,name=`${project}-semantic-${role}`,file=resolve(dir,`${role}.env`);names.push(name);
   const values={...workerEnv,LOOPLABS_TEMPORAL_TASK_QUEUE:plan.taskQueue,LOOPLABS_TEMPORAL_BUILD_ID:artifacts[i].buildId,LOOPLABS_TEMPORAL_RECORD_BUILD_ID:artifacts[i].buildId,LOOPLABS_TEMPORAL_HEALTH_PORT:"9320",LOOPLABS_CONNECTOR_TWIN_TOKEN:token};
   values.LOOPLABS_RECORD_CATALOG=JSON.stringify({records:records.map(r=>({version:"record-scope-1",workspaceId:"local-proof",...r}))});
   assert(Object.values(values).every(v=>typeof v==="string"&&!/[\r\n\0]/.test(v)));
   // Restoring uses the same saved configuration, rather than replacing it.
   try{await writeFile(file,Object.entries(values).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{flag:"wx",mode:0o600});}catch(error){if(error.code!=="EEXIST")throw error;assert.equal(await readFile(file,"utf8"),Object.entries(values).map(([k,v])=>`${k}=${v}`).join("\n")+"\n");}
   docker("run","-d","--name",name,...hardened(plan.memory.worker),"--env-file",file,"--mount",`type=bind,src=${resolve(privateDir,"client-tls")},dst=/run/temporal-tls,readonly`,images[role],"node",".worker/temporal-service.cjs","worker");
   await until(()=>{try{docker("exec",name,"node","-e","fetch('http://127.0.0.1:9320/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))");return true;}catch{return false;}});
   return bound(name,plan.memory.worker,images[role]);
  };
  const old=await start("baseline"),next=await start("incompatible");
  phase="controller";
  const control=`${project}-semantic-controller`;names.push(control);
  child=spawn("docker",["run","--rm","--name",control,...hardened(plan.memory.controller),"--user",uid,"--env-file",resolve(trial,"worker.env"),"--env","LOOPLABS_SEMANTIC_LIFECYCLE=isolated","--mount",`type=bind,src=${trial},dst=/run/trial`,...[["baseline","/run/baseline"],["incompatible","/run/incompatible"]].flatMap(([role,dst])=>["--mount",`type=bind,src=${resolve(dir,role)},dst=${dst},readonly`]),images.controller,"node","--import","tsx","scripts/staging-semantic-controller.mjs"],{stdio:["ignore","ignore","pipe"]});
  child.stderr.resume();child.on("exit",code=>{exit=code??127;});child.on("error",()=>{exit=127;});
  await until(()=>{if(exit!==null)throw Error("Semantic controller unavailable");try{return bound(control,plan.memory.controller,images.controller).State.Running;}catch{return false;}},15);
  phase="held";await checkpoint("held");assert.equal(Object.keys(state().effects).length,0);
  phase="old-worker-loss";docker("kill","--signal","SIGKILL",old.Id);
  const killed=inspect(old.Id);assert(!killed.State.Running&&killed.State.ExitCode===137&&!killed.State.OOMKilled);assert.equal(killed.Image,old.Image);docker("rm",old.Id);
  await mark("old-worker-stopped");
  phase="new-worker-continues";await checkpoint("old-waits-new-completes");
  const held=JSON.parse(await readFile(resolve(dir,"held.json"),"utf8"));assert.equal(held.runs.length,2);
  const first=state().effects;assert.equal(Object.keys(first).length,2);for(const s of held.runs[0].steps)assert(!first[s.actionId]);for(const s of held.runs[1].steps)assert(first[s.actionId]);
  assert.equal(inspect(next.Id).Id,next.Id);assert(inspect(next.Id).State.Running);
  phase="old-artifact-restoration";const restored=await start("baseline");assert.notEqual(restored.Id,old.Id);assert.equal(restored.Image,old.Image);await mark("old-worker-restored");
  phase="independent-provider-readback";await checkpoint("effects-ready");await mark("provider-readback",{effects:state().effects});
  phase="replay";await checkpoint("post-replay-effects-ready");await mark("post-replay-provider-readback",{effects:state().effects});
  await checkpoint("replay-completed");await until(()=>exit!==null);assert.equal(exit,0);
  const receipt=JSON.parse(await readFile(resolve(dir,"replay-completed.json"),"utf8"));assert.equal(receipt.passed,true);assert.equal(receipt.actualEffects,4);
  const effects=state().effects;assert.equal(Object.keys(effects).length,4);
  for(const [i,r] of held.runs.entries())for(const s of r.steps)assert.equal(effects[s.actionId].recordId,records[i].contactId);
  phase="writer-containment";
  for(const c of [restored,next]){docker("stop","--time","30",c.Id);assert.equal(inspect(c.Id).State.Running,false);}
  return {passed:true,builds:artifacts.map(a=>a.buildId),images:[old.Image,next.Image],oldWorkerKilled:true,oldWorkerRecreated:true,newWorkerContinued:true,heldEffects:0,newWhileOldAbsentEffects:2,finalEffects:4,replay:receipt.replay,additionalWritersStopped:true,notVerified:["retirement admission fence","long-term retention","production cutover","enterprise acceptance"]};
 }catch{
  let controllerPhase="";try{const report=JSON.parse(await readFile(resolve(dir,"failure.json"),"utf8"));if(typeof report.phase==="string"&&/^[a-z-]+$/.test(report.phase))controllerPhase=`/${report.phase}`;}catch{}
  console.error(`Semantic host refused at ${phase}${controllerPhase}; no raw Docker output, payload or credentials printed.`);
  throw Error("Semantic host trial not accepted");
 }finally{
  for(const name of [...new Set(names)].reverse())try{if(inspect(name).Config.Labels?.[ownerLabel]===owner)docker("rm","-f",name);}catch{}
  child?.kill("SIGTERM");
  for(const id of attached.reverse())try{docker("network","disconnect",plan.network,id);}catch{throw Error("Owned semantic network disconnection failed");}
  if(networkOwned){assert.equal(JSON.parse(docker("network","inspect",plan.network))[0].Labels?.[ownerLabel],owner);docker("network","rm",plan.network);}
  if(volumeOwned){assert.equal(JSON.parse(docker("volume","inspect",plan.volume))[0].Labels?.[ownerLabel],owner);docker("volume","rm",plan.volume);}
 }
}
