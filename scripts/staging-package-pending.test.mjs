import {test,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {pendingSnapshot,readPendingPackageState} from "./staging-package-pending.mjs";
import {spawnSync} from "node:child_process";
const buildId=`ack-${"a".repeat(64)}`;
function fixture(){
 const id=randomUUID(),scopeId=randomUUID(),owner="owner@example.test";
 const reference={id,steps:[{action_id:randomUUID(),payload_hash:"b".repeat(64)},{action_id:randomUUID(),payload_hash:"c".repeat(64)}]};
 const org_id="local-proof",plan_hash="d".repeat(64),binding_id="e".repeat(64);
 const value={plans:[{org_id,id,run_id:id,plan_hash,created_by:owner,plan:{payload:"private sample"}}],runs:[{org_id,id,state:"active"}],dispatch:[{org_id,plan_id:id,plan_hash,plan_version:"acknowledgement-1",connector_version:"private-record-twin-2",state:"started",workflow_id:"same-workflow"}],routes:[{org_id,plan_id:id,scope_id:scopeId,scope_version:1,binding_id,worker_build_id:buildId}],scopes:[{org_id,id:scopeId,version:1,binding_id,active:true}],steps:[],actions:[],agents:[],grants:[],policies:[],members:[{email:owner,active:true},{email:"reviewer@example.test",active:true}]};
 for(let i=0;i<2;i++){const connector=["crm","email"][i],agent_id=`trial-${connector}`,step=reference.steps[i];value.steps.push({org_id,run_id:id,ordinal:i+1,action_id:step.action_id,agent_id,connector});value.actions.push({org_id,id:step.action_id,payload_hash:step.payload_hash,agent_id,connector,policy_version:1,state:"held",approved_by:null,approval_until:null,lease_token:null,lease_until:null,evidence:null,payload:{sample:"private"}});value.agents.push({org_id,id:agent_id,active:true,reserved:1});value.grants.push({org_id,scope_id:scopeId,agent_id,active:true,version:1});value.policies.push({org_id,connector,active:true,version:1});}
 return {reference,value};
}
test("retains only a digest of exact pending authority and detects silent payload, reservation and grant-version drift",()=>{
 const {value,reference}=fixture(),snapshot=pendingSnapshot(value,reference,buildId);
 expect(Object.keys(snapshot).sort()).toEqual(["buildId","digest","version"]);expect(snapshot.digest).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(snapshot)).not.toContain("private");
 for(const change of [v=>{v.actions[0].payload.sample="changed";},v=>{v.agents[0].reserved=2;},v=>{v.grants[0].version=2;},v=>{v.plans[0].plan.payload="changed";}]){const copy=structuredClone(value);change(copy);expect(pendingSnapshot(copy,reference,buildId).digest).not.toBe(snapshot.digest);}
});
test("missing, foreign, already-approved, executing or stale pending state refuses a snapshot",()=>{
 const {value,reference}=fixture();
 const changes=[v=>{v.actions=[];},v=>{v.routes=[];},v=>{v.scopes[0].active=false;},v=>{v.scopes[0].version=2;},v=>{v.routes[0].worker_build_id=`ack-${"f".repeat(64)}`;},v=>{v.dispatch[0].state="pending";},v=>{v.dispatch[0].connector_version="private-twin-1";},v=>{v.dispatch[0].plan_hash="f".repeat(64);},v=>{v.runs[0].state="completed";},v=>{v.actions[0].state="executing";},v=>{v.actions[0].approved_by="reviewer@example.test";},v=>{v.actions[0].approval_until="tomorrow";},v=>{v.actions[0].lease_token=randomUUID();},v=>{v.actions[0].lease_until="tomorrow";},v=>{v.actions[0].evidence={effect:true};},v=>{v.actions[0].payload_hash="f".repeat(64);},v=>{v.grants[0].active=false;},v=>{v.agents[0].active=false;},v=>{v.policies[0].version=2;},v=>{v.members[0].active=false;},v=>{v.steps.reverse();},v=>{v.actions[0].org_id="foreign";},v=>{v.secret="private";}];
 for(const change of changes){const copy=structuredClone(value);change(copy);expect(()=>pendingSnapshot(copy,reference,buildId)).toThrow();}
 for(const invalid of [{...reference,id:"unknown"},{...reference,steps:[]},{...reference,steps:[reference.steps[0],reference.steps[0]]}])expect(()=>pendingSnapshot(value,invalid,buildId)).toThrow();
});
test("read-only repeatable snapshot always rolls back and releases on query or validation failure",async()=>{
 const {value,reference}=fixture(),keys=Object.keys(value);
 // Map queries independently by FROM table; callers cannot replace SQL with writes.
 const table={ll_enquiry_plans:"plans",ll_workflow_runs:"runs",ll_workflow_steps:"steps",ll_connector_actions:"actions",ll_temporal_dispatch:"dispatch",ll_temporal_record_routes:"routes",ll_connector_scopes:"scopes",ll_connector_scope_grants:"grants",ll_agents:"agents",ll_connector_policies:"policies",ll_members:"members"};expect(keys).toHaveLength(11);
 for(const failure of [null,"query","validation"]){const calls=[];let released=false;const client={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith("SELECT")){expect(args).toEqual(["local-proof",reference.id]);if(failure==="query")throw Error("read failed");const key=table[/FROM (\w+)/.exec(sql)[1]];return {rows:failure==="validation"&&key==="actions"?[]:value[key]};}return {rows:[]};},release:()=>{released=true;}};
  const result=readPendingPackageState({connect:async()=>client},reference,buildId);
  if(failure)await expect(result).rejects.toThrow();else expect(await result).toEqual(pendingSnapshot(value,reference,buildId));
  expect(calls[0].sql).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");expect(calls.at(-1).sql).toBe("ROLLBACK");expect(released).toBe(true);expect(calls.some(c=>/^(INSERT|UPDATE|DELETE|COMMIT|ALTER)/.test(c.sql))).toBe(false);
 }
});
test("offline controller defaults to sanitized refusal without runtime inputs",()=>{
 const child=spawnSync(process.execPath,["scripts/staging-package-pending-controller.mjs"],{env:{PATH:process.env.PATH},encoding:"utf8",timeout:10000});expect(child.status).toBe(1);expect(child.stdout).toBe("");expect(child.stderr.trim()).toBe("Pending package authority check refused; no credential, payload or raw database error printed.");
});
