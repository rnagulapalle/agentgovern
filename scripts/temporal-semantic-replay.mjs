// Replay gate shared by calibration and the future authenticated two-image trial.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {Worker} from "@temporalio/worker";
import {DeterminismViolationError} from "@temporalio/workflow";
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
export async function semanticArtifact(directory){
 assert(typeof directory==="string"&&directory.length>0);
 const [manifest,service,workflow,lock]=await Promise.all([
  readFile(resolve(directory,"temporal-manifest.json"),"utf8"),
  readFile(resolve(directory,"temporal-service.cjs")),
  readFile(resolve(directory,"temporal-workflow.cjs")),
  readFile(resolve(directory,"pnpm-lock.yaml")),
 ]);
 const m=JSON.parse(manifest);
 assert.deepEqual(Object.keys(m).sort(),["artifactHash","buildId","version"]);
 const hash=createHash("sha256").update(service).update(workflow).update(lock).digest("hex");
 assert.equal(m.version,1);assert.equal(m.artifactHash,hash);assert.equal(m.buildId,`ack-${hash}`);
 return {buildId:m.buildId,serviceHash:digest(service),workflowHash:digest(workflow),lockHash:digest(lock),codePath:resolve(directory,"temporal-workflow.cjs")};
}
export function semanticPair(artifacts){
 assert(Array.isArray(artifacts)&&artifacts.length===2);
 const [old,next]=artifacts;
 for(const a of artifacts){
  assert(a&&/^ack-[a-f0-9]{64}$/.test(a.buildId));
  for(const field of ["serviceHash","workflowHash","lockHash"])assert(/^[a-f0-9]{64}$/.test(a[field]));
  assert(typeof a.codePath==="string"&&a.codePath.length>0);
 }
 assert.notEqual(old.buildId,next.buildId,"Build labels must be content-distinct");
 assert.notEqual(old.workflowHash,next.workflowHash,"Workflow code must actually change");
 assert.equal(old.serviceHash,next.serviceHash,"Do not change authority services during semantic fault injection");
 assert.equal(old.lockHash,next.lockHash,"Dependency lock must remain identical");
 return artifacts;
}
export function completedSemanticHistory(history){
 assert(history&&Array.isArray(history.events)&&history.events.length>=7);
 const events=history.events;
 assert.equal(events[0].eventType,1,"Complete history must begin with workflow start");
 assert.equal(events.at(-1).eventType,2,"Only successful completed histories prove replay");
 assert.equal(events[0].workflowExecutionStartedEventAttributes?.workflowType?.name,"pinnedAcknowledgement");
 assert(events.some(e=>e.eventType===12),"An actual completed activity is required");
 for(let i=0;i<events.length;i++)assert.equal(String(events[i].eventId),String(i+1),"Truncated or reordered histories must refuse");
 return {events:events.length,sha256:digest(JSON.stringify(history))};
}
export async function replaySemanticPair(artifacts,histories){
 semanticPair(artifacts);assert(Array.isArray(histories)&&histories.length===2);
 const historyEvidence=histories.map(completedSemanticHistory);
 assert.notEqual(historyEvidence[0].sha256,historyEvidence[1].sha256,"Two independent captures required");
 const checks=[];
 for(let i=0;i<2;i++){
  await Worker.runReplayHistory({workflowBundle:{codePath:artifacts[i].codePath}},histories[i]);
  checks.push({historyBuild:artifacts[i].buildId,replayBuild:artifacts[i].buildId,result:"compatible"});
  let refused=false;
  try{await Worker.runReplayHistory({workflowBundle:{codePath:artifacts[1-i].codePath}},histories[i]);}
  catch(error){
   // Missing libraries, corrupt bundles and transport errors are NOT incompatible-code proof.
   if(!(error instanceof DeterminismViolationError))throw Error("Cross-version replay failed without verified nondeterminism");
   refused=true;
  }
  assert(refused,"Deliberately incompatible code unexpectedly replayed successfully");
  checks.push({historyBuild:artifacts[i].buildId,replayBuild:artifacts[1-i].buildId,result:"nondeterminism-refused"});
 }
 return {checks,histories:historyEvidence};
}
