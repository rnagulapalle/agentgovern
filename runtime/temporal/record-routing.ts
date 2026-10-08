import type {Pool} from "pg";
import type {Actor} from "../../lib/durable/contracts";
import {ControlError} from "../../lib/durable/contracts";
import {transaction} from "../../lib/durable/database";
import {authorize} from "../../lib/durable/service";
import {recordScope,type RecordScope} from "../../lib/connectors/record-scope";
import type {ConnectorProvider} from "../../lib/connectors/contracts";
import {connectorProvider} from "../../lib/connectors/hosted";
import {ConnectorControl} from "../../lib/connectors/service";
import {WorkflowControl} from "../../lib/workflows/service";
import {activities} from "./activities";
import type {RunContract} from "./version-contract";
// Resolve only a persisted route in the authenticated workload's workspace.
// Neither history nor chat supplies credentials, URLs, customer IDs or recipients.
export function recordActivities(db:Pool,actor:Actor,factory:(scope:RecordScope)=>ConnectorProvider=connectorProvider,buildId=process.env.LOOPLABS_TEMPORAL_BUILD_ID){
 return async (input:RunContract)=>{
  if(input?.connectorVersion!=="private-record-twin-2" || input.planVersion!=="acknowledgement-1")throw new ControlError(409,"Unsupported record workflow contract.");
  if(!buildId || !/^ack-[a-f0-9]{64}$/.test(buildId))throw new ControlError(503,"Explicit verified record worker build required.");
  const routed=await transaction(db,actor.orgId,async c=>{
   await authorize(c,actor,["worker"],"enquiries");
   if(actor.subject!=="enquiry-temporal")throw new ControlError(403,"Compatible Temporal workload required.");
   if(!(await c.query("SELECT to_regclass('ll_temporal_record_routes') AS present")).rows[0].present)throw new ControlError(503,"Compatible record routing is unavailable.");
   const rows=(await c.query("SELECT p.plan,r.scope_id,r.scope_version,r.binding_id,r.worker_build_id,s.contact_id,s.recipient FROM ll_enquiry_plans p JOIN ll_temporal_dispatch t ON t.org_id=p.org_id AND t.plan_id=p.id JOIN ll_temporal_record_routes r ON r.org_id=t.org_id AND r.plan_id=t.plan_id JOIN ll_connector_scopes s ON s.org_id=r.org_id AND s.id=r.scope_id WHERE p.org_id=$1 AND p.run_id=$2 AND p.plan_hash=$3 AND t.plan_hash=p.plan_hash AND t.connector_version='private-record-twin-2' AND s.active=true AND s.version=r.scope_version AND s.binding_id=r.binding_id",[actor.orgId,input.runId,input.planHash])).rows;
   if(rows.length!==1)throw new ControlError(409,"Saved record route or authority is unavailable; no fallback is allowed.");
   const r=rows[0];
   if(r.worker_build_id!==buildId)throw new ControlError(409,"Saved route requires its pinned worker build; no fallback is allowed.");
   if(r.plan.recordEnrollment?.id!==r.scope_id || r.plan.recordEnrollment?.version!==r.scope_version || r.plan.connectorBinding!==r.binding_id || r.plan.contact?.id!==r.contact_id || r.plan.contact?.email!==r.recipient)throw new ControlError(409,"Saved record route does not match the reviewed plan.");
   return {scope:recordScope({version:"record-scope-1",workspaceId:actor.orgId,contactId:r.contact_id,recipient:r.recipient}),binding:r.binding_id};
  });
  const provider=factory(routed.scope);
  if(provider.bindingId!==routed.binding || !provider.recordScope || JSON.stringify(provider.recordScope)!==JSON.stringify(routed.scope))throw new ControlError(409,"Configured provider differs from the saved route; do not resend.");
  return activities(new WorkflowControl(db,new ConnectorControl(db,provider)),actor).advance(input.runId);
 };
}
