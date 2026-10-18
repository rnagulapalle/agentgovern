// Read-only authority snapshot for the owned two-action staging trial.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sha=/^[a-f0-9]{64}$/;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export function pendingSnapshot(value,reference,buildId){
 assert(reference&&typeof reference.id==="string"&&uuid.test(reference.id));
 assert(typeof buildId==="string"&&/^ack-[a-f0-9]{64}$/.test(buildId));
 assert(Array.isArray(reference.steps)&&reference.steps.length===2);
 assert(new Set(reference.steps.map(s=>s.action_id)).size===2);
 for(const step of reference.steps)assert(typeof step.action_id==="string"&&uuid.test(step.action_id)&&typeof step.payload_hash==="string"&&sha.test(step.payload_hash));
 assert(value&&typeof value==="object"&&!Array.isArray(value));
 assert.deepEqual(Object.keys(value).sort(),["actions","agents","dispatch","grants","members","plans","policies","routes","runs","scopes","steps"].sort());
 for(const rows of Object.values(value))assert(Array.isArray(rows));
 for(const [key,rows] of Object.entries(value))if(key!=="members")assert(rows.every(r=>r.org_id==="local-proof"),"Foreign pending authority refused");
 for(const key of ["plans","runs","dispatch","routes","scopes"])assert.equal(value[key].length,1,"Exactly one pending scoped run required");
 const [plan]=value.plans,[run]=value.runs,[dispatch]=value.dispatch,[route]=value.routes,[scope]=value.scopes;
 assert(plan.id===reference.id&&plan.run_id===reference.id&&run.id===reference.id&&run.state==="active","Saved pending run changed");
 assert(typeof plan.plan_hash==="string"&&sha.test(plan.plan_hash));
 assert(dispatch.plan_id===plan.id&&dispatch.plan_hash===plan.plan_hash&&dispatch.plan_version==="acknowledgement-1"&&dispatch.connector_version==="private-record-twin-2"&&dispatch.state==="started","Pinned Temporal ownership must be established before package transition");
 assert(typeof dispatch.workflow_id==="string"&&dispatch.workflow_id.length>0);
 assert(route.plan_id===plan.id&&route.worker_build_id===buildId&&route.scope_id===scope.id&&route.scope_version===scope.version&&route.binding_id===scope.binding_id&&scope.active===true,"Pinned route or record authority changed");
 assert(value.steps.length===2&&value.actions.length===2&&value.grants.length===2&&value.agents.length===2&&value.policies.length===2,"Complete pending connector authority required");
 assert.deepEqual(value.steps.map(s=>s.ordinal),[1,2]);
 for(let i=0;i<2;i++){
  const step=value.steps[i],saved=reference.steps[i],action=value.actions.find(a=>a.id===step.action_id),agent=value.agents.find(a=>a.id===step.agent_id),grant=value.grants.find(g=>g.agent_id===step.agent_id),policy=value.policies.find(p=>p.connector===step.connector);
  assert(step.run_id===run.id&&step.action_id===saved.action_id&&action?.payload_hash===saved.payload_hash,"Pending action identity or hash changed");
  assert(step.connector===["crm","email"][i]&&action.connector===step.connector&&action.agent_id===step.agent_id,"Connector action identity mismatch");
  assert(action.state==="held"&&action.approved_by===null&&action.approval_until===null&&action.lease_token===null&&action.lease_until===null&&action.evidence===null,"Unapproved work advanced or acquired authority");
  assert(agent?.active===true&&grant?.active===true&&grant.scope_id===scope.id&&policy?.active===true&&policy.version===action.policy_version,"Pending agent, grant or policy invalid");
 }
 assert(value.members.some(m=>m.email===plan.created_by&&m.active===true),"Plan owner is no longer active");
 // Compare whole captured rows, including payloads, policy/grant versions and
 // reservations. Keep only a digest outside the read-only controller process.
 return {version:1,buildId,digest:createHash("sha256").update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value))))).digest("hex")};
}
export async function readPendingPackageState(db,reference,buildId){
 const client=await db.connect();
 try{
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const args=["local-proof",reference.id],rows=async sql=>(await client.query(sql,args)).rows;
  const value={
   plans:await rows("SELECT * FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2"),
   runs:await rows("SELECT * FROM ll_workflow_runs WHERE org_id=$1 AND id=$2"),
   steps:await rows("SELECT * FROM ll_workflow_steps WHERE org_id=$1 AND run_id=$2 ORDER BY ordinal"),
   actions:await rows("SELECT a.* FROM ll_connector_actions a JOIN ll_workflow_steps s ON s.org_id=a.org_id AND s.action_id=a.id WHERE s.org_id=$1 AND s.run_id=$2 ORDER BY s.ordinal"),
   dispatch:await rows("SELECT org_id,plan_id,workflow_id,plan_hash,plan_version,connector_version,state FROM ll_temporal_dispatch WHERE org_id=$1 AND plan_id=$2"),
   routes:await rows("SELECT * FROM ll_temporal_record_routes WHERE org_id=$1 AND plan_id=$2"),
   scopes:await rows("SELECT s.* FROM ll_connector_scopes s JOIN ll_temporal_record_routes r ON r.org_id=s.org_id AND r.scope_id=s.id WHERE r.org_id=$1 AND r.plan_id=$2"),
   grants:await rows("SELECT g.* FROM ll_connector_scope_grants g JOIN ll_temporal_record_routes r ON r.org_id=g.org_id AND r.scope_id=g.scope_id JOIN ll_workflow_steps s ON s.org_id=g.org_id AND s.agent_id=g.agent_id AND s.run_id=r.plan_id WHERE r.org_id=$1 AND r.plan_id=$2 ORDER BY s.ordinal"),
   agents:await rows("SELECT a.* FROM ll_agents a JOIN ll_workflow_steps s ON s.org_id=a.org_id AND s.agent_id=a.id WHERE s.org_id=$1 AND s.run_id=$2 ORDER BY s.ordinal"),
   policies:await rows("SELECT p.* FROM ll_connector_policies p JOIN ll_workflow_steps s ON s.org_id=p.org_id AND s.connector=p.connector WHERE s.org_id=$1 AND s.run_id=$2 ORDER BY s.ordinal"),
   members:await rows("SELECT m.email,m.active FROM ll_members m JOIN ll_enquiry_plans p ON p.org_id=m.org_id WHERE p.org_id=$1 AND p.id=$2 ORDER BY m.email")
  };
  return pendingSnapshot(value,reference,buildId);
 }finally{try{await client.query("ROLLBACK");}finally{client.release();}}
}
