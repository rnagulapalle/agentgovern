/** Isolated quote-mail client contract. Reuses existing private email transport,
 * existing exact acceptance verifier and predecessor's OWN native quote client.
 * The pre-send source check is NOT a cross-provider atomicity guarantee. */
import { isDeepStrictEqual } from 'node:util';
import { ControlError } from '../durable/contracts';
import type { JsonBodyRequestTransport } from './json-body-transport';
import { credentialShapedText } from '../connectors/content';
import { observeSimulatedEmail } from '../connectors/email-observation';
import type { Observation } from '../connectors/contracts';
import { observeQuoteEffect, quoteRequestIdentity } from './effect';
import { quotePlanDigest } from './digest';
import type { QuotePlanV2 } from './plan-v2';
import type { NativeQuoteTransport } from './native-transport';
export type NativeMailPin=Readonly<{quoteRequest:QuotePlanV2['update']['request'];messageRequest:QuotePlanV2['message']['request']}>;
function exact(value:unknown,keys:string[]):value is Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;const d=Object.getOwnPropertyDescriptors(value);return Reflect.ownKeys(value).length===keys.length&&keys.every(k=>d[k]&&Object.hasOwn(d[k],'value')&&d[k].enumerable);}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const email=/^[a-z0-9][a-z0-9._+-]*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.test$/;
export function nativeMailIdentity(value:unknown):string|null{
 if(!exact(value,['contract','binding','workspaceId','quoteId','method','resource','idempotencyKey','body'])||value.contract!=='quote-email-request-1'||typeof value.binding!=='string'||!/^[a-f0-9]{64}$/.test(value.binding)||typeof value.workspaceId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value.workspaceId)||typeof value.quoteId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value.quoteId)||value.method!=='POST'||value.resource!=='/emails'||typeof value.idempotencyKey!=='string'||!uuid.test(value.idempotencyKey)||!exact(value.body,['from','to','subject','text']))return null;
 const b=value.body;if(typeof b.from!=='string'||!email.test(b.from)||!Array.isArray(b.to)||b.to.length!==1||typeof b.to[0]!=='string'||!email.test(b.to[0])||typeof b.subject!=='string'||b.subject.length<1||b.subject.length>120||b.subject.trim()!==b.subject||/[\x00-\x1f\x7f]/.test(b.subject)||typeof b.text!=='string'||b.text.length<1||b.text.length>800||b.text.trim()!==b.text||/[\x00-\x09\x0b-\x1f\x7f<>]/.test(b.text))return null;
 if(credentialShapedText(b.subject+'\n'+b.text))return null;
 return quotePlanDigest(value);
}
const unknown=():Observation=>({outcome:'unknown',detail:'Exact simulated quote-email acceptance is unavailable. Keep work held; no resend inferred.'});
export class NativeQuoteEmailTransport {
 private readonly pin:NativeMailPin;
 constructor(pin:NativeMailPin,private readonly quote:Pick<NativeQuoteTransport,'lookup'>,private readonly mail:JsonBodyRequestTransport){
  if(!exact(pin,['quoteRequest','messageRequest'])||!quoteRequestIdentity(pin.quoteRequest)||!nativeMailIdentity(pin.messageRequest)||pin.messageRequest.binding===pin.quoteRequest.binding||pin.messageRequest.workspaceId!==pin.quoteRequest.workspaceId||pin.quoteRequest.resource!=='/quotes/'+pin.messageRequest.quoteId||pin.messageRequest.idempotencyKey===pin.quoteRequest.idempotencyKey)throw new ControlError(409,'Exact separate quote and email bindings required.');
  this.pin=structuredClone(pin);
 }
 private headers(){return{'X-LoopLabs-Workspace':this.pin.messageRequest.workspaceId,'X-LoopLabs-Quote':this.pin.messageRequest.quoteId,'X-LoopLabs-Binding':this.pin.messageRequest.binding};}
 private matches(value:unknown){if(!nativeMailIdentity(value)||!isDeepStrictEqual(value,this.pin.messageRequest))throw new ControlError(403,'Only the exact server-pinned quote message may be sent.');}
 async write(value:unknown):Promise<Observation>{
  this.matches(value);
  let predecessor:unknown;try{predecessor=await this.quote.lookup(this.pin.quoteRequest.idempotencyKey);}catch{return unknown();}
  const observed=observeQuoteEffect(this.pin.quoteRequest,predecessor);if(observed.outcome!=='verified')return{...observed,detail:'Quote predecessor is not currently verified. No email request sent.'};
  try{await this.mail.request('/quote-email/emails',{method:'POST',headers:{...this.headers(),'Content-Type':'application/json','Idempotency-Key':'looplabs-'+this.pin.messageRequest.idempotencyKey},body:JSON.stringify(this.pin.messageRequest)});}catch{return unknown();}
  return this.inspect(value);
 }
 async inspect(value:unknown):Promise<Observation>{
  this.matches(value);let evidence:unknown;try{evidence=await this.mail.request('/quote-email/effects/'+this.pin.messageRequest.idempotencyKey,{headers:this.headers()});}catch{return unknown();}
  if(!exact(evidence,['contract','effect','currentEmail'])||evidence.contract!=='quote-email-lookup-1'||!exact(evidence.effect,['contract','binding','workspaceId','quoteId','actionId','requestIdentity','quoteRequestIdentity','reference','body'])||typeof evidence.effect.reference!=='string')return unknown();
  const e=evidence.effect;if(e.contract!=='quote-email-effect-1'||e.binding!==this.pin.messageRequest.binding||e.workspaceId!==this.pin.messageRequest.workspaceId||e.quoteId!==this.pin.messageRequest.quoteId||e.actionId!==this.pin.messageRequest.idempotencyKey||e.requestIdentity!==nativeMailIdentity(this.pin.messageRequest)||e.quoteRequestIdentity!==quoteRequestIdentity(this.pin.quoteRequest)||!isDeepStrictEqual(e.body,this.pin.messageRequest.body))return{outcome:'conflict',detail:'Retained quote email differs from the exact pinned request.'};
  if(typeof e.reference!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(e.reference))return unknown();
  return observeSimulatedEmail(this.pin.messageRequest.body,e.reference,evidence.currentEmail);
 }
}
