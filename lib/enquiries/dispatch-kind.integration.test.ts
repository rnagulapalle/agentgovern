import {test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createInstalledTenantFixture} from '../workspace/installed-tenant-fixture';
import {applyQuoteExecutionMigrations} from '../workspace/quote-execution-migrations';
import {installQuoteAdmissionGrants} from '../workspace/quote-workload-installation';
import {tenantPoolBinding} from '../durable/tenant-pool';
import {transaction} from '../durable/database';
import {dispatchOwnership} from './dispatch';
import type {Actor} from '../durable/contracts';
// Actual SQL/installed-role routing proof. Owner inserts restored-state fixtures;
// this is not approval, provider execution or genuine worker-image admission.
test('ACK installed roles avoid quote-only reads; persisted ownership and unknown-kind containment remain enforced',async()=>{
 const f=await createInstalledTenantFixture({tenants:['one','foreign'],salesOrg:'one',seed:async()=>{}});
 try{
  await applyQuoteExecutionMigrations(f.owner);
  const worker=await f.workload('one','worker'),web=f.web('one');
  const human:Actor={orgId:'one',subject:'owner',role:'operator',tokenHash:'fixture-only'},ack:Actor={...human,subject:'enquiry-temporal',role:'worker'},quote:Actor={...ack,subject:'quote-temporal'};
  // This is the exact previously unconditional pre-dispatch query. No grant
  // is added to ACK roles to make it work.
  await expect(worker.query('SELECT 1 FROM ll_quote_background_routes r JOIN ll_quote_plans p ON p.org_id=r.org_id AND p.id=r.plan_id WHERE r.org_id=$1 AND p.id=$2',['one',randomUUID()])).rejects.toMatchObject({code:'42501'});
  await expect(web.query('SELECT 1 FROM ll_quote_background_routes')).rejects.toMatchObject({code:'42501'});
  const manual=randomUUID(),routed=randomUUID(),quoted=randomUUID(),foreign=randomUUID(),unknown=randomUUID(),routedAction=randomUUID();
  // Offline restored-state injection only. All triggers are reenabled before
  // any runtime-role observation; no runtime receives an owner connection.
  await f.owner.query('ALTER TABLE ll_workflow_runs DROP CONSTRAINT ll_workflow_kind_version');
  const quoteChecks=(await f.owner.query("SELECT conname FROM pg_constraint WHERE conrelid='ll_quote_plans'::regclass AND contype='c'")).rows;
  for(const row of quoteChecks)await f.owner.query('ALTER TABLE ll_quote_plans DROP CONSTRAINT "'+row.conname.replaceAll('"','""')+'"');
  await f.owner.query("SET session_replication_role='replica'");
  try{
   for(const[id,org,kind]of [[manual,'one','customer-acknowledgement'],[routed,'one','customer-acknowledgement'],[quoted,'one','distributor-quote'],[foreign,'foreign','customer-acknowledgement']])await f.owner.query('INSERT INTO ll_workflow_runs(org_id,id,created_by,workflow_kind)VALUES($1,$2,$3,$4)',[org,id,'owner',kind]);
   await f.owner.query("INSERT INTO ll_agents(org_id,id,tools,action_limit)VALUES('one','restored-agent',ARRAY['twin.crm'],1)");
   await f.owner.query("INSERT INTO ll_workflow_steps(org_id,run_id,ordinal,action_id,agent_id,connector,payload)VALUES('one',$1,1,$2,'restored-agent','crm','{}')",[routed,routedAction]);
   await f.owner.query("INSERT INTO ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by,run_id)VALUES('one',$1,'chat_ack_v1','v1','{}','{}',$2,'owner',$1)",[routed,'a'.repeat(64)]);
   await f.owner.query("INSERT INTO ll_enquiry_dispatch(org_id,plan_id,created_by)VALUES('one',$1,'owner')",[routed]);
   await f.owner.query("INSERT INTO ll_temporal_dispatch(org_id,plan_id,workflow_id,plan_hash,plan_version,connector_version)VALUES('one',$1,$2,$3,'acknowledgement-1','private-twin-1')",[routed,'restored-fixture:'+routed,'a'.repeat(64)]);
   await f.owner.query("INSERT INTO ll_quote_plans(org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id)VALUES('one',$1,'owner',$2,'{}',$3,'{}',$3,$4,$5)",[quoted,tenantPoolBinding(worker)!.epoch,'b'.repeat(64),randomUUID(),randomUUID()]);
   await f.owner.query("INSERT INTO ll_quote_background_routes(org_id,plan_id,plan_hash,recovery_epoch,worker_role_oid,scheduler_role_oid,worker_build_id,workflow_id,authority,contract)VALUES('one',$1,$2,$3,$4::oid,$4::oid,$5,$6,'{}','{}')",[quoted,'b'.repeat(64),tenantPoolBinding(worker)!.epoch,tenantPoolBinding(worker)!.roleOid,'quote-'+ 'c'.repeat(64),'quote:'+quoted]);
  }finally{await f.owner.query("SET session_replication_role='origin'");}
  const route=(db:typeof worker,a:Actor,id:string)=>transaction(db,a.orgId,c=>dispatchOwnership(c,a,id,false));
  await expect(route(web,human,manual)).resolves.toBeUndefined();
  await expect(route(worker,ack,routed)).resolves.toBeUndefined();
  await expect(transaction(worker,'one',c=>dispatchOwnership(c,ack,routedAction,true))).resolves.toBeUndefined();
  await expect(transaction(web,'one',c=>dispatchOwnership(c,human,routedAction,true))).rejects.toMatchObject({status:403});
  await expect(route(web,human,routed)).rejects.toMatchObject({status:403});
  await expect(route(worker,ack,manual)).rejects.toMatchObject({status:403});
  await expect(route(worker,ack,foreign)).rejects.toMatchObject({status:403});
  await expect(route(worker,quote,routed)).rejects.toMatchObject({status:403});
  // Give only the existing actual web admission installer its reviewed rights.
  const wb=tenantPoolBinding(web)!;await installQuoteAdmissionGrants(f.owner,f.schema,wb.role,'one',wb.roleOid);
  await expect(route(web,human,quoted)).rejects.toMatchObject({status:403});
  await expect(worker.query('SELECT * FROM ll_quote_background_routes')).rejects.toMatchObject({code:'42501'});
  // Unknown source metadata must not fall through as a legacy/manual action.
  await f.owner.query("SET session_replication_role='replica'");try{await f.owner.query("INSERT INTO ll_workflow_runs(org_id,id,created_by,workflow_kind)VALUES('one',$1,'owner','unrecognized')",[unknown]);}finally{await f.owner.query("SET session_replication_role='origin'");}
  await expect(route(web,human,unknown)).rejects.toMatchObject({status:409});
  expect((await f.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
 }finally{await f.close();}
},20000);

// Source classification unit contract complements actual installed-role proof.
test('standalone saved quote action retains quote-route checks rather than falling through as ACK',async()=>{
 const queries:string[]=[];
 const client={query:async(sql:string)=>{queries.push(sql);return{rows:sql.includes('FROM ll_workflow_steps')?[]:sql.includes('FROM ll_connector_actions')?[{connector:'email',contract:'quote-step-1'}]:sql.includes('to_regclass')?[{present:'ll_quote_background_routes'}]:[{routed:true}]};}};
 await expect(dispatchOwnership(client as unknown as import('pg').PoolClient,{orgId:'one',subject:'owner',role:'operator',tokenHash:'unit'},randomUUID(),true)).rejects.toMatchObject({status:403});
 expect(queries.some(sql=>sql.includes('JOIN ll_quote_plans'))).toBe(true);
});
test('quote-shaped saved action contradicting persisted ACK graph is refused before quote storage',async()=>{
 const queries:string[]=[];
 const client={query:async(sql:string)=>{queries.push(sql);return{rows:sql.includes('FROM ll_workflow_steps')?[{workflow_kind:'customer-acknowledgement'}]:[{connector:'email',contract:'quote-step-1'}]};}};
 await expect(dispatchOwnership(client as unknown as import('pg').PoolClient,{orgId:'one',subject:'owner',role:'operator',tokenHash:'unit'},randomUUID(),true)).rejects.toMatchObject({status:409});
 expect(queries.some(sql=>sql.includes('ll_quote_background_routes'))).toBe(false);
});
