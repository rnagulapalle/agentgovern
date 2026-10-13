/** Trusted local provider provisioning only. No approval or execution authority. */
import {BoundedHttpsJsonClient,parseHttpsInput,readOwnedHttpsCa} from './https-transport';
import { isDeepStrictEqual } from 'node:util';
import { ControlError } from '../durable/contracts';
import { quotePlanDigest } from './digest';
import { quoteRequestIdentity } from './effect';
import { nativeMailIdentity,type NativeMailPin } from './native-email-transport';
import type { JsonBodyRequestTransport } from './json-body-transport';
export function pinEnrollmentReceipt(pin:NativeMailPin,contract='native-quote-pin-enrollment-1'){
 if(!pin||Object.keys(pin).sort().join()!=='messageRequest,quoteRequest'||!quoteRequestIdentity(pin.quoteRequest)||!nativeMailIdentity(pin.messageRequest)||pin.quoteRequest.binding===pin.messageRequest.binding||pin.quoteRequest.workspaceId!==pin.messageRequest.workspaceId||pin.quoteRequest.resource!=='/quotes/'+pin.messageRequest.quoteId||pin.quoteRequest.idempotencyKey===pin.messageRequest.idempotencyKey)throw new ControlError(409,'Exact separately bound quote pin required.');
 return {contract,workspaceId:pin.messageRequest.workspaceId,quoteId:pin.messageRequest.quoteId,quoteActionId:pin.quoteRequest.idempotencyKey,messageActionId:pin.messageRequest.idempotencyKey,requestIdentity:nativeMailIdentity(pin.messageRequest)!,quoteRequestIdentity:quoteRequestIdentity(pin.quoteRequest)!,pinDigest:quotePlanDigest(pin)};
}
/** Uses its own provisioner bearer, not an action execution credential. */
export class NativeEmailPinProvisioner {
 constructor(private readonly transport:JsonBodyRequestTransport){}
 async enroll(value:NativeMailPin){const pin=structuredClone(value);const expected=pinEnrollmentReceipt(pin,'native-quote-email-enrollment-1');const result=await this.transport.request('/quote-email/enroll',{method:'POST',headers:{'Content-Type':'application/json','X-LoopLabs-Workspace':expected.workspaceId,'X-LoopLabs-Quote':expected.quoteId,'X-LoopLabs-Binding':pin.messageRequest.binding,'Idempotency-Key':expected.messageActionId},body:JSON.stringify(pin)});if(!isDeepStrictEqual(result,expected))throw new ControlError(503,'Exact persisted email enrollment is unavailable.');return result;}
}

/** Bounded provisioning HTTP; separate from the existing fixed email execution transport. */
async function provisionRequest(origin:string,token:string,pin:NativeMailPin){
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ControlError(503,'Provisioner response unavailable.'));},1500);});
 try{const receipt=pinEnrollmentReceipt(pin);const response=await Promise.race([fetch(origin+'/quote-pins/enroll',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json','X-LoopLabs-Workspace':receipt.workspaceId,'X-LoopLabs-Binding':pin.quoteRequest.binding,'Idempotency-Key':receipt.messageActionId},body:JSON.stringify(pin)}),deadline]);
  if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw new ControlError(503,'Provisioner response unavailable.');const length=response.headers.get('content-length');if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)>16384))throw new ControlError(503,'Bounded provisioner response required.');const reader=response.body?.getReader();if(!reader)throw new ControlError(503,'Provisioner response unavailable.');const chunks:Uint8Array[]=[];let size=0;try{for(;;){const next=await Promise.race([reader.read(),deadline]);if(next.done)break;size+=next.value.byteLength;if(size>16384)throw new ControlError(503,'Bounded provisioner response required.');chunks.push(next.value);}}finally{reader.releaseLock();}return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
 }finally{clearTimeout(timer);controller.abort();}
}

/** Explicit administrator-owned generation; never select a path from request data. */
export async function readNativeQuoteProvisionerGeneration(file:string,execution:import('../durable/pg-transport').ExecutionContext={kind:'installed-runtime'},readProbe?:()=>Promise<void>){
 if(typeof window!=='undefined')throw new ControlError(503,'Server provisioner generation required.');
 const {readOwnedPrivateFile}=await import('../workspace/tenant-bootstrap');const {resolve,dirname}=await import('node:path');const {readdir}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const path=resolve(file);if(!path.endsWith('/provisioner.json'))throw new ControlError(503,'Owned provisioner generation required.');
 const configRead=await readOwnedPrivateFile(path,16384),readyRead=await readOwnedPrivateFile(resolve(dirname(path),'ready.json'),16384);const config=JSON.parse(configRead.bytes.toString()),ready=JSON.parse(readyRead.bytes.toString());
 const keys=['emailBinding','origin','purpose','quoteBinding','quoteId','token','version','workspaceId'];const d=config&&typeof config==='object'&&Object.getPrototypeOf(config)===Object.prototype?Object.getOwnPropertyDescriptor(config,'version'):undefined;if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw new ControlError(503,'Exact provisioner generation required.');const version=d.value;
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).sort().join()!==(version===2?[...keys,'transport']:keys).sort().join()||![1,2].includes(version)||config.purpose!=='quote-pin-provisioner'||typeof config.token!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(config.token)||!['workspaceId','quoteId'].every(k=>typeof config[k]==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(config[k]))||!['quoteBinding','emailBinding'].every(k=>typeof config[k]==='string'&&/^[a-f0-9]{64}$/.test(config[k]))||config.quoteBinding===config.emailBinding)throw new ControlError(503,'Exact provisioner generation required.');
 const ca=version===2?parseHttpsInput({origin:config.origin,transport:config.transport}):undefined;const ownedCa=ca?.transport.trust==='owned-ca'?await readOwnedHttpsCa(ca.transport.caFile,ca.transport.caSha256):undefined;
 if(version===1&&execution.kind!=='owned-disposable-fixture')throw new ControlError(503,'Provisioner1 remains fixture-only');
 const url=new URL(config.origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||(url.protocol==='http:'&&(execution.kind!=='owned-disposable-fixture'||url.hostname!=='127.0.0.1'))||!ready||typeof ready!=='object'||Object.keys(ready).sort().join()!=='purpose,sha256,version'||ready.version!==version||ready.purpose!=='quote-pin-provisioner'||ready.sha256!==createHash('sha256').update(configRead.bytes).digest('hex'))throw new ControlError(503,'Verified provisioner publication required.');
 const assertStable=async()=>{await configRead.assertStable();await readyRead.assertStable();await ownedCa?.assertStable();if((await readdir(dirname(path))).sort().join()!=='provisioner.json,ready.json')throw new ControlError(503,'Sealed provisioner publication required.');};await assertStable();await readProbe?.();await assertStable();
 const pinned=Object.freeze({...config});
 return{workspaceId:pinned.workspaceId as string,quoteId:pinned.quoteId as string,quoteBinding:pinned.quoteBinding as string,emailBinding:pinned.emailBinding as string,assertStable,
  enroll:async(value:NativeMailPin)=>{const pin=structuredClone(value);const expected=pinEnrollmentReceipt(pin);if(expected.workspaceId!==pinned.workspaceId||expected.quoteId!==pinned.quoteId||pin.quoteRequest.binding!==pinned.quoteBinding||pin.messageRequest.binding!==pinned.emailBinding)throw new ControlError(403,'Saved pin differs from the provisioner scope.');await assertStable();let response:unknown;try{if(ca){const client=new BoundedHttpsJsonClient(ca,async()=>{await assertStable();return pinned.token;},assertStable);const result=await client.request('/quote-pins/enroll',{method:'POST',headers:{'content-type':'application/json','x-looplabs-workspace':expected.workspaceId,'x-looplabs-binding':pin.quoteRequest.binding,'idempotency-key':expected.messageActionId},body:JSON.stringify(pin)});response=result.status===200?result.body:null;}else response=await provisionRequest(url.origin,pinned.token,pin);}finally{await assertStable();}if(!isDeepStrictEqual(response,expected))throw new ControlError(503,'Persisted native pin enrollment unavailable.');return expected;}
 };
}
