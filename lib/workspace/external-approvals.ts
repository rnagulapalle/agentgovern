import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { ControlError, type Actor } from "../durable/contracts";

export interface ApprovalScope { tenantId:string; connectionId:string; resourceArn:string; version:string; epoch:string }
export interface ApprovalBinding extends ApprovalScope { endpoint:string; secret:string; reviewers:string[]; allowSelfReview?:boolean }
export interface ExternalApproval {
 id:string; runId:string; revision:string; policyVersion:string; status:"pending"|"approved"|"rejected"|"expired"|"cancelled";
 title:string; reason:string; action:string; system:string; before:string; after:string;
 requestedBy:string; allowedReviewers:string[]; expiresAt:string; decidedBy:string|null; decidedAt:string|null;
 channel:"slack"|"email"|"internal"; executionStatus:"held"|"running"|"completed"|"failed"|"uncertain";
}
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const text=(v:unknown,max=500):v is string=>typeof v==="string"&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const id=(v:unknown):v is string=>text(v,128)&&/^[A-Za-z0-9_.-]+$/.test(v);
const email=(v:unknown):v is string=>text(v,254)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const instant=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v)&&Number.isFinite(Date.parse(v));
const digest=(v:string)=>createHash("sha256").update(v).digest("hex");
export function approvalHash(a:ExternalApproval){
 return digest(JSON.stringify([a.id,a.runId,a.policyVersion,a.title,a.reason,a.action,a.system,a.before,a.after,a.requestedBy,a.allowedReviewers,a.expiresAt,a.channel]));
}
export function externalApproval(v:unknown):ExternalApproval {
 const keys="action,after,allowedReviewers,before,channel,decidedAt,decidedBy,executionStatus,expiresAt,id,policyVersion,reason,requestedBy,revision,runId,status,system,title";
 if(!object(v)||Object.keys(v).sort().join()!==keys||!id(v.id)||!id(v.runId)||!id(v.policyVersion)||!text(v.title,160)||!text(v.reason,1000)
  ||![v.action,v.system,v.before,v.after].every(x=>text(x,500))||!email(v.requestedBy)||!Array.isArray(v.allowedReviewers)||v.allowedReviewers.length<1||v.allowedReviewers.length>20||!v.allowedReviewers.every(email)||new Set(v.allowedReviewers).size!==v.allowedReviewers.length
  ||!instant(v.expiresAt)||!["pending","approved","rejected","expired","cancelled"].includes(v.status as string)||!["slack","email","internal"].includes(v.channel as string)
  ||!["held","running","completed","failed","uncertain"].includes(v.executionStatus as string)||!(v.decidedBy===null||email(v.decidedBy))||!(v.decidedAt===null||instant(v.decidedAt)))throw new ControlError(502,"The workflow returned an unsupported approval record.");
 const a=v as unknown as ExternalApproval;
 if(a.revision!==approvalHash(a)||((a.status==="approved"||a.status==="rejected")&&(!a.decidedBy||!a.decidedAt))||(a.status==="pending"&&(a.decidedBy!==null||a.decidedAt!==null||a.executionStatus!=="held")))throw new ControlError(502,"The workflow approval details could not be verified.");
 return a;
}
export async function approvalBinding(scope:ApprovalScope):Promise<ApprovalBinding|null>{
 let rows:unknown;try{rows=JSON.parse(process.env.LOOPLABS_EXTERNAL_APPROVAL_BRIDGES??"[]");}catch{throw new ControlError(503,"Approval connection configuration is invalid.");}
 if(!Array.isArray(rows))throw new ControlError(503,"Approval connection configuration is invalid.");
 const matches=rows.filter(v=>object(v)&&Object.entries(scope).every(([k,x])=>v[k]===x));
 if(!matches.length)return null;
 if(matches.length!==1)throw new ControlError(503,"Approval connection is ambiguous.");
 const row=matches[0];if(row.allowSelfReview!==undefined&&typeof row.allowSelfReview!=="boolean")throw new ControlError(503,"Demo self-review setting must be explicit.");let endpoint:URL;
 try{endpoint=new URL(row.endpoint);if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||endpoint.port||endpoint.search||endpoint.hash||endpoint.pathname!=="/looplabs/approval-bridge"||!/^[-a-z0-9]+\.execute-api\.[a-z]{2}-[a-z]+-\d\.amazonaws\.com$/.test(endpoint.hostname))throw Error();}catch{throw new ControlError(503,"A reviewed AWS approval endpoint is required.");}
 if(typeof row.secretPath!=="string"||!row.secretPath.startsWith("/run/")||!Array.isArray(row.reviewers)||!row.reviewers.length||row.reviewers.length>20||!row.reviewers.every(email))throw new ControlError(503,"Named reviewer and secret-file configuration required.");
 try{const s=await stat(row.secretPath);if(!s.isFile()||(s.mode&0o077)!==0||s.size>256)throw Error();const secret=(await readFile(row.secretPath,"utf8")).trim();if(!/^[a-f0-9]{64,128}$/.test(secret))throw Error();return {...scope,endpoint:endpoint.href,secret,reviewers:row.reviewers,allowSelfReview:row.allowSelfReview===true};}catch{throw new ControlError(503,"Approval signing material is unavailable.");}
}
export class ExternalApprovalBridge {
 constructor(private readonly binding:ApprovalBinding,private readonly send:typeof fetch=fetch,private readonly now=Date.now,private readonly authorize:()=>Promise<void>=async()=>{}){}
 private async call(command:object){
  const nonce=randomUUID(),timestamp=Math.floor(this.now()/1000).toString(),{secret,endpoint,reviewers,allowSelfReview,...scope}=this.binding;
  void reviewers;void allowSelfReview;
  const raw=JSON.stringify({contract:"looplabs-shared-approval-1",scope,nonce,timestamp,...command});
  const signature=createHmac("sha256",secret).update(`request\n${raw}`).digest("hex");
  try{
   const r=await this.send(endpoint,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json","x-looplabs-signature":signature},body:raw,signal:AbortSignal.timeout(10000),cache:"no-store"});
   if(!r.ok)throw Error();
   const reader=r.body?.getReader();if(!reader)throw Error();let response="",size=0;const decoder=new TextDecoder("utf-8",{fatal:true});
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)throw Error();response+=decoder.decode(value,{stream:true});}response+=decoder.decode();}finally{await reader.cancel();}
   const header=r.headers.get("x-looplabs-response-signature");if(!header||!/^[a-f0-9]{64}$/.test(header))throw Error();
   const expected=createHmac("sha256",secret).update(`response\n${digest(raw)}\n${response}`).digest();
   if(!timingSafeEqual(expected,Buffer.from(header,"hex")))throw Error();
   const data:unknown=JSON.parse(response);if(!object(data)||Object.keys(data).sort().join()!=="nonce,requests"||data.nonce!==nonce||!Array.isArray(data.requests)||data.requests.length>100)throw Error();
   const requests=data.requests.map(externalApproval);if(new Set(requests.map(a=>a.id)).size!==requests.length)throw Error();return requests;
  }catch{throw new ControlError(503,"The workflow could not confirm this check or decision. Refresh approvals before trying again; no automatic decision retry was sent.");}
 }
 async list(){return this.call({operation:"list"});}
 async decide(actor:Actor,value:unknown){
  if(actor.role!=="operator"||actor.orgId!==this.binding.tenantId||!this.binding.reviewers.includes(actor.subject))throw new ControlError(403,"You are not a configured reviewer for this workflow.");
  if(!object(value)||Object.keys(value).sort().join()!=="decision,id,revision"||!id(value.id)||typeof value.revision!=="string"||!/^[a-f0-9]{64}$/.test(value.revision)||!["approved","rejected"].includes(value.decision as string))throw new ControlError(400,"Choose the exact reviewed request and decision.");
  const request=(await this.list()).find(a=>a.id===value.id);
  if(!request||request.revision!==value.revision||request.status!=="pending"||Date.parse(request.expiresAt)<=this.now())throw new ControlError(409,"This approval changed, expired or was already decided. Refresh the current decision.");
  if((request.requestedBy===actor.subject&&!this.binding.allowSelfReview)||!request.allowedReviewers.includes(actor.subject))throw new ControlError(403,"A different authorized reviewer must decide this request.");
  // Provider must compare-and-set the same request/revision and resume its existing
  // workflow atomically. A timeout is unknown; never send a second mutation here.
  const decisionId=digest(JSON.stringify([this.binding.tenantId,this.binding.resourceArn,request.id,request.revision,actor.subject,value.decision]));
  await this.authorize();
  if(Date.parse(request.expiresAt)<=this.now())throw new ControlError(409,"This approval expired during review. Refresh approvals.");
  const result=await this.call({operation:"decide",id:request.id,revision:request.revision,policyVersion:request.policyVersion,decision:value.decision,reviewer:actor.subject,decisionId});
  const saved=result.find(a=>a.id===request.id);
  if(!saved||saved.revision!==request.revision||saved.status!==value.decision||saved.decidedBy!==actor.subject)throw new ControlError(409,"The workflow did not confirm your exact decision. Refresh before another action.");
  return result;
 }
}
