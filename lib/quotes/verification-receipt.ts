import { ControlError } from '../durable/contracts';
import { quotePlanDigest } from './digest';
export interface QuoteVerificationStep {
 ordinal:1|2; actionId:string; binding:string; requestIdentity:string;
 payloadHash:string; effectDigest:string; providerReference:string; sourceAfter:string|null;
}
export interface QuoteVerificationReceipt {
 contract:'quote-verification-receipt-1'; workspaceId:string; runId:string; planHash:string;
 quoteId:string; recoveryEpoch:string; verifiedBy:string; verifiedAt:string;
 steps:[QuoteVerificationStep,QuoteVerificationStep]; receiptHash:string;
}
export interface QuoteVerificationView {
 historical:QuoteVerificationReceipt|null;
 current:{outcome:'verified'|'conflict'|'unknown';checkedAt:string;detail:string};
}
const hash=/^[a-f0-9]{64}$/,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function exact(v:unknown,keys:string[]):v is Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(v).length===keys.length&&keys.every(k=>d[k]&&'value'in d[k]&&d[k].enumerable);}
function bounded(v:unknown,re:RegExp):v is string{return typeof v==='string'&&re.test(v);}
/** Provider/server observation record, never a signature, delivery assertion or
 * current-state assertion. Current status requires separate fresh readbacks. */
export function parseQuoteVerificationReceipt(value:unknown):QuoteVerificationReceipt {
 const fail=():never=>{throw new ControlError(409,'Exact retained quote verification is unavailable.');};
 if(!exact(value,['contract','workspaceId','runId','planHash','quoteId','recoveryEpoch','verifiedBy','verifiedAt','steps','receiptHash'])||value.contract!=='quote-verification-receipt-1'||!bounded(value.workspaceId,/^[A-Za-z0-9_-]{1,64}$/)||!bounded(value.runId,uuid)||!bounded(value.planHash,hash)||!bounded(value.quoteId,/^[A-Za-z0-9_-]{1,64}$/)||!bounded(value.recoveryEpoch,uuid)||!bounded(value.verifiedBy,/^[^\s\x00-\x1f]{1,254}$/)||!bounded(value.verifiedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)||!Number.isFinite(Date.parse(value.verifiedAt))||new Date(value.verifiedAt).toISOString()!==value.verifiedAt||!bounded(value.receiptHash,hash)||!Array.isArray(value.steps)||value.steps.length!==2||Reflect.ownKeys(value.steps).length!==3)fail();
 const r=value as unknown as QuoteVerificationReceipt;
 for(let i=0;i<2;i++){const descriptor=Object.getOwnPropertyDescriptor(r.steps,String(i));if(!descriptor||!('value'in descriptor)||!descriptor.enumerable)fail();const s=descriptor!.value;if(!exact(s,['ordinal','actionId','binding','requestIdentity','payloadHash','effectDigest','providerReference','sourceAfter'])||s.ordinal!==i+1||!bounded(s.actionId,uuid)||!bounded(s.binding,hash)||!bounded(s.requestIdentity,hash)||!bounded(s.payloadHash,hash)||!bounded(s.effectDigest,hash)||!bounded(s.providerReference,/^[A-Za-z0-9_-]{1,128}$/)||!(i===0?bounded(s.sourceAfter,/^[A-Za-z0-9._:-]{1,128}$/):s.sourceAfter===null))fail();}
 if(r.steps[0].actionId===r.steps[1].actionId||r.steps[0].binding===r.steps[1].binding)fail();
 const {receiptHash,...body}=r;if(quotePlanDigest(body)!==receiptHash)fail();
 return structuredClone(r);
}
export function createQuoteVerificationReceipt(body:Omit<QuoteVerificationReceipt,'contract'|'receiptHash'>):QuoteVerificationReceipt {
 const full={contract:'quote-verification-receipt-1' as const,...body};
 return parseQuoteVerificationReceipt({...full,receiptHash:quotePlanDigest(full)});
}
