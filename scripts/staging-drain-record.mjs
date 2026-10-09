// Recorded consistency/source freshness only; authenticate CI provenance separately.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {typedReceipt} from './staging-browser-record.mjs';
import {validateSemanticReceipt} from './staging-semantic-record.mjs';
export const drainSources=['lib/enquiries/worker-admission-schema.sql','scripts/worker-admission-setup.ts','scripts/worker-artifact-enrollment.mjs','scripts/staging-drain-owner.mjs','scripts/staging-drain-exercise.mjs','scripts/staging-drain-source.mjs','scripts/staging-drain-proof.mjs'];
const hash=value=>createHash('sha256').update(value).digest('hex');
export function validateDrainReceipt(receipt,semanticBaseline,browserBaseline,sources){
 validateSemanticReceipt(semanticBaseline,browserBaseline,sources);
 assert.deepEqual(Object.keys(receipt).sort(),['passed','scope','semanticLifecycle','semanticAdmission','runtime','sourceFingerprints','generatedTrialSha256','generatedControllerSha256','generatedHostSha256','notVerified'].sort());
 assert.equal(receipt.passed,true);
 assert.equal(receipt.scope,'Disposable authenticated worker admission/drain races with existing pinned histories and bounded private record twins');
 assert.deepEqual(receipt.notVerified,['full retirement/reset fence','migration14 archive restore/retention policy','long-term image and history retention','persistent remote operator acceptance','live providers','production cutover','enterprise production SLA']);
 const {admissionFence,images,replay,...flags}=receipt.semanticLifecycle;
 assert.deepEqual(admissionFence,{passed:true,admissionFirstCommitted:true,drainFirstRefused:true,failedTransferRolledBack:true,existingTransfersIdempotent:true,additionalHeldRoute:1,noRetirementAuthorized:true});
 const {images:originalImages,replay:originalReplay,...originalFlags}=semanticBaseline.semanticLifecycle;
 assert.equal(originalImages.length,2);assert.deepEqual(flags,originalFlags);
 assert(Array.isArray(images)&&images.length===2&&images.every(x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x)));assert.notEqual(...images);
 assert.deepEqual(Object.keys(replay).sort(),['checks','histories']);assert.deepEqual(replay.checks,originalReplay.checks);
 assert.equal(replay.histories.length,2);
 for(const history of replay.histories){assert.deepEqual(Object.keys(history).sort(),['events','sha256']);assert(Number.isSafeInteger(history.events)&&history.events>=7);assert(/^[a-f0-9]{64}$/.test(history.sha256));}
 assert.notEqual(replay.histories[0].sha256,replay.histories[1].sha256);
 const admission=receipt.semanticAdmission;
 assert.deepEqual(Object.keys(admission).sort(),['admitted','blockers','existingBytes','plannedBytes','hostReserveBytes','totalBytes','availableBytes'].sort());
 assert.equal(admission.admitted,true);assert.deepEqual(admission.blockers,[]);
 assert.equal(admission.plannedBytes,semanticBaseline.semanticAdmission.plannedBytes);assert.equal(admission.hostReserveBytes,1024**3);
 for(const key of ['existingBytes','totalBytes','availableBytes'])assert(Number.isSafeInteger(admission[key])&&admission[key]>=0);
 assert(admission.totalBytes>=admission.existingBytes+admission.plannedBytes+admission.hostReserveBytes);
 assert(admission.availableBytes<=admission.totalBytes&&admission.availableBytes>=admission.plannedBytes+admission.hostReserveBytes);
 const {executionEvidence,sourceFingerprints,...runtime}=receipt.runtime;
 const {runId,privateWorkflowCommit,publicBaseCommit,exactCompressedOverlaySha256}=executionEvidence;
 assert.deepEqual(sourceFingerprints,{});
 assert.deepEqual(typedReceipt(runtime,{runId,privateWorkflowCommit,publicBaseCommit,exactCompressedOverlaySha256},{}),receipt.runtime);
 assert.equal(runtime.buildId,flags.builds[0]);assert.equal(runtime.images.find(i=>i.role==='worker').id,images[0]);
 const files=[...Object.keys(semanticBaseline.sourceFingerprints),...drainSources].sort();assert.equal(files.length,113);assert.deepEqual(Object.keys(receipt.sourceFingerprints).sort(),files);
 for(const f of files){assert.equal(typeof sources[f],'string');assert.equal(hash(sources[f]),receipt.sourceFingerprints[f],`Measured source changed: ${f}`);if(f in semanticBaseline.sourceFingerprints)assert.equal(receipt.sourceFingerprints[f],semanticBaseline.sourceFingerprints[f]);}
 // Generated names are intentionally ephemeral; hashes are shape-checked here.
 // The runtime driver rehashed their actual bytes before emitting the receipt.
 for(const key of ['generatedTrialSha256','generatedControllerSha256','generatedHostSha256'])assert(typeof receipt[key]==='string'&&/^[a-f0-9]{64}$/.test(receipt[key]));
 return receipt;
}
