import { describe, expect, it, vi } from "vitest";
import { collectWorkflowTelemetry, projectWorkflowEvent, workflowEventNames } from "./workflow-telemetry";
import type { DiscoveredRuntime } from "./cloud-discovery";
const end=Date.parse("2026-10-15T20:00:00Z"),start=end-86400000;
const runtime=():DiscoveredRuntime=>({scope:{tenantId:"workspace",connectionId:"aws",accountId:"342206308838",region:"us-west-2"},source:"aws-agentcore-runtime",resourceId:"agent-1234567890",resourceArn:"arn:aws:bedrock-agentcore:us-west-2:342206308838:runtime/agent-1234567890",version:"10",observedAt:new Date(end).toISOString(),roleReference:null,workloadIdentityReference:null,gaps:["runtime-identity-unavailable","effective-permissions-unknown","declared-tools-unknown"],coverage:{ownership:"unmapped",activity:"unconnected",enforcement:"unverified"}});
const event=()=>({schema_version:"1.0",event_name:"action.completed",event_id:"event_one",run_id:"RUN-one",action_id:"action_one",timestamp:"2026-10-15T19:00:00.123456+00:00",attempt:1,trace_id:"a".repeat(32),span_id:"b".repeat(16),trigger_channel:"slack",agent_deployment_version:"10",action_name:"record_crm",provider:"hubspot",decision:"needs_approval",requested_pct:25,approval_threshold_pct:20,decline_above_pct:70});
const row=(value:unknown=event())=>({eventId:"cloudwatch_event_one",timestamp:end-3600000,message:JSON.stringify(value)});
const api=(value:unknown)=>({callerIdentity:vi.fn(async()=>({Account:"342206308838"})),listEvents:vi.fn(async()=>value)});
const window=()=>({logGroup:"/company/agent-events",startTime:start,endTime:end});
describe("explicit AWS workflow business-event observation",()=>{
 it("projects safe decision metadata but never treats reported completion/approval as authority or verified effects",()=>{
  const v={...event(),token:"must-discard",customer_message:"must-discard",output:"must-discard",provider_response:{email:"private@example.invalid"},effectVerified:true,approvalIdentityVerified:true};
  const result=projectWorkflowEvent(JSON.stringify(v));
  expect(result).toMatchObject({eventId:"event_one",runId:"RUN-one",eventName:"action.completed",occurredAt:"2026-10-15T19:00:00.123456Z",requestedPercent:25,approvalThreshold:20,maximumDiscount:70,effectVerified:false,approvalIdentityVerified:false,evidence:"source-reported"});
  expect(JSON.stringify(result)).not.toMatch(/must-discard|private|provider_response|customer_message/);
 });
 it.each(workflowEventNames)("supports explicit event kind %s without executing it",event_name=>{expect(projectWorkflowEvent(JSON.stringify({...event(),event_name,action_id:null}))).toMatchObject({eventName:event_name,actionId:null,effectVerified:false});});
 it.each([{schema_version:"2"},{event_name:"unknown.write"},{timestamp:"2026-02-30T12:00:00Z"},{timestamp:"bad"},{attempt:0},{attempt:1.5},{trace_id:"0".repeat(32)},{span_id:[]},{action_id:undefined},{trigger_channel:["slack"]},{decision:["approved"]},{requested_pct:"25"},{requested_pct:101},{provider:"private@example.invalid"},{run_id:"bad/id"}])("rejects unsupported/malformed fields %#",change=>{expect(projectWorkflowEvent(JSON.stringify({...event(),...change}))).toBeNull();});
 it("refuses non-JSON, oversized and secret-shaped metadata, leaving missing optional evidence unknown",()=>{
  expect(projectWorkflowEvent("invalid")).toBeNull();expect(projectWorkflowEvent("a".repeat(65537))).toBeNull();
  expect(projectWorkflowEvent(JSON.stringify({...event(),provider:"bearer-private"}))).toBeNull();
  expect(projectWorkflowEvent(JSON.stringify({...event(),decision:undefined,requested_pct:undefined}))).toMatchObject({decision:null,requestedPercent:null});
 });
 it("pins account and log ARN, deduplicates event IDs and preserves microsecond order",async()=>{
  const first=event(),second={...event(),event_id:"event_two",timestamp:"2026-10-15T19:00:00.123455Z"};
  const client=api({events:[row(first),row(first),row(second)]});const result=await collectWorkflowTelemetry(client,runtime(),window());
  expect(client.listEvents).toHaveBeenCalledWith({logGroupIdentifier:"arn:aws:logs:us-west-2:342206308838:log-group:/company/agent-events",startTime:start,endTime:end,limit:100});
  expect(result).toMatchObject({completeness:"complete-api-traversal",duplicateDeliveries:1,enforcement:"not-established",unsupportedRecords:0});expect(result.events.map(e=>e.eventId)).toEqual(["event_two","event_one"]);
 });
 it("keeps conflicting delivery visible and does not claim a complete observation",async()=>{
  const result=await collectWorkflowTelemetry(api({events:[row(),row({...event(),decision:"decline"})]}),runtime(),window());
  expect(result).toMatchObject({completeness:"partial",conflictingEventIds:["event_one"],failures:["conflicting-event"]});
 });
 it("distinguishes missing format, empty source and read failure, preserving previous pages",async()=>{
  expect(await collectWorkflowTelemetry(api({events:[]}),runtime(),window())).toMatchObject({completeness:"complete-api-traversal",events:[],unsupportedRecords:0});
  expect(await collectWorkflowTelemetry(api({events:[row({other:"private"})]}),runtime(),window())).toMatchObject({events:[],unsupportedRecords:1});
  const client={callerIdentity:async()=>({Account:"342206308838"}),listEvents:vi.fn().mockResolvedValueOnce({events:[row()],nextToken:"next"}).mockRejectedValueOnce(Error("private AWS error"))};
  const result=await collectWorkflowTelemetry(client,runtime(),window());expect(result.events).toHaveLength(1);expect(result.failures).toEqual(["read-unavailable"]);expect(JSON.stringify(result)).not.toContain("private AWS error");
 });
 it("refuses foreign identity, forged runtime and broad/custom endpoint sources before reading logs",async()=>{
  const client=api({events:[]});await expect(collectWorkflowTelemetry({...client,callerIdentity:async()=>({Account:"111111111111"})},runtime(),window())).rejects.toThrow("account");
  await expect(collectWorkflowTelemetry(client,{...runtime(),resourceArn:"foreign"},window())).rejects.toThrow();
  for(const change of [{logGroup:"https://untrusted.invalid"},{logGroup:"/company/*"},{startTime:end},{startTime:end-604800001}])await expect(collectWorkflowTelemetry(client,runtime(),{...window(),...change})).rejects.toThrow();
  expect(client.listEvents).not.toHaveBeenCalled();
 });
 it.each([null,{},[],{events:Array(101).fill(row())},{events:[],nextToken:"bad token"}])("rejects malformed page %#",async value=>{expect(await collectWorkflowTelemetry(api(value),runtime(),window())).toMatchObject({completeness:"partial",failures:["invalid-page"]});});
 it("rejects invalid source records, excessive pages and cyclic cursors",async()=>{
  expect(await collectWorkflowTelemetry(api({events:[{...row(),timestamp:end}, {...row(),eventId:"bad/id"},row({...event(),timestamp:"2026-10-16T19:00:00Z"})]}),runtime(),window())).toMatchObject({events:[],failures:["invalid-event","invalid-event","invalid-event"]});
  expect(await collectWorkflowTelemetry(api({events:[],nextToken:"same"}),runtime(),window())).toMatchObject({failures:["pagination-cycle"]});
  let n=0;expect(await collectWorkflowTelemetry({callerIdentity:async()=>({Account:"342206308838"}),listEvents:async()=>({events:[],nextToken:`next-${++n}`})},runtime(),window())).toMatchObject({failures:["page-limit"]});expect(n).toBe(20);
 });
 it("bounds stalled reads and rejects raw unbounded transport values",async()=>{
  await expect(collectWorkflowTelemetry({callerIdentity:()=>new Promise(()=>{}),listEvents:async()=>({events:[]})},runtime(),window(),5)).rejects.toThrow("identity");
  expect(await collectWorkflowTelemetry({callerIdentity:async()=>({Account:"342206308838"}),listEvents:()=>new Promise(()=>{})},runtime(),window(),5)).toMatchObject({failures:["read-unavailable"]});
  expect(await collectWorkflowTelemetry(api({events:[],private:"a".repeat(1_048_577)}),runtime(),window())).toMatchObject({failures:["read-unavailable"]});
 });
});
