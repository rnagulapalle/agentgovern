// Actual local Temporal history calibration. No PostgreSQL/provider/enterprise acceptance.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {TestWorkflowEnvironment} from "@temporalio/testing";
import {Worker,Runtime,DefaultLogger} from "@temporalio/worker";
import {semanticArtifact,semanticPair,replaySemanticPair} from "./temporal-semantic-replay.mjs";
let environment;
try{
 assert(process.env.LOOPLABS_SEMANTIC_CALIBRATION==="isolated");
 const [old,next,output]=process.argv.slice(2);assert(old&&next&&output&&process.argv.length===5);
 const artifacts=semanticPair(await Promise.all([semanticArtifact(old),semanticArtifact(next)]));
 Runtime.install({logger:new DefaultLogger("ERROR")});
 environment=await TestWorkflowEnvironment.createLocal();
 const histories=[],calls=[0,0];
 for(let i=0;i<2;i++){
  const taskQueue=`semantic-calibration-${randomUUID()}`;
  const worker=await Worker.create({connection:environment.nativeConnection,taskQueue,
   workflowBundle:{codePath:artifacts[i].codePath},
   activities:{async advanceContract(){calls[i]++;return "completed";}},
   shutdownGraceTime:"1 second"});
  await worker.runUntil(async()=>{
   const handle=await environment.client.workflow.start("pinnedAcknowledgement",{
    workflowId:taskQueue,taskQueue,args:[{runId:randomUUID(),planHash:"0".repeat(64),planVersion:"acknowledgement-1",connectorVersion:"private-record-twin-2"}],
    workflowExecutionTimeout:"30 seconds",
   });
   assert.equal(await handle.result(),"completed");histories.push(await handle.fetchHistory());
  });
 }
 assert.deepEqual(calls,[1,1]);
 const replay=await replaySemanticPair(artifacts,histories);
 assert.deepEqual(calls,[1,1],"Replay must not invoke activities");
 await writeFile(output,JSON.stringify({at:new Date().toISOString(),scope:"Local actual Temporal replay calibration with inert activities only",builds:artifacts.map(({buildId,serviceHash,workflowHash,lockHash})=>({buildId,serviceHash,workflowHash,lockHash})),...replay,activityCalls:calls,notVerified:["authenticated PostgreSQL-backed Temporal","actual worker Docker images","scoped connector actions or approvals","old-worker loss, recovery or retirement","enterprise acceptance"]},null,2)+"\n",{flag:"wx",mode:0o600});
 console.log("Actual semantic replay calibration passed; enterprise lifecycle proof remains open.");
}catch{console.error("Semantic replay calibration refused; no raw input, history or SDK error printed.");process.exitCode=1;}
finally{await environment?.teardown();}
