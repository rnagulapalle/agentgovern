// Candidate input association only. Never authorizes a release or starts services.
// GitHub metadata must come from the authenticated API, not an uploaded manifest.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {typedReceipt} from "./staging-browser-record.mjs";

export const componentSteps={
 trial:"Run actual assembled typed workflow",
 receipt:"Retain successful measured receipt before the unchanged full regression gate",
 archive:"Retain verified candidate image inputs; not release acceptance",
 quality:"Full unchanged quality gate",
 cleanup:"Remove this job's owned quality fixture and temporary model input",
};
export function verifyComponentArtifactRequest(request,run,job,artifact,now=Date.now()){
 assert.deepEqual(Object.keys(request).sort(),["archiveSha256","artifactId","manifestSha256","overlaySha256","publicBaseCommit","receiptSha256","runId","workflowCommit"].sort());
 for(const key of ["runId","artifactId"])assert(Number.isSafeInteger(request[key])&&request[key]>0);
 for(const key of ["workflowCommit","publicBaseCommit"])assert(/^[a-f0-9]{40}$/.test(request[key]));
 for(const key of ["manifestSha256","archiveSha256","receiptSha256","overlaySha256"])assert(/^[a-f0-9]{64}$/.test(request[key]));
 assert(Number.isFinite(now)&&now>=0);
 assert.equal(run.id,request.runId);assert.equal(run.status,"completed");
 assert(["success","failure"].includes(run.conclusion));assert.equal(run.head_sha,request.workflowCommit);
 assert.equal(run.head_branch,"codex/looplabs-platform-integration");assert.equal(run.event,"push");
 assert.equal(run.head_repository?.full_name,"rnagulapalle/sandbox");assert.equal(run.path,".github/workflows/looplabs-platform-proof.yml");
 assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.equal(job.name,"assembled-platform");
 assert.equal(job.status,"completed");assert.equal(job.conclusion,run.conclusion);assert(Array.isArray(job.steps));
 const required=Object.values(componentSteps).map(name=>{
  const matches=job.steps.filter(step=>step.name===name);assert.equal(matches.length,1,"Unique required component step missing");
  const step=matches[0];assert.equal(step.status,"completed");assert(Number.isSafeInteger(step.number)&&step.number>0);return step;
 });
 assert(required.slice(1).every((step,i)=>step.number>required[i].number),"Component steps out of order");
 for(const step of required.filter(step=>step.name!==componentSteps.quality))assert.equal(step.conclusion,"success");
 const quality=required.find(step=>step.name===componentSteps.quality);
 assert.equal(quality.conclusion,run.conclusion);
 // An unrelated failure, cancellation or timeout cannot become a candidate input.
 for(const step of job.steps){
  assert.equal(step.status,"completed");
  assert(["success","skipped"].includes(step.conclusion)||(step===quality&&step.conclusion==="failure"));
 }
 assert.equal(artifact.id,request.artifactId);assert.equal(artifact.name,`looplabs-candidate-platform-images-${request.runId}`);
 assert.equal(artifact.expired,false);
 assert(Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=8*1024**3+2*1024**2+65536);
 assert(Number.isFinite(Date.parse(artifact.expires_at))&&Date.parse(artifact.expires_at)>now);
 assert.equal(artifact.workflow_run?.id,request.runId);assert.equal(artifact.workflow_run?.head_sha,request.workflowCommit);
 return {...request,purpose:"isolated-staging-proof-input",qualityPassed:quality.conclusion==="success",releaseAccepted:false};
}

export function verifyComponentReceipt(encoded,origin,sources){
 try{
  assert(origin?.purpose==="isolated-staging-proof-input"&&origin.releaseAccepted===false);
  assert(Buffer.isBuffer(encoded)&&encoded.length>0&&encoded.length<=2*1024**2);
  assert.equal(createHash("sha256").update(encoded).digest("hex"),origin.receiptSha256);
  const receipt=JSON.parse(encoded.toString("utf8")),{executionEvidence,sourceFingerprints,...runtime}=receipt;
  assert.deepEqual(Object.keys(sourceFingerprints).sort(),Object.keys(sources).sort());assert(Object.keys(sources).length>0);
  for(const [file,bytes] of Object.entries(sources)){
   assert(typeof bytes==="string"||Buffer.isBuffer(bytes));
   assert.equal(createHash("sha256").update(bytes).digest("hex"),sourceFingerprints[file]);
  }
  const metadata={runId:origin.runId,privateWorkflowCommit:origin.workflowCommit,publicBaseCommit:origin.publicBaseCommit,exactCompressedOverlaySha256:origin.overlaySha256};
  assert.equal(executionEvidence.runId,origin.runId);
  // The runtime sourceCommit identifies the private provider fixture, while
  // executionEvidence.publicBaseCommit identifies the LoopLabs checkout.
  assert.equal(runtime.sourceCommit,"08372aadbaa6fb8f37368c6900323b8619c10f2c","Exact reviewed provider fixture source required");
  assert.deepEqual(typedReceipt(runtime,metadata,sourceFingerprints),receipt);
  assert.equal(receipt.artifact.manifestSha256,origin.manifestSha256);
  assert.equal(receipt.artifact.archiveSha256,origin.archiveSha256);
  return receipt;
 }catch{throw Error("Candidate component receipt refused; no release authority granted.");}
}
