import {beforeAll,afterAll,test,expect} from 'vitest';
import {Pool} from 'pg';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {claimResetIntent,observeResetIntent,dispatchResetOnce,resetIntent,reconcileResetIntent,resetObservation} from './reset-intent-store.mjs';
import {resolve} from 'node:path';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {Worker,Runtime,DefaultLogger} from '@temporalio/worker';
import {completedSemanticHistory} from './temporal-semantic-replay.mjs';
import {pinnedBuild} from './temporal-completed-reset.mjs';
const suffix=randomBytes(8).toString('hex'),schema=`reset_${suffix}`,role=`reset_role_${suffix}`;
const build=`ack-${'a'.repeat(64)}`,image=`sha256:${'a'.repeat(64)}`,epoch=randomUUID();
let admin,db,runtime;const priorEpoch=process.env.LOOPLABS_RECOVERY_EPOCH;
async function input(){
 const plan=randomUUID(),workflow=`reset-proof-${randomUUID()}`;
 await db.query("INSERT INTO ll_workflow_runs VALUES('proof',$1,'completed')",[plan]);
 await db.query("INSERT INTO ll_temporal_dispatch VALUES('proof',$1,$2,'started')",[plan,workflow]);
 // Fixture routes are installed before migration14; no new admission is inferred.
 await db.query("INSERT INTO ll_temporal_record_routes VALUES('proof',$1,$2)",[plan,build]);
 return {org_id:'proof',operation_id:randomUUID(),plan_id:plan,namespace:'default',workflow_id:workflow,original_run_id:randomUUID(),task_finish_event_id:4,original_history_sha256:'b'.repeat(64),worker_build_id:build,image_id:image,recovery_epoch:epoch};
}
beforeAll(async()=>{
 process.env.LOOPLABS_RECOVERY_EPOCH=epoch;
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error('Dedicated PostgreSQL required; reset intent tests must not skip.');
 admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);
 db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 await db.query(`CREATE TABLE ll_temporal_record_routes(org_id text,plan_id uuid,worker_build_id text,PRIMARY KEY(org_id,plan_id));
 CREATE TABLE ll_temporal_dispatch(org_id text,plan_id uuid,workflow_id text,state text);
 CREATE TABLE ll_workflow_runs(org_id text,id uuid,state text);
 CREATE TABLE ll_workspace_recovery(org_id text PRIMARY KEY,epoch uuid);
 CREATE TABLE ll_temporal_worker_builds(worker_build_id text PRIMARY KEY,image_id text,state text);`);
 await db.query('INSERT INTO ll_temporal_worker_builds VALUES($1,$2,$3)',[build,image,'draining']);
 await db.query("INSERT INTO ll_workspace_recovery VALUES('proof',$1)",[epoch]);
 await db.query(await readFile('lib/enquiries/reset-intent-schema.sql','utf8'));
 await db.query('CREATE TABLE ll_migrations(version int PRIMARY KEY,digest text NOT NULL)');
 await db.query('INSERT INTO ll_migrations VALUES(15,$1)',[createHash('sha256').update(await readFile('lib/enquiries/reset-intent-schema.sql')).digest('hex')]);
 await admin.query(`CREATE ROLE ${role} NOLOGIN`);await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}; GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
 runtime=new Pool({connectionString:url,options:`-c search_path=${schema} -c role=${role}`});
});
afterAll(async()=>{if(priorEpoch===undefined)delete process.env.LOOPLABS_RECOVERY_EPOCH;else process.env.LOOPLABS_RECOVERY_EPOCH=priorEpoch;await runtime?.end();await db?.end();await admin?.query(`DROP SCHEMA ${schema} CASCADE`);await admin?.query(`DROP OWNED BY ${role}`);await admin?.query(`DROP ROLE ${role}`);await admin?.end();});
test('concurrent persisted claims authorize exactly one dispatch; pending uncertainty never retries',async()=>{
 const i=await input();const claims=await Promise.all(Array.from({length:8},()=>claimResetIntent(db,i)));
 expect(claims.filter(c=>c.dispatch)).toHaveLength(1);expect(claims.every(c=>c.state==='uncertain')).toBe(true);
 expect(await claimResetIntent(db,i)).toEqual({dispatch:false,state:'uncertain',resetRunId:null});
});
test('lost RPC response stays durable across new connection; retry does not call RPC',async()=>{
 const i=await input();let calls=0;
 const rpc=async()=>{calls++;throw Error('Simulated lost response after remote reset');};
 await expect(dispatchResetOnce(db,i,rpc)).rejects.toThrow('Simulated lost response');
 const fresh=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 try{expect(await dispatchResetOnce(fresh,i,rpc)).toEqual({dispatch:false,state:'uncertain',resetRunId:null});expect(calls).toBe(1);}
 finally{await fresh.end();}
});
test('RPC uses the persisted intent snapshot despite caller mutation during database waits',async()=>{
 const i=await input(),expected={...i};let sent;
 const pending=dispatchResetOnce(db,i,async request=>{sent=request;return {runId:randomUUID()};});
 i.workflow_id='substituted-workflow';i.operation_id=randomUUID();i.namespace='substituted';
 await pending;expect(sent.workflowExecution.workflowId).toBe(expected.workflow_id);
 expect(sent.requestId).toBe(expected.operation_id);expect(sent.namespace).toBe(expected.namespace);
 expect(sent.resetReapplyExcludeTypes).toEqual([1,2,3]);expect(sent.postResetOperations).toEqual([]);
});
test('observed result is idempotent and cannot be substituted or requeued',async()=>{
 const i=await input(),result={resetRunId:randomUUID(),historySha256:'c'.repeat(64)};
 await claimResetIntent(db,i);await observeResetIntent(db,i,result);await observeResetIntent(db,i,result);
 expect(await claimResetIntent(db,i)).toEqual({dispatch:false,state:'observed',resetRunId:result.resetRunId});
 await expect(observeResetIntent(db,i,{...result,resetRunId:randomUUID()})).rejects.toThrow();
 for(const sql of ["SET state='uncertain',reset_run_id=NULL,reset_history_sha256=NULL,observed_at=NULL","SET original_history_sha256=repeat('d',64)"])
  await expect(db.query(`UPDATE ll_temporal_reset_intents ${sql} WHERE operation_id=$1`,[i.operation_id])).rejects.toMatchObject({code:'23514'});
 await expect(db.query('DELETE FROM ll_temporal_reset_intents WHERE operation_id=$1',[i.operation_id])).rejects.toMatchObject({code:'23514'});
});
test('new operation IDs and changed immutable identity cannot repeat an original execution',async()=>{
 const i=await input();await claimResetIntent(db,i);
 await expect(claimResetIntent(db,{...i,operation_id:randomUUID()})).rejects.toThrow('another reset intent');
 await expect(claimResetIntent(db,{...i,original_history_sha256:'c'.repeat(64)})).rejects.toThrow();
});
test('runtime credentials cannot claim, observe, insert or mutate reset intents',async()=>{
 const i=await input();await expect(claimResetIntent(runtime,i)).rejects.toThrow('owner required');
 await claimResetIntent(db,i);
 await expect(observeResetIntent(runtime,i,{resetRunId:randomUUID(),historySha256:'c'.repeat(64)})).rejects.toThrow('owner required');
 await expect(runtime.query("UPDATE ll_temporal_reset_intents SET state='observed'")).rejects.toMatchObject({code:'42501'});
 await expect(runtime.query("INSERT INTO ll_temporal_reset_intents(org_id) VALUES('proof')")).rejects.toMatchObject({code:'42501'});
});
test('wrong image, workflow, unknown route and unfinished application run default-deny',async()=>{
 for(const change of [{image_id:`sha256:${'d'.repeat(64)}`},{workflow_id:'different-workflow'},{worker_build_id:`ack-${'d'.repeat(64)}`},{plan_id:randomUUID()}]){
  const i=await input();await expect(claimResetIntent(db,{...i,...change})).rejects.toMatchObject({code:'23514'});
 }
 const i=await input();await db.query("UPDATE ll_workflow_runs SET state='active' WHERE id=$1",[i.plan_id]);
 await expect(claimResetIntent(db,i)).rejects.toMatchObject({code:'23514'});
});
test('malformed intent and missing observed history refuse before mutation',async()=>{
 const i=await input();for(const change of [{namespace:'unsafe/path'},{task_finish_event_id:0},{image_id:'latest'},{extra:'authority'},{recovery_epoch:'invalid'}])expect(()=>resetIntent({...i,...change})).toThrow();
 await claimResetIntent(db,i);
 await expect(db.query("UPDATE ll_temporal_reset_intents SET state='observed',reset_run_id=$2,reset_history_sha256=NULL,observed_at=now() WHERE operation_id=$1",[i.operation_id,randomUUID()])).rejects.toMatchObject({code:'23514'});
});
test('rotated external recovery epoch contains both pending and observed intents',async()=>{
 const i=await input();await claimResetIntent(db,i);
 await db.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='proof'",[randomUUID()]);
 try{
  await expect(claimResetIntent(db,i)).rejects.toThrow('external recovery epoch');
  await expect(observeResetIntent(db,i,{resetRunId:randomUUID(),historySha256:'c'.repeat(64)})).rejects.toThrow('external recovery epoch');
 }finally{await db.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='proof'",[epoch]);}
});
test('missing or rotated deployment configuration refuses even when archived database epoch matches input',async()=>{
 const i=await input();
 try{
  delete process.env.LOOPLABS_RECOVERY_EPOCH;await expect(claimResetIntent(db,i)).rejects.toThrow('external recovery epoch');
  process.env.LOOPLABS_RECOVERY_EPOCH=randomUUID();await expect(claimResetIntent(db,i)).rejects.toThrow('external recovery epoch');
 }finally{process.env.LOOPLABS_RECOVERY_EPOCH=epoch;}
});
test('changed applied migration refuses before persisting an intent',async()=>{
 const i=await input();await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=15");
 try{await expect(claimResetIntent(db,i)).rejects.toThrow('Exact reset-intent migration');}
 finally{await db.query('UPDATE ll_migrations SET digest=$1 WHERE version=15',[createHash('sha256').update(await readFile('lib/enquiries/reset-intent-schema.sql')).digest('hex')]);}
 expect((await db.query('SELECT count(*)::int n FROM ll_temporal_reset_intents WHERE operation_id=$1',[i.operation_id])).rows[0].n).toBe(0);
});
test('actual local Temporal lost reset response cannot send a second reset after reconnect',async()=>{
 Runtime.install({logger:new DefaultLogger('ERROR')});let environment;
 const i=await input();let calls=0,rpcCalls=0;
 try{
  environment=await TestWorkflowEnvironment.createLocal();
  const worker=await Worker.create({connection:environment.nativeConnection,taskQueue:i.workflow_id,
   workflowsPath:resolve('runtime/temporal/pinned-workflow.ts'),activities:{async advanceContract(){calls++;return 'completed';}},
   workerDeploymentOptions:{version:{deploymentName:'looplabs-acknowledgement',buildId:build},useWorkerVersioning:true,defaultVersioningBehavior:'PINNED'},shutdownGraceTime:'1 second'});
  await worker.runUntil(async()=>{
   for(let attempt=0;;attempt++){
    try{await environment.client.workflowService.setWorkerDeploymentCurrentVersion({namespace:'default',deploymentName:'looplabs-acknowledgement',buildId:build,identity:'isolated-reset-intent-controller'});break;}
    catch(error){if(attempt>=100)throw error;await new Promise(r=>setTimeout(r,100));}
   }
   const original=await environment.client.workflow.start('pinnedAcknowledgement',{workflowId:i.workflow_id,taskQueue:i.workflow_id,
    args:[{runId:i.plan_id,planHash:'0'.repeat(64),planVersion:'acknowledgement-1',connectorVersion:'private-record-twin-2'}],workflowExecutionTimeout:'60 seconds',
    versioningOverride:{pinnedTo:{deploymentName:'looplabs-acknowledgement',buildId:build}}});
   expect(await original.result()).toBe('completed');expect(calls).toBe(1);
   const history=await original.fetchHistory();pinnedBuild(await original.describe(),build);
   i.original_run_id=original.firstExecutionRunId;i.original_history_sha256=completedSemanticHistory(history).sha256;
   i.task_finish_event_id=Number(String(history.events.find(e=>e.eventType===7).eventId));
   const rpc=async request=>{rpcCalls++;await environment.client.workflowService.resetWorkflowExecution(request);throw Error('Actual reset response discarded');};
   await expect(dispatchResetOnce(db,i,rpc)).rejects.toThrow('response discarded');
   const fresh=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
   try{expect(await dispatchResetOnce(fresh,i,rpc)).toEqual({dispatch:false,state:'uncertain',resetRunId:null});}
   finally{await fresh.end();}
   const current=environment.client.workflow.getHandle(i.workflow_id);expect(await current.result()).toBe('completed');
   const desc=await current.describe();pinnedBuild(desc,build);
   expect(desc.runId).not.toBe(i.original_run_id);expect(calls).toBe(2);expect(rpcCalls).toBe(1);
   const restored=await current.fetchHistory(),marker=restored.events.find(e=>e.eventType===9&&e.workflowTaskFailedEventAttributes?.cause===20)?.workflowTaskFailedEventAttributes;
   expect(marker?.baseRunId).toBe(i.original_run_id);expect(marker?.newRunId).toBe(desc.runId);
   expect(marker?.failure?.message).toContain(i.operation_id);
   expect(await reconcileResetIntent(db,i,environment.client)).toEqual({state:'observed',resetRunId:desc.runId});
   await expect(reconcileResetIntent(db,{...i,namespace:'different'},environment.client)).rejects.toThrow('Matching Temporal namespace');
   for(const change of [{runId:i.original_run_id},{description:{...desc,workflowId:'unrelated'}},{history:{events:restored.events.map(e=>e.eventType===9?{...e,workflowTaskFailedEventAttributes:{...e.workflowTaskFailedEventAttributes,baseRunId:randomUUID()}}:e)}},{history:{events:restored.events.map(e=>e.eventType===9?{...e,workflowTaskFailedEventAttributes:{...e.workflowTaskFailedEventAttributes,failure:{message:'another reset intent'}}}:e)}},{history:{events:restored.events.slice(0,-1)}}])
    expect(()=>resetObservation(i,{runId:desc.runId,history:restored,description:desc,...change})).toThrow();
   expect(await dispatchResetOnce(db,i,rpc)).toEqual({dispatch:false,state:'observed',resetRunId:desc.runId});
   expect(calls).toBe(2);expect(rpcCalls).toBe(1);
  });
 }finally{await environment?.teardown();}
},30000);
