// Independent bounded package-origin admission. No production authority or full
// platform acceptance; all JSON eligibility flags remain false and are not grants.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstat,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifyInstalledArtifactRequest2} from './staging-artifact-retrieval.mjs';
import {validateAcceptedOriginJobs,acceptedOriginSteps} from './staging-accepted-package-inputs.mjs';
import {installedObservationReceipt2} from './staging-installed-release-intake.mjs';
import {downloadInstalledArtifact2,ownedInstalledInput2} from './staging-installed-artifact-download.mjs';
import {loadAndRetireMeasuredArchive2} from './staging-package-releases.mjs';
const admittedInstalledOrigins2=new WeakMap();
export function requireDerivedInstalledPackageOrigins2(value){assert(admittedInstalledOrigins2.has(value),'Source-owned authenticated cold-loaded origin admission required');assert.deepEqual(value,admittedInstalledOrigins2.get(value),'Derived origin inputs changed after authenticated admission');return value;}
export const installedReceiptStep2='Retain current six-image source-bound observations before the unchanged full regression gate';
const keys=(object,expected)=>assert.deepEqual(Object.keys(object).sort(),[...expected].sort());
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateInstalledOriginRequest2(request){
 keys(request,['runId','artifactId','workflowCommit','publicBaseCommit','overlaySha256','receiptSha256','manifestSha256','archiveSha256']);for(const key of ['runId','artifactId'])assert(Number.isSafeInteger(request[key])&&request[key]>0);for(const key of ['workflowCommit','publicBaseCommit'])assert(/^[a-f0-9]{40}$/.test(request[key]));for(const key of ['overlaySha256','receiptSha256','manifestSha256','archiveSha256'])assert(/^[a-f0-9]{64}$/.test(request[key]));return request;
}
export function validateInstalledOriginMetadata2(request,run,jobs,artifact,now=Date.now()){
 validateInstalledOriginRequest2(request);
 const origin=verifyInstalledArtifactRequest2(Object.fromEntries(['runId','artifactId','workflowCommit','manifestSha256','archiveSha256'].map(key=>[key,request[key]])),run,artifact,now);
 validateAcceptedOriginJobs(jobs,request.runId);
 const matches=jobs.jobs.filter(job=>job.name==='assembled-platform');assert.equal(matches.length,1,'Unique actual installed platform job required');const job=matches[0];assert.equal(job.head_sha,request.workflowCommit);
 const order=[acceptedOriginSteps[0],installedReceiptStep2,...acceptedOriginSteps.slice(1)];
 const steps=order.map(name=>{const found=job.steps.filter(step=>step.name===name);assert.equal(found.length,1,'Missing or ambiguous current acceptance step');const step=found[0];assert.equal(step.status,'completed');assert.equal(step.conclusion,'success');assert(Number.isSafeInteger(step.number)&&step.number>0);return step;});assert(steps.slice(1).every((step,index)=>step.number>steps[index].number),'Required acceptance step order changed');
 return {...origin,publicBaseCommit:request.publicBaseCommit,overlaySha256:request.overlaySha256,receiptSha256:request.receiptSha256,artifactDigest:artifact.digest};
}
// This pure core validates independently observed metadata and actual downloaded
// bytes. Production entry below fetches metadata/bytes itself; callers cannot
// inject readMetadata or a downloaded-success boolean into that entry.
export async function validateInstalledOriginReceipt2({request,run,jobs,artifact,receiptBytes,downloadDigest},root=process.cwd(),now=Date.now()){
 const origin=validateInstalledOriginMetadata2(request,run,jobs,artifact,now);assert.equal(downloadDigest,artifact.digest,'Download must match authenticated artifact digest');assert(Buffer.isBuffer(receiptBytes)&&receiptBytes.length>0&&receiptBytes.length<=2*1024**2);assert.equal(hash(receiptBytes),request.receiptSha256,'Downloaded receipt digest changed');const receipt=JSON.parse(receiptBytes);
 assert.equal(receipt.contract,'installed-platform-observation-receipt-2','Raw diagnostics and historical receipts are not current accepted-origin inputs');
 keys(receipt,['contract','observations','construction','sourceBefore','sourceAfter','cleanup','executionEvidence','fullInstalledAcceptance','releaseEligible','originIndependentlyVerified']);assert.equal(receipt.contract,'installed-platform-observation-receipt-2','Raw diagnostics and historical receipts are not current accepted-origin inputs');assert.equal(receipt.fullInstalledAcceptance,false);assert.equal(receipt.releaseEligible,false);assert.equal(receipt.originIndependentlyVerified,false);
 const {executionEvidence,...rest}=receipt;keys(executionEvidence,['runId','privateWorkflowCommit','publicBaseCommit','exactCompressedOverlaySha256','runUrl','productionChanged']);
 const envelope={contract:'installed-generation-observation-intake-2',...Object.fromEntries(['observations','construction','sourceBefore','sourceAfter','cleanup'].map(key=>[key,rest[key]]))};
 const metadata={runId:request.runId,privateWorkflowCommit:request.workflowCommit,publicBaseCommit:request.publicBaseCommit,exactCompressedOverlaySha256:request.overlaySha256};assert.deepEqual(await installedObservationReceipt2(envelope,metadata,root),receipt,'Current source-owned receipt reconstruction changed');
 const retained=receipt.observations.artifact;for(const key of ['manifestSha256','archiveSha256'])assert.equal(retained[key],request[key]);
 const successor=receipt.observations.quoteSuccessor;assert.equal(successor.newProviderEffectIssued,true,'Actual fresh post-restore completion required');assert(successor.freshCompletion,'Native fresh completion observation required');
 return {contract:'independently-verified-installed-package-origin-2',origin,receipt,packageOriginAccepted:false,metadataVerified:true,coldLoadVerified:false,fullInstalledAcceptance:false,releaseEligible:false,productionChanged:false};
}
export async function loadInstalledAcceptedPackageEntries2(entries,docker,owned,root=process.cwd(),now=Date.now()){
 assert(Array.isArray(entries)&&entries.length===2&&typeof docker==='function'&&Array.isArray(owned));assert.notEqual(entries[0].directory,entries[1].directory);
 const validated=[];for(const entry of entries)validated.push(await validateInstalledOriginReceipt2(entry,root,now));assert.notEqual(validated[0].origin.runId,validated[1].origin.runId,'Two independently observed successful runs required');assert.notEqual(validated[0].origin.artifactId,validated[1].origin.artifactId);
 const receipts=validated.map(value=>value.receipt);assert.equal(new Set(receipts.flatMap(r=>r.observations.services.map(service=>service.containerId))).size,26,'Independent origins cannot reuse observed service containers');for(const field of ['planId','updateActionId','messageActionId']){assert.notEqual(receipts[0].observations.quoteBrowser[field],receipts[1].observations.quoteBrowser[field],'Independent quote executions required');assert.notEqual(receipts[0].observations.quoteSuccessor[field],receipts[1].observations.quoteSuccessor[field],'Independent successor executions required');}assert.notEqual(receipts[0].observations.quoteBrowser.verificationReceipt.recoveryEpoch,receipts[1].observations.quoteBrowser.verificationReceipt.recoveryEpoch,'Independent installed epochs required');assert.deepEqual(receipts[0].sourceBefore,receipts[1].sourceBefore);assert.deepEqual(receipts[0].construction,receipts[1].construction);for(const profile of ['ack','quote']){const strip=artifact=>Object.fromEntries(['buildId','serviceHash','workflowHash','lockHash'].map(key=>[key,artifact[key]]));assert.deepEqual(strip(receipts[0].observations.artifact.workers[profile]),strip(receipts[1].observations.artifact.workers[profile]),'Both genuine worker profile bytes must match current source');}
 const ids=receipts.flatMap(r=>r.observations.images.map(i=>i.id));assert.equal(new Set(ids).size,12,'Twelve distinct immutable independently built images required');assert(ids.every(id=>!owned.includes(id)));
 const output=docker('image','ls','--no-trunc','--quiet');assert.equal(typeof output,'string');const inventory=output.split('\n').filter(Boolean);assert(inventory.every(id=>/^sha256:[a-f0-9]{64}$/.test(id)));assert(ids.every(id=>!inventory.includes(id)),'Current accepted images must be absent on isolated host');owned.push(...ids);
 const packages=[];for(let i=0;i<2;i++){const retained=receipts[i].observations.artifact;const loaded=await loadAndRetireMeasuredArchive2(entries[i].directory,retained,docker);packages.push({contract:'installed-candidate-package-2',builds:{ack:loaded.workers.ack.buildId,quote:loaded.workers.quote.buildId},images:Object.fromEntries(loaded.images.map(image=>[image.role,image.id]))});}
 const result={purpose:'independently-accepted-installed-package-inputs-2',packageOriginsAccepted:true,coldLoadVerified:true,packages,origins:validated.map(value=>value.origin),fullInstalledAcceptance:false,releaseEligible:false,productionChanged:false};admittedInstalledOrigins2.set(result,structuredClone(result));return result;
}
export function validateInstalledAcceptedEnvelope2(input){keys(input,['contract','requests']);assert.equal(input.contract,'installed-accepted-package-requests-2');assert(Array.isArray(input.requests)&&input.requests.length===2);input.requests.forEach(validateInstalledOriginRequest2);assert.notEqual(input.requests[0].runId,input.requests[1].runId);assert.notEqual(input.requests[0].artifactId,input.requests[1].artifactId);return input;}
// Authenticated production adapter: local input specifies reviewed immutable
// origin pins only. Never accepts caller API status, receipts or directories.
export async function loadInstalledAcceptedPackagesFromFile2(file,docker,owned,{root=process.cwd(),downloadRoot,now=Date.now()}={}){
 const input=validateInstalledAcceptedEnvelope2(JSON.parse(await ownedInstalledInput2(file,65536)));assert(typeof downloadRoot==='string'&&resolve(downloadRoot)===downloadRoot&&await realpath(downloadRoot)===downloadRoot);const state=await lstat(downloadRoot);assert(state.isDirectory()&&!state.isSymbolicLink()&&state.uid===process.getuid()&&(state.mode&0o7777)===0o700);
 const api=endpoint=>JSON.parse(execFileSync('gh',['api',endpoint],{timeout:30000,maxBuffer:2*1024**2,encoding:'utf8',stdio:['ignore','pipe','pipe']}));const entries=[];
 for(const request of input.requests){const prefix='repos/rnagulapalle/sandbox/actions';const run=api(`${prefix}/runs/${request.runId}`),jobs=api(`${prefix}/runs/${request.runId}/jobs?per_page=100`),artifact=api(`${prefix}/artifacts/${request.artifactId}`);validateInstalledOriginMetadata2(request,run,jobs,artifact,now);const download=await downloadInstalledArtifact2(artifact,resolve(downloadRoot,'origin-'+request.runId+'-'+randomBytes(12).toString('hex')));const receiptBytes=await ownedInstalledInput2(resolve(download.directory,'installed-platform-observation-receipt.json'),2*1024**2);entries.push({request,run,jobs,artifact,receiptBytes,...download});}
 return loadInstalledAcceptedPackageEntries2(entries,docker,owned,root,now);
}
