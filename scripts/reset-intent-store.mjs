// Offline owner/proof boundary only; no public API or runtime retry loop.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {completedSemanticHistory} from './temporal-semantic-replay.mjs';
import {pinnedBuild,resetWorkflowId} from './temporal-completed-reset.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const fields=['org_id','operation_id','plan_id','namespace','workflow_id','original_run_id','task_finish_event_id','original_history_sha256','worker_build_id','image_id','recovery_epoch'];
export function resetIntent(input){
 assert(input&&typeof input==='object');assert.deepEqual(Object.keys(input).sort(),[...fields].sort());
 assert(/^[a-zA-Z0-9_-]{1,64}$/.test(input.org_id));
 for(const f of ['operation_id','plan_id','original_run_id','recovery_epoch'])assert(uuid.test(input[f]));
 assert(/^[a-zA-Z0-9_-]{1,100}$/.test(input.namespace));
 const identity=resetWorkflowId(input.workflow_id);
 if(identity){assert.equal(identity.orgId,input.org_id,'Reset workflow workspace mismatch');assert.equal(identity.planId,input.plan_id,'Reset workflow plan mismatch');}
 assert(Number.isSafeInteger(input.task_finish_event_id)&&input.task_finish_event_id>0);
 assert(hash.test(input.original_history_sha256));assert(/^ack-[a-f0-9]{64}$/.test(input.worker_build_id));
 assert(/^sha256:[a-f0-9]{64}$/.test(input.image_id));return {...input};
}
async function ownerTransaction(db,fn){
 const c=await db.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s'");
  const owner=(await c.query("SELECT pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid=to_regclass('ll_temporal_reset_intents')")).rows;
  assert(owner.length===1&&owner[0].owned===true,'Separate reset-intent owner required');
  const digest=createHash('sha256').update(await readFile('lib/enquiries/reset-intent-schema.sql')).digest('hex');
  const applied=(await c.query('SELECT digest FROM ll_migrations WHERE version=15')).rows;
  assert(applied.length===1&&applied[0].digest===digest,'Exact reset-intent migration required');
  const result=await fn(c);await c.query('COMMIT');return result;
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
async function epochFence(c,input){
 assert(uuid.test(process.env.LOOPLABS_RECOVERY_EPOCH)&&process.env.LOOPLABS_RECOVERY_EPOCH===input.recovery_epoch,'Current external recovery epoch required');
 const r=(await c.query('SELECT epoch FROM ll_workspace_recovery WHERE org_id=$1 FOR SHARE',[input.org_id])).rows;
 assert(r.length===1&&r[0].epoch===input.recovery_epoch,'Current external recovery epoch required');
}
function sameIntent(row,input){
 for(const f of fields)assert.equal(f==='task_finish_event_id'?Number(row[f]):row[f],input[f],'Reset intent conflict');
}
export async function claimResetIntent(db,input){
 input=resetIntent(input);
 return ownerTransaction(db,async c=>{
  await epochFence(c,input);
  const result=await c.query(`INSERT INTO ll_temporal_reset_intents(${fields.join(',')}) VALUES(${fields.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT DO NOTHING RETURNING *`,fields.map(f=>input[f]));
  const row=(await c.query('SELECT * FROM ll_temporal_reset_intents WHERE org_id=$1 AND operation_id=$2 FOR UPDATE',[input.org_id,input.operation_id])).rows[0];
  assert(row,'Original execution already belongs to another reset intent');sameIntent(row,input);
  return {dispatch:result.rowCount===1,state:row.state,resetRunId:row.reset_run_id};
 });
}
export async function observeResetIntent(db,input,{resetRunId,historySha256}){
 input=resetIntent(input);assert(uuid.test(resetRunId)&&resetRunId!==input.original_run_id);assert(hash.test(historySha256));
 return ownerTransaction(db,async c=>{
  await epochFence(c,input);
  const row=(await c.query('SELECT * FROM ll_temporal_reset_intents WHERE org_id=$1 AND operation_id=$2 FOR UPDATE',[input.org_id,input.operation_id])).rows[0];
  assert(row);sameIntent(row,input);
  if(row.state==='observed'){
   assert.equal(row.reset_run_id,resetRunId);assert.equal(row.reset_history_sha256,historySha256);return;
  }
  assert.equal(row.state,'uncertain');
  await c.query("UPDATE ll_temporal_reset_intents SET state='observed',reset_run_id=$3,reset_history_sha256=$4,observed_at=clock_timestamp() WHERE org_id=$1 AND operation_id=$2",[input.org_id,input.operation_id,resetRunId,historySha256]);
 });
}
// The RPC callback must be supplied by the isolated proof or future reviewed owner
// command. On error the already committed uncertainty remains; no automatic retry.
export async function dispatchResetOnce(db,input,rpc){
 input=resetIntent(input);assert.equal(typeof rpc,'function');const claim=await claimResetIntent(db,input);
 if(!claim.dispatch)return claim;
 const response=await rpc({namespace:input.namespace,workflowExecution:{workflowId:input.workflow_id,runId:input.original_run_id},
  workflowTaskFinishEventId:input.task_finish_event_id,requestId:input.operation_id,
  reason:`LoopLabs isolated reset intent ${input.operation_id}`,identity:'isolated-reset-intent-controller',
  resetReapplyExcludeTypes:[1,2,3],postResetOperations:[]});
 return {dispatch:true,state:'uncertain',response};
}
export function resetObservation(input,{runId,history,description}){
 input=resetIntent(input);assert(uuid.test(runId)&&runId!==input.original_run_id);
 pinnedBuild(description,input.worker_build_id);
 assert.equal(description.workflowId,input.workflow_id);assert.equal(description.runId,runId);
 const evidence=completedSemanticHistory(history);
 const markers=history.events.filter(e=>e.eventType===9&&e.workflowTaskFailedEventAttributes?.cause===20)
  .map(e=>e.workflowTaskFailedEventAttributes)
  .filter(e=>e.baseRunId===input.original_run_id&&e.newRunId===runId);
 assert.equal(markers.length,1,'Exact reset lineage required');
 assert.equal(markers[0].failure?.message,`LoopLabs isolated reset intent ${input.operation_id}`,'Exact persisted reset intent required');
 return {resetRunId:runId,historySha256:evidence.sha256};
}
// Independent read-only Temporal readback, never an RPC retry. An incomplete or
// unrelated current execution leaves the intent uncertain. No effect proof claimed.
export async function reconcileResetIntent(db,input,client){
 input=resetIntent(input);
 assert.equal(client.options?.namespace,input.namespace,'Matching Temporal namespace required');
 const current=await client.workflow.getHandle(input.workflow_id).describe();
 const handle=client.workflow.getHandle(input.workflow_id,current.runId);
 const observed=resetObservation(input,{runId:current.runId,history:await handle.fetchHistory(),description:await handle.describe()});
 await observeResetIntent(db,input,observed);return {state:'observed',resetRunId:observed.resetRunId};
}
