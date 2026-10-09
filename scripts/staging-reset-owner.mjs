// Disposable separate owner process. A lost response is never retried as a reset RPC.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {Connection,Client} from '@temporalio/client';
import {resetIntent,dispatchResetOnce,reconcileResetIntent} from './reset-intent-store.mjs';
const directory='/run/trial/semantic';let db,connection;
class DiscardedResponse extends Error {}
async function main(){
 assert.equal(process.env.LOOPLABS_STAGING_RESET_PROOF,'isolated');
 assert(!process.env.LOOPLABS_DATABASE_URL&&!process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN&&!Object.keys(process.env).some(k=>k.startsWith('AWS_')));
 const mode=process.argv[2];assert(['dispatch','reconcile'].includes(mode)&&process.argv.length===3);
 const input=resetIntent(JSON.parse(await readFile(`${directory}/reset-request.json`,'utf8')));
 const url=new URL(process.env.LOOPLABS_MIGRATION_DATABASE_URL);
 assert(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='application-db'&&url.username==='ll_stage_owner'&&url.password&&url.pathname==='/looplabs_staging'&&!url.search&&!url.hash);
 assert.equal(process.env.LOOPLABS_TEMPORAL_NAMESPACE,input.namespace);
 assert.equal(process.env.LOOPLABS_RECOVERY_EPOCH,input.recovery_epoch);
 db=new Pool({connectionString:url.toString(),max:2,query_timeout:10000});
 connection=await Connection.connect({address:process.env.LOOPLABS_TEMPORAL_ADDRESS,apiKey:process.env.LOOPLABS_TEMPORAL_API_KEY,tls:{serverRootCACertificate:await readFile('/run/trial/tls/ca.pem'),clientCertPair:{crt:await readFile('/run/trial/tls/client.pem'),key:await readFile('/run/trial/tls/client.key')}}});
 const client=new Client({connection,namespace:input.namespace});
 const mark=(name,value)=>writeFile(`${directory}/${name}.json`,JSON.stringify(value),{flag:'wx',mode:0o600});
 if(mode==='dispatch'){
  let rpcCalls=0,lost=false;
  try{await dispatchResetOnce(db,input,async request=>{
   rpcCalls++;const response=await connection.withDeadline(Date.now()+15000,()=>client.workflowService.resetWorkflowExecution(request));
   assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(response.runId)&&response.runId!==input.original_run_id);
   throw new DiscardedResponse();
  });}catch(error){if(!(error instanceof DiscardedResponse))throw error;lost=true;}
  assert(lost&&rpcCalls===1,'Fresh intent must actually send one reset then discard its response');
  const row=(await db.query('SELECT state,reset_run_id FROM ll_temporal_reset_intents WHERE org_id=$1 AND operation_id=$2',[input.org_id,input.operation_id])).rows;
  assert(row.length===1&&row[0].state==='uncertain'&&row[0].reset_run_id===null);
  await mark('reset-response-discarded',{passed:true,rpcCalls:1,committedUncertainty:true});
 }else{
  // This is a new OS process, with a new owner pool and Temporal connection.
  const retried=await dispatchResetOnce(db,input,async()=>{throw Error('Unexpected second reset RPC');});
  assert.deepEqual(retried,{dispatch:false,state:'uncertain',resetRunId:null});
  let completed=false;
  for(const end=Date.now()+180000;Date.now()<end;){const current=await client.workflow.getHandle(input.workflow_id).describe();if(current.status.name==='COMPLETED'){assert.notEqual(current.runId,input.original_run_id);completed=true;break;}await new Promise(r=>setTimeout(r,250));}
  assert(completed,'Reset execution must complete before independent lineage readback');
  const observed=await reconcileResetIntent(db,input,client);
  assert.equal(observed.state,'observed');assert.notEqual(observed.resetRunId,input.original_run_id);
  const repeat=await dispatchResetOnce(db,input,async()=>{throw Error('Observed intent cannot send reset');});
  assert.equal(repeat.dispatch,false);assert.equal(repeat.resetRunId,observed.resetRunId);
  await mark('reset-owner-readback',{passed:true,newProcessRetryRefused:true,independentLineageObserved:true,resetRunId:observed.resetRunId,workerBuildId:input.worker_build_id});
 }
}
main().catch(()=>{console.error('Isolated reset owner refused; no raw database, history or credentials printed.');process.exitCode=1;}).finally(async()=>{await connection?.close();await db?.end();});
