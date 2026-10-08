import {createHash} from "node:crypto";
import type {Pool} from "pg";
import type {Actor} from "../durable/contracts";
import {ControlError} from "../durable/contracts";
import {authorize} from "../durable/service";
import {transaction} from "../durable/database";
import {recordScope,type RecordScope} from "./record-scope";
import {connectorProvider} from "./hosted";
import type {ConnectorProvider} from "./contracts";
import {ScopeControl} from "./scopes";
export function recordCatalog(org:string,raw=process.env.LOOPLABS_RECORD_CATALOG){
 if(!raw)return [];
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new ControlError(503,"Supported customer records are unavailable.");}
 const v=value as {records:unknown[]};
 if(!v || typeof v!=="object" || Array.isArray(v) || Object.keys(v).join()!=="records" || !Array.isArray(v.records) || v.records.length>100)throw new ControlError(503,"Supported customer records are unavailable.");
 const records=v.records.map(recordScope);
 if(new Set(records.map(s=>`${s.workspaceId}:${s.contactId}`)).size!==records.length || new Set(records.map(s=>`${s.workspaceId}:${s.recipient}`)).size!==records.length)throw new ControlError(503,"Supported customer records are ambiguous.");
 return records.filter(s=>s.workspaceId===org).map(scope=>({key:createHash("sha256").update(JSON.stringify(scope)).digest("hex"),scope}));
}
export async function providerForScope<T extends ConnectorProvider>(db:Pool,actor:Actor,id:string,factory:(scope:RecordScope)=>T):Promise<T>{
 if(typeof id!=="string" || !/^[a-f0-9-]{36}$/i.test(id))throw new ControlError(400,"Choose an enrolled customer record.");
 const scope=await transaction(db,actor.orgId,async c=>{
  await authorize(c,actor,["operator","agent","worker"],actor.role==="worker"?"enquiries":undefined);
  if(!(await c.query("SELECT to_regclass('ll_connector_scopes') AS present")).rows[0].present)throw new ControlError(503,"Customer record setup is unavailable.");
  const row=(await c.query("SELECT contact_id,recipient,binding_id FROM ll_connector_scopes WHERE org_id=$1 AND id=$2",[actor.orgId,id])).rows[0];
  if(!row)throw new ControlError(404,"Customer record not found.");
  return {...row,scope:recordScope({version:"record-scope-1",workspaceId:actor.orgId,contactId:row.contact_id,recipient:row.recipient})};
 });
 const provider=factory(scope.scope);
 if(provider.bindingId!==scope.binding_id)throw new ControlError(409,"The configured connection differs from this saved record. No action was sent.");
 return provider;
}
export class RecordOnboarding{
 constructor(readonly db:Pool,readonly factory:(scope:RecordScope)=>ConnectorProvider=connectorProvider){}
 async list(actor:Actor){
  return transaction(this.db,actor.orgId,async c=>{
   await authorize(c,actor,["operator"]);
   const supported=!process.env.LOOPLABS_FETCHSANDBOX_BINDING,catalog=supported?recordCatalog(actor.orgId):[],present=Boolean((await c.query("SELECT to_regclass('ll_connector_scopes') AS present")).rows[0].present);
   const records=present?(await c.query("SELECT id,contact_id,recipient,active,version FROM ll_connector_scopes WHERE org_id=$1 ORDER BY created_at",[actor.orgId])).rows:[];
   const grants=present?(await c.query("SELECT scope_id,agent_id,active,version FROM ll_connector_scope_grants WHERE org_id=$1 ORDER BY scope_id,agent_id",[actor.orgId])).rows:[];
   return {available:present && supported,mode:"private",realDelivery:false,candidates:catalog.map(c=>({key:c.key,contactId:c.scope.contactId,recipient:c.scope.recipient})),records,grants};
  });
 }
 async change(actor:Actor,p:Record<string,unknown>){
  await transaction(this.db,actor.orgId,c=>authorize(c,actor,["operator"]));
  if(process.env.LOOPLABS_FETCHSANDBOX_BINDING)throw new ControlError(409,"This connection does not support isolated customer records. No authority was changed.");
  if(p.operation==="enroll" && Object.keys(p).sort().join() === "id,operation,recordKey" && typeof p.id==="string" && typeof p.recordKey==="string"){
   const candidate=recordCatalog(actor.orgId).find(c=>c.key===p.recordKey);if(!candidate)throw new ControlError(403,"Choose a supported record in your workspace.");
   return new ScopeControl(this.db,this.factory(candidate.scope)).enroll(actor,p.id);
  }
  if(typeof p.scopeId!=="string")throw new ControlError(400,"Choose a supported record operation.");
  const provider=await providerForScope(this.db,actor,p.scopeId,this.factory),control=new ScopeControl(this.db,provider);
  if(p.operation==="grant" && Object.keys(p).sort().join()==="agentId,operation,scopeId" && typeof p.agentId==="string")return control.grant(actor,p.scopeId,p.agentId);
  const grant=p.operation==="setGrantActive",scope=p.operation==="setScopeActive";
  if((grant||scope) && Object.keys(p).sort().join()===(grant?"active,agentId,expectedVersion,operation,scopeId":"active,expectedVersion,operation,scopeId") && typeof p.active==="boolean" && typeof p.expectedVersion==="number" && Number.isInteger(p.expectedVersion) && p.expectedVersion>0 && (!grant||typeof p.agentId==="string"))
   return control.setActive(actor,p.scopeId,p.active,grant?p.agentId as string:undefined,p.expectedVersion);
  throw new ControlError(400,"Choose a supported record operation.");
 }
}
