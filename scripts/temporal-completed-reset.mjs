// Disposable proof helper only. This is not an operator reset endpoint.
import assert from 'node:assert/strict';
import {completedSemanticHistory} from './temporal-semantic-replay.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export class ResetRequestDeduplicationError extends Error {
 constructor(evidence){super('Reset request created another execution');this.name='ResetRequestDeduplicationError';this.evidence=evidence;}
}
export function pinnedBuild(description,buildId){
 assert(/^ack-[a-f0-9]{64}$/.test(buildId));
 const info=description?.raw?.workflowExecutionInfo?.versioningInfo;
 assert(info,'Versioning evidence required');
 const override=info.versioningOverride;
 if(override){
  // SDK 1.24 uses the canonical pinnedVersion; do not accept auto-upgrade.
  assert.equal(override.behavior,1);
  assert.equal(override.pinnedVersion,`looplabs-acknowledgement.${buildId}`);
 }
 assert.equal(info.behavior,1);
 assert.equal(info.deploymentVersion?.deploymentName,'looplabs-acknowledgement');
 assert.equal(info.deploymentVersion?.buildId,buildId);
 return true;
}
export function completedResetRequest({namespace,workflowId,runId,requestId,history}){
 assert(typeof namespace==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(namespace));
 assert(typeof workflowId==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(workflowId));
 assert(uuid.test(runId)&&uuid.test(requestId));
 completedSemanticHistory(history);
 const point=history.events.find(e=>e.eventType===7);
 assert(point,'Actual completed workflow task required');
 const eventId=Number(String(point.eventId));assert(Number.isSafeInteger(eventId)&&eventId>0);
 return {namespace,workflowExecution:{workflowId,runId},workflowTaskFinishEventId:eventId,
  requestId,reason:'Isolated completed-run duplicate-effect proof',identity:'isolated-reset-controller',
  resetReapplyExcludeTypes:[1,2,3],postResetOperations:[]};
}
export async function resetCompletedRun({client,namespace,workflowId,runId,requestId,buildId,isolated}){
 assert.equal(isolated,true,'Explicit disposable reset proof required');
 const old=client.workflow.getHandle(workflowId,runId);
 const history=await old.fetchHistory();
 pinnedBuild(await old.describe(),buildId);
 const request=completedResetRequest({namespace,workflowId,runId,requestId,history});
 const first=await client.workflowService.resetWorkflowExecution(request);
 assert(uuid.test(first.runId)&&first.runId!==runId,'Reset must create a distinct execution');
 const next=client.workflow.getHandle(workflowId,first.runId);
 assert.equal(await next.result(),'completed');
 pinnedBuild(await next.describe(),buildId);
 const nextHistory=await next.fetchHistory();
 const before=completedSemanticHistory(history),after=completedSemanticHistory(nextHistory);
 assert.notEqual(before.sha256,after.sha256);
 const duplicate=await client.workflowService.resetWorkflowExecution(request);
 assert(uuid.test(duplicate.runId));
 if(duplicate.runId!==first.runId)throw new ResetRequestDeduplicationError({originalRunId:runId,resetRunId:first.runId,duplicateRunId:duplicate.runId,original:before,reset:after,buildId,pinPreserved:true});
 return {passed:true,distinctExecution:true,duplicateRequestDeduplicated:true,pinPreserved:true,
  original:before,reset:after,buildId};
}
