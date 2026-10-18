import type { Pool, PoolClient } from "pg";
import { transaction } from "../durable/database";
import { ControlError, type Actor } from "../durable/contracts";
import { tenantPoolBinding } from "../durable/tenant-pool";
import { memberAuthority } from "./identity";
import { throttle } from "./auth";
import { activityReference, type ActivityReference } from "./cloud-activity";
import type { CloudDiscoveryScope } from "./cloud-discovery";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export interface ObservationEnrollment extends ActivityReference { id:string; ownerReviewId:string; displayName:string; logGroup:string }
export function observationEnrollment(value:unknown):ObservationEnrollment {
 const v=value as ObservationEnrollment;
 if(!v||Object.keys(v).sort().join()!=="connectionId,displayName,id,logGroup,ownerReviewId,resourceArn,scanId,version"
  ||typeof v.id!=="string"||!uuid.test(v.id)||typeof v.ownerReviewId!=="string"||!uuid.test(v.ownerReviewId)
  ||typeof v.displayName!=="string"||v.displayName.trim()!==v.displayName||!v.displayName||v.displayName.length>100||/[\u0000-\u001f\u007f]/.test(v.displayName)
  ||typeof v.logGroup!=="string"||!/^\/[A-Za-z0-9_./#-]{1,250}$/.test(v.logGroup))throw new ControlError(400,"Choose the current agent, invited owner and exact AWS log source.");
 return {...activityReference({connectionId:v.connectionId,scanId:v.scanId,resourceArn:v.resourceArn,version:v.version}),id:v.id,ownerReviewId:v.ownerReviewId,displayName:v.displayName,logGroup:v.logGroup};
}
async function authority(c:PoolClient,actor:Actor){if(!await memberAuthority(c,actor))throw new ControlError(403,"Current invited member required for AWS observation.");}
function epoch(c:PoolClient,org:string){const b=tenantPoolBinding(c);if(!b||b.org!==org||b.purpose!=="web")throw new ControlError(503,"Scoped AWS observation context unavailable.");return b.epoch;}
async function scope(c:PoolClient,org:string,id:string):Promise<CloudDiscoveryScope>{
 if(typeof id!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw new ControlError(400,"Choose a saved AWS connection.");
 const row=(await c.query("SELECT account_id,region FROM ll_cloud_connections WHERE org_id=$1 AND id=$2",[org,id])).rows[0];
 if(!row)throw new ControlError(404,"AWS connection unavailable.");return{tenantId:org,connectionId:id,accountId:row.account_id,region:row.region};
}
export class CloudObservationStore {
 constructor(private readonly db:Pool){}
 async admit(actor:Actor,connectionId:string){return transaction(this.db,actor.orgId,async c=>{await authority(c,actor);await scope(c,actor.orgId,connectionId);return throttle(c,`cloud-observation:${actor.orgId}:${actor.subject}:${connectionId}`,12,60);});}
 async context(actor:Actor,connectionId:string){return transaction(this.db,actor.orgId,async c=>{await authority(c,actor);return{scope:await scope(c,actor.orgId,connectionId),epoch:epoch(c,actor.orgId)};});}
 async enroll(actor:Actor,input:unknown){
  const v=observationEnrollment(input);
  return transaction(this.db,actor.orgId,async c=>{
   await authority(c,actor);await scope(c,actor.orgId,v.connectionId);const recovery=epoch(c,actor.orgId);
   const scan=(await c.query("SELECT id,observed_at FROM ll_cloud_scans WHERE org_id=$1 AND connection_id=$2 ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1",[actor.orgId,v.connectionId])).rows[0];
   const review=(await c.query("SELECT owner_email,reviewed_by FROM ll_cloud_owner_reviews WHERE org_id=$1 AND id=$2 AND provider='aws-agentcore-runtime' AND connection_id=$3 AND scan_id=$4 AND resource=$5 AND provider_version=$6",[actor.orgId,v.ownerReviewId,v.connectionId,v.scanId,v.resourceArn,v.version])).rows[0];
   if(!scan||scan.id!==v.scanId||Date.now()-scan.observed_at.getTime()>900000||scan.observed_at.getTime()-Date.now()>300000||!review||review.reviewed_by!==actor.subject)throw new ControlError(409,"Refresh discovery and review this agent's owner before onboarding.");
   const values=[actor.orgId,v.id,v.connectionId,v.scanId,v.resourceArn,v.version,v.ownerReviewId,review.owner_email,v.displayName,v.logGroup,"business-events-1.0",recovery,actor.subject];
   const old=(await c.query("SELECT connection_id,scan_id,resource_arn,provider_version,owner_review_id,owner_email,display_name,log_group,mapping,epoch::text,reviewed_by FROM ll_cloud_observation_enrollments WHERE org_id=$1 AND id=$2",[actor.orgId,v.id])).rows[0];
   if(old&&JSON.stringify(Object.values(old))!==JSON.stringify(values.slice(2)))throw new ControlError(409,"Onboarding retry changed the saved source or owner.");
   if(!old)await c.query("INSERT INTO ll_cloud_observation_enrollments(org_id,id,connection_id,scan_id,resource_arn,provider_version,owner_review_id,owner_email,display_name,log_group,mapping,epoch,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",values);
   return{enrollmentId:v.id,repeated:Boolean(old),mode:"observation-only" as const,enforcement:"not-established" as const};
  });
 }
 async enrollment(actor:Actor,reference:Pick<ActivityReference,"connectionId"|"resourceArn"|"version">){
  return transaction(this.db,actor.orgId,async c=>{
   await authority(c,actor);const connection=await scope(c,actor.orgId,reference.connectionId),recovery=epoch(c,actor.orgId);
   const row=(await c.query("SELECT e.id,e.display_name,e.owner_email,e.log_group,e.mapping,e.epoch::text,e.recorded_at,m.active AND m.org_id=e.org_id AS owner_active FROM ll_cloud_observation_enrollments e JOIN ll_members m ON m.email=e.owner_email WHERE e.org_id=$1 AND e.connection_id=$2 AND e.resource_arn=$3 AND e.provider_version=$4 ORDER BY e.recorded_at DESC,e.id DESC LIMIT 1",[actor.orgId,reference.connectionId,reference.resourceArn,reference.version])).rows[0];
   if(!row)throw new ControlError(409,"Onboard this agent for observation before opening its history.");
   if(row.epoch!==recovery||!row.owner_active)throw new ControlError(409,"Review the agent owner and observation source again after access or recovery changes.");
   return {scope:connection,epoch:recovery,id:row.id as string,displayName:row.display_name as string,owner:row.owner_email as string,logGroup:row.log_group as string,mapping:row.mapping as "business-events-1.0",enrolledAt:row.recorded_at.toISOString() as string};
  });
 }
}
