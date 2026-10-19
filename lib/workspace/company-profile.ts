import type { Pool } from "pg";
import { ControlError, type Actor } from "../durable/contracts";
import { transaction } from "../durable/database";
import { memberAuthority } from "./identity";
import { parseCompanyProfile, type CompanySnapshot } from "./company-profile-contract";
export async function companyDirectory(db:Pool,actor:Actor,input?:unknown):Promise<CompanySnapshot>{
 return transaction(db,actor.orgId,async c=>{
  if(!await memberAuthority(c,actor))throw new ControlError(403,"Sign in as a current company member.");
  const installed=Boolean((await c.query("SELECT 1 FROM pg_attribute WHERE attrelid='ll_orgs'::regclass AND attname='company_profile' AND NOT attisdropped")).rows[0]);
  const members=(await c.query("SELECT name,email FROM ll_members WHERE org_id=$1 AND active=true ORDER BY name",[actor.orgId])).rows;
  if(!installed){if(input!==undefined)throw new ControlError(503,"Company directory setup is required before saving.");return{installed:false,profile:null,members};}
  const row=(await c.query("SELECT company_profile FROM ll_orgs WHERE id=$1",[actor.orgId])).rows[0];
  if(!row)throw new ControlError(404,"Company workspace unavailable.");
  if(input===undefined)return{installed:true,profile:row.company_profile?parseCompanyProfile(row.company_profile):null,members};
  let next;try{next=parseCompanyProfile(input);}catch{throw new ControlError(400,"Enter a valid company, department, team and agent assignment.");}
  if(next.revision!==(row.company_profile?.revision??0))throw new ControlError(409,"The company directory changed. Refresh before saving.");
  for(const assignment of next.assignments){
   let found=false;
   if(assignment.agentKey.startsWith("sample:"))found=Boolean((await c.query("SELECT 1 FROM ll_agents WHERE org_id=$1 AND id=$2",[actor.orgId,assignment.agentKey.slice(7)])).rows[0]);
   else{let key;try{key=JSON.parse(assignment.agentKey);}catch{throw new ControlError(400,"Choose an agent from this company’s saved inventory.");}if(!Array.isArray(key)||key.length!==2||key.some(x=>typeof x!=="string"))throw new ControlError(400,"Choose an agent from this company’s saved inventory.");found=Boolean((await c.query("SELECT 1 FROM ll_cloud_runtime_observations WHERE org_id=$1 AND connection_id=$2 AND resource_arn=$3 LIMIT 1",[actor.orgId,...key])).rows[0]);}
   if(!found)throw new ControlError(404,"An assigned agent is not in this company’s saved inventory.");
  }
  for(const declaration of next.catalog??[]){
   const previous=row.company_profile?.catalog?.find((w:{connectionId:string;resourceArn:string})=>w.connectionId===declaration.connectionId&&w.resourceArn===declaration.resourceArn);
   if(previous&&JSON.stringify(previous)===JSON.stringify(declaration))continue;
   const observed=(await c.query(`SELECT 1 FROM ll_cloud_runtime_observations o JOIN ll_cloud_scans s ON s.org_id=o.org_id AND s.connection_id=o.connection_id AND s.id=o.scan_id WHERE o.org_id=$1 AND o.connection_id=$2 AND o.resource_arn=$3 AND o.version=$4 AND s.id=(SELECT id FROM ll_cloud_scans WHERE org_id=$1 AND connection_id=$2 ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1) AND s.observed_at>now()-interval '15 minutes' LIMIT 1`,[actor.orgId,declaration.connectionId,declaration.resourceArn,declaration.version])).rows[0];
   if(!observed)throw new ControlError(409,"Refresh discovery first. A workflow declaration must match this company’s current observed deployment version.");
  }
  if(next.revision===Number.MAX_SAFE_INTEGER)throw new ControlError(409,"The company directory revision cannot advance. Contact the installation owner.");
  next.revision++;
  await c.query("UPDATE ll_orgs SET company_profile=$2::jsonb WHERE id=$1",[actor.orgId,JSON.stringify(next)]);
  return{installed:true,profile:next,members};
 });
}
