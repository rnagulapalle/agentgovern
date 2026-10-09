// Receipt consistency/freshness only. Authenticate the private CI artifact separately.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateDrainReceipt} from './staging-drain-record.mjs';
export const resetSources=['lib/enquiries/reset-intent-schema.sql','scripts/reset-intent-setup.ts','scripts/reset-intent-store.mjs','scripts/temporal-completed-reset.mjs','scripts/reset-assembly-enrollment.mjs','scripts/staging-reset-enroll.mjs','scripts/staging-reset-bootstrap.mjs','scripts/staging-reset-source.mjs','scripts/staging-reset-owner.mjs','scripts/reset-owner-diagnostic.mjs','scripts/staging-reset-archive.mjs','scripts/staging-reset-restore-owner.mjs','scripts/restored-reset-verification.mjs','scripts/restored-worker-containment.mjs','scripts/worker-restore-contain.mjs','scripts/staging-reset-proof.mjs'];
const hash=value=>createHash('sha256').update(value).digest('hex'),sha=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateResetReceipt(receipt,drain,semantic,browser,sources){
 validateDrainReceipt(drain,semantic,browser,sources);
 assert.deepEqual(Object.keys(receipt).sort(),['passed','scope','resetAssembly','semanticLifecycle','semanticAdmission','runtime','sourceFingerprints','generatedTrialSha256','generatedControllerSha256','generatedHostSha256','notVerified'].sort());
 assert.equal(receipt.passed,true);
 assert.equal(receipt.scope,'Disposable named-approval worker reset/restart and pending-intent archive containment with private record twins');
 assert.deepEqual(receipt.notVerified,['complete retirement and artifact deletion policy','long-term image and history retention','persistent remote operator acceptance','live providers','production cutover','enterprise production SLA']);
 const {resetAssembly,...parent}=receipt;
 const {resetEvidence,resetArchive,...lifecycle}=receipt.semanticLifecycle;
 validateDrainReceipt({...parent,scope:drain.scope,notVerified:drain.notVerified,semanticLifecycle:lifecycle,sourceFingerprints:drain.sourceFingerprints},semantic,browser,sources);
 assert.deepEqual(Object.keys(resetAssembly).sort(),['builds','images','enrollmentCompleted'].sort());
 assert.equal(resetAssembly.enrollmentCompleted,true);assert.deepEqual(resetAssembly.builds,lifecycle.builds);assert.deepEqual(resetAssembly.images,lifecycle.images);
 assert.deepEqual(Object.keys(resetEvidence).sort(),['passed','newProcessRetryRefused','independentLineageObserved','resetRunId','workerBuildId','rpcCalls','committedUncertainty','pendingArchiveSha256','effects'].sort());
 for(const f of ['passed','newProcessRetryRefused','independentLineageObserved','committedUncertainty'])assert.equal(resetEvidence[f],true);
 assert.equal(resetEvidence.rpcCalls,1);assert(uuid.test(resetEvidence.resetRunId));assert.equal(resetEvidence.workerBuildId,lifecycle.builds[0]);assert(sha.test(resetEvidence.pendingArchiveSha256));
 const effects=Object.entries(resetEvidence.effects);assert.equal(effects.length,4);const counts={crm:0,email:0},records=new Map();
 for(const [id,effect] of effects){
  assert(uuid.test(id));assert.deepEqual(Object.keys(effect).sort(),['actionId','body','connector','observedVersion','recordId','reference','resource','response'].sort());
  assert.equal(effect.actionId,id);assert(['crm','email'].includes(effect.connector));counts[effect.connector]++;
  assert(typeof effect.recordId==='string'&&/^[0-9]{1,24}$/.test(effect.recordId));
  assert(typeof effect.reference==='string'&&effect.reference.length>0&&effect.reference.length<=128);
  const perRecord=records.get(effect.recordId)||[];perRecord.push(effect.connector);records.set(effect.recordId,perRecord);
  if(effect.connector==='email')assert(Array.isArray(effect.body.to)&&effect.body.to.length===1&&/^[a-zA-Z0-9._+-]+@example\.test$/.test(effect.body.to[0]));
 }
 assert.deepEqual(counts,{crm:2,email:2});assert.equal(records.size,2);for(const value of records.values())assert.deepEqual(value.sort(),['crm','email']);
 assert.deepEqual(Object.keys(resetArchive).sort(),['passed','staleResetRefused','replacementIntentRefused','restoredAuthorityRevoked','actionIdentitiesPreserved','reservationsPreserved','buildsDraining','actions','actionIdentitySha256','backupSha256','isolatedCopy','externalEpochRotatedBeforeRestore'].sort());
 for(const f of ['passed','staleResetRefused','replacementIntentRefused','restoredAuthorityRevoked','actionIdentitiesPreserved','reservationsPreserved','isolatedCopy','externalEpochRotatedBeforeRestore'])assert.equal(resetArchive[f],true);
 assert.equal(resetArchive.buildsDraining,2);assert(Number.isSafeInteger(resetArchive.actions)&&resetArchive.actions>=4);assert(sha.test(resetArchive.actionIdentitySha256));assert.equal(resetArchive.backupSha256,resetEvidence.pendingArchiveSha256);
 const files=[...Object.keys(drain.sourceFingerprints),...resetSources].sort();assert.equal(files.length,129);assert.deepEqual(Object.keys(receipt.sourceFingerprints).sort(),files);
 for(const file of files){assert.equal(typeof sources[file],'string');assert.equal(hash(sources[file]),receipt.sourceFingerprints[file],`Measured reset source changed: ${file}`);if(file in drain.sourceFingerprints)assert.equal(receipt.sourceFingerprints[file],drain.sourceFingerprints[file]);}
 return receipt;
}
