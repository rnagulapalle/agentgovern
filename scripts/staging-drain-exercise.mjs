import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerAgent} from '../lib/workspace/agents.ts';
import {FetchSandboxConnectors} from '../lib/connectors/twin.ts';
import {ScopeControl} from '../lib/connectors/scopes.ts';
import {ConnectorControl} from '../lib/connectors/service.ts';
import {WorkflowControl} from '../lib/workflows/service.ts';
import {EnquiryControl} from '../lib/enquiries/service.ts';
import {TemporalOutbox} from '../runtime/temporal/outbox.ts';
export async function exerciseDrain({db,owner,runs,artifacts,token,mark,checkpoint}){
 assert.equal(process.env.LOOPLABS_STAGING_DRAIN_PROOF,'isolated');assert.equal(runs.length,2);
 await checkpoint('registry-ready');
 const added=[];
 for(let i=0;i<2;i++){
  const original=runs[i],scope={version:'record-scope-1',workspaceId:owner.orgId,...original.record};
  const provider=new FetchSandboxConnectors('http://connector-twin:8018',token,1500,scope),control=new ConnectorControl(db,provider),workflow=new WorkflowControl(db,control),scopes=new ScopeControl(db,provider);
  const agents=[`drain-${i}-crm`,`drain-${i}-email`];
  for(const [n,id] of agents.entries()){await registerAgent(db,owner,{id,name:id,owner:owner.subject,role:n===0?'crm_agent':'email_agent',connector:n===0?'crm_twin':'email_twin',actionLimit:1});await scopes.grant(owner,original.enrollment,id);}
  const enquiry=new EnquiryControl(db,workflow,async()=>{const c=await provider.contact();return {id:c.id,email:c.properties.email,version:c.updatedAt,lifecycle:c.properties.lifecyclestage};});
  const plan=(await enquiry.prepareChat(owner,randomUUID())).saved;await enquiry.start(owner,plan.id,plan.plan_hash,...agents,true);
  const run=await workflow.read(owner,plan.id);for(const s of run.steps)await control.propose(owner,{actionId:s.action_id,agentId:s.agent_id,connector:s.connector,payload:s.payload});
  added.push({plan,workflow});
 }
 // Intercept only observation barriers, after/before the real INSERT. SQL is unchanged.
 function observedPool(first){return {connect:async()=>{
  const c=await db.connect(),query=c.query.bind(c);
  return new Proxy(c,{get(target,key){if(key==='query')return async(...args)=>{
   const route=typeof args[0]==='string'&&args[0].startsWith('INSERT INTO ll_temporal_record_routes(');
   if(route&&!first){const pid=(await query('SELECT pg_backend_pid() pid')).rows[0].pid;await mark('new-insert-attempt',{pid});}
   const result=await query(...args);
   if(route&&first){const pid=(await query('SELECT pg_backend_pid() pid')).rows[0].pid;await mark('admission-row-held',{pid});await checkpoint('admission-drain-blocked');}
   return result;
  };if(key==='release')return target.release.bind(target);return Reflect.get(target,key);}});
 }};}
 const admittedId=await new TemporalOutbox(observedPool(true),artifacts[0].buildId).transfer(owner,added[0].plan.id);
 await checkpoint('old-build-drained');await checkpoint('new-drain-held');
 await assert.rejects(()=>new TemporalOutbox(observedPool(false),artifacts[1].buildId).transfer(owner,added[1].plan.id),e=>e.code==='23514');
 for(const r of runs){const outbox=new TemporalOutbox(db,r.buildId);assert.equal(await outbox.transfer(owner,r.id),r.handle.workflowId);}
 assert.equal(await new TemporalOutbox(db,artifacts[0].buildId).transfer(owner,added[0].plan.id),admittedId);
 for(const table of ['ll_temporal_dispatch','ll_temporal_record_routes'])assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE org_id=$1 AND plan_id=$2`,[owner.orgId,added[1].plan.id])).rows[0].n,0);
 const builds=(await db.query('SELECT worker_build_id,state FROM ll_temporal_worker_builds WHERE worker_build_id=ANY($1::text[]) ORDER BY worker_build_id',[artifacts.map(a=>a.buildId)])).rows;assert.equal(builds.length,2);assert(builds.every(b=>b.state==='draining'));
 for(const r of added)assert((await r.workflow.read(owner,r.plan.id)).steps.every(s=>s.state==='held'&&!s.approved_by));
 const proof={passed:true,admissionFirstCommitted:true,drainFirstRefused:true,failedTransferRolledBack:true,existingTransfersIdempotent:true,additionalHeldRoute:1,noRetirementAuthorized:true};
 await mark('admission-exercised',proof);await checkpoint('owner-drain-completed');return proof;
}
