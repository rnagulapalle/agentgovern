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
  return {id,events,status,policy,quoteIds:[...new Set(events.flatMap(e=>e.quoteId?[e.quoteId]:[]))],trigger:events[0].triggerChannel,lastObservedAt:events.at(-1)!.occurredAt,startedAt:events.find(e=>e.eventName==="workflow.started")?.occurredAt??null,startObserved:events.some(e=>e.eventName==="workflow.started"),conflict};
 }).sort((a,b)=>(b.startedAt??b.events[0].occurredAt).localeCompare(a.startedAt??a.events[0].occurredAt)||a.id.localeCompare(b.id));
}

/** Collapse lifecycle reports only for the same action ID and attempt. Never
 * merge separate runs, parallel calls, or retries because their names match. */
export function telemetrySteps(events:WorkflowTelemetryEvent[]) {
 const steps:{key:string;events:WorkflowTelemetryEvent[];action:boolean}[]=[],actions=new Map<string,typeof steps[number]>();
 for(const event of events){
  if(event.eventName.startsWith("action.")&&event.actionId){
   const key=JSON.stringify([event.runId,event.actionId,event.attempt]);let step=actions.get(key);
   if(!step){step={key,events:[],action:true};actions.set(key,step);steps.push(step);}step.events.push(event);
  }else steps.push({key:event.eventId,events:[event],action:false});
 }
 return steps.map(step=>{
  const first=step.events[0],last=step.events.at(-1)!;
  const uncertain=step.events.some(e=>e.eventName==="action.uncertain"),failed=step.events.some(e=>e.eventName==="action.failed");
  const state=uncertain?"Outcome uncertain":failed?"Failed":last.eventName==="action.completed"?"Completed":last.eventName==="action.withheld"?"Withheld":last.eventName==="action.started"?"In progress":"Proposed";
  return {...step,first,last,title:step.action?(first.actionName??"Tool action").replaceAll("_"," "):eventLabels[first.eventName],state:step.action?state:null};
 });
}
export function telemetryDecision(events:WorkflowTelemetryEvent[],decision:string|null|undefined){
 if(events.some(e=>e.eventName==="approval.rejected"))return "Manager rejected";
 if(events.some(e=>e.eventName==="approval.expired"))return "Approval expired";
 if(events.some(e=>e.eventName==="approval.approved"))return "Manager approved";
 if(decision==="decline")return "Denied by policy";
 if(decision==="needs_approval")return "Manager approval required";
 if(decision==="auto_approve")return "Automatically approved";
 if(decision==="invalid")return "More details needed";
 return "Decision not reported";
}

const actionCopy: Record<string, [string, string]> = {
 classify: ["Understand the request", "Identify what the customer is asking for."],
 resolve_customer: ["Find the customer", "Look up the customer in the connected CRM."],
 price: ["Calculate pricing", "Prepare pricing for the requested products."],
 record_crm: ["Update the customer record", "Save the quote information in the connected CRM."],
 send_quote: ["Send the quote", "Deliver the quote through the connected channel."],
 request_approval: ["Ask for approval", "Hold the request for a manager’s decision."],
 update_approval_message: ["Update the approval conversation", "Reflect the decision in the connected approval channel."],
 notify_manager_declined: ["Notify the manager", "Report that the policy declined the request."],
 triage: ["Request human review", "Route the request to a person for review."],
};
export function telemetryStepCopy(step: ReturnType<typeof telemetrySteps>[number]) {
 const known=step.action&&step.first.actionName?actionCopy[step.first.actionName]:null;
 const lifecycleTitle=step.first.eventName==="workflow.started"?"Request received":step.first.eventName==="workflow.finished"?({completed:"Request completed",declined:"Request blocked by policy",rejected:"Request rejected",failed:"Request failed"} as Record<string,string>)[step.first.reportedOutcome??""]??"Review the reported outcome":step.first.eventName==="policy.evaluated"?"Check the approval rules":null;
 const title=known?.[0]??lifecycleTitle??step.title;
 const detail=known?.[1]??(step.first.eventName==="workflow.started"?"The workflow received the request.":step.first.eventName==="workflow.finished"?"The workflow reported its final outcome.":step.first.eventName==="workflow.paused"?"The workflow is waiting before it continues.":null);
 const provider=step.first.provider?({hubspot:"HubSpot",slack:"Slack",gmail:"Gmail",anthropic:"Anthropic",pricing:"Pricing service"} as Record<string,string>)[step.first.provider]??step.first.provider:null;
 const tone=step.first.eventName==="workflow.finished"&&step.first.reportedOutcome==="failed"?"attention":step.first.eventName==="workflow.finished"&&["declined","rejected"].includes(step.first.reportedOutcome??"")?"blocked":step.first.eventName==="workflow.finished"&&step.first.reportedOutcome==="completed"?"done":step.state==="Outcome uncertain"||step.state==="Failed"||step.first.eventName==="customer_output.failed"?"attention":step.state==="Withheld"||step.first.eventName==="approval.rejected"||step.first.eventName==="customer_output.withheld"?"blocked":step.state==="Completed"||["customer_output.sent","approval.approved"].includes(step.first.eventName)?"done":"neutral";
 return {title,detail,provider,tone};
}
export function telemetryRequestLabel(run: ReturnType<typeof telemetryRuns>[number]) {
 if(run.policy?.requestedPercent!=null)return `${run.policy.requestedPercent}% discount`;
 if(run.events.some(e=>e.actionName==="send_quote"||e.actionName==="price"))return "Prepare a quote";
 return "Workflow execution";
}
export function telemetryOutcomeGroup(run: ReturnType<typeof telemetryRuns>[number]) {
 if(run.conflict||run.events.some(e=>e.eventName==="action.uncertain"))return "attention";
 if(run.status==="Completed · agent reported")return "completed";
 if(run.status==="Awaiting manager approval")return "waiting";
 if(run.status==="Blocked by workflow policy"||run.status==="Rejected · agent reported")return "blocked";
 return "attention";
}

/** Summary of observed fields, not a reconstruction of the original message. */
export function telemetryRequestContext(run: ReturnType<typeof telemetryRuns>[number]) {
 const description=run.policy?.requestedPercent!=null
  ? `A ${run.policy.requestedPercent}% discount was requested.`
  :run.events.some(event=>event.actionName==="price")&&run.events.some(event=>event.actionName==="send_quote")
   ?"The workflow reports steps to prepare pricing and send a quote."
   :run.events.some(event=>event.actionName==="price")?"The workflow reports a request involving pricing."
   :run.events.some(event=>event.actionName==="send_quote")?"The workflow reports a request to send a quote."
   :"The workflow has not shared a description of this request.";
 const started=run.events.find(event=>event.eventName==="workflow.started");
 return {description,channel:run.trigger,startedAt:started?.occurredAt??null,version:started?.reportedDeploymentVersion??null,messageAvailable:false as const};
}
