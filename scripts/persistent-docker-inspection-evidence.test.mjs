import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {inspectionProofSources,validateInspectionFixtureReceipt} from './persistent-docker-inspection-record.mjs';
const receipt=JSON.parse(readFileSync('docs/evidence/persistent-docker-inspection-proof.json','utf8'));
const sources=Object.fromEntries(inspectionProofSources.map(file=>[file,readFileSync(file)]));
// Exact origin independently observed through authenticated run/jobs/artifact API.
const origin={runId:38082845227,workflowCommit:'c9f8a821c3356d068be5618d597fb45fb81d06c1'};
test('retained actual Docker fixture evidence matches current sources and exact observed origin',()=>{
 expect(validateInspectionFixtureReceipt(receipt,sources,origin)).toBe(receipt);
});
test('fixture evidence cannot claim activation, provenance, SLA, missing cleanup or weakened observations',()=>{
 const changes=[r=>r.activationEstablished=true,r=>r.acceptedProvenanceEstablished=true,r=>r.enterpriseSlaEstablished=true,r=>r.productionChanged=true,r=>r.ownedResourceCleanupVerified=false,r=>r.roles=7,r=>r.passed=false,r=>r.scope='production platform',r=>r.image.id='latest',r=>r.image.repoDigest='alpine:latest',r=>r.image.selectionTag='unreviewed',r=>r.workflowRunId='1',r=>r.workflowCommit='a'.repeat(40),r=>r.extra=true,...Object.keys(receipt.checks).map(key=>r=>r.checks[key]=false),r=>delete r.checks.actualExtraNetworkDetected];
 for(const change of changes){const altered=structuredClone(receipt);change(altered);expect(()=>validateInspectionFixtureReceipt(altered,sources,origin)).toThrow();}
});
test('changed inspection code or reduced source coverage requires a genuine new measurement',()=>{
 for(const file of inspectionProofSources)expect(()=>validateInspectionFixtureReceipt(receipt,{...sources,[file]:Buffer.concat([sources[file],Buffer.from('\n// changed')])},origin)).toThrow();
 const altered=structuredClone(receipt);delete altered.sourceFingerprints[inspectionProofSources[0]];
 expect(()=>validateInspectionFixtureReceipt(altered,sources,origin)).toThrow();
 expect(()=>validateInspectionFixtureReceipt(receipt,sources,{...origin,runId:1})).toThrow();
});
