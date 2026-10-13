import { quotePlanDigest } from '../quotes/digest';
/** Isolated quote-mail adapter. Existing provider fence owns pending send; this
 * adapter owns no approval, retry, lease or state machine. Inspection is GET-only. */
import type { QuotePlanV2 } from '../quotes/plan-v2';
import { isDeepStrictEqual } from 'node:util';
import { ControlError } from '../durable/contracts';
import { observeQuoteEffect,quoteRequestIdentity } from '../quotes/effect';
import { NativeQuoteEmailTransport,nativeMailIdentity,type NativeMailPin } from '../quotes/native-email-transport';
import type { Connector,ConnectorAction,ConnectorProvider,Observation } from './contracts';
import { NativeQuoteConnector } from './native-quote';
const unknown=():Observation=>({outcome:'unknown',detail:'Quote email remains contained. Exact pending fence and simulated acceptance must be read back; do not resend.'});
function exact(v:unknown,keys:string[]):v is Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(v).length===keys.length&&keys.every(k=>d[k]&&'value'in d[k]&&d[k].enumerable);}
export class NativeQuoteMailConnector implements ConnectorProvider {
 readonly bindingId:string;readonly workspaceId:string;private readonly pin:NativeMailPin;
 constructor(readonly quote:NativeQuoteConnector,pin:NativeMailPin,private readonly acceptance:NativeQuoteEmailTransport){
  if(!(quote instanceof NativeQuoteConnector)||!(acceptance instanceof NativeQuoteEmailTransport)||!exact(pin,['quoteRequest','messageRequest'])||!quoteRequestIdentity(pin.quoteRequest)||!nativeMailIdentity(pin.messageRequest)||pin.quoteRequest.binding!==quote.bindingId||pin.quoteRequest.workspaceId!==quote.workspaceId||pin.messageRequest.workspaceId!==quote.workspaceId||pin.messageRequest.binding===quote.bindingId||pin.quoteRequest.resource!=='/quotes/'+pin.messageRequest.quoteId||pin.quoteRequest.idempotencyKey===pin.messageRequest.idempotencyKey)throw new ControlError(503,'Exact offline quote and mail enrollment required.');
  this.pin=structuredClone(pin);this.bindingId=pin.messageRequest.binding;this.workspaceId=pin.messageRequest.workspaceId;
 }
 matchesPlan(plan:QuotePlanV2){return isDeepStrictEqual(this.pin.quoteRequest,plan.update.request)&&isDeepStrictEqual(this.pin.messageRequest,plan.message.request);}
 private request(a:ConnectorAction){const p=a.payload;if(a.connector!=='email'||a.org_id!==this.workspaceId||!p||!('contract'in p)||p.contract!=='quote-step-1'||p.step!=='message'||p.binding!==this.bindingId||a.id!==this.pin.messageRequest.idempotencyKey||!isDeepStrictEqual(p.quoteRequest,this.pin.messageRequest))throw new ControlError(409,'Only the exact saved quote email may use this connection.');return structuredClone(this.pin.messageRequest);}
 async source(connector:Connector):Promise<string|null>{if(connector!=='email')throw new ControlError(409,'Quote mail connection only supports its exact saved email.');return null;}
 async predecessor():Promise<Observation>{return observeQuoteEffect(this.pin.quoteRequest,await this.quote.transport.lookup(this.pin.quoteRequest.idempotencyKey));}
 async write(a:ConnectorAction,loseResponse=false):Promise<Observation>{const request=this.request(a);const preceding=await this.predecessor();if(preceding.outcome!=='verified')return preceding;const response=await this.quote.transport.mailWrite(request);if(response.status==='conflict')return{outcome:'conflict',detail:'Quote mail fence refused the current predecessor or exact request.'};if(response.status!=='observed'||loseResponse)return unknown();return this.inspect(a);}
 /** Existing-pending fence persistence recovery only, after the controller's
  * current policy/authority check. Provider resolver cannot insert or send. */
 async resolvePending(a:ConnectorAction):Promise<void>{
  const request=this.request(a),v=await this.quote.transport.mailLookup(a.id);
  if(!exact(v,['contract','workspaceId','quoteId','actionId','binding','requestIdentity','quoteRequestIdentity','state','observation'])||v.contract!=='native-quote-mail-fence-lookup-1'||v.state!=='pending'||v.workspaceId!==this.workspaceId||v.quoteId!==request.quoteId||v.actionId!==a.id||v.binding!==this.bindingId||v.requestIdentity!==nativeMailIdentity(request)||v.quoteRequestIdentity!==quoteRequestIdentity(this.pin.quoteRequest))return;
  if((await this.predecessor()).outcome!=='verified')return;
  await this.quote.transport.mailResolve(request);
 }
 private async readback(a:ConnectorAction,capture?:(evidence:unknown)=>void):Promise<Observation>{
  const request=this.request(a),v=await this.quote.transport.mailLookup(a.id);
  if(!exact(v,['contract','workspaceId','quoteId','actionId','binding','requestIdentity','quoteRequestIdentity','state','observation'])||v.contract!=='native-quote-mail-fence-lookup-1')return unknown();
  if(v.workspaceId!==this.workspaceId||v.quoteId!==request.quoteId||v.actionId!==a.id||v.binding!==this.bindingId||v.requestIdentity!==nativeMailIdentity(request)||v.quoteRequestIdentity!==quoteRequestIdentity(this.pin.quoteRequest))return{outcome:'conflict',detail:'Quote email fence differs from the exact offline enrollment.'};
  if(v.state!=='resolved')return unknown();
  const predecessor=await this.predecessor();if(predecessor.outcome!=='verified')return predecessor;
  const o=v.observation;if(!exact(o,['outcome','detail','reference'])||o.outcome!=='verified'||typeof o.detail!=='string'||typeof o.reference!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(o.reference))return unknown();
  const acceptance=await this.acceptance.inspect(request);if(acceptance.outcome!=='verified'||acceptance.reference!==o.reference)return acceptance.outcome==='verified'?{outcome:'conflict',detail:'Current simulated email differs from retained acceptance.'}:acceptance;
  const after=await this.predecessor();if(after.outcome==='verified')capture?.(v);return after.outcome==='verified'?acceptance:after;
 }
 async inspect(a:ConnectorAction):Promise<Observation>{return this.readback(a);}
 async verificationEvidence(a:ConnectorAction){
  let evidence:unknown;const observation=await this.readback(a,v=>{evidence=v;});
  return observation.outcome==='verified'&&evidence?{observation,effectDigest:quotePlanDigest(evidence)}:{observation};
 }
}
