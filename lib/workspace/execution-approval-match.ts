import type {ExternalApproval} from './external-approvals';
import type {WorkflowTelemetryEvent} from './workflow-telemetry';

/** Evidence correlation only. Never grants review or execution authority. */
export function executionApprovalIds(events:WorkflowTelemetryEvent[]) {
 return [...new Set(events.flatMap(e=>e.approvalId?[e.approvalId]:[]))].sort();
}
export function executionApprovalRecords(requests:ExternalApproval[],runId:string,approvalIds:string[]=[]) {
 return requests.filter(a=>a.runId===runId&&(!approvalIds.length||approvalIds.includes(a.id)));
}
export function uniqueExecutionApproval(requests:ExternalApproval[],runId:string,approvalIds:string[]=[]) {
 const rows=executionApprovalRecords(requests,runId,approvalIds);
 // Multiple reported requests need separate review, even if only one is returned.
 return approvalIds.length<=1&&rows.length===1?rows[0]:null;
}
