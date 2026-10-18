/** Proposal-only verified HTTPS transport. No binding enrollment, approval,
 * retries, effects or production factory enablement is established here. */
import {request as httpsRequest} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {createHash,X509Certificate} from 'node:crypto';
import {readOwnedPrivateFile} from '../workspace/owned-private-file';
import {resolve} from 'node:path';
import {isIP} from 'node:net';
import {ControlError} from '../durable/contracts';

export type HttpsTrust=Readonly<{mode:'verified-tls';trust:'standard'}|{mode:'verified-tls';trust:'owned-ca';caFile:string;caSha256:string}>;
export type HttpsInput=Readonly<{origin:string;transport:HttpsTrust}>;
export type BoundedRequest=Readonly<{method:'GET'|'POST'|'PATCH';headers?:Readonly<Record<string,string>>;body?:string}>;
export type JsonResponse=Readonly<{status:number;body:unknown}>;
export interface JsonRequestTransport{request(path:string,input:BoundedRequest):Promise<JsonResponse>}
export type HttpsReadFailureKind='connection-unavailable'|'invalid-input-trust-or-response';
const privateReadFailures=new WeakMap<object,HttpsReadFailureKind>();
export function httpsReadFailureKind(error:unknown):HttpsReadFailureKind|undefined{return error!==null&&typeof error==='object'?privateReadFailures.get(error):undefined;}
const refused=(kind:HttpsReadFailureKind='invalid-input-trust-or-response')=>{const error=new ControlError(503,'Verified provider transport unavailable. No safe retry inferred.');privateReadFailures.set(error,kind);return error;};
const connectionCodes=new Set(['ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT']);
const socketReadFailure=(error:unknown)=>{const code=error!==null&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code')?.value:undefined;return refused(typeof code==='string'&&connectionCodes.has(code)?'connection-unavailable':'invalid-input-trust-or-response');};
function exact(v:unknown,keys:string[]):v is Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(d).length===keys.length&&keys.every(k=>d[k]?.enumerable&&Object.hasOwn(d[k],'value'));}
export function parseHttpsInput(value:unknown):HttpsInput{
 try{
  if(!exact(value,['origin','transport'])||typeof value.origin!=='string')throw refused();
  const u=new URL(value.origin);const host=u.hostname.replace(/^\[|\]$/g,'');
  if(u.protocol!=='https:'||u.origin!==value.origin||u.username||u.password||u.pathname!=='/'||u.search||u.hash||host.includes('%')||!(isIP(host)||/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)))throw refused();
  const t=value.transport;
  if(exact(t,['mode','trust'])&&t.mode==='verified-tls'&&t.trust==='standard')return Object.freeze({origin:u.origin,transport:Object.freeze({...t}) as HttpsTrust});
  if(exact(t,['mode','trust','caFile','caSha256'])&&t.mode==='verified-tls'&&t.trust==='owned-ca'&&typeof t.caFile==='string'&&resolve(t.caFile)===t.caFile&&typeof t.caSha256==='string'&&/^[a-f0-9]{64}$/.test(t.caSha256))return Object.freeze({origin:u.origin,transport:Object.freeze({...t}) as HttpsTrust});
 }catch{/* Uniform diagnostics never expose configuration. */}
 throw refused();
}
/** Exact single current CA certificate; stable private filesystem generation.
 * No private key, bundle ambiguity, symlinks, FIFO or process-wide trust. */
export async function readOwnedHttpsCa(file:string,sha:string){
 try{
  if(typeof file!=='string'||resolve(file)!==file||!/^[a-f0-9]{64}$/.test(sha))throw refused();
  const {bytes,assertStable}=await readOwnedPrivateFile(file,65536);
  if(createHash('sha256').update(bytes).digest('hex')!==sha)throw refused();
  const text=bytes.toString('utf8');if(!/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(text))throw refused();
  const cert=new X509Certificate(bytes);if(!cert.ca||Date.parse(cert.validFrom)>Date.now()||Date.parse(cert.validTo)<=Date.now())throw refused();
  return {bytes,assertStable:async()=>{try{await assertStable();}catch{throw refused();}}};
 }catch{throw refused();}
}
export class BoundedHttpsJsonClient implements JsonRequestTransport{
 private readonly configured:HttpsInput;
 constructor(input:unknown,private readonly credential:()=>Promise<string>,private readonly assertGeneration:()=>Promise<void>,private readonly timeoutMs=1500){
  this.configured=parseHttpsInput(input);if(typeof credential!=='function'||typeof assertGeneration!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw refused();
 }
 async request(path:string,input:BoundedRequest):Promise<JsonResponse>{
  let expired=false,networkStarted=false;let req:ReturnType<typeof httpsRequest>|undefined;let response:import('node:http').IncomingMessage|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(refused(networkStarted?'connection-unavailable':'invalid-input-trust-or-response'));req?.destroy();response?.destroy();},this.timeoutMs);});
  try{
   // Process-level TLS lowering is refused even though every socket also pins
   // rejectUnauthorized and hostname verification explicitly.
   if(process.env.NODE_TLS_REJECT_UNAUTHORIZED!==undefined&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='1'||['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'].some(k=>process.env[k]!==undefined)||/--(?:use-openssl-ca|use-system-ca|tls-|openssl-)/.test(process.env.NODE_OPTIONS??''))throw refused();
   if(!/^\/[A-Za-z0-9/_-]{1,512}$/.test(path)||path.includes('//')||!exact(input,['method'])&&!exact(input,['method','headers'])&&!exact(input,['method','body'])&&!exact(input,['method','headers','body'])||!['GET','POST','PATCH'].includes(input.method)||input.body!==undefined&&(typeof input.body!=='string'||Buffer.byteLength(input.body)>16384||input.method==='GET'))throw refused();
   const method=input.method,body=input.body;const headers:Record<string,string>={Accept:'application/json'};
   if(input.headers!==undefined){if(!input.headers||Object.getPrototypeOf(input.headers)!==Object.prototype||Reflect.ownKeys(input.headers).length>12||Reflect.ownKeys(input.headers).length!==Object.keys(input.headers).length)throw refused();for(const [k,d] of Object.entries(Object.getOwnPropertyDescriptors(input.headers))){if(!Object.hasOwn(d,'value')||!d.enumerable||!/^x-looplabs-[a-z-]+$|^idempotency-key$|^content-type$/.test(k)||typeof d.value!=='string'||d.value.length<1||d.value.length>512||/[\r\n\x00-\x1f\x7f]/.test(d.value))throw refused();headers[k]=d.value;}}
   const result=await Promise.race([(async()=>{
    await this.assertGeneration();const ca=this.configured.transport.trust==='owned-ca'?await readOwnedHttpsCa(this.configured.transport.caFile,this.configured.transport.caSha256):undefined;
    const token=await this.credential();if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(token))throw refused();await this.assertGeneration();await ca?.assertStable();
    if(expired)throw refused();headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Length']=String(Buffer.byteLength(body));
    const host=new URL(this.configured.origin).hostname.replace(/^\[|\]$/g,'');
    const observed=await new Promise<JsonResponse>((accept,reject)=>{
     req=httpsRequest(this.configured.origin+path,{method,headers,agent:false,rejectUnauthorized:true,minVersion:'TLSv1.2',...(isIP(host)?{}:{servername:host}),checkServerIdentity:(_name,cert)=>checkServerIdentity(host,cert),...(ca?{ca:ca.bytes}:{})},res=>{
      response=res;const status=res.statusCode??0,length=res.headers['content-length'];
      if(status<200||status>=600||status>=300&&status<400||!/^application\/json(?:\s*;|$)/i.test(String(res.headers['content-type']??''))||res.headers['content-encoding']!==undefined||length!==undefined&&(!/^\d+$/.test(length)||Number(length)>16384)){reject(refused());res.destroy();return;}
      const chunks:Buffer[]=[];let size=0;res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>16384){reject(refused());res.destroy();}else chunks.push(chunk);});res.on('error',error=>reject(socketReadFailure(error)));res.on('aborted',()=>reject(refused('connection-unavailable')));res.on('end',()=>{try{accept({status,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))});}catch{reject(refused());}});
     });req.on('error',error=>reject(socketReadFailure(error)));req.end(body);networkStarted=true;
    });await ca?.assertStable();await this.assertGeneration();if(expired)throw refused();return observed;
   })(),deadline]);return result;
  }catch(error){throw refused(httpsReadFailureKind(error)??'invalid-input-trust-or-response');}finally{clearTimeout(timer);req?.destroy();response?.destroy();}
 }
}
