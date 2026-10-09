// Validate a measured receipt; this cannot establish that its CI origin succeeded.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {typedReceipt} from "./staging-browser-record.mjs";
import {retainedPackageTrial} from "./staging-package-trial-source.mjs";
export const packageSources=["transition","pending","pending-controller","releases","trial-source","proof","browser"].map(name=>`scripts/staging-package-${name}.mjs`);
export function validatePackageReceipt(receipt,origins,sources){
 assert.deepEqual(Object.keys(receipt).sort(),["passed","scope","packageTransitions","packageOrigins","pendingPackageBrowser","releaseImagesRemoved","generatedTrialSha256","runtime","sourceFingerprints","notVerified"].sort());
 assert.equal(receipt.passed,true);assert.equal(receipt.releaseImagesRemoved,true);
 assert.equal(receipt.scope,"same-worker-build retained application package promotion/reversion with unapproved pending API and trusted HTTPS UI work");
 assert.deepEqual(receipt.notVerified,["semantic worker-version upgrade","persistent staging and operator rollback acceptance","live providers and enterprise production SLA"]);
 assert.deepEqual(receipt.pendingPackageBrowser,{trustedHTTPS:true,namedFormSession:true,sameSession:true,savedPendingReloads:3,sameActionHashes:true,heldWithoutApproval:true,noSelfApproval:true,mobileWidth:390,noHorizontalOverflow:true});
 assert(Array.isArray(origins)&&origins.length===2);
 assert.deepEqual(origins.map(r=>r.executionEvidence.runId),[37877500571,37881876443]);
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
 const files=[...Object.keys(origins[1].sourceFingerprints),...packageSources].sort();
 assert.equal(files.length,104);assert.deepEqual(Object.keys(receipt.sourceFingerprints).sort(),files);
 for(const file of files){
  assert.equal(typeof sources[file],"string");
  assert.equal(createHash("sha256").update(sources[file]).digest("hex"),receipt.sourceFingerprints[file],`Measured source changed: ${file}`);
 }
 assert.equal(createHash("sha256").update(retainedPackageTrial(sources["scripts/staging-platform-proof.mjs"])).digest("hex"),receipt.generatedTrialSha256);
 return receipt;
}
