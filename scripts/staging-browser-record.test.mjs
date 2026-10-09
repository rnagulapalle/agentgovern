import {it,expect} from "vitest";
import {typedReceipt} from "./staging-browser-record.mjs";
// Synthetic extension of the earlier measured result tests retention/refusal only.
import {readFileSync} from "node:fs";
const prior=JSON.parse(readFileSync("docs/evidence/staging-platform-browser-prepared-proof.json","utf8"));
const result=Object.fromEntries(Object.entries(prior).filter(([k])=>!["sourceFingerprints","executionEvidence"].includes(k)));
Object.assign(result,{scope:"assembled isolated API/runtime and fresh typed HTTPS browser trial",notVerified:prior.notVerified.filter(x=>x!=="fresh typed chat/model interpretation"),plannerAuthority:{webOnly:true},actualProviderEffects:4,restoreContainment:{approvedArchive:true,externalEpochRotated:true,runtimeRoles:3,omittedEpochRefused:true,revivedSessionsRefused:true,restoredApprovalRefused:true,packagedWorkerRefused:true,packagedSchedulerRefused:true,quarantineRevokesAuthority:true,quarantineReplay:true,staleBootstrapRefused:true,retainedEffects:4},browser:{...prior.browser,scope:"trusted HTTPS Chromium fresh typed planning/review/approval over disposable assembled runtime",planning:{typedRequest:true,clarified:true,model:"us.amazon.nova-lite-v1:0",savedBeforeSubmission:true},checks:["real typed request and missing-recipient clarification save an exact scoped plan without execution authority",...prior.browser.checks],notVerified:prior.browser.notVerified.filter(x=>x!=="fresh typed chat/model interpretation")}});
const metadata={runId:123,privateWorkflowCommit:"a".repeat(40),publicBaseCommit:"b".repeat(40),exactCompressedOverlaySha256:"c".repeat(64)};
it("requires measured typed planning, web-only authority, verified effects and CI input provenance before retaining a result",()=>{
 const receipt=typedReceipt(result,metadata,{source:"d".repeat(64)});expect(receipt.executionEvidence.productionChanged).toBe(false);expect(receipt.executionEvidence.actualProviderEffects).toBe(4);
 for(const changes of [{passed:false},{browser:{...result.browser,planning:undefined}},{browser:{...result.browser,checks:[]}},{plannerAuthority:{webOnly:false}},{actualProviderEffects:6},{admission:{...result.admission,hostReserveBytes:1}},{notVerified:["fresh typed chat/model interpretation"]},{actionIds:["private"]},{secret:"private"},{browser:{...result.browser,secret:"private"}},{services:[{secret:"private"},...result.services.slice(1)]}])expect(()=>typedReceipt({...result,...changes},metadata,{})).toThrow();
 for(const changes of [{runId:NaN},{publicBaseCommit:"unknown"},{exactCompressedOverlaySha256:"wrong"},{secret:"private"}])expect(()=>typedReceipt(result,{...metadata,...changes},{})).toThrow();
});

it("refuses absent, partial, inflated or unexpected restore evidence",()=>{
 expect(()=>typedReceipt({...result,restoreContainment:undefined},metadata,{})).toThrow();
 for(const [key,value] of Object.entries(result.restoreContainment)){
  const invalid=typeof value==="boolean"?false:value+1;
  expect(()=>typedReceipt({...result,restoreContainment:{...result.restoreContainment,[key]:invalid}},metadata,{})).toThrow();
 }
 expect(()=>typedReceipt({...result,restoreContainment:{...result.restoreContainment,secret:"private"}},metadata,{})).toThrow();
});
