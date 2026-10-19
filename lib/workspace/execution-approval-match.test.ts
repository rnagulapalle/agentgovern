import {expect,it} from 'vitest';
import type {ExternalApproval} from './external-approvals';
import type {WorkflowTelemetryEvent} from './workflow-telemetry';
import {executionApprovalIds,executionApprovalRecords,uniqueExecutionApproval} from './execution-approval-match';
const record=(id:string,runId='run-one')=>({id,runId} as ExternalApproval);
it('uses the reported approval reference instead of another request on the same run',()=>{
 const correct=record('approval-two'),wrong=record('approval-one');
 expect(uniqueExecutionApproval([wrong,correct],'run-one',['approval-two'])).toBe(correct);
 expect(uniqueExecutionApproval([wrong],'run-one',['approval-two'])).toBeNull();
 expect(executionApprovalRecords([wrong,correct,record('approval-two','foreign-run')],'run-one',['approval-two'])).toEqual([correct]);
});
it('retains legacy unique-run matching but refuses ambiguous, duplicate and partially returned multiple requests',()=>{
 const first=record('approval-one'),second=record('approval-two');
 expect(uniqueExecutionApproval([first],'run-one')).toBe(first);
 expect(uniqueExecutionApproval([first,second],'run-one')).toBeNull();
 expect(uniqueExecutionApproval([first,first],'run-one',['approval-one'])).toBeNull();
 expect(uniqueExecutionApproval([first],'run-one',['approval-one','approval-two'])).toBeNull();
 expect(executionApprovalRecords([first,second],'run-one',['approval-one','approval-two'])).toEqual([first,second]);
 expect(uniqueExecutionApproval([],'run-one')).toBeNull();
});
it('retains explicit references on action events too and deduplicates without manufacturing missing IDs',()=>{
 const events=[{eventName:'approval.requested',approvalId:'two'},{eventName:'approval.approved',approvalId:'two'},{eventName:'approval.rejected',approvalId:'one'},{eventName:'action.completed',approvalId:'three'},{eventName:'approval.requested'}] as WorkflowTelemetryEvent[];
 expect(executionApprovalIds(events)).toEqual(['one','three','two']);expect(executionApprovalIds([])).toEqual([]);
});
