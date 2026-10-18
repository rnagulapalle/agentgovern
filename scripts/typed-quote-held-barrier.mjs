// Optional trusted-producer checkpoint only. Never approval or execution authority.
import assert from 'node:assert/strict';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
export function quoteHeldBarrierOptions(onHeld,required=false){
 assert.equal(typeof required,'boolean','Explicit held-barrier requirement required');
 assert(onHeld===undefined||typeof onHeld==='function','Source-owned held callback required');
 assert(!required||typeof onHeld==='function','Required quote-held callback is missing');
}
function held(saved,value){
 const p=saved?.plan,s=value?.snapshot,o=value?.observed;assert(p&&s&&o,'Actual saved quote, action and provider observations required');
 assert(uuid.test(saved.id)&&hash.test(saved.planHash)&&uuid.test(p.authority?.scopeId));assert.equal(p.version,'distributor-quote-plan-2');
 assert.deepEqual(s.saved,saved,'Saved quote bytes changed at held barrier');assert.equal(s.completion,'not-established');assert.equal(s.run?.id,saved.id);assert.equal(s.run.state,'active');
 assert(Array.isArray(s.actions)&&s.actions.length===2,'Both exact held actions required');assert.notEqual(p.update.actionId,p.message.actionId);
 const privateActions=o.workspaceEvidence?.quoteActions;assert(Array.isArray(privateActions),'Actual offline SQL action rows required');const authority=[];
 const actions=[p.update,p.message].map(part=>{assert(uuid.test(part.actionId));const rows=s.actions.filter(a=>a.id===part.actionId);assert.equal(rows.length,1,'Exact distinct action identity required');const a=rows[0];assert.deepEqual(Object.keys(a).sort(),['approved_by','connector','evidence','id','payload_hash','state'],'Exact public action projection required');assert.equal(a.state,'held');assert.equal(a.approved_by,null);assert(hash.test(a.payload_hash),'Exact held payload hash required');
 const raw=privateActions.filter(row=>row.id===a.id);assert.equal(raw.length,1,'Exact offline SQL action identity required');const row=raw[0];assert.equal(row.org_id,p.workspaceId);for(const key of ['id','connector','payload_hash','state','approved_by'])assert.equal(row[key],a[key],'Public and offline action observations differ');assert.deepEqual(row.evidence,a.evidence);for(const key of ['approval_until','lease_token','lease_until'])assert.equal(row[key],null,'Actual offline action must be unapproved and unleased');authority.push(structuredClone(row));return{id:a.id,payloadHash:a.payload_hash};});
 assert.equal(o.workspaceId,p.workspaceId);assert.equal(o.quoteId,p.quote.id);assert(/^v[1-9][0-9]*$/.test(p.quote.sourceVersion));assert.equal(o.quote?.version,Number(p.quote.sourceVersion.slice(1)));
 assert(Array.isArray(o.quoteEffects)&&o.quoteEffects.length===0,'Held quote must have zero effects');assert(o.mailEffects&&typeof o.mailEffects==='object'&&!Array.isArray(o.mailEffects)&&Object.keys(o.mailEffects).length===0,'Held confirmation must have zero effects');assert(Array.isArray(o.pendingMail)&&o.pendingMail.length===0,'Held confirmation must not acquire provider dispatch');
 return{descriptor:Object.freeze({version:1,phase:'quote-held',planId:saved.id,planHash:saved.planHash,scopeId:p.authority.scopeId,runId:s.run.id,update:Object.freeze(actions[0]),message:Object.freeze(actions[1])}),business:{workspaceId:o.workspaceId,quoteId:o.quoteId,quote:structuredClone(o.quote),quoteEffects:structuredClone(o.quoteEffects),mailEffects:structuredClone(o.mailEffects),pendingMail:structuredClone(o.pendingMail)},snapshot:structuredClone(s),authority};
}
export async function quoteHeldBarrier({saved,initial,readCurrent,onHeld,required=false}){
 quoteHeldBarrierOptions(onHeld,required);if(onHeld===undefined)return{used:false};
 assert.equal(typeof readCurrent,'function','Independent post-barrier state read required');const before=held(saved,initial);
 // The callback cannot return a supplied success/approval flag or mutate the
 // driver's saved objects. Only actual reads can establish the resume boundary.
 const response=await onHeld(before.descriptor);assert.equal(response,undefined,'Held callback must not supply acceptance or authority');
 const after=held(saved,await readCurrent());assert.deepEqual(after.descriptor,before.descriptor,'Held action identity changed during checkpoint');assert.deepEqual(after.snapshot,before.snapshot,'Saved held authority changed during checkpoint');assert.deepEqual(after.authority,before.authority,'Offline SQL authority changed during checkpoint');assert.deepEqual(after.business,before.business,'Provider state changed during held checkpoint');
 return{used:true,descriptor:before.descriptor};
}
