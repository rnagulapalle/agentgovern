import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateResetReceipt,resetSources} from './staging-reset-record.mjs';
const bytes=readFileSync('docs/evidence/staging-reset-proof.json'),receipt=JSON.parse(bytes);
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const drain=load('docs/evidence/staging-drain-proof.json'),semantic=load('docs/evidence/staging-semantic-proof.json'),browser=load('docs/evidence/staging-platform-browser-proof.json');
const sources=Object.fromEntries([...Object.keys(drain.sourceFingerprints),...resetSources].map(f=>[f,readFileSync(f,'utf8')]));
test('retained actual assembled reset receipt preserves complete parent acceptance and current129 sources',()=>{
 expect(createHash('sha256').update(bytes).digest('hex')).toBe('9ac40f8a6dff8c8edad8e635bfa3b1f31f830703a14bcb140e6fd01f9d839e60');
 expect(validateResetReceipt(receipt,drain,semantic,browser,sources)).toBe(receipt);
 expect(receipt.runtime.executionEvidence).toMatchObject({runId:37932460184,privateWorkflowCommit:'77b7f304b44fc962f1c963822e035cfda9d81064',publicBaseCommit:'95f5a086c77b4537c0bfe1e4ddb547ae572b4886',productionChanged:false});
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
