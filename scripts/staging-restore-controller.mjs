// Actual private HTTP/database restore checks; never emits credentials or payloads.
import {readFile,writeFile} from "node:fs/promises";
import {parseEnv} from "node:util";
import assert from "node:assert/strict";
import pg from "pg";
import {createHash} from "node:crypto";
const phase=process.argv[2];assert(["before","after"].includes(phase));
const dir="/run/trial",origin=process.env.LOOPLABS_TRIAL_ORIGIN||"https://looplabs-staging.example.test";
assert(["https://looplabs-staging.example.test","https://looplabs-staging.example.test:3443"].includes(origin));
let checkpoint="inputs";
async function main(){
 const env=parseEnv(await readFile(`${dir}/worker.env`,"utf8")),reference=JSON.parse(await readFile(`${dir}/restore-reference.json`,"utf8")),accounts=JSON.parse(await readFile(`${dir}/accounts.json`,"utf8")).accounts;
 assert(reference.steps.length===2&&accounts.length===2);
 const db=new pg.Pool({connectionString:env.LOOPLABS_DATABASE_URL});
 const request=async(cookie,path,data,expected)=>{const response=await fetch("http://web:3000"+path,{headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(data?{"Content-Type":"application/json"}:{})},...(data?{method:"POST",body:JSON.stringify(data)}:{})});assert.equal(response.status,expected);await response.arrayBuffer();};
 const rows=()=>db.query("SELECT id,payload_hash,state,approved_by,approval_until,lease_token FROM ll_connector_actions WHERE org_id='local-proof' ORDER BY id");
 try{
  checkpoint="action-snapshot";const actions=(await rows()).rows;assert.equal(actions.length,2);
  for(const step of reference.steps){const action=actions.find(a=>a.id===step.action_id);assert(action);assert.equal(action.payload_hash,step.payload_hash);}
  checkpoint="reservations";assert.deepEqual((await db.query("SELECT id,reserved FROM ll_agents WHERE org_id='local-proof' ORDER BY id")).rows,reference.reservations);
  checkpoint="token-count";assert.equal((await db.query("SELECT count(*)::int n FROM ll_tokens WHERE org_id='local-proof'")).rows[0].n,reference.tokenCount);
  checkpoint="fence";const epoch=(await db.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='local-proof'")).rows[0].epoch;
  const snapshot=JSON.stringify(actions);
  if(phase==="before"){
   assert.notEqual(epoch,env.LOOPLABS_RECOVERY_EPOCH);
   checkpoint="workload-identity";const workload=(await db.query("SELECT active,subject,role FROM ll_tokens WHERE org_id='local-proof' AND hash=$1",[createHash("sha256").update(env.LOOPLABS_TEMPORAL_WORKER_TOKEN).digest("hex")])).rows[0];
   assert.deepEqual(workload,{active:true,subject:"enquiry-temporal",role:"worker"});
   checkpoint="approved-snapshot";assert(actions.every(a=>a.state==="ready"&&a.approved_by===accounts[1].email&&a.approval_until));
   checkpoint="restored-sessions";assert((await db.query("SELECT count(*)::int n FROM ll_sessions")).rows[0].n>=2);
   checkpoint="old-session-http";for(const cookie of [reference.owner,reference.reviewer])await request(cookie,"/api/workspace/session",undefined,503);
   checkpoint="approval-http";await request(reference.reviewer,"/api/durable/connectors",{operation:"approve",actionId:reference.steps[0].action_id,payloadHash:reference.steps[0].payload_hash},503);
   checkpoint="execution-http";await request(reference.owner,"/api/durable/connectors",{operation:"execute",actionId:reference.steps[0].action_id},503);
  }else{
   checkpoint="quarantine-state";assert.equal(epoch,env.LOOPLABS_RECOVERY_EPOCH);
   assert(actions.every(a=>a.state==="uncertain"&&a.approved_by===null&&a.approval_until===null&&a.lease_token===null));
   assert.equal((await db.query("SELECT count(*)::int n FROM ll_workspace_recovery_events")).rows[0].n,1);
   checkpoint="revoked-identities";assert.equal((await db.query("SELECT count(*)::int n FROM ll_tokens WHERE active")).rows[0].n,0);
   assert.equal((await db.query("SELECT count(*)::int n FROM ll_members WHERE active")).rows[0].n,0);
   assert.equal((await db.query("SELECT count(*)::int n FROM ll_sessions")).rows[0].n,0);
   assert.equal((await db.query("SELECT count(*)::int n FROM ll_connector_scopes WHERE active")).rows[0].n,0);
   assert.equal((await db.query("SELECT count(*)::int n FROM ll_connector_scope_grants WHERE active")).rows[0].n,0);
   for(const cookie of [reference.owner,reference.reviewer])await request(cookie,"/api/workspace/session",undefined,401);
   checkpoint="old-password-http";await request("","/api/workspace/session",{email:accounts[0].email,password:accounts[0].password},401);
  }
  checkpoint="unchanged-actions";assert.equal(JSON.stringify((await rows()).rows),snapshot);
  console.log(JSON.stringify({passed:true,phase,scope:"actual restored approved actions and HTTP authority containment only"}));
 }finally{await db.end();}
}
main().catch(async()=>{await writeFile(`${dir}/restore-failure.json`,JSON.stringify({phase:checkpoint}),{mode:0o600}).catch(()=>{});console.error("Restored runtime authority check refused; no session, payload or raw database error printed.");process.exitCode=1;});
