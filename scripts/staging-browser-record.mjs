// Record only a successful measured typed trial; this is not a signed attestation.
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
export function typedReceipt(result,metadata,fingerprints){
 assert(result?.passed===true&&result.browser?.passed===true);
 assert.equal(result.scope,"assembled isolated API/runtime and fresh typed HTTPS browser trial");
 assert.deepEqual(result.browser.planning,{typedRequest:true,clarified:true,model:"us.amazon.nova-lite-v1:0",savedBeforeSubmission:true});
 assert.deepEqual(result.plannerAuthority,{webOnly:true});assert.equal(result.actualProviderEffects,4);
 assert.deepEqual(result.restoreContainment,{approvedArchive:true,externalEpochRotated:true,runtimeRoles:3,omittedEpochRefused:true,revivedSessionsRefused:true,restoredApprovalRefused:true,packagedWorkerRefused:true,packagedSchedulerRefused:true,quarantineRevokesAuthority:true,quarantineReplay:true,staleBootstrapRefused:true,retainedEffects:4});
 assert(result.browser.checks.includes("real typed request and missing-recipient clarification save an exact scoped plan without execution authority"));
 assert(result.browser.checks.includes("real hostile-origin browser POST with reviewer cookie refused before approval"));
 assert(result.browser.checks.includes("independent UI approvals and actual verified completion"));
 assert(result.browser.checks.includes("saved outcome and exact recipient survive 390px reload without overflow"));
 assert(!result.notVerified.includes("fresh typed chat/model interpretation"));
 assert.equal(Object.keys(metadata).sort().join(),["runId","privateWorkflowCommit","publicBaseCommit","exactCompressedOverlaySha256"].sort().join());
 assert(Number.isSafeInteger(metadata.runId)&&metadata.runId>0);
 for(const k of ["privateWorkflowCommit","publicBaseCommit"])assert(/^[a-f0-9]{40}$/.test(metadata[k]));
 assert(/^[a-f0-9]{64}$/.test(metadata.exactCompressedOverlaySha256));
 assert.equal(result.admission.admitted,true);assert.equal(result.admission.hostReserveBytes,2*1024**3);assert.deepEqual(result.admission.blockers,[]);
 assert.equal(result.images.length,4);assert.equal(result.services.length,8);
 assert.equal(result.browser.scope,"trusted HTTPS Chromium fresh typed planning/review/approval over disposable assembled runtime");
 assert.equal(Object.keys(result.browser).sort().join(),["passed","scope","checks","notVerified","planning"].sort().join());
 const knownBrowser=["real typed request and missing-recipient clarification save an exact scoped plan without execution authority","untrusted CA refused before sign-in","trusted CA and secure browser context","separate named form sign-ins with Secure/HttpOnly/Strict cookies","anonymous and requester self-approval refusal","real hostile-origin browser POST with reviewer cookie refused before approval","UI exact-plan review, scoped agent selection and submission","independent UI approvals and actual verified completion","saved outcome and exact recipient survive 390px reload without overflow","Secure session cookie not sent over plain HTTP"];
 assert.deepEqual([...result.browser.checks].sort(),knownBrowser.sort());
 assert.deepEqual(result.browser.notVerified,["persistent remote staging","live-provider delivery","sustained tenant load, restore and operator acceptance"]);
 assert.deepEqual(result.notVerified,["remote persistent staging","sustained load, restore and operator alert acceptance","live provider guarantees"]);
 assert.deepEqual(result.checks,["separate secure named sessions","unauthenticated and self-approval refusal","API enrollment and per-agent record grants","saved plan and duplicate-safe submission","held work and sessions survive runtime SIGKILL","named approval and two verified private effects","lost-response reconciliation without a duplicated effect","real authenticated Temporal history replay without new actions"]);
 assert(/^ack-[a-f0-9]{64}$/.test(result.buildId));assert(/^[a-f0-9]{40}$/.test(result.sourceCommit));
 assert.deepEqual(result.images.map(x=>x.role),["web","worker","twin","provisioner"]);
 for(const image of result.images){assert.deepEqual(Object.keys(image).sort(),["id","role"]);assert(/^sha256:[a-f0-9]{64}$/.test(image.id));}
 for(const service of result.services){assert.deepEqual(Object.keys(service).sort(),["health","memoryBytes","pids","readOnly"]);assert(Number.isSafeInteger(service.memoryBytes)&&service.memoryBytes>0);assert(Number.isSafeInteger(service.pids)&&service.pids>0);assert(typeof service.readOnly==="boolean");assert(["healthy","not-configured"].includes(service.health));}
 assert.deepEqual(Object.keys(result.admission).sort(),["admitted","availableBytes","blockers","existingBytes","hostReserveBytes","plannedBytes","totalBytes"].sort());
 for(const key of ["availableBytes","existingBytes","hostReserveBytes","plannedBytes","totalBytes"])assert(Number.isSafeInteger(result.admission[key])&&result.admission[key]>=0);
 assert(!result.actionIds&&!result.browser.actionIds);
 // Result is generated by the reviewed parent after independent provider readback.
 // Refuse accidental credentials or unknown top-level fields in the retained output.
 if(result.artifact){
  const a=result.artifact;assert.deepEqual(Object.keys(a).sort(),["archiveBytes","archiveSha256","images","manifestSha256","reloadedAfterRemoval","workerBuildVerified"].sort());
  assert(/^[a-f0-9]{64}$/.test(a.manifestSha256)&&/^[a-f0-9]{64}$/.test(a.archiveSha256));
  assert(Number.isSafeInteger(a.archiveBytes)&&a.archiveBytes>0&&a.archiveBytes<=8*1024**3);
  assert.equal(a.reloadedAfterRemoval,true);assert.equal(a.workerBuildVerified,true);assert.deepEqual(a.images,result.images);
 }
 const keys=["passed","scope","checks","notVerified","plannerAuthority","actualProviderEffects","browser","buildId","sourceCommit","images","services","admission","restoreContainment",...(result.artifact?["artifact"]:[])];
 assert.equal(Object.keys(result).sort().join(),keys.sort().join());
 return {...result,sourceFingerprints:fingerprints,executionEvidence:{...metadata,runUrl:`https://github.com/rnagulapalle/sandbox/actions/runs/${metadata.runId}`,actualProviderEffects:4,productionChanged:false,scope:"disposable assembled runtime and real-model trusted HTTPS typed journey"}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);
 assert(input&&output&&process.argv.length===4&&process.env.GITHUB_ACTIONS==="true"&&process.env.LOOPLABS_STAGING_BROWSER_PROOF==="isolated","Actual isolated CI result and explicit receipt path required");
 try{
  const prior=JSON.parse(await readFile("docs/evidence/staging-platform-browser-prepared-proof.json","utf8"));
  const files=[...new Set([...Object.keys(prior.sourceFingerprints),"scripts/staging-planner-inputs.mjs","scripts/staging-planner-attachment.mjs","scripts/staging-browser-record.mjs","scripts/workspace-recovery.ts","scripts/staging-restore-controller.mjs","scripts/staging-image-artifact.mjs"])].sort();
  const fingerprints=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash("sha256").update(await readFile(file)).digest("hex")])));
  const result=typedReceipt(JSON.parse(await readFile(input,"utf8")),{runId:Number(process.env.GITHUB_RUN_ID),privateWorkflowCommit:process.env.GITHUB_SHA,publicBaseCommit:process.env.LOOPLABS_SOURCE_BASE,exactCompressedOverlaySha256:process.env.LOOPLABS_SOURCE_OVERLAY_SHA256},fingerprints);
  await writeFile(output,JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({recorded:true,runId:result.executionEvidence.runId,sources:files.length,scope:result.scope}));
 }catch{console.error("Measured typed-browser receipt refused; no raw result or credentials printed.");process.exitCode=1;}
}
