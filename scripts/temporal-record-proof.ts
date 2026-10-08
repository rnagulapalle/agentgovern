import type {WorkflowHandle} from "@temporalio/client";
// Actual packaged workers + Temporal + PostgreSQL + isolated HTTP provider twins.
import {TestWorkflowEnvironment} from "@temporalio/testing";
import {Worker} from "@temporalio/worker";
import {Pool} from "pg";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {readFile,writeFile,mkdtemp,rm} from "node:fs/promises";
import {spawn,type ChildProcess} from "node:child_process";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {authenticate,tokenHash} from "../lib/durable/service";
import {FetchSandboxConnectors} from "../lib/connectors/twin";
import {ConnectorControl} from "../lib/connectors/service";
import {ScopeControl} from "../lib/connectors/scopes";
import {WorkflowControl} from "../lib/workflows/service";
import {EnquiryControl} from "../lib/enquiries/service";
import {TemporalOutbox} from "../runtime/temporal/outbox";
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(test:()=>Promise<boolean>,label:string,timeout=90000){const start=Date.now();while(!(await test())){if(Date.now()-start>timeout)throw Error(`Timed out: ${label}`);await wait(100);}}
async function main(){
 const load=process.env.LOOPLABS_RECORD_LOAD_PROOF==="1";if(process.env.LOOPLABS_RECORD_LOAD_PROOF && !load)throw Error("Unsupported load-proof mode");
 const count=load?40:10,completedCount=count-1,effectCount=completedCount*2;
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error("Dedicated test PostgreSQL required.");
 const dir=await mkdtemp(resolve(".local/record-worker-proof-")),schema=`record_worker_${randomBytes(8).toString("hex")}`;
 const admin=new Pool({connectionString:url}),db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 let env:TestWorkflowEnvironment|undefined,twin:ChildProcess|undefined;const children:ChildProcess[]=[],checks:string[]=[];
 const pass=(s:string)=>{checks.push(s);console.log("PASS",s);},token=randomBytes(32).toString("base64url"),workerKey=randomBytes(32).toString("base64url");
 const records=Array.from({length:count},(_,i)=>({version:"record-scope-1" as const,workspaceId:"local-proof",contactId:String(3001+i),recipient:`person${i+1}@example.test`}));
 const latencies:{ordinal:number;approvalToObservedCompletionMs:number}[]=[];let observationWindowMs=0;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const f of ["lib/durable/schema.sql","lib/workspace/schema.sql","lib/refunds/schema.sql","lib/connectors/schema.sql","lib/workflows/schema.sql","lib/durable/proposal-schema.sql","lib/enquiries/schema.sql","lib/enquiries/managed-schema.sql","lib/enquiries/temporal-schema.sql","lib/connectors/scope-schema.sql","lib/enquiries/record-routing-schema.sql"])await db.query(await readFile(f,"utf8"));
  await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");await db.query("INSERT INTO ll_members(org_id,email,name,password_hash) VALUES('local-proof','owner','Owner','unused'),('local-proof','reviewer','Reviewer','unused')");
  await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
  const actors=[];
  for(const [subject,role,key] of [["owner","operator",randomBytes(32).toString("base64url")],["reviewer","operator",randomBytes(32).toString("base64url")],["enquiry-temporal","worker",workerKey]]){
   await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,$3)",[tokenHash(key),subject,role]);actors.push(await authenticate(db,key));
  }
  const [owner,reviewer]=actors;
  await writeFile(`${dir}/connector-twin-credentials.json`,JSON.stringify({token}),{mode:0o600});await writeFile(`${dir}/connector-twin-records.json`,JSON.stringify({records}),{mode:0o600});
  await writeFile(`${dir}/connector-twin-faults.json`,JSON.stringify({loseResponseRecords:load?["3009","3019","3029","3039"]:["3009"]}),{mode:0o600});
  const backend=process.env.FETCHSANDBOX_BACKEND_PATH||`${process.env.HOME}/sandbox/backend`;
  twin=spawn(`${backend}/.venv/bin/python`,["scripts/connector-twin.py"],{env:{...process.env,LOOPLABS_CONNECTOR_STATE_DIR:dir},stdio:"ignore"});
  const base=new FetchSandboxConnectors("http://127.0.0.1:8018",token);
  await until(async()=>{try{await base.contact();return true;}catch{if(twin!.exitCode!==null)throw Error("Private twin exited; port 8018 must be free");return false;}},"private twin startup",10000);
  const build=JSON.parse(await readFile(".worker/temporal-manifest.json","utf8")),outbox=new TemporalOutbox(db,build.buildId);
  const runs:{record:(typeof records)[number];scopeId:string;scopes:ScopeControl;control:ConnectorControl;flow:WorkflowControl;plan:Awaited<ReturnType<EnquiryControl["prepareChat"]>>["saved"];steps:Awaited<ReturnType<WorkflowControl["read"]>>["steps"];workflowId:string}[]=[];
  for(const record of records){
   const provider=new FetchSandboxConnectors("http://127.0.0.1:8018",token,1500,record),control=new ConnectorControl(db,provider),flow=new WorkflowControl(db,control),scopes=new ScopeControl(db,provider),scopeId=randomUUID();
   const crm=`crm-${record.contactId}`,email=`email-${record.contactId}`;
   for(const [id,tool,role,connector] of [[crm,"twin.crm","crm_agent","crm_twin"],[email,"twin.email","email_agent","email_twin"]]){
    await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('local-proof',$1,ARRAY[$2],1)",[id,tool]);
    await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES('local-proof',$1,$1,'owner',$2,$3)",[id,role,connector]);
    await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,'agent')",[tokenHash(randomBytes(32).toString("base64url")),id]);
   }
   await scopes.enroll(owner,scopeId);await scopes.grant(owner,scopeId,crm);await scopes.grant(owner,scopeId,email);
   const enquiries=new EnquiryControl(db,flow,async()=>{const c=await provider.contact();return {id:c.id,email:c.properties.email,version:c.updatedAt,lifecycle:c.properties.lifecyclestage};});
   const plan=(await enquiries.prepareChat(owner,randomUUID())).saved;await enquiries.start(owner,plan.id,plan.plan_hash,crm,email,true);
   let steps=(await flow.read(owner,plan.id)).steps;
   for(const step of steps)await control.propose(owner,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});
   steps=(await flow.read(owner,plan.id)).steps;
   const ids=await Promise.all([outbox.transfer(owner,plan.id),outbox.transfer(owner,plan.id)]);assert.equal(ids[0],ids[1]);
   runs.push({record,scopeId,scopes,control,flow,plan,steps,workflowId:ids[0]});
  }
  const effects=async()=>JSON.parse(await readFile(`${dir}/connector-twin-state.json`,"utf8")).effects;
  assert.equal(Object.keys(await effects()).length,0);assert.equal((await db.query("SELECT count(*)::int n FROM ll_temporal_record_routes")).rows[0].n,count);
  pass(load?"Forty independently enrolled customer plans and eighty paired concurrent transfers save forty immutable routes without effects":"Ten independently enrolled customer plans and twenty concurrent transfer requests save ten immutable routes without effects");
  env=await TestWorkflowEnvironment.createLocal({server:{dbFilename:`${dir}/temporal.sqlite`}});
  const taskQueue=`records-${randomUUID()}`,databaseUrl=new URL(url);databaseUrl.searchParams.set("options",`-c search_path=${schema}`);
  const service=(role:"worker"|"scheduler")=>{
   const child=spawn(process.execPath,[".worker/temporal-service.cjs",role],{env:{...process.env,LOOPLABS_DATABASE_URL:databaseUrl.toString(),LOOPLABS_TEMPORAL_WORKER_TOKEN:workerKey,LOOPLABS_TEMPORAL_ADDRESS:env!.address,LOOPLABS_TEMPORAL_NAMESPACE:"default",LOOPLABS_TEMPORAL_TASK_QUEUE:taskQueue,LOOPLABS_TEMPORAL_BUILD_ID:build.buildId,LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK:"true",LOOPLABS_TEMPORAL_API_KEY:"",LOOPLABS_TEMPORAL_CERT_PATH:"",LOOPLABS_TEMPORAL_KEY_PATH:"",LOOPLABS_TEMPORAL_CA_PATH:"",LOOPLABS_TEMPORAL_POLL_MS:"250",LOOPLABS_TEMPORAL_HEALTH_PORT:role==="worker"?"19330":"19331",LOOPLABS_CONNECTOR_TWIN_URL:"http://127.0.0.1:8018",LOOPLABS_CONNECTOR_TWIN_TOKEN:token,LOOPLABS_FETCHSANDBOX_BINDING:""},stdio:["ignore","ignore","ignore"]});children.push(child);return child;
  };
  const ready=async(port:number)=>{try{return (await fetch(`http://127.0.0.1:${port}/health/ready`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}};
  let worker=service("worker");service("scheduler");await until(async()=>await ready(19330)&&await ready(19331),"packaged role readiness");
  await until(async()=> (await db.query("SELECT count(*)::int n FROM ll_temporal_dispatch WHERE state='started'")).rows[0].n===count,"all Temporal starts");
  await wait(1200);assert.equal(Object.keys(await effects()).length,0);
  pass(load?"Actual packaged worker and scheduler start forty explicitly pinned record histories; held approvals remain effect-free":"Actual packaged worker and scheduler start ten explicitly pinned record histories; held approvals remain effect-free");
  worker.kill("SIGKILL");await until(async()=>worker.signalCode==="SIGKILL","confirmed worker crash",10000);
  const last=runs[count-1];await last.scopes.setActive(owner,last.scopeId,false);
  if(!load)for(const run of runs.slice(0,completedCount))for(const step of run.steps)await run.control.review(reviewer,step.action_id,step.payload_hash,true);
  worker=service("worker");await until(()=>ready(19330),"replacement worker readiness");
  if(load){
   const windowStarted=performance.now();
   for(let wave=0;wave<4;wave++){
    const batch=runs.slice(wave*10,Math.min((wave+1)*10,completedCount)),started=new Map<string,number>(),seen=new Set<string>();
    for(const run of batch){started.set(run.plan.id,performance.now());for(const step of run.steps)await Promise.all([run.control.review(reviewer,step.action_id,step.payload_hash,true),run.control.review(reviewer,step.action_id,step.payload_hash,true)]);}
    await until(async()=>{const states=(await db.query("SELECT id,state FROM ll_workflow_runs WHERE id=ANY($1::uuid[])",[batch.map(r=>r.plan.id)])).rows;for(const state of states)if(state.state==="completed"&&!seen.has(state.id)){seen.add(state.id);latencies.push({ordinal:runs.findIndex(r=>r.plan.id===state.id)+1,approvalToObservedCompletionMs:Math.round(performance.now()-started.get(state.id)!)});}return seen.size===batch.length;},`approved wave ${wave+1}`);
    const held=(await db.query("SELECT count(*)::int n FROM ll_connector_actions WHERE state='held'")).rows[0].n;assert.equal(held,Math.max(0,completedCount-(wave+1)*10)*2+2);
    console.log(`MEASURE wave ${wave+1}: ${batch.length} completed; later approvals remain held`);
    if(wave<3)await wait(20000);
   }
   observationWindowMs=Math.round(performance.now()-windowStarted);assert(observationWindowMs>=60000);assert.equal(latencies.length,completedCount);
  }
  await until(async()=> (await db.query("SELECT count(*)::int n FROM ll_workflow_runs WHERE state='completed'")).rows[0].n===completedCount,"independent completed runs");
  const observed=await effects();assert.equal(Object.keys(observed).length,effectCount);
  for(const run of runs.slice(0,completedCount)){
   assert.equal(observed[run.steps[0].action_id].recordId,run.record.contactId);assert.equal(observed[run.steps[1].action_id].recordId,run.record.contactId);assert.deepEqual(observed[run.steps[1].action_id].body.to,[run.record.recipient]);
   assert.equal((await run.flow.read(owner,run.plan.id)).state,"completed");
   const handle:WorkflowHandle=env.client.workflow.getHandle(run.workflowId);assert.equal(await handle.result(),"completed");
   const history=await handle.fetchHistory();await Worker.runReplayHistory({workflowsPath:resolve("runtime/temporal/pinned-workflow.ts")},history);assert(!JSON.stringify(history).includes(token));
  }
  pass(load?"Four paced approval waves after confirmed SIGKILL complete thirty-nine routes and seventy-eight exact effects; later approvals stay held and duplicate approvals do not duplicate effects":"SIGKILL and replacement preserve nine approved customer routes; each CRM and email effect belongs only to its enrolled record and recipient");
  const lost=(await db.query("SELECT 1 FROM ll_connector_events WHERE action_id=$1 AND kind='uncertain'",[runs[8].steps[0].action_id])).rows[0];assert(lost);
  if(load)for(const i of [18,28,38])assert((await db.query("SELECT 1 FROM ll_connector_events WHERE action_id=$1 AND kind='uncertain'",[runs[i].steps[0].action_id])).rows[0]);
  pass(load?"Four real lost CRM HTTP responses are read back by the packaged scoped worker without resend or wrong-recipient messaging":"Real lost CRM HTTP response is read back by the packaged scoped worker; exactly one CRM and one intended email effect are retained");
  await wait(1000);assert.equal(Object.keys(await effects()).length,effectCount);assert(!observed[last.steps[0].action_id]);assert(!observed[last.steps[1].action_id]);
  await assert.rejects(()=>env!.client.workflow.getHandle(last.workflowId).result());
  pass(load?"Revoked fortieth enrollment cannot execute after restart; approved customers continue without fallback":"Revoked tenth enrollment cannot execute after restart; other customers continue and denied authority never falls back to the sample record");
  pass(load?"All thirty-nine completed pinned histories replay without new effects or provider secrets in history":"All nine completed pinned histories replay without new effects or provider secrets in history");
  const files=["lib/connectors/scopes.ts","lib/connectors/scope-schema.sql","lib/connectors/request.ts","lib/connectors/twin.ts","lib/connectors/hosted.ts","lib/connectors/service.ts","lib/enquiries/service.ts","lib/enquiries/runner.ts","lib/enquiries/record-routing-schema.sql","runtime/temporal/record-routing.ts","runtime/temporal/version-contract.ts","runtime/temporal/outbox.ts","runtime/temporal/activities.ts","runtime/temporal/pinned-workflow.ts","scripts/temporal-service.ts","scripts/build-temporal-worker.mjs","scripts/connector-twin.py","scripts/temporal-record-proof.ts"];
  const sourceFingerprints=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash("sha256").update(await readFile(f)).digest("hex")])));
  const sample=load?{observationWindowMs,approvalToObservedCompletionMs:latencies,sampleLimits:"Single local workspace and paced four-wave sample; not steady-state throughput, percentile SLO, multi-tenant capacity or remote availability"}:{};
  await writeFile(load?"docs/evidence/temporal-approved-load-proof.json":"docs/evidence/temporal-record-proof.json",JSON.stringify({at:new Date().toISOString(),checks,sourceFingerprints,measurements:{records:count,transferCalls:count*2,completed:completedCount,contained:1,effects:effectCount},...sample,buildId:build.buildId,scope:"Local packaged processes and private HTTP twins; no production cutover, sustained load SLA or live provider guarantee"},null,2)+"\n");
 }finally{
  for(const child of children)if(child.exitCode===null&&!child.signalCode){child.kill("SIGTERM");await until(async()=>child.exitCode!==null||Boolean(child.signalCode),"packaged process shutdown",25000);}
  await env?.teardown();if(twin&&twin.exitCode===null){twin.kill("SIGTERM");await until(async()=>twin!.exitCode!==null||Boolean(twin!.signalCode),"private twin shutdown",10000);}
  await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
