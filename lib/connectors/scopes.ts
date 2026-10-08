import type { Pool, PoolClient } from "pg";
import { transaction } from "../durable/database";
import { authorize } from "../durable/service";
import { ControlError, type Actor } from "../durable/contracts";
import type { ConnectorAction, ConnectorProvider } from "./contracts";
import { recordScope } from "./record-scope";
export interface ScopeGrantSnapshot { scopeId: string; scopeVersion: number; grantVersion: number }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id:string) { if(typeof id!=="string" || !uuid.test(id))throw new ControlError(400,"Choose a valid enrolled scope."); }
async function present(c:PoolClient) {
 return Boolean((await c.query("SELECT to_regclass('ll_connector_scopes') IS NOT NULL AND to_regclass('ll_connector_scope_grants') IS NOT NULL AS present")).rows[0].present);
}
export async function scopeEnrollment(c:PoolClient,org:string,provider:ConnectorProvider) {
 if(!provider.recordScope)return null;
 const scope=recordScope(provider.recordScope);
 if(org!==scope.workspaceId || !/^[a-f0-9]{64}$/.test(provider.bindingId) || !(await present(c)))return null;
 const rows=(await c.query("SELECT * FROM ll_connector_scopes WHERE org_id=$1 AND binding_id=$2 AND active=true AND contract_version='private-record-twin-2' AND contact_id=$3 AND recipient=$4",[org,provider.bindingId,scope.contactId,scope.recipient])).rows;
 return rows.length===1?rows[0]:null;
}
export async function currentScopeGrant(c:PoolClient,org:string,agent:string,provider:ConnectorProvider):Promise<ScopeGrantSnapshot|null> {
 const scope=await scopeEnrollment(c,org,provider);if(!scope)return null;
 const rows=(await c.query("SELECT g.version FROM ll_connector_scope_grants g JOIN ll_agents a ON a.org_id=g.org_id AND a.id=g.agent_id JOIN ll_agent_profiles p ON p.org_id=a.org_id AND p.agent_id=a.id JOIN ll_members m ON m.org_id=p.org_id AND m.email=p.owner AND m.active=true WHERE g.org_id=$1 AND g.scope_id=$2 AND g.agent_id=$3 AND g.active=true AND a.active=true",[org,scope.id,agent])).rows;
 return rows.length===1?{scopeId:scope.id,scopeVersion:scope.version,grantVersion:rows[0].version}:null;
}
export async function scopedGrantMatches(c:PoolClient,org:string,a:Pick<ConnectorAction,"agent_id"|"payload">,provider:ConnectorProvider) {
 const saved=a.payload?.scopeGrant;
 if(!provider.recordScope)return saved===undefined;
 if(!saved || typeof saved!=="object" || Array.isArray(saved) || typeof saved.scopeId!=="string" || Object.keys(saved).sort().join(",")!=="grantVersion,scopeId,scopeVersion" || !uuid.test(saved.scopeId) || !Number.isInteger(saved.scopeVersion) || saved.scopeVersion<1 || !Number.isInteger(saved.grantVersion) || saved.grantVersion<1)return false;
 const current=await currentScopeGrant(c,org,a.agent_id,provider);
 return Boolean(current && current.scopeId===saved.scopeId && current.scopeVersion===saved.scopeVersion && current.grantVersion===saved.grantVersion);
}
export class ScopeControl {
 constructor(readonly db:Pool,readonly provider:ConnectorProvider){}
 async authority(c:PoolClient,actor:Actor) {
  await authorize(c,actor,["operator"]);
  if(!this.provider.recordScope || actor.orgId!==this.provider.recordScope.workspaceId)throw new ControlError(403,"Use a server-enrolled record in your workspace.");
  if(!(await present(c)))throw new ControlError(503,"Record enrollment requires administrator setup.");
 }
 async event(c:PoolClient,actor:Actor,id:string,kind:string,agent:string|null=null){await c.query("INSERT INTO ll_connector_scope_events(org_id,scope_id,agent_id,kind,subject) VALUES($1,$2,$3,$4,$5)",[actor.orgId,id,agent,kind,actor.subject]);}
 async enroll(actor:Actor,id:string){
  validId(id);
  await transaction(this.db,actor.orgId,c=>this.authority(c,actor));
  const scope=recordScope(this.provider.recordScope),binding=this.provider.bindingId;
  if(!/^[a-f0-9]{64}$/.test(binding))throw new ControlError(503,"Trusted connector destination is unavailable.");
  const source=await this.provider.source("crm");
  if(typeof source!=="string" || !source || source.length>256)throw new ControlError(503,"Trusted contact version is unavailable.");
  return transaction(this.db,actor.orgId,async c=>{
   await this.authority(c,actor);if(binding!==this.provider.bindingId)throw new ControlError(409,"Connector destination changed during enrollment.");
   const old=(await c.query("SELECT * FROM ll_connector_scopes WHERE org_id=$1 AND (id=$2 OR binding_id=$3)",[actor.orgId,id,binding])).rows;
   if(old.length){if(old.length!==1 || old[0].id!==id.toLowerCase() || old[0].binding_id!==binding || old[0].contact_id!==scope.contactId || old[0].recipient!==scope.recipient)throw new ControlError(409,"Enrollment ID or destination already belongs to another scope.");return old[0];}
   const row=(await c.query("INSERT INTO ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,created_by) VALUES($1,$2,$3,$4,$5,'private-record-twin-2',$6) RETURNING *",[actor.orgId,id,scope.contactId,scope.recipient,binding,actor.subject])).rows[0];
   await this.event(c,actor,id,"enrolled");return row;
  });
 }
 async grant(actor:Actor,id:string,agent:string){
  validId(id);if(typeof agent!=="string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(agent))throw new ControlError(400,"Choose a registered scoped agent.");
  return transaction(this.db,actor.orgId,async c=>{
   await this.authority(c,actor);const scope=await scopeEnrollment(c,actor.orgId,this.provider);
   if(!scope || scope.id!==id.toLowerCase())throw new ControlError(409,"An active matching enrollment is required.");
   const a=(await c.query("SELECT 1 FROM ll_agents a JOIN ll_agent_profiles p ON p.org_id=a.org_id AND p.agent_id=a.id JOIN ll_members m ON m.org_id=p.org_id AND m.email=p.owner AND m.active=true WHERE a.org_id=$1 AND a.id=$2 AND a.active=true AND (a.tools && ARRAY['twin.crm','twin.email']) AND EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=a.org_id AND t.subject=a.id AND t.role='agent' AND t.active=true)",[actor.orgId,agent])).rows[0];
   if(!a)throw new ControlError(403,"An active connector agent with an invited owner is required.");
   const old=(await c.query("SELECT * FROM ll_connector_scope_grants WHERE org_id=$1 AND scope_id=$2 AND agent_id=$3",[actor.orgId,id,agent])).rows[0];if(old)return old;
   const row=(await c.query("INSERT INTO ll_connector_scope_grants(org_id,scope_id,agent_id,created_by) VALUES($1,$2,$3,$4) RETURNING *",[actor.orgId,id,agent,actor.subject])).rows[0];await this.event(c,actor,id,"agent_granted",agent);return row;
  });
 }
 async setActive(actor:Actor,id:string,active:boolean,agent?:string,expectedVersion?:number){
  validId(id);if((expectedVersion!==undefined && (!Number.isInteger(expectedVersion) || expectedVersion<1)) || typeof active!=="boolean" || (agent!==undefined && (typeof agent!=="string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(agent))))throw new ControlError(400,"Choose a valid scope authority change.");
  return transaction(this.db,actor.orgId,async c=>{
   await this.authority(c,actor);
   const enrolled=(await c.query("SELECT * FROM ll_connector_scopes WHERE org_id=$1 AND id=$2 AND binding_id=$3",[actor.orgId,id,this.provider.bindingId])).rows[0];
   if(!enrolled)throw new ControlError(404,"Scope not found.");
   const table=agent===undefined?"ll_connector_scopes":"ll_connector_scope_grants",where=agent===undefined?"id=$2":"scope_id=$2 AND agent_id=$3",params=agent===undefined?[actor.orgId,id]:[actor.orgId,id,agent];
   const old=(await c.query(`SELECT * FROM ${table} WHERE org_id=$1 AND ${where}`,params)).rows[0];if(!old)throw new ControlError(404,"Grant not found.");
   if(old.active===active)return old;
   if(expectedVersion!==undefined && expectedVersion!==old.version)throw new ControlError(409,"Record authority changed. Refresh before changing access.");
   const row=(await c.query(`UPDATE ${table} SET active=$${params.length+1},version=version+1 WHERE org_id=$1 AND ${where} RETURNING *`,[...params,active])).rows[0];await this.event(c,actor,id,active?"reactivated":"revoked",agent??null);return row;
  });
 }
}
