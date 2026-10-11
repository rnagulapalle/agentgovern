// Actual local Temporal reset; inert activities, no application/provider acceptance.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {Worker,Runtime,DefaultLogger} from '@temporalio/worker';
import {semanticArtifact} from './temporal-semantic-replay.mjs';
import {resetCompletedRun,ResetRequestDeduplicationError,pinnedBuild} from './temporal-completed-reset.mjs';
let environment,phase='inputs',failureOutput;
try{
 assert.equal(process.env.LOOPLABS_RESET_CALIBRATION,'isolated');
 const [directory,output]=process.argv.slice(2);assert(directory&&output&&process.argv.length===4);
 failureOutput=`${output}.failure.json`;
 const artifact=await semanticArtifact(directory);
 Runtime.install({logger:new DefaultLogger('ERROR')});
 environment=await TestWorkflowEnvironment.createLocal();
 const taskQueue=`reset-calibration-${randomUUID()}`,requestId=randomUUID();let calls=0;
 const worker=await Worker.create({connection:environment.nativeConnection,taskQueue,
  workflowBundle:{code:artifact.code},activities:{async advanceContract(){calls++;return 'completed';}},
  workerDeploymentOptions:{version:{deploymentName:'looplabs-acknowledgement',buildId:artifact.buildId},useWorkerVersioning:true,defaultVersioningBehavior:'PINNED'},shutdownGraceTime:'1 second'});
 await worker.runUntil(async()=>{
  phase='promotion';
  for(let attempt=0;;attempt++){
   try{await environment.client.workflowService.setWorkerDeploymentCurrentVersion({namespace:'default',deploymentName:'looplabs-acknowledgement',buildId:artifact.buildId,identity:'isolated-reset-controller'});break;}
   catch(error){if(attempt>=100)throw error;await new Promise(r=>setTimeout(r,100));}
  }
  phase='start';
  const handle=await environment.client.workflow.start('pinnedAcknowledgement',{workflowId:taskQueue,taskQueue,
   args:[{runId:randomUUID(),planHash:'0'.repeat(64),planVersion:'acknowledgement-1',connectorVersion:'private-record-twin-2'}],
   workflowExecutionTimeout:'60 seconds',versioningOverride:{pinnedTo:{deploymentName:'looplabs-acknowledgement',buildId:artifact.buildId}}});
  assert.equal(await handle.result(),'completed');assert.equal(calls,1);
  phase='reset';
  let result;
  try{
   result=await resetCompletedRun({client:environment.client,namespace:'default',workflowId:taskQueue,runId:handle.firstExecutionRunId,requestId,buildId:artifact.buildId,isolated:true});
   assert.equal(calls,2,'Reset must exercise a new activity, not merely replay history');
  }catch(error){
   if(!(error instanceof ResetRequestDeduplicationError))throw error;
   const e=error.evidence;
   assert.notEqual(e.duplicateRunId,e.originalRunId);assert.notEqual(e.duplicateRunId,e.resetRunId);
   const duplicate=environment.client.workflow.getHandle(taskQueue,e.duplicateRunId);
   assert.equal(await duplicate.result(),'completed');pinnedBuild(await duplicate.describe(),artifact.buildId);
   assert.equal(calls,3,'Both distinct reset executions must actually invoke an activity');
   result={passed:false,blocker:'reset_request_id_did_not_deduplicate_original_run',distinctExecution:true,duplicateRequestDeduplicated:false,pinPreserved:true,original:e.original,reset:e.reset,buildId:artifact.buildId};
  }
  await writeFile(output,JSON.stringify({at:new Date().toISOString(),scope:'Local actual Temporal reset with inert activity only',...result,activityCalls:calls,notVerified:['application approvals and reservations','provider effect deduplication','migration14 archive restore','image retention','enterprise acceptance']},null,2)+'\n',{flag:'wx',mode:0o600});
 });
 console.log('Actual local reset observation retained; inspect passed/blocker before acceptance. No application effect acceptance claimed.');
}catch(error){
 // Inert local calibration only; private diagnostics never enter the public receipt.
 if(failureOutput)await writeFile(failureOutput,JSON.stringify({phase,name:error.name,message:error.message}),{flag:'wx',mode:0o600}).catch(()=>{});
 console.error(`Reset calibration refused at ${phase}; no raw authority, history or SDK error printed.`);process.exitCode=1;
}
finally{await environment?.teardown();}
