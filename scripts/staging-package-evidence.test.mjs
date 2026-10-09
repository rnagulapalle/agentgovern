// Consistency/freshness of observed evidence, never a substitute for live execution.
import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {validatePackageReceipt,packageSources} from "./staging-package-record.mjs";
const receipt=JSON.parse(readFileSync("docs/evidence/staging-package-proof.json","utf8"));
const origins=["staging-platform-browser-before-dependency-proof.json","staging-platform-browser-proof.json"].map(name=>JSON.parse(readFileSync(`docs/evidence/${name}`,"utf8")));
const sources=Object.fromEntries([...Object.keys(origins[1].sourceFingerprints),...packageSources].map(file=>[file,readFileSync(file,"utf8")]));
test("measured pending package promotion/reversion keeps exact origins, sources and full runtime/UI coverage",()=>{
 expect(validatePackageReceipt(receipt,origins,sources)).toBe(receipt);
 expect(receipt.runtime.executionEvidence).toMatchObject({runId:37893973887,privateWorkflowCommit:"2c3c550058cc574959f76a763f3d702cbd5beb01",publicBaseCommit:"80f0d7cf91f462cc7f17ca5a5d07fffb1771d9b7",exactCompressedOverlaySha256:"9ceffb7310338057cfe71a4ae1e2c98d2c485d81cdef906532a801f457a38d64",productionChanged:false});
});
test("missing coverage, changed authority checks, origins, runtime metadata and unknown fields cannot pass receipt validation",()=>{
 const changes=[
  r=>r.pendingPackageBrowser.sameSession=false,
  r=>delete r.pendingPackageBrowser.noSelfApproval,
  r=>r.pendingPackageBrowser.mobileWidth=1024,
  r=>r.packageTransitions.pop(),
  r=>r.packageTransitions[0].pendingAuthorityChecks=2,
  r=>r.packageTransitions[1].to.web=r.packageTransitions[1].from.web,
  r=>r.packageOrigins[0].archiveBytes++,
  r=>r.releaseImagesRemoved=false,
  r=>r.runtime.actualProviderEffects=5,
  r=>r.runtime.restoreContainment.restoredApprovalRefused=false,
  r=>r.runtime.browser.checks.pop(),
  r=>r.runtime.executionEvidence.productionChanged=true,
  r=>r.runtime.executionEvidence.extra="unexpected",
  r=>r.sourceFingerprints[packageSources[0]]="0".repeat(64),
  r=>r.generatedTrialSha256="0".repeat(64),
  r=>r.notVerified=[],
  r=>r.unreviewed="unexpected"
 ];
 for(const change of changes){const candidate=structuredClone(receipt);change(candidate);expect(()=>validatePackageReceipt(candidate,origins,sources)).toThrow();}
});
test("changed measured code and lost source coverage require another runtime receipt",()=>{
 for(const file of ["lib/connectors/service.ts","runtime/temporal/activities.ts",...packageSources])expect(()=>validatePackageReceipt(receipt,origins,{...sources,[file]:sources[file]+"\n// changed\n"})).toThrow();
 const candidate=structuredClone(receipt);delete candidate.sourceFingerprints[packageSources[0]];
 expect(()=>validatePackageReceipt(candidate,origins,sources)).toThrow();
});
