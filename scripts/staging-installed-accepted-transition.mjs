// Versioned source-owned consumer of independently cold-loaded packages. It
// extends the existing five-writer primitive; never grants execution authority.
import assert from 'node:assert/strict';
import {join,dirname,resolve} from 'node:path';
import {requireDerivedInstalledPackageOrigins2} from './staging-installed-accepted-origins.mjs';
import {quotePackagePendingSnapshot} from './staging-quote-package-switch.mjs';
import {transitionInstalledCandidatePackage} from './staging-package-transition.mjs';
export function installedAcceptedWriterSelection2(origins){
 requireDerivedInstalledPackageOrigins2(origins);assert.equal(origins.packageOriginsAccepted,true);assert.equal(origins.coldLoadVerified,true);assert.equal(origins.packages.length,2);const [current,second]=origins.packages;assert.deepEqual(current.builds,second.builds);
 // Both origins have six distinct measured images. Only the five runtime
 // writers move; actual DB, provider journals, Temporal and owner remain first.
 const target={...structuredClone(current),images:{...current.images,...Object.fromEntries(['web','worker','quote'].map(role=>[role,second.images[role]]))}};
 return {current:structuredClone(current),target,originRuns:origins.origins.map(origin=>origin.runId)};
}
export function heldAckObservation2(value){
 assert(value&&Object.getPrototypeOf(value)===Object.prototype);assert.deepEqual(Object.keys(value).sort(),['contract','planId','actions','pendingSnapshot','namedSessionValid','approvalIssued','fullInstalledAcceptance','productionChanged'].sort());assert.equal(value.contract,'native-held-ack-observation-2');assert.equal(value.namedSessionValid,true);for(const key of ['approvalIssued','fullInstalledAcceptance','productionChanged'])assert.equal(value[key],false);assert(/^[a-f0-9-]{36}$/.test(value.planId));assert(Array.isArray(value.actions)&&value.actions.length===2&&new Set(value.actions.map(a=>a.action_id)).size===2);for(const action of value.actions){assert.deepEqual(Object.keys(action).sort(),['action_id','payload_hash']);assert(/^[a-f0-9-]{36}$/.test(action.action_id)&&/^[a-f0-9]{64}$/.test(action.payload_hash));}assert.deepEqual(Object.keys(value.pendingSnapshot).sort(),['buildId','digest','version']);assert.equal(value.pendingSnapshot.version,1);assert(/^ack-[a-f0-9]{64}$/.test(value.pendingSnapshot.buildId));assert(/^[a-f0-9]{64}$/.test(value.pendingSnapshot.digest));return structuredClone(value);
}
export async function switchHeldInstalledAcceptedPackages2(input){
 assert.deepEqual(Object.keys(input).sort(),['origins','descriptor','docker','offlineOwner','originalComposeFile','project','readQuotePending','prepareAckPending','readAckPending','ready','selectCompose'].sort());assert(/^ll-platform-[a-f0-9]{12}$/.test(input.project));assert(typeof input.originalComposeFile==='string'&&resolve(input.originalComposeFile)===input.originalComposeFile);const {current,target,originRuns}=installedAcceptedWriterSelection2(input.origins);for(const key of ['readQuotePending','prepareAckPending','readAckPending','ready','selectCompose','docker'])assert.equal(typeof input[key],'function');
 quotePackagePendingSnapshot(await input.readQuotePending(),input.descriptor);
 const ack=heldAckObservation2(await input.prepareAckPending());assert.equal(ack.pendingSnapshot.buildId,current.builds.ack);assert.notEqual(ack.planId,input.descriptor.planId);for(const action of ack.actions)assert(![input.descriptor.update.id,input.descriptor.message.id].includes(action.action_id));
 const quote=quotePackagePendingSnapshot(await input.readQuotePending(),input.descriptor);
 const assertPending=async()=>{assert.deepEqual(heldAckObservation2(await input.readAckPending()),ack,'Actual held ACK authority/session changed');assert.deepEqual(quotePackagePendingSnapshot(await input.readQuotePending(),input.descriptor),quote,'Actual held quote workspace/provider state changed');};
 let selected=input.originalComposeFile;const transitions=[];
 for(const [phase,from,to]of [['promotion',current,target],['reversion',target,current]]){
  const result=await transitionInstalledCandidatePackage({project:input.project,composeFile:selected,outputFile:join(dirname(input.originalComposeFile),'compose-accepted-held-'+phase+'.json'),current:from,target:to,offlineOwner:input.offlineOwner,docker:input.docker,assertPending,ready:input.ready});assert.equal(result.evidence.releaseEligible,false);assert.equal(result.evidence.authorityIssued,false);selected=result.composeFile;input.selectCompose(selected);transitions.push(result.evidence);
 }
 await assertPending();input.selectCompose(input.originalComposeFile);
 return {contract:'actual-installed-accepted-origin-transition-2',scope:'two independently cold-loaded origins; simultaneously held ACK and quote; five runtime writers',originRuns,ackHeld:ack,quoteHeld:{planId:input.descriptor.planId,planHash:input.descriptor.planHash,actionIds:[input.descriptor.update.id,input.descriptor.message.id]},transitions,pendingComparisons:7,packageOriginVerified:true,approvalIssued:false,fullInstalledAcceptance:false,releaseEligible:false,productionChanged:false};
}
