import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {validateSemanticReceipt,semanticSources} from "./staging-semantic-record.mjs";
const receipt=JSON.parse(readFileSync("docs/evidence/staging-semantic-proof.json","utf8"));
const baseline=JSON.parse(readFileSync("docs/evidence/staging-platform-browser-proof.json","utf8"));
const sources=Object.fromEntries([...Object.keys(baseline.sourceFingerprints),...semanticSources].map(f=>[f,readFileSync(f,"utf8")]));
test("actual two-image receipt retains full runtime, browser and recovery evidence with current sources",()=>{
 expect(validateSemanticReceipt(receipt,baseline,sources)).toBe(receipt);
 expect(receipt.runtime.executionEvidence).toMatchObject({runId:37901080849,privateWorkflowCommit:"76f3b4e4b17062c5f021266c0ddb3e268d1a1b5b",publicBaseCommit:"e9d4df0551e94efe3cd846c293308378b91df9f2",productionChanged:false});
});
test("missing or weakened lifecycle, replay, admission, parent authority or scope evidence refuses",()=>{
 const changes=[r=>r.semanticLifecycle.builds[1]=r.semanticLifecycle.builds[0],r=>r.semanticLifecycle.images[1]=r.semanticLifecycle.images[0],r=>r.semanticLifecycle.oldWorkerKilled=false,r=>r.semanticLifecycle.finalEffects=5,r=>r.semanticLifecycle.replay.checks[1].result="compatible",r=>r.semanticLifecycle.replay.histories[0].events=0,r=>r.semanticLifecycle.additionalWritersStopped=false,r=>r.semanticAdmission.availableBytes=0,r=>r.semanticAdmission.hostReserveBytes=0,r=>r.runtime.restoreContainment.restoredApprovalRefused=false,r=>r.runtime.browser.checks.pop(),r=>r.runtime.executionEvidence.productionChanged=true,r=>r.notVerified=[],r=>r.generatedTrialSha256="0".repeat(64),r=>r.extra="unreviewed"];
 for(const change of changes){const candidate=structuredClone(receipt);change(candidate);expect(()=>validateSemanticReceipt(candidate,baseline,sources)).toThrow();}
});
test("source drift or reduced measured coverage needs a fresh runtime trial",()=>{
 for(const f of ["runtime/temporal/outbox.ts",...semanticSources])expect(()=>validateSemanticReceipt(receipt,baseline,{...sources,[f]:sources[f]+"\n// changed\n"})).toThrow();
 const candidate=structuredClone(receipt);delete candidate.sourceFingerprints[semanticSources[0]];
 expect(()=>validateSemanticReceipt(candidate,baseline,sources)).toThrow();
});
