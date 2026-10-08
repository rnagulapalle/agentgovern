import type {Pool} from "pg";
import type {Actor} from "../durable/contracts";
import {ControlError} from "../durable/contracts";
import {authorize} from "../durable/service";
import {transaction} from "../durable/database";
import {validId} from "../enquiries/contracts";
import {connectorProvider,type HostedFetchSandboxConnectors} from "./hosted";
import type {FetchSandboxConnectors} from "./twin";
import type {RecordScope} from "./record-scope";
import {providerForScope} from "./catalog";
export type ConnectedProvider=FetchSandboxConnectors|HostedFetchSandboxConnectors;
export type ProviderFactory=(scope?:RecordScope)=>ConnectedProvider;
const configured:ProviderFactory=scope=>scope?connectorProvider(scope):connectorProvider();
// Resolve destinations from authenticated saved state, never from a supplied body/URL/recipient.
export async function savedProvider(db:Pool,actor:Actor,kind:"plan"|"run"|"action"|"proposal",id:string,selected?:string|null,allowNewPlan=false,factory:ProviderFactory=configured):Promise<ConnectedProvider>{
 validId(id);
 const result=await transaction(db,actor.orgId,async c=>{
  await authorize(c,actor,kind==="plan"?["operator"]:["operator","agent","worker"],actor.role==="worker"?"enquiries":undefined);
  let plans:{plan: {recordEnrollment?:{id?:string};requests?:{crm?:{version?:string};email?:{version?:string}}}}[]=[],actions:{agent_id?:string;payload?:{scopeGrant?:{scopeId?:string};request?:{version?:string}}}[]=[],found=false;
  let runId=id;
  if(kind==="action"){
   actions=(await c.query("SELECT agent_id,payload FROM ll_connector_actions WHERE org_id=$1 AND id=$2",[actor.orgId,id])).rows;found=actions.length>0;
   if(actor.role==="agent" && actions.some(a=>a.agent_id!==actor.subject))throw new ControlError(404,"Saved action not found.");
  }else{
   if(kind==="proposal"){
    if(!(await c.query("SELECT to_regclass('ll_workflow_steps') AS present")).rows[0].present)return {missingProposal:true,scope:null};
    const step=(await c.query("SELECT run_id,agent_id FROM ll_workflow_steps WHERE org_id=$1 AND action_id=$2",[actor.orgId,id])).rows[0];
    if(!step)return {missingProposal:true,scope:null};
    if(actor.role==="agent" && step.agent_id!==actor.subject)throw new ControlError(404,"Saved action not found.");
    runId=step.run_id;
   }
   if(kind!=="plan")found=Boolean((await c.query("SELECT id FROM ll_workflow_runs WHERE org_id=$1 AND id=$2",[actor.orgId,runId])).rows[0]);
   if((await c.query("SELECT to_regclass('ll_enquiry_plans') AS present")).rows[0].present){
    plans=(await c.query("SELECT plan FROM ll_enquiry_plans WHERE org_id=$1 AND "+(kind==="plan"?"id=$2":"run_id=$2"),[actor.orgId,runId])).rows;
    if(kind==="plan")found=plans.length>0;
   }
   if(kind!=="plan")actions=(await c.query("SELECT a.agent_id,a.payload FROM ll_workflow_steps s JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id WHERE s.org_id=$1 AND s.run_id=$2",[actor.orgId,runId])).rows;
  }
  if(!found){if(kind==="plan" && allowNewPlan)return {newPlan:true,scope:selected||null};throw new ControlError(404,"Saved work not found.");}
  const ids=[...plans.map(p=>p.plan.recordEnrollment?.id),...actions.map(a=>a.payload?.scopeGrant?.scopeId)].filter((s):s is string=>typeof s==="string"&&Boolean(s));
  const scoped=plans.some(p=>Object.values(p.plan.requests||{}).some(r=>r?.version==="prepared-request-2"))||actions.some(a=>a.payload?.request?.version==="prepared-request-2");
  const unique=[...new Set(ids)];
  if(unique.length>1 || (scoped&&!unique.length))throw new ControlError(409,"Saved record destination is missing or inconsistent. No request was sent.");
  const scope=unique[0]||null;
  if(selected && selected!==scope)throw new ControlError(409,"Choose the record saved with this work. No request was sent.");
  return {scope};
 });
 if(result.scope)return providerForScope(db,actor,result.scope,factory);
 return factory();
}
export async function selectedProvider(db:Pool,actor:Actor,selected:string|null,factory:ProviderFactory=configured):Promise<ConnectedProvider>{
 await transaction(db,actor.orgId,c=>authorize(c,actor,["operator"]));
 return selected?providerForScope(db,actor,selected,factory):factory();
}
