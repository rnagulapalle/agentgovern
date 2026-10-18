import { quotePlanDigest } from '../quotes/digest';
import type { QuoteEffectLookup } from '../quotes/effect';
/** Adapter for the measured isolated native quote contract only. This owns no
 * approval, lease, state machine, retry or hosted-provider authority. */
import { ControlError } from '../durable/contracts';
import { observeQuoteEffect, quoteRequestIdentity } from '../quotes/effect';
import { NativeQuoteTransport,type NativeQuoteTransportOptions } from '../quotes/native-transport';
import type { QuotePlanV2 } from '../quotes/plan-v2';
import type { Connector, ConnectorAction, ConnectorProvider, Observation } from './contracts';
export class NativeQuoteConnector implements ConnectorProvider {
 readonly bindingId:string;
 readonly workspaceId:string;
 readonly transport:NativeQuoteTransport;
 constructor(config:Readonly<{origin:string;workspaceId:string;quoteId:string;quoteBinding:string;emailBinding:string}>,credential:()=>Promise<string>,timeout=1500,options:NativeQuoteTransportOptions={}){
  this.transport=new NativeQuoteTransport(config,credential,timeout,options);
  this.bindingId=config.quoteBinding;this.workspaceId=config.workspaceId;
 }
 private request(a:ConnectorAction):QuotePlanV2['update']['request']{
  const p=a.payload;
  if(a.connector!=='quote'||!p||!('contract' in p)||p.contract!=='quote-step-1'||p.step!=='update'||p.binding!==this.bindingId||!quoteRequestIdentity(p.quoteRequest)||p.quoteRequest.contract!=='quote-conditional-write-1'||p.quoteRequest.binding!==this.bindingId||p.quoteRequest.workspaceId!==this.workspaceId||p.quoteRequest.idempotencyKey!==a.id)
   throw new ControlError(409,'Exact saved native quote request and action identity required. No write was sent.');
  return structuredClone(p.quoteRequest);
 }
 async source(connector:Connector){
  if(connector!=='quote')throw new ControlError(409,'This connection only supports the isolated native quote update.');
  return (await this.transport.read())?.sourceVersion??null;
 }
 async write(a:ConnectorAction,loseResponse=false):Promise<Observation>{
  const request=this.request(a),current=await this.transport.read();
  if(!current)return{outcome:'unknown',detail:'Current quote evidence unavailable. No automatic retry.'};
  if(current.sourceVersion!==request.sourceVersion)return{outcome:'conflict',detail:'Quote source changed before dispatch. No quote update was sent.'};
  // Atomic conditional source enforcement still happens in the native provider;
  // this read is only an earlier definite-refusal check, not race protection.
  const response=await this.transport.write(request);
  if(response.status==='conflict')return{outcome:'conflict',detail:'The provider refused the stale conditional quote request.'};
  if(response.status!=='observed'||loseResponse)return{outcome:'unknown',detail:'Quote response unavailable. Verify the retained effect before further work; do not resend.'};
  return observeQuoteEffect(request,await this.transport.lookup(a.id));
 }
 async inspect(a:ConnectorAction):Promise<Observation>{
  return (await this.verificationEvidence(a)).observation;
 }
 async verificationEvidence(a:ConnectorAction){
  const request=this.request(a),lookup=await this.transport.lookup(a.id),observation=observeQuoteEffect(request,lookup);
  if(observation.outcome!=='verified')return {observation};
  const effect=(lookup as QuoteEffectLookup).effects[0];
  return {observation,effectDigest:quotePlanDigest(effect),sourceAfter:effect.sourceAfter};
 }
}
