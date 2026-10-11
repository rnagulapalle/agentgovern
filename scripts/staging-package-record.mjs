// Validate a measured receipt; this cannot establish that its CI origin succeeded.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {typedReceipt,membershipAuthoritySourceFiles} from "./staging-browser-record.mjs";
import {retainedPackageTrial} from "./staging-package-trial-source.mjs";
import {acceptedPackageTrial} from "./staging-accepted-package-inputs.mjs";
export const packageSources=["transition","pending","pending-controller","releases","trial-source","proof","browser"].map(name=>`scripts/staging-package-${name}.mjs`);
export const currentPackageSources=[...packageSources,"scripts/staging-accepted-package-inputs.mjs","scripts/staging-artifact-retrieval.mjs"];
function checkedPackageReceipt(receipt,origins,sources,expectedRunIds,expectedFileCount,helpers=packageSources,trial=retainedPackageTrial){
 assert.deepEqual(Object.keys(receipt).sort(),["passed","scope","packageTransitions","packageOrigins","pendingPackageBrowser","releaseImagesRemoved","generatedTrialSha256","runtime","sourceFingerprints","notVerified"].sort());
 assert.equal(receipt.passed,true);assert.equal(receipt.releaseImagesRemoved,true);
 assert.equal(receipt.scope,"same-worker-build retained application package promotion/reversion with unapproved pending API and trusted HTTPS UI work");
 assert.deepEqual(receipt.notVerified,["semantic worker-version upgrade","persistent staging and operator rollback acceptance","live providers and enterprise production SLA"]);
 assert.deepEqual(receipt.pendingPackageBrowser,{trustedHTTPS:true,namedFormSession:true,sameSession:true,savedPendingReloads:3,sameActionHashes:true,heldWithoutApproval:true,noSelfApproval:true,mobileWidth:390,noHorizontalOverflow:true});
 assert(Array.isArray(origins)&&origins.length===2);
 assert.deepEqual(origins.map(r=>r.executionEvidence.runId),expectedRunIds);
 assert.equal(new Set(expectedRunIds).size,2);
 assert.equal(origins[0].buildId,origins[1].buildId);
 const images=origins.map(r=>Object.fromEntries(r.images.map(i=>[i.role,i.id])));
 assert.equal(new Set(origins.flatMap(r=>r.images.map(i=>i.id))).size,8);
 assert.equal(receipt.packageTransitions.length,2);assert.equal(receipt.packageOrigins.length,2);
 for(let i=0;i<2;i++){
  const from=images[i],to=images[1-i],origin=origins[i];
  assert.deepEqual(receipt.packageTransitions[i],{buildId:origin.buildId,from:{web:from.web,worker:from.worker},to:{web:to.web,worker:to.worker},replacedRoles:3,retainedRoles:5,pendingAuthorityChecks:3});
  assert.deepEqual(receipt.packageOrigins[i],{runId:origin.executionEvidence.runId,manifestSha256:origin.artifact.manifestSha256,archiveSha256:origin.artifact.archiveSha256,archiveBytes:origin.artifact.archiveBytes});
 }
 const {executionEvidence,sourceFingerprints,...runtime}=receipt.runtime;
 const {runId,privateWorkflowCommit,publicBaseCommit,exactCompressedOverlaySha256}=executionEvidence;
 assert.deepEqual(sourceFingerprints,{});
 assert.deepEqual(typedReceipt(runtime,{runId,privateWorkflowCommit,publicBaseCommit,exactCompressedOverlaySha256},{}),receipt.runtime);
 assert.equal(runtime.buildId,origins[1].buildId);assert.deepEqual(runtime.images,origins[0].images);
 const files=[...Object.keys(origins[1].sourceFingerprints),...helpers].sort();
 assert.equal(files.length,expectedFileCount);assert.deepEqual(Object.keys(receipt.sourceFingerprints).sort(),files);
 for(const file of files){
  assert.equal(typeof sources[file],"string");
  assert.equal(createHash("sha256").update(sources[file]).digest("hex"),receipt.sourceFingerprints[file],`Measured source changed: ${file}`);
 }
 assert.equal(createHash("sha256").update(trial(sources["scripts/staging-platform-proof.mjs"])).digest("hex"),receipt.generatedTrialSha256);
 return receipt;
}
// This retained record measured 97 runtime files and seven package helpers.
// It cannot establish acceptance of the current runtime.
export function validatePackageReceipt(receipt,origins,sources){
 assert.equal(Object.keys(origins[1].sourceFingerprints).length,97);
 return checkedPackageReceipt(receipt,origins,sources,[37877500571,37881876443],104);
}
// Caller must separately authenticate successful CI/artifact observations for
// both origins and the package trial. This function verifies measured consistency.
export function validateCurrentAcceptedPackageReceipt(receipt,origins,sources,expectedRuntimeFiles){
 assert(Array.isArray(origins)&&origins.length===2);
 assert.equal(expectedRuntimeFiles.length,106);
 assert(membershipAuthoritySourceFiles.every(file=>expectedRuntimeFiles.includes(file)),"Membership authority sources required");
 for(const origin of origins){
  assert.deepEqual(Object.keys(origin.sourceFingerprints).sort(),[...expectedRuntimeFiles].sort());
  for(const file of expectedRuntimeFiles)assert.equal(createHash('sha256').update(sources[file]).digest('hex'),origin.sourceFingerprints[file],`Current origin source changed: ${file}`);
  const {executionEvidence,sourceFingerprints,...runtime}=origin;
  const {runId,privateWorkflowCommit,publicBaseCommit,exactCompressedOverlaySha256}=executionEvidence;
  assert.deepEqual(typedReceipt(runtime,{runId,privateWorkflowCommit,publicBaseCommit,exactCompressedOverlaySha256},sourceFingerprints),origin);
  assert(origin.artifact,"Exact retained origin archive required");
 }
 return checkedPackageReceipt(receipt,origins,sources,origins.map(r=>r.executionEvidence.runId),115,currentPackageSources,acceptedPackageTrial);
}
