import { NextRequest } from "next/server";
import { tenantContext } from "../../../../../lib/workspace/tenant-context";
import { body, credential, failure, sameOrigin } from "../../../../../lib/durable/http";
import { ControlError } from "../../../../../lib/durable/contracts";
import { CloudObservationStore } from "../../../../../lib/workspace/cloud-observation-store";
import { approvalBinding, ExternalApprovalBridge } from "../../../../../lib/workspace/external-approvals";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 try{
  sameOrigin(request);const {db,actor}=await tenantContext().authenticated(credential(request)),v=await body(request);
  const keys=Object.keys(v).sort().join();
  if(!(v.operation==="list"&&keys==="connectionId,operation,resourceArn,version"||v.operation==="decide"&&keys==="connectionId,decision,id,operation,resourceArn,revision,version")||typeof v.connectionId!=="string"||typeof v.resourceArn!=="string"||typeof v.version!=="string")throw new ControlError(400,"Choose a saved workflow approval operation.");
  const store=new CloudObservationStore(db),reference={connectionId:v.connectionId,resourceArn:v.resourceArn,version:v.version};
  const enrolled=await store.enrollment(actor,reference);
  if(!await store.admit(actor,v.connectionId))throw new ControlError(429,"Too many approval checks. Wait a minute and refresh.");
  const scope={tenantId:actor.orgId,...reference,epoch:enrolled.epoch},binding=await approvalBinding(scope);
  if(!binding){if(v.operation==="decide")throw new ControlError(409,"This agent has no verified approval connection.");return Response.json({connected:false,requests:[],reviewer:actor.subject,canReview:false},{headers:{"Cache-Control":"no-store"}});}
  const recheck=async()=>{const current=await store.enrollment(actor,reference);if(JSON.stringify(current)!==JSON.stringify(enrolled))throw new ControlError(409,"Workflow access changed. Refresh approvals.");};
  const bridge=new ExternalApprovalBridge(binding,fetch,Date.now,recheck);
  // Recheck saved enrollment/current membership immediately before the external call.
  const current=await store.enrollment(actor,reference);
  if(JSON.stringify(current)!==JSON.stringify(enrolled))throw new ControlError(409,"Workflow access changed. Refresh approvals.");
  const requests=v.operation==="list"?await bridge.list():await bridge.decide(actor,{id:v.id,revision:v.revision,decision:v.decision});
  return Response.json({connected:true,requests,reviewer:actor.subject,canReview:binding.reviewers.includes(actor.subject)},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return failure(e);}
}
