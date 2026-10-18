// Assertions on actual independently read rows, never a supplied pass receipt.
import assert from 'node:assert/strict';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function assertQuoteRestoreSnapshot({plan,actions,reservations,epoch},reference,phase){
 assert(['restored','after'].includes(phase));assert(uuid.test(reference.planId)&&/^[a-f0-9]{64}$/.test(reference.planHash));
 assert.deepEqual(JSON.parse(JSON.stringify(plan)),reference.plan,'Entire immutable saved plan row must remain exact, including outer epoch/member/proposal identities');
 assert.equal(plan.id,reference.planId);assert.equal(plan.plan_hash,reference.planHash);assert.equal(plan.quote_action_id,reference.plan.quote_action_id);assert.equal(plan.message_action_id,reference.plan.message_action_id);assert(uuid.test(plan.quote_action_id)&&uuid.test(plan.message_action_id)&&plan.quote_action_id!==plan.message_action_id);
 assert.deepEqual(plan.plan,reference.plan.plan);assert.equal(plan.plan.quote.sourceVersion,'v3');assert.equal(plan.plan.discountBps,1400);assert.equal(actions.length,2);assert.equal(new Set(actions.map(a=>a.id)).size,2);
 for(const action of actions){const old=reference.actions.find(a=>a.id===action.id);assert(old);assert.equal(action.payload_hash,old.payload_hash);assert(/^[a-f0-9]{64}$/.test(action.payload_hash));}
 assert.deepEqual(reservations,reference.reservations);
 const approved=reference.actions.find(a=>a.id===plan.quote_action_id),held=reference.actions.find(a=>a.id===plan.message_action_id);assert(approved.state==='ready'&&approved.approved_by===plan.plan.approver&&approved.approval_until&&approved.lease_token===null);assert(held.state==='held'&&held.approved_by===null&&held.approval_until===null&&held.lease_token===null);
 if(phase==='restored'){assert.deepEqual(JSON.parse(JSON.stringify(actions)),reference.actions);assert.equal(plan.recovery_epoch,reference.plan.recovery_epoch);assert.equal(epoch,reference.plan.recovery_epoch);}
 else{assert(actions.every(a=>a.state==='uncertain'&&a.approved_by===null&&a.approval_until===null&&a.lease_token===null));assert.notEqual(epoch,reference.plan.recovery_epoch);}
}
export function assertQuoteProviderRetained(before,after){
 assert.equal(before.quote.version,4);assert.equal(before.quoteEffects.length,1);assert.equal(Object.keys(before.mailEffects).length,1);
 for(const key of ['quote','quoteEffects','pendingMail','mailEffects'])assert.deepEqual(after[key],before[key]);
}
