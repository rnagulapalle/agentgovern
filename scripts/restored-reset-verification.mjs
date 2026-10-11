// Offline verification of a pending intent restored into an isolated database copy.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {randomUUID} from 'node:crypto';
import {resetIntent,claimResetIntent} from './reset-intent-store.mjs';
import {containRestoredWorkerBuilds} from './restored-worker-containment.mjs';
import {quarantineRestore} from '../lib/durable/recovery.ts';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function verifyRestoredPendingReset(db,{input,epoch,backupHash}){
 input=resetIntent(input);
 assert.equal(process.env.LOOPLABS_STAGING_RESET_PROOF,'isolated');
 assert.equal(process.env.LOOPLABS_RESTORE_ACK,'WRITERS_STOPPED_AND_EPOCH_ROTATED');
 assert.equal(process.env.LOOPLABS_RECOVERY_EPOCH,epoch);assert.notEqual(epoch,input.recovery_epoch);
 assert(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(epoch)&&/^[a-f0-9]{64}$/.test(backupHash));
 const restored=(await db.query('SELECT * FROM ll_temporal_reset_intents WHERE org_id=$1 AND operation_id=$2',[input.org_id,input.operation_id])).rows;
 assert.equal(restored.length,1);assert.equal(restored[0].state,'uncertain');assert.equal(restored[0].reset_run_id,null);
 for(const key of Object.keys(input))assert.equal(key==='task_finish_event_id'?Number(restored[0][key]):restored[0][key],input[key]);
 await assert.rejects(()=>claimResetIntent(db,input),/external recovery epoch/);
 const actions=()=>db.query('SELECT id,agent_id,payload_hash,state,approved_by,approval_until,lease_token,lease_until FROM ll_connector_actions WHERE org_id=$1 ORDER BY id',[input.org_id]).then(r=>r.rows);
 const agents=()=>db.query('SELECT id,reserved,active FROM ll_agents WHERE org_id=$1 ORDER BY id',[input.org_id]).then(r=>r.rows);
 const beforeActions=await actions(),beforeAgents=await agents();assert(beforeActions.length>0&&beforeAgents.length>0);
 await quarantineRestore(db,input.org_id,epoch,backupHash);
 const contained=await containRestoredWorkerBuilds(db,{orgId:input.org_id,epoch,backupHash});
 assert.deepEqual(await containRestoredWorkerBuilds(db,{orgId:input.org_id,epoch,backupHash}),contained);
 const afterActions=await actions(),afterAgents=await agents();
 const identities=rows=>rows.map(r=>({id:r.id,agent_id:r.agent_id,payload_hash:r.payload_hash}));
 assert.deepEqual(identities(afterActions),identities(beforeActions));
 assert.deepEqual(afterAgents.map(r=>({id:r.id,reserved:r.reserved})),beforeAgents.map(r=>({id:r.id,reserved:r.reserved})));
 assert(afterAgents.every(r=>r.active===false));
 for(let i=0;i<afterActions.length;i++){
  const a=afterActions[i];assert.equal(a.state,beforeActions[i].state==='succeeded'?'succeeded':'uncertain');
  assert(a.approved_by===null&&a.approval_until===null&&a.lease_token===null&&a.lease_until===null);
 }
 for(const table of ['ll_members','ll_tokens','ll_connector_scopes','ll_connector_scope_grants'])assert.equal(Number((await db.query(`SELECT count(*) n FROM ${table} WHERE org_id=$1 AND active=true`,[input.org_id])).rows[0].n),0);
 assert.equal(Number((await db.query('SELECT count(*) n FROM ll_sessions s JOIN ll_members m ON m.email=s.email WHERE m.org_id=$1',[input.org_id])).rows[0].n),0);
 await assert.rejects(()=>claimResetIntent(db,input),/external recovery epoch/);
 await assert.rejects(()=>claimResetIntent(db,{...input,recovery_epoch:epoch}),/Reset intent conflict/);
 await assert.rejects(()=>claimResetIntent(db,{...input,recovery_epoch:epoch,operation_id:randomUUID()}),/another reset intent/);
 const unchanged=(await db.query('SELECT state,reset_run_id,recovery_epoch FROM ll_temporal_reset_intents WHERE org_id=$1 AND operation_id=$2',[input.org_id,input.operation_id])).rows[0];
 assert.deepEqual(unchanged,{state:'uncertain',reset_run_id:null,recovery_epoch:input.recovery_epoch});
 return {passed:true,staleResetRefused:true,replacementIntentRefused:true,restoredAuthorityRevoked:true,actionIdentitiesPreserved:true,reservationsPreserved:true,buildsDraining:contained.builds.length,actions:afterActions.length,actionIdentitySha256:digest(identities(afterActions)),backupSha256:backupHash};
}
