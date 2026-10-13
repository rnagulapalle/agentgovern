/** Trusted server transport for the isolated native application contract.
 * No approval, retry, provider-conformance or delivery authority is created. */
import {BoundedHttpsJsonClient,parseHttpsInput,type HttpsTrust} from "./https-transport";
import { ControlError } from "../durable/contracts";
import { nativeMailIdentity } from "./native-email-transport";
import type { QuotePlanV2 } from "./plan-v2";
import { quoteRequestIdentity } from "./effect";
import type { QuotePlan } from "./plan";

export type NativeQuotePolicy = {contract:"quote-pricing-policy-1";workspaceId:string;quoteId:string;binding:string;policy:{version:number;delegatedBps:number;hardCapBps:number;active:boolean}};
export type NativeQuoteTransportOptions=Readonly<{ownedTestOrigin?:boolean;https?:HttpsTrust;assertGeneration?:()=>Promise<void>}>;
type Binding = Readonly<{origin:string;workspaceId:string;quoteId:string;quoteBinding:string;emailBinding:string}>;
export type NativeQuoteRead = {workspaceId:string;quoteId:string;sourceVersion:string;distributorId:string;currency:"USD";subtotalMinor:number;discountBps:number;totalMinor:number};
export type NativeQuoteWrite = {status:"observed";body:unknown}|{status:"conflict"}|{status:"unavailable"};
const id=/^[A-Za-z0-9_-]{1,64}$/, hash=/^[a-f0-9]{64}$/, uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function exact(value:unknown,keys:string[]):value is Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const d=Object.getOwnPropertyDescriptors(value);
 return Reflect.ownKeys(value).length===keys.length&&keys.every(k=>d[k]&&Object.hasOwn(d[k],"value")&&d[k].enumerable);
}
export class NativeQuoteTransport {
 private readonly binding:Binding;
 private readonly https:BoundedHttpsJsonClient|undefined;
 constructor(configured:Binding,private readonly credential:()=>Promise<string>,private readonly timeoutMs=1500,options:NativeQuoteTransportOptions={}){
  const optionShape=(keys:string[]):boolean=>exact(options,keys);
  const tls=optionShape(["https","assertGeneration"]);
  const legacy=optionShape([])||(optionShape(["ownedTestOrigin"])&&typeof options.ownedTestOrigin==="boolean");
  if((!tls&&!legacy)||(tls&&typeof options.assertGeneration!=="function"))throw new ControlError(503,"Exact native transport options required.");
  if(!exact(configured,["origin","workspaceId","quoteId","quoteBinding","emailBinding"])||
   typeof configured.origin!=="string"||!(tls?!!parseHttpsInput({origin:configured.origin,transport:options.https!}):(configured.origin==="http://127.0.0.1:8019"||(process.env.NODE_ENV==="test"&&options.ownedTestOrigin===true&&/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(configured.origin)&&Number(configured.origin.slice(configured.origin.lastIndexOf(":")+1))<=65535)))||
   ![configured.workspaceId,configured.quoteId].every(v=>typeof v==="string"&&id.test(v))||![configured.quoteBinding,configured.emailBinding].every(v=>typeof v==="string"&&hash.test(v))||configured.quoteBinding===configured.emailBinding||
   typeof credential!=="function"||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)
   throw new ControlError(503,"An exact server-owned native quote connection is required.");
  this.binding=Object.freeze({...configured});
  if(tls){this.https=new BoundedHttpsJsonClient({origin:configured.origin,transport:options.https!},credential,options.assertGeneration!,timeoutMs);}
 }
 private async request(path:string,method:"GET"|"PATCH"|"POST",body?:QuotePlan["update"]["request"]|QuotePlanV2["message"]["request"]):Promise<{status:number;body:unknown}|null>{
  if(this.https){try{return await this.https.request(path,{method,headers:{"x-looplabs-workspace":this.binding.workspaceId,"x-looplabs-binding":this.binding.quoteBinding,...(body?{"content-type":"application/json","idempotency-key":body.idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{return null;}}
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("Native quote unavailable"));},this.timeoutMs);});
  try{
   const token=await Promise.race([this.credential(),deadline]);
   if(typeof token!=="string"||!/^[A-Za-z0-9_-]{32,256}$/.test(token))return null;
   const response=await Promise.race([fetch(this.binding.origin+path,{method,redirect:"error",credentials:"omit",cache:"no-store",signal:controller.signal,
    headers:{Authorization:"Bearer "+token,Accept:"application/json","x-looplabs-workspace":this.binding.workspaceId,"x-looplabs-binding":this.binding.quoteBinding,...(body?{"Content-Type":"application/json","idempotency-key":body.idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{})}),deadline]);
   if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type")||""))return null;
   const length=response.headers.get("content-length");if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)>16384))return null;
   const reader=response.body?.getReader();if(!reader)return null;const chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const next=await Promise.race([reader.read(),deadline]);if(next.done)break;size+=next.value.byteLength;if(size>16384){controller.abort();return null;}chunks.push(next.value);}}
   finally{reader.releaseLock();}
   return {status:response.status,body:JSON.parse(Buffer.concat(chunks).toString("utf8"))};
  }catch{return null;}finally{clearTimeout(timer);controller.abort();}
 }
 async read():Promise<NativeQuoteRead|null>{
  const response=await this.request("/quotes/"+this.binding.quoteId,"GET");if(response?.status!==200||!exact(response.body,["contract","binding","current"])||response.body.contract!=="quote-versioned-read-1"||response.body.binding!==this.binding.quoteBinding)return null;
  const current=response.body.current;if(!exact(current,["workspaceId","quoteId","sourceVersion","distributorId","currency","subtotalMinor","discountBps","totalMinor"])||current.workspaceId!==this.binding.workspaceId||current.quoteId!==this.binding.quoteId||typeof current.sourceVersion!=="string")return null;
  const {workspaceId,quoteId,sourceVersion,...body}=current;
  // Reuse the existing exact money/source contract rather than duplicate policy.
  const valid=quoteRequestIdentity({contract:"quote-conditional-write-1",binding:this.binding.quoteBinding,method:"PATCH",resource:"/quotes/"+quoteId,workspaceId,sourceVersion,idempotencyKey:"00000000-0000-4000-8000-000000000001",body});
  return valid?structuredClone(current) as NativeQuoteRead:null;
 }
 /** Read-only pricing truth from the independently provisioned native policy
  * relation. Numeric quote values or configuration cannot stand in for policy. */
 async policy():Promise<NativeQuotePolicy|null>{
  const response=await this.request("/quotes/"+this.binding.quoteId+"/policy","GET");
  if(response?.status!==200||!exact(response.body,["contract","workspaceId","quoteId","binding","policy"])||response.body.contract!=="quote-pricing-policy-1"||response.body.workspaceId!==this.binding.workspaceId||response.body.quoteId!==this.binding.quoteId||response.body.binding!==this.binding.quoteBinding||!exact(response.body.policy,["version","delegatedBps","hardCapBps","active"]))return null;
  const p=response.body.policy;if(!Number.isInteger(p.version)||Number(p.version)<1||Number(p.version)>2147483647||!Number.isInteger(p.delegatedBps)||!Number.isInteger(p.hardCapBps)||Number(p.delegatedBps)<0||Number(p.hardCapBps)<Number(p.delegatedBps)||Number(p.hardCapBps)>10000||typeof p.active!=="boolean")return null;
  return structuredClone(response.body) as NativeQuotePolicy;
 }
 async write(value:unknown):Promise<NativeQuoteWrite>{
  if(!quoteRequestIdentity(value))throw new ControlError(409,"An exact saved conditional quote request is required.");
  const request=structuredClone(value) as QuotePlan["update"]["request"];
  if(request.binding!==this.binding.quoteBinding||request.workspaceId!==this.binding.workspaceId||request.resource!=="/quotes/"+this.binding.quoteId)throw new ControlError(403,"Quote request belongs to another connection.");
  const response=await this.request(request.resource,"PATCH",request);
  if(response?.status===409)return {status:"conflict"};
  return response?.status===200?{status:"observed",body:response.body}:{status:"unavailable"};
 }
 private async mailMutation(value:unknown,resolve=false):Promise<NativeQuoteWrite>{
  if(!nativeMailIdentity(value))throw new ControlError(409,"Exact saved quote email required.");
  const request=structuredClone(value) as QuotePlanV2["message"]["request"];
  if(request.binding!==this.binding.emailBinding||request.workspaceId!==this.binding.workspaceId||request.quoteId!==this.binding.quoteId)throw new ControlError(403,"Quote email belongs to another connection.");
  const response=await this.request("/quote-mail/"+request.idempotencyKey+(resolve?"/resolve":""),"POST",request);
  if(response?.status===409)return{status:"conflict"};
  return response?.status===200?{status:"observed",body:response.body}:{status:"unavailable"};
 }
 async mailWrite(value:unknown){return this.mailMutation(value);}
 async mailResolve(value:unknown){return this.mailMutation(value,true);}
 async mailLookup(actionId:string):Promise<unknown|null>{
  if(typeof actionId!=="string"||!uuid.test(actionId))throw new ControlError(400,"A stable quote email action is required.");
  const response=await this.request("/quote-mail/"+actionId,"GET");return response?.status===200?response.body:null;
 }
 async lookup(actionId:string):Promise<unknown|null>{
  if(typeof actionId!=="string"||!uuid.test(actionId))throw new ControlError(400,"A stable quote action is required.");
  const response=await this.request("/quote-effects/"+actionId,"GET");return response?.status===200?response.body:null;
 }
}
