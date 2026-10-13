// Observed provider rows only. This assertion grants no execution authority.
import assert from 'node:assert/strict';
import {assertQuoteProviderObservation} from './typed-quote-browser-proof.mjs';
export function assertSuccessorProviderCompletion(before,after,saved){
 const p=saved.plan;
 assert.equal(before.quote.version,4);
 assert.equal(p.quote.sourceVersion,'v4');
 assert.equal(before.quoteEffects.length,1);
 assert.equal(Object.keys(before.mailEffects).length,1);
 assert.equal(before.pendingMail.length,1);
 assert.equal(after.quoteEffects.length,2);
 assert.equal(Object.keys(after.mailEffects).length,2);
 assert.equal(after.pendingMail.length,2);
 assert.equal(new Set(after.quoteEffects.map(row=>row.action_id)).size,2);
 assert.equal(new Set(after.pendingMail.map(row=>row.action_id)).size,2);
 for(const old of before.quoteEffects)assert.deepEqual(after.quoteEffects.find(row=>row.action_id===old.action_id),old,'Old committed effect changed');
 for(const [id,old]of Object.entries(before.mailEffects))assert.deepEqual(after.mailEffects[id],old,'Old accepted message changed');
 for(const old of before.pendingMail)assert.deepEqual(after.pendingMail.find(row=>row.action_id===old.action_id),old,'Old resolved mail dispatch changed');
 assert(!before.quoteEffects.some(row=>row.action_id===p.update.actionId));
 assert(!Object.hasOwn(before.mailEffects,p.message.actionId));
 const fresh=after.quoteEffects.filter(row=>row.action_id===p.update.actionId);
 const pending=after.pendingMail.filter(row=>row.action_id===p.message.actionId);
 assert.equal(fresh.length,1);assert.equal(pending.length,1);
 assertQuoteProviderObservation({...after,quoteEffects:fresh,mailEffects:{[p.message.actionId]:after.mailEffects[p.message.actionId]},pendingMail:pending},saved,'completed');
 return Object.freeze({newQuoteEffects:1,newSimulatedEmailAcceptances:1,oldEffectsUnchanged:true,sourceBefore:'v4',sourceAfter:'v5',production:false});
}
