import {ControlError,type Actor} from "../durable/contracts";
import {requireAdmission} from "../orchestration/admission";
import type {EnquiryControl} from "./service";
export async function submitScoped(enquiries:EnquiryControl,actor:Actor,id:string,hash:string,crm:string,email:string){
 if(!enquiries.workflows.connectors.provider.recordScope)throw new ControlError(409,"A compatible durable runner is required for this record. No new work was submitted.");
 const admission=requireAdmission(enquiries.orchestration);
 const {runId}=await enquiries.start(actor,id,hash,crm,email,true);
 const run=await enquiries.workflows.read(actor,runId);
 for(const step of run.steps)if(!step.state)await enquiries.workflows.connectors.propose(actor,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});
 await admission.transfer(actor,runId);
 return {runId};
}
