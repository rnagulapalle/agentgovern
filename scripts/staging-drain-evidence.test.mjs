import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateDrainReceipt,drainSources} from './staging-drain-record.mjs';
const receiptBytes=readFileSync('docs/evidence/staging-drain-proof.json');
const receipt=JSON.parse(receiptBytes.toString('utf8'));
const semantic=JSON.parse(readFileSync('docs/evidence/staging-semantic-proof.json','utf8'));
const browser=JSON.parse(readFileSync('docs/evidence/staging-platform-browser-proof.json','utf8'));
const sources=Object.fromEntries([...Object.keys(semantic.sourceFingerprints),...drainSources].map(f=>[f,readFileSync(f,'utf8')]));
test('retained actual drain receipt preserves complete runtime authority, both races and current113 sources',()=>{
 expect(createHash('sha256').update(receiptBytes).digest('hex')).toBe('003c13b172627e7a53dac3424f22153b1e5dbda811e16f75bbe52341a903921a');
 expect(validateDrainReceipt(receipt,semantic,browser,sources)).toBe(receipt);
 expect(receipt.runtime.executionEvidence).toMatchObject({runId:37911844347,privateWorkflowCommit:'cea6c0ea978392aad6c83a7bc3c0e037669607dc',publicBaseCommit:'f81c5bb9c9dddab814cd3b3d6ce1416fb0c32342',productionChanged:false});
});
test('weakening races, rollback, idempotency, retained pending route, recovery or scope refuses',()=>{
 const changes=[r=>r.semanticLifecycle.admissionFence.drainFirstRefused=false,r=>r.semanticLifecycle.admissionFence.admissionFirstCommitted=false,r=>r.semanticLifecycle.admissionFence.failedTransferRolledBack=false,r=>r.semanticLifecycle.admissionFence.existingTransfersIdempotent=false,r=>r.semanticLifecycle.admissionFence.additionalHeldRoute=0,r=>r.semanticLifecycle.admissionFence.noRetirementAuthorized=false,r=>r.semanticLifecycle.oldWorkerRecreated=false,r=>r.semanticLifecycle.finalEffects=5,r=>r.semanticLifecycle.images[1]=r.semanticLifecycle.images[0],r=>r.semanticLifecycle.replay.checks[1].result='compatible',r=>r.semanticAdmission.hostReserveBytes=0,r=>r.semanticAdmission.availableBytes=0,r=>r.runtime.restoreContainment.restoredApprovalRefused=false,r=>r.runtime.browser.checks.pop(),r=>r.runtime.executionEvidence.productionChanged=true,r=>r.notVerified=[],r=>r.generatedHostSha256='invalid',r=>r.extra='unreviewed'];
 for(const change of changes){const candidate=structuredClone(receipt);change(candidate);expect(()=>validateDrainReceipt(candidate,semantic,browser,sources)).toThrow();}
});
test('drift in outbox or any covered drain source and reduced evidence coverage require fresh proof',()=>{
 for(const f of ['runtime/temporal/outbox.ts',...drainSources])expect(()=>validateDrainReceipt(receipt,semantic,browser,{...sources,[f]:sources[f]+'\n// drift\n'})).toThrow();
 const candidate=structuredClone(receipt);delete candidate.sourceFingerprints[drainSources[0]];expect(()=>validateDrainReceipt(candidate,semantic,browser,sources)).toThrow();
});
