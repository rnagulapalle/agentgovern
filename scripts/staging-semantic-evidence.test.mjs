import {readHistoricalProof} from './historical-proof-sources.mjs';
import {test,expect} from "vitest";
import {typedSourceFiles} from "./staging-browser-record.mjs";
import {readFileSync} from "node:fs";
import {validateSemanticReceipt,semanticSources} from "./staging-semantic-record.mjs";
const receipt=JSON.parse(readFileSync("docs/evidence/staging-semantic-proof.json","utf8"));
const baseline=JSON.parse(readFileSync("docs/evidence/staging-platform-browser-proof.json","utf8"));
const historical=readHistoricalProof('staging-semantic-proof.json'),sources=historical.sources;
expect(historical).toMatchObject({historical:true,eligible:false,releaseAccepted:false,currentSourceValidated:false});
expect(historical.receipt).toEqual(receipt);
test("actual two-image receipt retains full runtime, browser and recovery evidence with original measured sources; historical only",()=>{
 expect(validateSemanticReceipt(receipt,baseline,sources)).toBe(receipt);
 expect(receipt.runtime.executionEvidence).toMatchObject({runId:38098248911,privateWorkflowCommit:"370d80d1219d034c243218ca1ffb8f61a125d46c",publicBaseCommit:"46cf28cef76b6643aedacc5c1c1dd52e05826019",exactCompressedOverlaySha256:"8693b25024bc0e88e1fac83ea5f149079f634a9146ca020770774f5f63c3e259",productionChanged:false});
});
test("missing or weakened lifecycle, replay, admission, parent authority or scope evidence refuses",()=>{
 const changes=[r=>r.semanticLifecycle.installedMembershipHistory=false,r=>r.semanticLifecycle.builds[1]=r.semanticLifecycle.builds[0],r=>r.semanticLifecycle.images[1]=r.semanticLifecycle.images[0],r=>r.semanticLifecycle.oldWorkerKilled=false,r=>r.semanticLifecycle.finalEffects=5,r=>r.semanticLifecycle.replay.checks[1].result="compatible",r=>r.semanticLifecycle.replay.histories[0].events=0,r=>r.semanticLifecycle.additionalWritersStopped=false,r=>r.semanticAdmission.availableBytes=0,r=>r.semanticAdmission.hostReserveBytes=0,r=>r.runtime.restoreContainment.restoredApprovalRefused=false,r=>r.runtime.browser.checks.pop(),r=>r.runtime.executionEvidence.productionChanged=true,r=>r.notVerified=[],r=>r.generatedTrialSha256="0".repeat(64),r=>r.extra="unreviewed"];
 for(const change of changes){const candidate=structuredClone(receipt);change(candidate);expect(()=>validateSemanticReceipt(candidate,baseline,sources)).toThrow();}
});
test("source drift or reduced measured coverage needs a fresh runtime trial",()=>{
 for(const f of ["runtime/temporal/outbox.ts",...semanticSources])expect(()=>validateSemanticReceipt(receipt,baseline,{...sources,[f]:sources[f]+"\n// changed\n"})).toThrow();
 const candidate=structuredClone(receipt);delete candidate.sourceFingerprints[semanticSources[0]];
 expect(()=>validateSemanticReceipt(candidate,baseline,sources)).toThrow();
});

test("retained semantic contract refuses omitted or same-size substituted membership authority sources",()=>{
 const prior=JSON.parse(readFileSync("docs/evidence/staging-platform-browser-prepared-proof.json","utf8"));
 const files=typedSourceFiles(prior.sourceFingerprints);
 expect([...files,...semanticSources]).toHaveLength(115);
 const omitted=structuredClone(baseline);delete omitted.sourceFingerprints["lib/workspace/membership-authority-schema.sql"];
 expect(()=>validateSemanticReceipt(receipt,omitted,sources)).toThrow();
 const substitute=structuredClone(baseline);
 substitute.sourceFingerprints=Object.fromEntries(files.map(f=>[f,"a".repeat(64)]));
 delete substitute.sourceFingerprints["lib/workspace/membership-authority-schema.sql"];substitute.sourceFingerprints["unreviewed.sql"]="a".repeat(64);
 expect(()=>validateSemanticReceipt(receipt,substitute,sources)).toThrow("Membership authority sources required");
});
