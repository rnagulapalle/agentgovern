import {ControlError,type Actor} from "../durable/contracts";
import {TemporalOutbox} from "../../runtime/temporal/outbox";
import type {EnquiryControl} from "./service";
export async function submitScoped(enquiries:EnquiryControl,actor:Actor,id:string,hash:string,crm:string,email:string,buildId=process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID){
 if(!enquiries.workflows.connectors.provider.recordScope || typeof buildId!=="string" || !/^ack-[a-f0-9]{64}$/.test(buildId))throw new ControlError(409,"A compatible durable runner is required for this record. No new work was submitted.");
 const {runId}=await enquiries.start(actor,id,hash,crm,email,true);
 const run=await enquiries.workflows.read(actor,runId);
 for(const step of run.steps)if(!step.state)await enquiries.workflows.connectors.propose(actor,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});
 await new TemporalOutbox(enquiries.db,buildId).transfer(actor,runId);
 return {runId};
}
