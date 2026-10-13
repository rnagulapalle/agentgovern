// Consistency and source freshness only. Authenticate CI origin independently.
// A fixture receipt never authorizes installation or transport activation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const inspectionProofSources=['scripts/persistent-docker-inspection.mjs','scripts/persistent-docker-inspection-proof.mjs'];
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),[...expected].sort());
export function validateInspectionFixtureReceipt(receipt,sources,origin){
 keys(receipt,['version','passed','scope','image','roles','checks','workflowRunId','workflowCommit','productionChanged','activationEstablished','acceptedProvenanceEstablished','enterpriseSlaEstablished','ownedResourceCleanupVerified','sourceFingerprints']);
 assert.equal(receipt.version,1);assert.equal(receipt.passed,true);
 assert.equal(receipt.scope,'actual isolated lightweight Docker inspection fixture only');
 assert.equal(receipt.roles,8);assert.equal(receipt.ownedResourceCleanupVerified,true);
 for(const key of ['productionChanged','activationEstablished','acceptedProvenanceEstablished','enterpriseSlaEstablished'])assert.equal(receipt[key],false);
 keys(receipt.image,['selectionTag','id','repoDigest']);assert.equal(receipt.image.selectionTag,'alpine:3.20');
 assert(/^sha256:[a-f0-9]{64}$/.test(receipt.image.id));assert(/^alpine@sha256:[a-f0-9]{64}$/.test(receipt.image.repoDigest));
 keys(receipt.checks,['actualHealthyRunning','completeSecurityConfiguration','measuredMalformedRefusal','actualExtraNetworkDetected','extraNetworkRemoved','stoppedContainerObserved']);
 assert(Object.values(receipt.checks).every(value=>value===true));
 keys(origin,['runId','workflowCommit']);assert(Number.isSafeInteger(origin.runId)&&origin.runId>0);assert(/^[a-f0-9]{40}$/.test(origin.workflowCommit));
 assert.equal(receipt.workflowRunId,String(origin.runId));assert.equal(receipt.workflowCommit,origin.workflowCommit);
 keys(receipt.sourceFingerprints,inspectionProofSources);keys(sources,inspectionProofSources);
 for(const file of inspectionProofSources){assert(typeof sources[file]==='string'||Buffer.isBuffer(sources[file]));assert.equal(receipt.sourceFingerprints[file],createHash('sha256').update(sources[file]).digest('hex'),`Measured inspection source changed: ${file}`);}
 return receipt;
}
