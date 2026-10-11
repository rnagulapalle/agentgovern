import {test,expect} from 'vitest';
import {completedResetRequest,pinnedBuild,resetCompletedRun} from './temporal-completed-reset.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const id='12345678-1234-1234-1234-123456789012',nextId='22345678-1234-1234-1234-123456789012';
const buildId=`ack-${'a'.repeat(64)}`;
const events=Array.from({length:7},(_,i)=>({eventId:i+1,eventType:[1,5,6,7,12,5,2][i],...(i===0?{workflowExecutionStartedEventAttributes:{workflowType:{name:'pinnedAcknowledgement'}}}:{})}));
const description=()=>({raw:{workflowExecutionInfo:{versioningInfo:{behavior:1,deploymentVersion:{deploymentName:'looplabs-acknowledgement',buildId},versioningOverride:{behavior:1,pinnedVersion:`looplabs-acknowledgement.${buildId}`}}}}});
const input=()=>({namespace:'default',workflowId:'isolated-proof',runId:id,requestId:nextId,history:{events}});
test('reset accepts the existing outbox workflow identity while refusing malformed namespaced IDs',()=>{
 const workflowId=`looplabs:local-proof:ack:${id}`;
 expect(completedResetRequest({...input(),workflowId}).workflowExecution.workflowId).toBe(workflowId);
 for(const bad of [`looplabs:local-proof:ack:not-a-plan`,`looplabs:local-proof:other:${id}`,`looplabs::ack:${id}`,`other:local-proof:ack:${id}`,`${workflowId}\n`,`${workflowId}:extra`,42])expect(()=>completedResetRequest({...input(),workflowId:bad})).toThrow();
});
test('reset selects an actual completed task and excludes reapplication without moving versions',()=>{
 const r=completedResetRequest(input());expect(r.workflowTaskFinishEventId).toBe(4);
 expect(r.resetReapplyExcludeTypes).toEqual([1,2,3]);expect(r.postResetOperations).toEqual([]);
 for(const change of [{runId:''},{requestId:'request'},{namespace:'bad\nnamespace'},{workflowId:'bad/path'},{history:{events:events.map(e=>({...e,eventType:e.eventType===7?6:e.eventType}))}},{history:{events:events.slice(1)}}])expect(()=>completedResetRequest({...input(),...change})).toThrow();
});
test('retained actual local reset observation stays a failed idempotency gate, not provider acceptance',()=>{
 const bytes=readFileSync('docs/evidence/local-reset-refusal.json');
 expect(createHash('sha256').update(bytes).digest('hex')).toBe('922f9036e0630162e2c3a238580ff7d4cc8fe27aeaa2dc3023bd78aa0cf713a7');
 const r=JSON.parse(bytes);expect(r.passed).toBe(false);expect(r.duplicateRequestDeduplicated).toBe(false);
 expect(r.blocker).toBe('reset_request_id_did_not_deduplicate_original_run');expect(r.pinPreserved).toBe(true);expect(r.activityCalls).toBe(3);
 expect(r.notVerified).toContain('provider effect deduplication');expect(r.notVerified).toContain('enterprise acceptance');
});
test('calibration refuses before starting services without explicit isolated opt-in',()=>{
 const r=spawnSync(process.execPath,['scripts/temporal-reset-calibration.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000});
 expect(r.status).toBe(1);expect(r.stdout).toBe('');expect(r.stderr.trim()).toBe('Reset calibration refused at inputs; no raw authority, history or SDK error printed.');
});
test('missing pin, auto-upgrade, incompatible deployment and override refuse',()=>{
 expect(pinnedBuild(description(),buildId)).toBe(true);
 for(const mutate of [d=>{delete d.raw.workflowExecutionInfo.versioningInfo;},d=>{d.raw.workflowExecutionInfo.versioningInfo.behavior=2;},d=>{d.raw.workflowExecutionInfo.versioningInfo.deploymentVersion.buildId=`ack-${'b'.repeat(64)}`;},d=>{d.raw.workflowExecutionInfo.versioningInfo.versioningOverride.behavior=2;},d=>{d.raw.workflowExecutionInfo.versioningInfo.versioningOverride.pinnedVersion='other';}]){const d=description();mutate(d);expect(()=>pinnedBuild(d,buildId)).toThrow();}
});
test('duplicate execution refuses acceptance; original pin failure never resets',async()=>{
 let calls=0;
 const handle={fetchHistory:async()=>({events}),describe:async()=>description(),result:async()=> 'completed'};
 const reset={...handle,fetchHistory:async()=>({events,reset:true})};
 const client={workflow:{getHandle:(_workflow,run)=>run===nextId?reset:handle},workflowService:{resetWorkflowExecution:async()=>({runId:++calls===1?nextId:'32345678-1234-1234-1234-123456789012'})}};
 await expect(resetCompletedRun({client,...input(),buildId,isolated:true})).rejects.toThrow('Reset request created another execution');expect(calls).toBe(2);
 calls=0;handle.describe=async()=>({});
 await expect(resetCompletedRun({client,...input(),buildId,isolated:true})).rejects.toThrow();expect(calls).toBe(0);
 await expect(resetCompletedRun({client,...input(),buildId})).rejects.toThrow('Explicit disposable reset proof required');expect(calls).toBe(0);
});
