// Actual private API/session/Temporal trial. Not a browser or fresh chat proof.
import assert from "node:assert/strict";
import {readFile,writeFile,access} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {parseEnv} from "node:util";
import pg from "pg";
import {Client,Connection} from "@temporalio/client";
import {Worker} from "@temporalio/worker";
const dir="/run/trial",origin=process.env.LOOPLABS_TRIAL_ORIGIN||"https://looplabs-staging.example.test",base="http://web:3000";
assert(["https://looplabs-staging.example.test","https://looplabs-staging.example.test:3443"].includes(origin));
let phase="inputs",httpStatus=null,errorKind="unknown";
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,seconds=120){for(const end=Date.now()+seconds*1000;Date.now()<end;){if(await fn())return;await wait(250);}throw Error(label);}
async function main(){
 const accounts=JSON.parse(await readFile(`${dir}/accounts.json`,"utf8")).accounts;
 assert.equal(accounts.length,2);assert.notEqual(accounts[0].email,accounts[1].email);
 const env=parseEnv(await readFile(`${dir}/worker.env`,"utf8"));
 const db=new pg.Pool({connectionString:env.LOOPLABS_DATABASE_URL});let connection;
 async function request(cookie,path,data,expected=200){const response=await fetch(base+path,{headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(data?{"Content-Type":"application/json"}:{})},...(data?{method:"POST",body:JSON.stringify(data)}:{})});httpStatus=response.status;if(response.status!==expected){const failure=await response.clone().json().catch(()=>({}));errorKind=failure.error==="Supported customer records are unavailable."?"catalog":failure.error==="Connector evidence unavailable. No safe retry inferred."?"provider":failure.error==="Sample CRM and messaging connector is not configured."?"binding":failure.error==="Trusted contact version is unavailable."?"source":failure.error==="The durable service could not complete this request. State was not assumed successful; refresh and inspect the action."?"service":"unknown";}assert.equal(response.status,expected,`HTTP contract ${path.split("?")[0]}`);return response;}
 const json=async(cookie,path,data,expected)=> (await request(cookie,path,data,expected)).json();
 async function login(account){const response=await request("","/api/workspace/session",{email:account.email,password:account.password});const cookies=response.headers.getSetCookie();assert(cookies.some(c=>c.includes("HttpOnly")&&c.includes("Secure")&&c.includes("SameSite=strict")));return cookies.map(c=>c.split(";")[0]).join("; ");}
 try{
  phase="sessions";const owner=await login(accounts[0]),reviewer=await login(accounts[1]);assert.notEqual(owner,reviewer);
  phase="unauthenticated-refusal";await request("","/api/workspace/records",undefined,401);
  phase="record-catalog";const candidates=(await json(owner,"/api/workspace/records")).candidates;assert.equal(candidates.length,1);
  phase="record-enrollment";const scope=randomUUID();await json(owner,"/api/workspace/records",{operation:"enroll",id:scope,recordKey:candidates[0].key});
  phase="agent-grants";for(const [id,role,connector] of [["trial-crm","crm_agent","crm_twin"],["trial-email","email_agent","email_twin"]]){
   await json(owner,"/api/workspace/agents",{id,name:id,owner:accounts[0].email,role,connector,actionLimit:4});
   await json(owner,"/api/workspace/records",{operation:"grant",scopeId:scope,agentId:id});
  }
  phase="saved-plan";const path=`/api/workspace/enquiries?scope=${scope}`,id=randomUUID();
  const plan=(await json(owner,path,{operation:"prepare",id,fixtureId:"service"})).saved;assert.equal(plan.id,id);
  const submit={operation:"submit",id,planHash:plan.plan_hash,crmAgent:"trial-crm",emailAgent:"trial-email"};
  phase="submission";assert.equal((await json(owner,path,submit)).runId,id);phase="submission";assert.equal((await json(owner,path,submit)).runId,id);
  phase="held-run";const read=()=>json(owner,`/api/durable/workflows?run=${id}`);let run=await read();assert.equal(run.steps.length,2);
  phase="self-approval-refusal";await json(owner,"/api/durable/connectors",{operation:"approve",actionId:run.steps[0].action_id,payloadHash:run.steps[0].payload_hash},403);
  phase="pre-approval-containment";await wait(2000);assert.equal((await db.query("SELECT count(*)::int n FROM ll_connector_actions WHERE state IN ('succeeded','uncertain')")).rows[0].n,0);
  await writeFile(`${dir}/restore-reference.json`,JSON.stringify({owner,reviewer,id,steps:run.steps.map(s=>({action_id:s.action_id,payload_hash:s.payload_hash})),reservations:(await db.query("SELECT id,reserved FROM ll_agents WHERE org_id='local-proof' ORDER BY id")).rows,tokenCount:(await db.query("SELECT count(*)::int n FROM ll_tokens WHERE org_id='local-proof'")).rows[0].n}),{mode:0o600});
  phase="restart-checkpoint";await writeFile(`${dir}/held.json`,JSON.stringify({held:true}),{mode:0o600});
  await until(async()=>{try{await access(`${dir}/continue.json`);return true;}catch{return false;}},"Restart controller did not release trial",180);
  // Cookies and saved work must survive the actual web/worker/twin restart.
  phase="session-recovery";await json(owner,"/api/workspace/session");run=await read();assert.equal(run.id,id);
  phase="independent-approval";for(const step of run.steps)await json(reviewer,"/api/durable/connectors",{operation:"approve",actionId:step.action_id,payloadHash:step.payload_hash});
  phase="restore-approval-checkpoint";await writeFile(`${dir}/approved.json`,"",{mode:0o600});
  await until(async()=>{try{await access(`${dir}/execute.json`);return true;}catch{return false;}},"Approved archive checkpoint was not released",180);
  phase="completion";await until(async()=>{run=await read();return run.state==="completed";},"Scoped workflow did not complete",180);
  assert(run.steps.every(s=>s.approved_by===accounts[1].email&&s.state==="succeeded"));
  phase="temporal-dispatch";const rows=(await db.query("SELECT workflow_id FROM ll_temporal_dispatch WHERE org_id='local-proof' AND plan_id=$1",[id])).rows;assert.equal(rows.length,1);
  phase="temporal-history";connection=await Connection.connect({address:env.LOOPLABS_TEMPORAL_ADDRESS,apiKey:env.LOOPLABS_TEMPORAL_API_KEY,tls:{serverRootCACertificate:await readFile(`${dir}/tls/ca.pem`),clientCertPair:{crt:await readFile(`${dir}/tls/client.pem`),key:await readFile(`${dir}/tls/client.key`)}}});
  const client=new Client({connection,namespace:env.LOOPLABS_TEMPORAL_NAMESPACE}),handle=client.workflow.getHandle(rows[0].workflow_id);
  assert.equal(await handle.result(),"completed");const history=await handle.fetchHistory();
  phase="lost-response-proof";const before=(await db.query("SELECT count(*)::int n FROM ll_connector_actions WHERE state='succeeded'")).rows[0].n;assert.equal(before,2);
  assert((await db.query("SELECT 1 FROM ll_connector_events WHERE action_id=$1 AND kind='uncertain'",[run.steps[0].action_id])).rows.length>0);
  phase="history-replay";await Worker.runReplayHistory({workflowBundle:{codePath:"/app/.worker/temporal-workflow.cjs"}},history);
  assert.equal((await db.query("SELECT count(*)::int n FROM ll_connector_actions WHERE state='succeeded'")).rows[0].n,before);
  phase="provider-readback";await writeFile(`${dir}/effects-ready.json`,"",{mode:0o600});
  await until(async()=>{try{await access(`${dir}/provider-state.json`);return true;}catch{return false;}},"Independent provider readback unavailable");
  const effects=JSON.parse(await readFile(`${dir}/provider-state.json`,"utf8")).effects;
  assert.equal(Object.keys(effects).length,2);for(const step of run.steps)assert(effects[step.action_id]);
  await writeFile(`${dir}/browser-run.json`,JSON.stringify({id,scope}),{mode:0o600});
  console.log(JSON.stringify({passed:true,scope:"assembled isolated API/runtime trial only",checks:["separate secure named sessions","unauthenticated and self-approval refusal","API enrollment and per-agent record grants","saved plan and duplicate-safe submission","held work and sessions survive runtime SIGKILL","named approval and two verified private effects","lost-response reconciliation without a duplicated effect","real authenticated Temporal history replay without new actions"],notVerified:["browser HTTPS and typed chat UX","remote persistent staging","sustained load, restore and operator alert acceptance","live provider guarantees"]}));
 }finally{await connection?.close();await db.end();}
}
main().catch(async()=>{await writeFile(`${dir}/failure.json`,JSON.stringify({phase,httpStatus,errorKind}),{mode:0o600}).catch(()=>{});console.error("Assembled API/runtime trial failed; no credential, payload or raw SDK error printed.");process.exitCode=1;});
