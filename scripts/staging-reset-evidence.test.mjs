import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateResetReceipt,resetSources} from './staging-reset-record.mjs';
const bytes=readFileSync('docs/evidence/staging-reset-proof.json'),receipt=JSON.parse(bytes);
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const drain=load('docs/evidence/staging-drain-proof.json'),semantic=load('docs/evidence/staging-semantic-proof.json'),browser=load('docs/evidence/staging-platform-browser-proof.json');
const sources=Object.fromEntries([...Object.keys(drain.sourceFingerprints),...resetSources].map(f=>[f,readFileSync(f,'utf8')]));
test('retained actual assembled reset receipt preserves complete parent acceptance and current131 sources',()=>{
 expect(createHash('sha256').update(bytes).digest('hex')).toBe('b2d79f9ab8172e2ade44a1ea30aa4ad6042c32297a6a9183372f6039a7bcd3f0');
 expect(validateResetReceipt(receipt,drain,semantic,browser,sources)).toBe(receipt);
 expect(receipt.runtime.executionEvidence).toMatchObject({runId:38084608972,privateWorkflowCommit:'897184a9164dd4b0d8e4399e31eb6be3f7d08318',publicBaseCommit:'46cf28cef76b6643aedacc5c1c1dd52e05826019',exactCompressedOverlaySha256:'091b0c5c643028d7d6e85cb8252c413bca8f97b9b7f3b65f75c2efd77b9586e5',productionChanged:false});
 expect(receipt.semanticLifecycle.resetArchive.actions).toBe(12);
});
test('missing reset, effect, restore, authority or parent proof refuses acceptance',()=>{
 const changes=[r=>r.passed=false,r=>r.resetAssembly.enrollmentCompleted=false,r=>r.resetAssembly.images[1]=r.resetAssembly.images[0],r=>r.semanticLifecycle.resetEvidence.rpcCalls=2,r=>r.semanticLifecycle.resetEvidence.newProcessRetryRefused=false,r=>r.semanticLifecycle.resetEvidence.independentLineageObserved=false,r=>r.semanticLifecycle.resetEvidence.committedUncertainty=false,r=>r.semanticLifecycle.resetEvidence.workerBuildId=r.semanticLifecycle.builds[1],r=>r.semanticLifecycle.resetEvidence.resetRunId='invalid',r=>delete r.semanticLifecycle.resetEvidence.effects[Object.keys(r.semanticLifecycle.resetEvidence.effects)[0]],r=>Object.values(r.semanticLifecycle.resetEvidence.effects)[0].actionId='different',r=>Object.values(r.semanticLifecycle.resetEvidence.effects)[0].connector='other',r=>Object.values(r.semanticLifecycle.resetEvidence.effects)[0].recordId='unsafe',r=>Object.values(r.semanticLifecycle.resetEvidence.effects)[0].reference='',r=>Object.values(r.semanticLifecycle.resetEvidence.effects).find(e=>e.connector==='email').body.to=['real@customer.com'],r=>r.semanticLifecycle.resetArchive.staleResetRefused=false,r=>r.semanticLifecycle.resetArchive.replacementIntentRefused=false,r=>r.semanticLifecycle.resetArchive.restoredAuthorityRevoked=false,r=>r.semanticLifecycle.resetArchive.actionIdentitiesPreserved=false,r=>r.semanticLifecycle.resetArchive.reservationsPreserved=false,r=>r.semanticLifecycle.resetArchive.buildsDraining=1,r=>r.semanticLifecycle.resetArchive.actions=0,r=>r.semanticLifecycle.resetArchive.backupSha256='0'.repeat(64),r=>r.semanticLifecycle.resetArchive.externalEpochRotatedBeforeRestore=false,r=>r.semanticLifecycle.admissionFence.drainFirstRefused=false,r=>r.runtime.browser.checks.pop(),r=>r.runtime.restoreContainment.revivedSessionsRefused=false,r=>r.notVerified=[],r=>r.extra='unreviewed'];
 for(const change of changes){const value=structuredClone(receipt);change(value);expect(()=>validateResetReceipt(value,drain,semantic,browser,sources)).toThrow();}
});
test('reset source drift, reduced coverage and substituted parent source identities require fresh evidence',()=>{
 for(const file of resetSources)expect(()=>validateResetReceipt(receipt,drain,semantic,browser,{...sources,[file]:sources[file]+'\n// drift'})).toThrow();
 const reduced=structuredClone(receipt);delete reduced.sourceFingerprints[resetSources[0]];expect(()=>validateResetReceipt(reduced,drain,semantic,browser,sources)).toThrow();
 const substituted=structuredClone(receipt);substituted.sourceFingerprints['runtime/temporal/outbox.ts']='0'.repeat(64);expect(()=>validateResetReceipt(substituted,drain,semantic,browser,sources)).toThrow();
});
