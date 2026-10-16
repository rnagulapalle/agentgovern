import {it,expect} from "vitest";
import {telemetryRuns,eventLabels} from "./workflow-telemetry-view";
import {projectWorkflowEvent,workflowEventNames,type WorkflowTelemetryWindow} from "./workflow-telemetry";
function event(event_name:string,extra:Record<string,unknown>={}){return projectWorkflowEvent(JSON.stringify({schema_version:"1.0",event_name,event_id:"event-1",run_id:"run-1",action_id:null,timestamp:"2026-10-15T12:00:00.000001Z",attempt:1,trace_id:"a".repeat(32),span_id:"b".repeat(16),trigger_channel:"slack",agent_deployment_version:"10",...extra}))!;}
function window(events:WorkflowTelemetryWindow['events'],conflictingEventIds:string[]=[]):WorkflowTelemetryWindow{return{source:{runtimeArn:"arn:aws:bedrock-agentcore:us-west-2:342206308838:runtime/agent-1234567890",enrolledRuntimeVersion:"10",logGroup:"/company/events",startTime:1,endTime:2},events,completeness:"partial",unsupportedRecords:0,duplicateDeliveries:0,conflictingEventIds,failures:[],enforcement:"not-established"};}
it.each([["completed","Completed · agent reported"],["declined","Blocked by workflow policy"],["rejected","Rejected · agent reported"],["failed","Failed · agent reported"],["needs_info","Waiting for details"],["triaged","Waiting for review"],["unrecognized","Outcome reported · unrecognized state"]])("labels reported outcome %s without claiming verified effects",(outcome,label)=>{
 const r=telemetryRuns(window([event("workflow.finished",{outcome})]))[0];expect(r.status).toBe(label);expect(r.startObserved).toBe(false);expect(r.events[0].effectVerified).toBe(false);expect(r.events[0].approvalIdentityVerified).toBe(false);
});
it("keeps approval requests, source-reported approval and missing final events distinct from completion",()=>{
 expect(telemetryRuns(window([event("approval.approved")]))[0].status).toBe("Outcome not reported");
 expect(telemetryRuns(window([event("workflow.paused",{outcome:"awaiting_approval"})]))[0].status).toBe("Awaiting manager approval");
 expect(telemetryRuns(window([event("workflow.paused",{outcome:"unknown"})]))[0].status).toBe("Paused · agent reported");
 expect(telemetryRuns(window([event("workflow.started")]))[0].status).toBe("In progress · agent reported");
 expect(telemetryRuns(window([]))).toEqual([]);
});
it("keeps conflicting completion visible and never converts it to success",()=>{
 const e=event("workflow.finished",{outcome:"completed"});const r=telemetryRuns(window([e],[e.eventId]))[0];expect(r.status).toBe("Evidence conflict · review required");expect(r.conflict).toBe(true);
});
it("orders parallel runs and microsecond events independently and retains the reported policy",()=>{
 const a=event("workflow.started",{event_id:"start"}),b=event("policy.evaluated",{event_id:"policy",timestamp:"2026-10-15T12:00:00.000002Z",requested_pct:25,decision:"needs_approval"}),c=event("workflow.finished",{event_id:"finish",timestamp:"2026-10-15T12:00:00.000003Z",outcome:"completed"}),other=event("workflow.started",{event_id:"other",run_id:"run-2",timestamp:"2026-10-15T12:00:00.000004Z",trigger_channel:"email"});
 const result=telemetryRuns(window([c,other,b,a]));expect(result.map(r=>r.id)).toEqual(["run-2","run-1"]);expect(result[1]).toMatchObject({startObserved:true,policy:{requestedPercent:25,decision:"needs_approval"}});expect(result[1].events.map(e=>e.eventId)).toEqual(["start","policy","finish"]);expect(result[0].trigger).toBe("email");
 expect(Object.keys(eventLabels).sort()).toEqual([...workflowEventNames].sort());
});
