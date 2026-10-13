// Source-owned candidate diagnostic only. No accepted-release authority.
import assert from 'node:assert/strict';
import {join,dirname,resolve} from 'node:path';
import {transitionInstalledCandidatePackage} from './staging-package-transition.mjs';
const hash=/^[a-f0-9]{64}$/;
export function quotePackagePendingSnapshot(observation,descriptor){
 assert.equal(descriptor?.version,1);assert.equal(descriptor.phase,'quote-held');assert(hash.test(descriptor.planHash));
 const w=observation?.workspaceEvidence;
 assert(w&&Array.isArray(w.quotePlans)&&Array.isArray(w.quoteActions)&&Array.isArray(w.workflowRuns)&&Array.isArray(w.recovery)&&Array.isArray(w.connectorEvents)&&Array.isArray(w.backgroundRoutes),'Complete actual workspace observation required');
 const plans=w.quotePlans.filter(p=>p.id===descriptor.planId);assert.equal(plans.length,1);assert.equal(plans[0].plan_hash,descriptor.planHash);
 const plan=plans[0].plan;assert.equal(plan?.authority?.scopeId,descriptor.scopeId);assert.equal(plan.workspaceId,observation.workspaceId);assert.equal(plan.quote.id,observation.quoteId);assert.equal(plan.quote.sourceVersion,'v'+observation.quote?.version);
 const runs=w.workflowRuns.filter(r=>r.id===descriptor.runId);assert.equal(runs.length,1);assert.equal(runs[0].state,'active');
 for(const part of [descriptor.update,descriptor.message]){const rows=w.quoteActions.filter(a=>a.id===part.id);assert.equal(rows.length,1);const row=rows[0];assert.equal(row.payload_hash,part.payloadHash);assert.equal(row.state,'held');for(const field of ['approved_by','approval_until','lease_token','lease_until'])assert.equal(row[field],null);}
 assert.equal(observation.quoteEffects?.length,0);assert.equal(observation.pendingMail?.length,0);assert(observation.mailEffects&&typeof observation.mailEffects==='object'&&!Array.isArray(observation.mailEffects));assert.equal(Object.keys(observation.mailEffects).length,0);assert(hash.test(observation.mailJournalSha256));
 // Whole observed workspace, quote data and journal identity must remain equal.
 // This scope has a HELD quote and completed ACK work, not two HELD workflows.
 return structuredClone(observation);
}
export async function switchHeldQuoteCandidatePackages(input){
 assert(input&&Object.getPrototypeOf(input)===Object.prototype);
 assert.deepEqual(Object.keys(input).sort(),['current','descriptor','docker','offlineOwner','originalComposeFile','project','readPending','ready','selectCompose','target'].sort());
 assert(/^ll-platform-[a-f0-9]{12}$/.test(input.project));assert.equal(resolve(input.originalComposeFile),input.originalComposeFile);
 for(const name of ['readPending','ready','selectCompose','docker'])assert.equal(typeof input[name],'function');
 const baseline=quotePackagePendingSnapshot(await input.readPending(),input.descriptor),transitions=[];
 const assertPending=async()=>assert.deepEqual(quotePackagePendingSnapshot(await input.readPending(),input.descriptor),baseline,'Actual held workspace/provider observation changed across package switch');
 let selected=input.originalComposeFile;
 for(const [phase,current,target]of [['promotion',input.current,input.target],['reversion',input.target,input.current]]){
  const outputFile=join(dirname(input.originalComposeFile),'compose-quote-held-'+phase+'.json');
  const result=await transitionInstalledCandidatePackage({project:input.project,composeFile:selected,outputFile,current,target,offlineOwner:input.offlineOwner,docker:input.docker,assertPending,ready:input.ready});
  assert.equal(result.evidence.candidateOnly,true);assert.equal(result.evidence.releaseEligible,false);assert.equal(result.evidence.authorityIssued,false);
  input.selectCompose(result.composeFile);selected=result.composeFile;transitions.push(result.evidence);
 }
 await assertPending();
 // Reversion has independently verified original image identities/configuration.
 // Select the unchanged original publication for subsequent fault/restore gates.
 input.selectCompose(input.originalComposeFile);
 return {contract:'actual-held-quote-candidate-switch-1',scope:'held quote and preserved completed ACK workspace',candidateOnly:true,releaseAccepted:false,fullInstalledAcceptance:false,transitions,pendingObservations:7};
}
