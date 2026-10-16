import type { Actor } from "../durable/contracts";
import { ControlError } from "../durable/contracts";
import { CloudInventoryStore } from "./cloud-inventory";
import { CloudDiscoveryOperations } from "./cloud-operations";
import { CloudObservationStore, observationEnrollment } from "./cloud-observation-store";
import { CloudOwnerReviewStore } from "./cloud-owner-review";
import { activityReference } from "./cloud-activity";
import { createAwsGuidedAccess, type AwsGuidedAccess } from "./aws-guided-access";
import type { CloudDiscoveryScope } from "./cloud-discovery";
import { collectWorkflowTelemetry } from "./workflow-telemetry";
type Access=Pick<AwsGuidedAccess,"authorization"|"inventory"|"telemetry"|"logGroups">;
const keys=(v:Record<string,unknown>,expected:string)=>Object.keys(v).sort().join()===expected;
export class CloudObservationOperations {
 constructor(private readonly store:CloudObservationStore,private readonly inventory:CloudInventoryStore,private readonly owners:CloudOwnerReviewStore,
  private readonly access:(scope:CloudDiscoveryScope,epoch:string)=>Promise<Access>=createAwsGuidedAccess,private readonly now=Date.now){}
 async perform(actor:Actor,value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new ControlError(400,"Choose an AWS connection operation.");
  const v=value as Record<string,unknown>;
  if(typeof v.connectionId!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(v.connectionId))throw new ControlError(400,"Choose a saved AWS account.");
  const context=await this.store.context(actor,v.connectionId);
  if(!await this.store.admit(actor,v.connectionId))throw new ControlError(429,"Too many AWS observation requests. Try again in a minute.");
  if(v.operation==="enrollment"&&keys(v,"connectionId,operation,resourceArn,scanId,version")){
   const reference=activityReference({connectionId:v.connectionId,scanId:v.scanId,resourceArn:v.resourceArn,version:v.version});
   try{return {enrollment:await this.store.enrollment(actor,reference)};}catch(e){if(e instanceof ControlError&&e.status===409&&e.message==="Onboard this agent for observation before opening its history.")return {enrollment:null};throw e;}
  }
  let api:Access;
  try{api=await this.access(context.scope,context.epoch);}catch{throw new ControlError(503,"AWS authorization is not configured on the LoopLabs server. Ask your administrator to finish the renewable observation identity setup.");}
  const recheck=async()=>{if(JSON.stringify(await this.store.context(actor,v.connectionId as string))!==JSON.stringify(context))throw new ControlError(409,"AWS connection authority changed. Start again.");};
  if(v.operation==="authorization"&&keys(v,"connectionId,operation,telemetryLogGroup")){
   if(typeof v.telemetryLogGroup!=="string"||v.telemetryLogGroup!==""&&!/^\/[A-Za-z0-9_./#-]{1,250}$/.test(v.telemetryLogGroup))throw new ControlError(400,"Enter an exact optional CloudWatch log group; wildcards are not accepted.");
   let result;try{result=await api.authorization(v.telemetryLogGroup);}catch{throw new ControlError(503,"The AWS review link could not be prepared. No account access was granted.");}
   await recheck();return {...result,expiresAt:new Date(this.now()+900000).toISOString(),reviewRequired:true};
  }
  if(v.operation==="verify"&&keys(v,"connectionId,operation")){
   const result=await new CloudDiscoveryOperations(this.inventory,async scope=>{if(JSON.stringify(scope)!==JSON.stringify(context.scope))throw Error();return api.inventory();}).scan(actor,v.connectionId);
   await recheck();if(result.failures?.includes("list-unavailable"))throw new ControlError(503,"AWS account identity matched, but inventory access was denied or unavailable. Review the observation role before continuing.");return {status:"identity-verified",inventory:result,authorityGranted:false};
  }
  if(v.operation==="sources"&&keys(v,"connectionId,operation")){
   let result;try{result=await api.logGroups();}catch{throw new ControlError(503,"AWS log sources could not be listed. Check the observation role's metadata read permission.");}
   await recheck();return result;
  }
  if(v.operation==="onboard"&&keys(v,"connectionId,displayName,id,logGroup,operation,owner,resourceArn,scanId,version")){
   const ref=activityReference({connectionId:v.connectionId,scanId:v.scanId,resourceArn:v.resourceArn,version:v.version});
   if(typeof v.id!=="string"||typeof v.owner!=="string"||typeof v.displayName!=="string"||typeof v.logGroup!=="string"||!/^\/[A-Za-z0-9_./#-]{1,250}$/.test(v.logGroup))throw new ControlError(400,"Choose an owner, agent name and exact telemetry source.");
   observationEnrollment({...ref,id:v.id,ownerReviewId:v.id,displayName:v.displayName,logGroup:v.logGroup});
   const data=await this.inventory.latest(actor,v.connectionId),record=data.records.find(r=>r.record.resourceArn===ref.resourceArn&&r.record.version===ref.version&&r.observedInCurrentScan&&!r.stale);
   if(data.status!=="observed"||data.scanId!==ref.scanId||data.stale||!record)throw new ControlError(409,"Refresh discovery before onboarding this agent.");
   const end=this.now();let observed;
   try{observed=await collectWorkflowTelemetry(api.telemetry(),record.record,{logGroup:v.logGroup,startTime:end-900000,endTime:end});}catch{throw new ControlError(503,"The selected log source's AWS account could not be verified.");}
   if(observed.failures.includes("read-unavailable")||observed.failures.includes("invalid-page"))throw new ControlError(503,"The selected telemetry source could not be read. Grant read access to this exact log group in AWS before onboarding.");
   await recheck();
   const review=await this.owners.review(actor,{id:v.id,provider:"aws-agentcore-runtime",connectionId:ref.connectionId,scanId:ref.scanId,resource:ref.resourceArn,version:ref.version,owner:v.owner});
   const enrolled=await this.store.enroll(actor,{...ref,id:v.id,ownerReviewId:review.reviewId,displayName:v.displayName,logGroup:v.logGroup});
   return {...enrolled,sourceRead:"verified",supportedEventsObserved:observed.events.length,unsupportedRecords:observed.unsupportedRecords,historyCompleteness:observed.completeness};
  }
  if(v.operation==="history"&&keys(v,"connectionId,hours,operation,resourceArn,version")){
   if(![1,24,168].includes(v.hours as number)||typeof v.hours!=="number"||typeof v.resourceArn!=="string"||typeof v.version!=="string")throw new ControlError(400,"Choose a supported history window and enrolled agent.");
   const reference={connectionId:v.connectionId,resourceArn:v.resourceArn,version:v.version},enrollment=await this.store.enrollment(actor,reference);
   const data=await this.inventory.latest(actor,v.connectionId),record=data.records.find(r=>r.record.resourceArn===reference.resourceArn&&r.record.version===reference.version);
   if(!record)throw new ControlError(409,"The agent's saved inventory is unavailable. Refresh discovery and review onboarding.");
   const end=this.now();let result;
   try{result=await collectWorkflowTelemetry(api.telemetry(),record.record,{logGroup:enrollment.logGroup,startTime:end-v.hours*3600000,endTime:end});}catch{throw new ControlError(503,"AWS history identity could not be verified. No history was accepted.");}
   await recheck();if(JSON.stringify(await this.store.enrollment(actor,reference))!==JSON.stringify(enrollment))throw new ControlError(409,"The observation owner or source changed during this read. Refresh history.");
   return {enrollment,checkedAt:new Date(end).toISOString(),retention:"aws-source-retention",...result};
  }
  throw new ControlError(400,"Unsupported AWS onboarding operation or fields.");
 }
}
