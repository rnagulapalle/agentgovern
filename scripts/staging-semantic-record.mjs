// Receipt consistency/freshness only: authenticate CI origin separately.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {typedReceipt} from "./staging-browser-record.mjs";
import {semanticPlatformTrial} from "./staging-semantic-trial-source.mjs";
export const semanticSources=["Dockerfile.temporal-version-proof","Dockerfile.temporal-version-proof.dockerignore","scripts/temporal-semantic-variant.mjs","scripts/build-temporal-semantic-variant.mjs","scripts/temporal-semantic-replay.mjs","scripts/staging-semantic-controller.mjs","scripts/staging-semantic-host.mjs","scripts/staging-semantic-trial-source.mjs","scripts/staging-semantic-proof.mjs"];
const hash=value=>createHash("sha256").update(value).digest("hex");
export function validateSemanticReceipt(receipt,baseline,sources){
 assert.deepEqual(Object.keys(receipt).sort(),["passed","scope","semanticLifecycle","semanticAdmission","runtime","sourceFingerprints","generatedTrialSha256","notVerified"].sort());
 assert.equal(receipt.passed,true);
 assert.equal(receipt.scope,"Disposable authenticated PostgreSQL-backed Temporal and two content-distinct worker images; bounded private record twins");
 assert.deepEqual(receipt.notVerified,["retirement admission/reset fence","long-term image and history retention","persistent remote operator acceptance","live providers","production cutover","enterprise production SLA"]);
 const lifecycle=receipt.semanticLifecycle;
 const {builds,images,replay,...flags}=lifecycle;
 assert.deepEqual(flags,{passed:true,oldWorkerKilled:true,oldWorkerRecreated:true,newWorkerContinued:true,heldEffects:0,newWhileOldAbsentEffects:2,finalEffects:4,additionalWritersStopped:true,notVerified:["retirement admission fence","long-term retention","production cutover","enterprise acceptance"]});
 for(const [values,pattern] of [[builds,/^ack-[a-f0-9]{64}$/],[images,/^sha256:[a-f0-9]{64}$/]]){
  assert(Array.isArray(values)&&values.length===2&&values.every(v=>typeof v==="string"&&pattern.test(v)));assert.notEqual(values[0],values[1]);
 }
 assert.deepEqual(Object.keys(replay).sort(),["checks","histories"]);
 assert.deepEqual(replay.checks,builds.flatMap((build,i)=>[{historyBuild:build,replayBuild:build,result:"compatible"},{historyBuild:build,replayBuild:builds[1-i],result:"nondeterminism-refused"}]));
 assert.equal(replay.histories.length,2);
 for(const history of replay.histories){assert.deepEqual(Object.keys(history).sort(),["events","sha256"]);assert(Number.isSafeInteger(history.events)&&history.events>=7);assert(/^[a-f0-9]{64}$/.test(history.sha256));}
 assert.notEqual(replay.histories[0].sha256,replay.histories[1].sha256);
 const admission=receipt.semanticAdmission;
 assert.deepEqual(Object.keys(admission).sort(),["admitted","blockers","existingBytes","plannedBytes","hostReserveBytes","totalBytes","availableBytes"].sort());
 assert.equal(admission.admitted,true);assert.deepEqual(admission.blockers,[]);
 assert.equal(admission.hostReserveBytes,1024**3);assert.equal(admission.plannedBytes,5248*1024**2);
 for(const key of ["existingBytes","totalBytes","availableBytes"])assert(Number.isSafeInteger(admission[key])&&admission[key]>=0);
 assert(admission.availableBytes<=admission.totalBytes&&admission.availableBytes>=admission.plannedBytes+admission.hostReserveBytes);
 const {executionEvidence,sourceFingerprints,...runtime}=receipt.runtime;
 const {runId,privateWorkflowCommit,publicBaseCommit,exactCompressedOverlaySha256}=executionEvidence;
 assert.deepEqual(sourceFingerprints,{});
 assert.deepEqual(typedReceipt(runtime,{runId,privateWorkflowCommit,publicBaseCommit,exactCompressedOverlaySha256},{}),receipt.runtime);
 assert.equal(runtime.buildId,builds[0]);assert.equal(runtime.images.find(i=>i.role==="worker").id,images[0]);
 const files=[...Object.keys(baseline.sourceFingerprints),...semanticSources].sort();
 assert.equal(files.length,106);assert.deepEqual(Object.keys(receipt.sourceFingerprints).sort(),files);
 for(const file of files){assert.equal(typeof sources[file],"string");assert.equal(hash(sources[file]),receipt.sourceFingerprints[file],`Measured source changed: ${file}`);if(file in baseline.sourceFingerprints)assert.equal(receipt.sourceFingerprints[file],baseline.sourceFingerprints[file]);}
 assert.equal(hash(semanticPlatformTrial(sources["scripts/staging-platform-proof.mjs"])),receipt.generatedTrialSha256);
 return receipt;
}
