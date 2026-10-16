import type { WorkflowTelemetryEvent, WorkflowTelemetryWindow } from "./workflow-telemetry";
export const eventLabels: Record<WorkflowTelemetryEvent["eventName"],string> = {
 "workflow.started":"Workflow started","workflow.resumed":"Workflow resumed","workflow.paused":"Workflow paused","workflow.finished":"Workflow outcome reported",
 "action.proposed":"Action proposed","action.started":"Action started","action.completed":"Action completion reported","action.failed":"Action failure reported","action.uncertain":"Action outcome uncertain","action.withheld":"Action withheld",
 "policy.evaluated":"Existing policy evaluated","approval.requested":"Manager approval requested","approval.approved":"Manager approval reported","approval.rejected":"Manager rejection reported","approval.expired":"Approval expiry reported",
 "customer_output.prepared":"Customer response prepared","customer_output.withheld":"Customer response withheld","customer_output.sent":"Customer response sent · reported","customer_output.failed":"Customer response failed · reported",
};
export function telemetryRuns(window:WorkflowTelemetryWindow) {
 const runs=new Map<string,WorkflowTelemetryEvent[]>();
 for(const event of window.events){const rows=runs.get(event.runId)??[];rows.push(event);runs.set(event.runId,rows);}
 return [...runs].map(([id,events])=>{
  events.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.eventId.localeCompare(b.eventId));
  const lifecycle=events.filter(e=>e.eventName.startsWith("workflow.")).at(-1),policy=events.filter(e=>e.eventName==="policy.evaluated").at(-1);
  const conflict=events.some(e=>window.conflictingEventIds.includes(e.eventId));
  let status="Outcome not reported";
  if(conflict)status="Evidence conflict · review required";
  else if(lifecycle?.eventName==="workflow.finished")status=({completed:"Completed · agent reported",declined:"Blocked by workflow policy",rejected:"Rejected · agent reported",failed:"Failed · agent reported",needs_info:"Waiting for details",triaged:"Waiting for review"} as Record<string,string>)[lifecycle.reportedOutcome??""]??"Outcome reported · unrecognized state";
  else if(lifecycle?.eventName==="workflow.paused")status=lifecycle.reportedOutcome==="awaiting_approval"?"Awaiting manager approval":"Paused · agent reported";
  else if(lifecycle)status="In progress · agent reported";
  return {id,events,status,policy,trigger:events[0].triggerChannel,lastObservedAt:events.at(-1)!.occurredAt,startObserved:events.some(e=>e.eventName==="workflow.started"),conflict};
 }).sort((a,b)=>b.lastObservedAt.localeCompare(a.lastObservedAt)||a.id.localeCompare(b.id));
}
