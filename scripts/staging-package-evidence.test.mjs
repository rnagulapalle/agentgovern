// Consistency/freshness of observed evidence, never a substitute for live execution.
import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {validatePackageReceipt,packageSources} from "./staging-package-record.mjs";
const receipt=JSON.parse(readFileSync("docs/evidence/staging-package-proof.json","utf8"));
const origins=["staging-platform-browser-before-dependency-proof.json","staging-platform-browser-before-chat-redesign-proof.json"].map(name=>JSON.parse(readFileSync(`docs/evidence/${name}`,"utf8")));
const snapshotBytes=readFileSync("docs/evidence/staging-package-historical-sources.json.gz");
const snapshot=JSON.parse(gunzipSync(snapshotBytes));
const sources=snapshot.sources;
// Historical accepted-image proof and current candidate proof are distinct.
// The release-only guard additionally requires an actual current accepted-image
// transition receipt; this historical record never grants that eligibility.
test("historical pending package promotion/reversion keeps exact original sources and full runtime/UI coverage",()=>{
 expect(createHash("sha256").update(snapshotBytes).digest("hex")).toBe("ed12ebe84470f2545f43f8e4917012edd554909a9043210c49869652eed9a5dd");
 expect(snapshot.version).toBe(1);
 expect(snapshot.sourceCommit).toBe("80f0d7cf91f462cc7f17ca5a5d07fffb1771d9b7");
 expect(snapshot.overlaySha256).toBe("9ceffb7310338057cfe71a4ae1e2c98d2c485d81cdef906532a801f457a38d64");
 expect(Object.keys(sources)).toHaveLength(104);
 expect(createHash("sha256").update(readFileSync("docs/evidence/staging-package-proof.json")).digest("hex")).toBe("52a661efed6c97a463883ba75cc3f9c27c265c533ce874c4496e4f2d4c619cd1");
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
