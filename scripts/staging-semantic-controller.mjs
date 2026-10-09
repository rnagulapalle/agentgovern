// Controller for the authenticated staging trial; uses normal application authority.
// Starting this file alone is not lifecycle acceptance: the host owns real Docker checkpoints.
import assert from "node:assert/strict";
import {readFile,writeFile,access} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {parseEnv} from "node:util";
import pg from "pg";
import {Connection,Client} from "@temporalio/client";
import {memberSession} from "../lib/workspace/identity.ts";
import {registerAgent} from "../lib/workspace/agents.ts";
import {authenticate} from "../lib/durable/service.ts";
import {FetchSandboxConnectors} from "../lib/connectors/twin.ts";
import {ScopeControl} from "../lib/connectors/scopes.ts";
import {ConnectorControl} from "../lib/connectors/service.ts";
import {WorkflowControl} from "../lib/workflows/service.ts";
import {EnquiryControl} from "../lib/enquiries/service.ts";
import {TemporalOutbox} from "../runtime/temporal/outbox.ts";
import {semanticArtifact,semanticPair,replaySemanticPair} from "./temporal-semantic-replay.mjs";
const dir="/run/trial",phaseDir=dir+"/semantic";
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let phase="inputs",db,connection,optedIn=false;
async function until(fn,label,seconds=180){
 for(const end=Date.now()+seconds*1000;Date.now()<end;){if(await fn())return;await wait(250);}throw Error(label);
}
async function checkpoint(name){await until(async()=>{try{await access(`${phaseDir}/${name}.json`);return true;}catch{return false;}},"Host checkpoint unavailable");}
const mark=(name,value)=>writeFile(`${phaseDir}/${name}.json`,JSON.stringify(value),{flag:"wx",mode:0o600});
async function main(){
 assert.equal(process.env.LOOPLABS_SEMANTIC_LIFECYCLE,"isolated");
 optedIn=true;
 const env=parseEnv(await readFile(`${dir}/worker.env`,"utf8"));
 const input=JSON.parse(await readFile(`${phaseDir}/input.json`,"utf8"));
 assert(/^ll-platform-[a-f0-9]{12}-semantic$/.test(input.taskQueue));
 const artifacts=semanticPair(await Promise.all([semanticArtifact("/run/baseline"),semanticArtifact("/run/incompatible")]));
 assert.deepEqual(input.builds,artifacts.map(a=>a.buildId));
 assert.equal(input.records.length,2);
 assert.notEqual(input.records[0].contactId,input.records[1].contactId);
 const {token}=JSON.parse(await readFile(`${phaseDir}/connector-twin-credentials.json`,"utf8"));
 db=new pg.Pool({connectionString:env.LOOPLABS_DATABASE_URL,max:4,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000});
 phase="named-authority";
 const reference=JSON.parse(await readFile(`${dir}/restore-reference.json`,"utf8"));
 async function member(cookie){
  assert(typeof cookie==="string");const matched=cookie.split("; ").filter(c=>c.startsWith("looplabs_workspace_session="));
  assert.equal(matched.length,1);return memberSession(db,matched[0].slice("looplabs_workspace_session=".length));
 }
 const owner=await member(reference.owner),reviewer=await member(reference.reviewer);
 assert(owner&&reviewer,"Current named member sessions required");
 assert.notEqual(owner.subject,reviewer.subject);assert.equal(owner.orgId,"local-proof");assert.equal(reviewer.orgId,owner.orgId);
 const workload=await authenticate(db,env.LOOPLABS_TEMPORAL_WORKER_TOKEN);
 assert.equal(workload.subject,"enquiry-temporal");assert.equal(workload.role,"worker");
 connection=await Connection.connect({address:env.LOOPLABS_TEMPORAL_ADDRESS,apiKey:env.LOOPLABS_TEMPORAL_API_KEY,tls:{serverRootCACertificate:await readFile(`${dir}/tls/ca.pem`),clientCertPair:{crt:await readFile(`${dir}/tls/client.pem`),key:await readFile(`${dir}/tls/client.key`)}}});
 const client=new Client({connection,namespace:env.LOOPLABS_TEMPORAL_NAMESPACE});
 const runs=[];
 async function promote(buildId){
  await until(async()=>{try{await connection.withDeadline(Date.now()+5000,()=>client.workflowService.setWorkerDeploymentCurrentVersion({namespace:env.LOOPLABS_TEMPORAL_NAMESPACE,deploymentName:"looplabs-acknowledgement",buildId,identity:"isolated-semantic-controller"}));return true;}catch{return false;}},"Worker deployment promotion unavailable");
 }
 phase="scoped-enrollment";
 for(let i=0;i<2;i++){
  const scope={version:"record-scope-1",workspaceId:owner.orgId,...input.records[i]};
  const provider=new FetchSandboxConnectors("http://connector-twin:8018",token,1500,scope);
  const control=new ConnectorControl(db,provider),workflow=new WorkflowControl(db,control),scopes=new ScopeControl(db,provider);
  const enrollment=randomUUID();await scopes.enroll(owner,enrollment);
  const agents=[`semantic-${i}-crm`,`semantic-${i}-email`];
  for(const [n,id] of agents.entries()){
   await registerAgent(db,owner,{id,name:id,owner:owner.subject,role:n===0?"crm_agent":"email_agent",connector:n===0?"crm_twin":"email_twin",actionLimit:1});
   await scopes.grant(owner,enrollment,id);
  }
  const enquiry=new EnquiryControl(db,workflow,async()=>{const c=await provider.contact();return {id:c.id,email:c.properties.email,version:c.updatedAt,lifecycle:c.properties.lifecyclestage};});
  const plan=(await enquiry.prepareChat(owner,randomUUID())).saved;
  await enquiry.start(owner,plan.id,plan.plan_hash,...agents,true);
  let run=await workflow.read(owner,plan.id);
  for(const step of run.steps)await control.propose(owner,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});
  run=await workflow.read(owner,plan.id);assert.equal(run.steps.length,2);assert(run.steps.every(s=>s.state==="held"));
  await assert.rejects(()=>control.review(owner,run.steps[0].action_id,run.steps[0].payload_hash,true),e=>e.status===403);
  await promote(artifacts[i].buildId);
  const outbox=new TemporalOutbox(db,artifacts[i].buildId),workflowId=await outbox.transfer(owner,plan.id);
  assert.equal(await outbox.transfer(owner,plan.id),workflowId);
  assert.equal(await outbox.tick(workload,client,input.taskQueue),1);
  const handle=client.workflow.getHandle(workflowId);
  runs.push({record:input.records[i],id:plan.id,buildId:artifacts[i].buildId,control,workflow,handle,steps:run.steps.map(s=>({actionId:s.action_id,payloadHash:s.payload_hash,agentId:s.agent_id})),enrollment,agents});
 }
 async function snapshot(r){
  const run=await r.workflow.read(owner,r.id);
  assert.deepEqual(run.steps.map(s=>({actionId:s.action_id,payloadHash:s.payload_hash,agentId:s.agent_id})),r.steps);
  const routes=(await db.query("SELECT scope_id,worker_build_id FROM ll_temporal_record_routes WHERE org_id=$1 AND plan_id=$2",[owner.orgId,r.id])).rows;
  assert.equal(routes.length,1);assert.equal(routes[0].scope_id,r.enrollment);assert.equal(routes[0].worker_build_id,r.buildId);
  return run;
 }
 const [old,next]=runs;
 phase="held-history";
 for(const r of runs)await until(async()=>{const h=await r.handle.fetchHistory();return h.events?.some(e=>e.eventType===12);},"Pinned held activity did not run");
 for(const r of runs){assert((await snapshot(r)).steps.every(s=>s.state==="held"));assert.equal((await r.handle.describe()).status.name,"RUNNING");}
 await mark("held",{runs:runs.map(r=>({id:r.id,buildId:r.buildId,steps:r.steps})),effects:0});
 await checkpoint("old-worker-stopped");
 phase="old-worker-absence";
 for(const s of old.steps)await old.control.review(reviewer,s.actionId,s.payloadHash,true);
 await old.handle.signal("wake");await wait(7000);
 assert((await snapshot(old)).steps.every(s=>s.state==="ready"&&s.approved_by===reviewer.subject));
 assert.equal((await old.handle.describe()).status.name,"RUNNING");
 phase="new-worker-completion";
 for(const s of next.steps)await next.control.review(reviewer,s.actionId,s.payloadHash,true);
 await next.handle.signal("wake");
 await until(async()=> (await snapshot(next)).state==="completed","New worker did not complete its independently approved route");
 assert.equal(await next.handle.result(),"completed");
 assert((await snapshot(old)).steps.every(s=>s.state==="ready"));
 await mark("old-waits-new-completes",{old:old.id,next:next.id});
 await checkpoint("old-worker-restored");
 phase="old-worker-recovery";
 await until(async()=> (await snapshot(old)).state==="completed","Retained old artifact did not recover its original route");
 assert.equal(await old.handle.result(),"completed");
 for(const r of runs)assert((await snapshot(r)).steps.every(s=>s.state==="succeeded"&&s.approved_by===reviewer.subject));
 phase="lost-response";
 assert((await db.query("SELECT 1 FROM ll_connector_events WHERE org_id=$1 AND action_id=$2 AND kind='uncertain'",[owner.orgId,old.steps[0].actionId])).rows.length>0);
 await mark("effects-ready",{actionIds:runs.flatMap(r=>r.steps.map(s=>s.actionId))});
 await checkpoint("provider-readback");
 const effects=JSON.parse(await readFile(`${phaseDir}/provider-readback.json`,"utf8")).effects;
 assert.equal(Object.keys(effects).length,4);
 for(const r of runs){
  for(const s of r.steps)assert.equal(effects[s.actionId]?.recordId,r.record.contactId);
  assert.deepEqual(effects[r.steps[1].actionId].body.to,[r.record.recipient]);
 }
 phase="semantic-replay";
 const replay=await replaySemanticPair(artifacts,await Promise.all(runs.map(r=>r.handle.fetchHistory())));
 // Replays cannot create application actions, reserve new budget or call providers.
 for(const r of runs){assert((await snapshot(r)).steps.every(s=>s.state==="succeeded"));
  const counters=(await db.query("SELECT id,reserved FROM ll_agents WHERE org_id=$1 AND id=ANY($2::text[]) ORDER BY id",[owner.orgId,r.agents])).rows;
  assert.equal(counters.length,2);assert(counters.every(a=>a.reserved===1));
 }
 await mark("post-replay-effects-ready",{});await checkpoint("post-replay-provider-readback");
 assert.deepEqual(JSON.parse(await readFile(`${phaseDir}/post-replay-provider-readback.json`,"utf8")).effects,effects,"Replay must not change provider effects");
 await mark("replay-completed",{passed:true,replay,actualEffects:4,scope:"Authenticated isolated scoped version lifecycle; host checkpoints and retirement still require independent verification",notVerified:["retirement admission fence","long-term retention","production cutover","enterprise acceptance"]});
}
main().catch(async()=>{if(optedIn)await writeFile(`${phaseDir}/failure.json`,JSON.stringify({phase}),{mode:0o600}).catch(()=>{});console.error("Staged semantic lifecycle controller failed; no raw authority, payload or SDK error printed.");process.exitCode=1;}).finally(async()=>{await connection?.close();await db?.end();});
