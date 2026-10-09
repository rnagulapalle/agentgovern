// Add reset enrollment without editing the accepted drain/semantic sources.
import assert from 'node:assert/strict';
import {drainPlatform} from './staging-drain-source.mjs';
export function resetPlatform(source,hostFile){
 let out=drainPlatform(source,hostFile);
 const replace=(before,after)=>{assert.equal(out.split(before).length,2,'Reset assembly anchor missing or ambiguous');out=out.replace(before,after);};
 replace('const docker=(...args)=>','import {bootstrapResetAssembly} from "./staging-reset-bootstrap.mjs";\nconst docker=(...args)=>');
 replace(' const database=resolve(application,"database");',` stage="reset-assembly-enrollment";
 const resetAssembly=await bootstrapResetAssembly({project,parent,images:{baseline:images.worker,incompatible:semanticImage,provisioner:images.provisioner},ownerEnv:resolve(parent,"owner.env"),docker,runController});
 const database=resolve(application,"database");`);
 replace(' stage="offline-restore-quarantine";quarantine();quarantine();',` stage="offline-restore-quarantine";quarantine();quarantine();
 const workerContain=()=>{const result=runController(project+"-worker-restore-contain",project+"_application",images.provisioner,["node","scripts/worker-restore-contain.mjs"],[\`type=bind,src=\${application},dst=/run/private,readonly\`],[resolve(parent,"quarantine.env")]);assert.equal(result,"Restored worker admission contained: 2 retained builds draining. No reset sent, authority granted or artifact removed.");};
 workerContain();workerContain();`);
 replace(' outcome={...result,semanticLifecycle,',' outcome={...result,resetAssembly,semanticLifecycle,');
 return out;
}

// Preserve the original controller's identities, approvals, replay and reservations.
import {drainController,drainHost} from './staging-drain-source.mjs';
function resetEditor(source){return (before,after)=>{assert.equal(source.split(before).length,2,'Reset checkpoint anchor missing or ambiguous');source=source.replace(before,after);return source;};}
export function resetController(source){
 const replace=resetEditor(drainController(source));let out;
 out=replace('import {exerciseDrain} from "./staging-drain-exercise.mjs";',`import {exerciseDrain} from "./staging-drain-exercise.mjs";
import {completedSemanticHistory} from "./temporal-semantic-replay.mjs";
import {completedResetRequest,pinnedBuild} from "./temporal-completed-reset.mjs";`);
 out=replace(' await mark("post-replay-effects-ready",{});',` phase="reset-existing-approved-run";
 assert(await member(reference.owner));assert(await member(reference.reviewer));
 const originalDescription=await old.handle.describe(),originalHistory=await old.handle.fetchHistory();
 pinnedBuild(originalDescription,old.buildId);
 const request=completedResetRequest({namespace:env.LOOPLABS_TEMPORAL_NAMESPACE,workflowId:originalDescription.workflowId,runId:originalDescription.runId,requestId:randomUUID(),history:originalHistory});
 const imageIds=JSON.parse(await readFile(phaseDir+"/inspected-images.json","utf8"));assert(imageIds.length===2&&imageIds.every(x=>/^sha256:[a-f0-9]{64}$/.test(x))&&imageIds[0]!==imageIds[1]);
 await mark("reset-request",{org_id:owner.orgId,operation_id:request.requestId,plan_id:old.id,namespace:request.namespace,workflow_id:request.workflowExecution.workflowId,original_run_id:request.workflowExecution.runId,task_finish_event_id:request.workflowTaskFinishEventId,original_history_sha256:completedSemanticHistory(originalHistory).sha256,worker_build_id:old.buildId,image_id:imageIds[0],recovery_epoch:env.LOOPLABS_RECOVERY_EPOCH});
 await checkpoint("reset-provider-readback");
 const resetEvidence=JSON.parse(await readFile(phaseDir+"/reset-provider-readback.json","utf8"));
 assert(resetEvidence.passed===true&&resetEvidence.newProcessRetryRefused===true&&resetEvidence.independentLineageObserved===true);
 assert.equal(resetEvidence.workerBuildId,old.buildId);
 assert.deepEqual(resetEvidence.effects,effects,"Completed-run reset cannot create a new business effect");
 for(const r of runs){assert((await snapshot(r)).steps.every(s=>s.state==="succeeded"&&s.approved_by===reviewer.subject));const counters=(await db.query("SELECT id,reserved FROM ll_agents WHERE org_id=$1 AND id=ANY($2::text[]) ORDER BY id",[owner.orgId,r.agents])).rows;assert.equal(counters.length,2);assert(counters.every(a=>a.reserved===1));}
 await mark("post-replay-effects-ready",{});`);
 out=replace('passed:true,replay,admissionFence,actualEffects:4,','passed:true,replay,admissionFence,resetEvidence,actualEffects:4,');
 return out;
}
export function resetHost(source,controllerFile){
 const replace=resetEditor(drainHost(source,controllerFile));let out;
 out=replace('import {semanticArtifact,semanticPair} from "./temporal-semantic-replay.mjs";',`import {semanticArtifact,semanticPair} from "./temporal-semantic-replay.mjs";
import {capturePendingResetArchive,restorePendingResetArchive} from "./staging-reset-archive.mjs";`);
 out=replace('  phase="replay";await checkpoint("post-replay-effects-ready");',`  phase="reset-owner-dispatch";await checkpoint("reset-request");
  await until(()=>ownerExit!==null);assert.equal(ownerExit,0);
  const beforeReset=state().effects;assert.equal(Object.keys(beforeReset).length,4);
  const resetEnv=resolve(trial,"..",project+"-reset-owner.env");
  const resetValues={LOOPLABS_STAGING_RESET_PROOF:"isolated",LOOPLABS_MIGRATION_DATABASE_URL:ownerURL,LOOPLABS_RECOVERY_EPOCH:ownerValues.LOOPLABS_RECOVERY_EPOCH};
  for(const key of ["LOOPLABS_TEMPORAL_ADDRESS","LOOPLABS_TEMPORAL_API_KEY","LOOPLABS_TEMPORAL_NAMESPACE"])resetValues[key]=workerEnv[key];
  assert(Object.values(resetValues).every(v=>typeof v==="string"&&v.length>0&&!/[\\r\\n\\0]/.test(v)));
  await writeFile(resetEnv,Object.entries(resetValues).map(([k,v])=>k+"="+v).join("\\n")+"\\n",{flag:"wx",mode:0o600});
  async function resetOwner(mode){
   const name=project+"-reset-owner-"+mode;names.push(name);let finished=null;
   const process=spawn("docker",["run","--rm","--name",name,...hardened(256*1024**2),"--user",uid,"--env-file",resetEnv,"--mount",\`type=bind,src=\${trial},dst=/run/trial\`,images.controller,"node","--import","tsx","scripts/staging-reset-owner.mjs",mode],{stdio:["ignore","ignore","pipe"]});
   process.stderr.resume();process.on("exit",code=>{finished=code??127;});process.on("error",()=>{finished=127;});
   try{await until(()=>finished!==null);assert.equal(finished,0);}finally{process.kill("SIGTERM");}
  }
  await resetOwner("dispatch");
  const discarded=JSON.parse(await readFile(resolve(dir,"reset-response-discarded.json"),"utf8"));assert.deepEqual(discarded,{passed:true,rpcCalls:1,committedUncertainty:true});
  const pendingArchiveSha256=await capturePendingResetArchive({project,database,trial,docker});
  phase="reset-owner-restart";await resetOwner("reconcile");
  const resetReadback=JSON.parse(await readFile(resolve(dir,"reset-owner-readback.json"),"utf8"));assert(resetReadback.passed===true&&resetReadback.newProcessRetryRefused===true&&resetReadback.independentLineageObserved===true);
  assert.deepEqual(state().effects,beforeReset,"Reset must not duplicate actual provider effects");
  await mark("reset-provider-readback",{...resetReadback,rpcCalls:discarded.rpcCalls,committedUncertainty:discarded.committedUncertainty,pendingArchiveSha256,effects:state().effects});
  phase="replay";await checkpoint("post-replay-effects-ready");`);
 out=replace('  return {admissionFence:receipt.admissionFence,passed:true,',`  phase="pending-reset-archive-restore";
  const resetArchive=await restorePendingResetArchive({project,database,trial,ownerURL,images,docker,writers:[restored.Id,next.Id],ownerLabel:owner});
  assert.deepEqual(state().effects,effects,"Restoring the isolated copy cannot create provider effects");
  assert.equal(resetArchive.backupSha256,pendingArchiveSha256);
  return {resetArchive,resetEvidence:receipt.resetEvidence,admissionFence:receipt.admissionFence,passed:true,`);
 return out;
}
