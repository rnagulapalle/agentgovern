/** Shared exact simulated-email readback; no delivery or execution authority. */
import type { Observation } from './contracts';
export function observeSimulatedEmail(body:Readonly<{from?:string;to?:string[];subject?:string;text?:string}>,reference:string,value:unknown):Observation {
 const r=value as Record<string,unknown>|null;
 if(!r||r.id!==reference||r.subject!==body.subject||!Array.isArray(r.to)||r.to.length!==1||r.to[0]!==body.to?.[0]||r.from!==body.from||r.text!==body.text)
  return{outcome:'conflict',detail:'Message evidence differs from the approved template or recipient.'};
 if(!['sent','delivered'].includes(r.last_event as string))return{outcome:'unknown',reference,detail:'Message acceptance is not established; delivery or failure requires review.'};
 return{outcome:'verified',reference,detail:'Simulated provider accepted the approved message. This is not proof of real delivery.'};
}
