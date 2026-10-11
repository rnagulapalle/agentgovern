import { TemporalOutbox } from "../../runtime/temporal/outbox";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { ConnectorControl } from "../connectors/service";
import type { Actor } from "../durable/contracts";
import type { ConnectorProvider } from "../connectors/contracts";
import { connectorMembershipCurrent, enquiryMembershipCurrent, namedActorCurrent } from "./membership-authority";
import { quarantineRestore } from "../durable/recovery";
import { EnquiryControl } from "../enquiries/service";
import { WorkflowControl } from "../workflows/service";
import { transaction } from "../durable/database";
const schema=`membership23_${randomBytes(8).toString('hex')}`;
let admin:Pool,db:Pool,control:ConnectorControl,calls=0,inspections=0,gate:Promise<void>|null=null;
const owner:Actor={orgId:'one',subject:'owner@company.example',role:'operator',tokenHash:'owner-session'};
const manager:Actor={orgId:'one',subject:'manager@company.example',role:'operator',tokenHash:'manager-session'};
const executor:Actor={orgId:'one',subject:'executor@company.example',role:'operator',tokenHash:'executor-session'};
const provider:ConnectorProvider={workspaceId:'one',bindingId:'a'.repeat(64),source:async()=> 'v1',write:async()=>{calls++;if(gate)await gate;return{outcome:'verified',detail:'Fixture effect'};},inspect:async()=>{inspections++;return{outcome:'verified',detail:'Fixture effect'};}};
const proposal=()=>({actionId:randomUUID(),agentId:'agent',connector:'crm',payload:{lifecycle:'customer'}});
beforeAll(async()=>{
 if(!process.env.LOOPLABS_TEST_DATABASE_URL)throw Error('Dedicated PostgreSQL required');
 admin=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 db=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:12});
},20000);
beforeEach(async()=>{
 await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.query(`CREATE SCHEMA ${schema}`);
 for(const f of ['lib/durable/schema.sql','lib/workspace/schema.sql','lib/refunds/schema.sql','lib/connectors/schema.sql','lib/workflows/schema.sql','lib/enquiries/schema.sql','lib/enquiries/managed-schema.sql','lib/durable/proposal-schema.sql','lib/quotes/schema.sql','lib/connectors/scope-schema.sql','lib/quotes/authority-schema.sql','lib/quotes/plan-v2-schema.sql','lib/quotes/membership-schema.sql','lib/workspace/membership-authority-schema.sql'])await db.query(await readFile(f,'utf8'));
await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
 for(const a of [owner,manager,executor]){await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,'one','Fixture','fixture')",[a.subject]);await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')",[a.tokenHash,a.subject]);}
 await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('one','agent',ARRAY['twin.crm','twin.email'],100)");
 await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES('one','agent','Agent',$1,'crm_agent','crm_twin')",[owner.subject]);
 await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('agent-token','one','agent','agent')");
 await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('one','crm'),('one','email')");
 calls=0;inspections=0;gate=null;control=new ConnectorControl(db,provider);
});
afterAll(async()=>{await db?.end();await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin?.end();});
async function ready(){const a=await control.propose(owner,proposal());return control.review(manager,a.id,a.payload_hash,true);}
async function cycle(email:string,move=false){if(move){await db.query("UPDATE ll_members SET org_id='two' WHERE email=$1",[email]);await db.query("UPDATE ll_members SET org_id='one' WHERE email=$1",[email]);}else{await db.query('UPDATE ll_members SET active=false WHERE email=$1',[email]);await db.query('UPDATE ll_members SET active=true WHERE email=$1',[email]);}}
it('binds independently approved current named generations; duplicate does not duplicate spend/effects',async()=>{
 const p=proposal(),a=await control.propose(owner,p);expect((a as unknown as Record<string,unknown>).membership_proposal).toBeTruthy();
 await expect(control.review(owner,a.id,a.payload_hash,true)).rejects.toThrow();
 const approved=await control.review(manager,a.id,a.payload_hash,true);expect(approved.state).toBe('ready');
 expect((await control.propose(owner,p)).id).toBe(a.id);expect((await control.execute(executor,a.id)).state).toBe('succeeded');
 expect((await control.execute(executor,a.id)).state).toBe('succeeded');expect(calls).toBe(1);
 expect((await db.query("SELECT reserved FROM ll_agents WHERE id='agent'")).rows[0].reserved).toBe(1);
});
for(const member of [owner,manager])for(const move of [false,true])it(`permanently fences ${member.subject} ${move?'move-return':'deactivate-reactivate'} before dispatch`,async()=>{
 const a=await ready();await cycle(member.subject,move);expect((await control.execute(executor,a.id)).state).toBe('cancelled');expect(calls).toBe(0);
 const fresh=await ready();expect((await control.execute(executor,fresh.id)).state).toBe('succeeded');
});
it('agent-submitted actions bind enrolled named owner and forbid owner self approval',async()=>{
 const actor:Actor={orgId:'one',subject:'agent',role:'agent',tokenHash:'agent-token'};
 const a=await control.propose(actor,proposal());await expect(control.review(owner,a.id,a.payload_hash,true)).rejects.toThrow('Independent');
 await control.review(manager,a.id,a.payload_hash,true);await cycle(owner.subject);expect((await control.execute(executor,a.id)).state).toBe('cancelled');expect(calls).toBe(0);
});
it('post-dispatch invisible revocation preserves uncertain evidence, reservations and IDs; reconciliation cannot restore success',async()=>{
 const a=await ready();let release!:()=>void;gate=new Promise<void>(r=>release=r);const running=control.execute(executor,a.id);
 while(calls===0)await new Promise(r=>setTimeout(r,5));await cycle(manager.subject);release();
 const result=await running;expect(result.state).toBe('uncertain');expect(result.evidence).toMatchObject({outcome:'verified'});expect(result.id).toBe(a.id);const readback=await control.reconcile(executor,a.id);expect(readback.state).toBe('uncertain');expect(readback.evidence).toMatchObject({outcome:'verified'});expect(inspections).toBe(1);expect(calls).toBe(1);
 expect((await db.query("SELECT reserved FROM ll_agents WHERE id='agent'")).rows[0].reserved).toBe(1);
});
it('active legacy token cannot override inactive/foreign named member or impersonate its session',async()=>{
 await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('legacy-owner','one',$1,'operator')",[owner.subject]);
 const legacy={...owner,tokenHash:'legacy-owner'};await expect(control.propose(legacy,proposal())).rejects.toThrow('named');
 await db.query('UPDATE ll_members SET active=false WHERE email=$1',[owner.subject]);await expect(control.propose(legacy,proposal())).rejects.toThrow('named');
 await db.query("UPDATE ll_members SET active=true,org_id='two' WHERE email=$1",[owner.subject]);await expect(control.propose(legacy,proposal())).rejects.toThrow('named');
});
it('server owned immutable snapshots reject direct tampering and stale SQL approval',async()=>{
 const a=await control.propose(owner,proposal());for(const q of ["UPDATE ll_connector_actions SET membership_proposal='{}' WHERE id=$1","UPDATE ll_connector_actions SET membership_approval='{}' WHERE id=$1"])await expect(db.query(q,[a.id])).rejects.toThrow();
 await cycle(owner.subject);await expect(db.query('UPDATE ll_connector_actions SET approved_by=$2 WHERE id=$1',[a.id,manager.subject])).rejects.toThrow('changed');
 expect((await control.read(executor,a.id)).state).toBe('held');
});
it('old NULL authority is readable but refuses approval or execution after installation',async()=>{
 // Owner-only fixture removes the new capture trigger to model a retained historical row.
 await db.query('ALTER TABLE ll_connector_actions DISABLE TRIGGER ll_00_connector_membership_insert23');
 const a=await control.propose(owner,proposal());await db.query('ALTER TABLE ll_connector_actions ENABLE TRIGGER ll_00_connector_membership_insert23');
 expect((await control.read(executor,a.id)).id).toBe(a.id);expect((await control.review(manager,a.id,a.payload_hash,true)).state).toBe('cancelled');expect(calls).toBe(0);
});
it('saved enquiry old owner snapshot never regains submission authority and remains immutable',async()=>{
 const id=randomUUID();await db.query("INSERT INTO ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by) VALUES('one',$1,'fixture','v1','{}','{}','hash',$2)",[id,owner.subject]);
 expect(await transaction(db,'one',c=>enquiryMembershipCurrent(c,'one',id))).toBe(true);await cycle(owner.subject);
 expect(await transaction(db,'one',c=>enquiryMembershipCurrent(c,'one',id))).toBe(false);
 await expect(db.query("UPDATE ll_enquiry_plans SET membership_owner='{}' WHERE id=$1",[id])).rejects.toThrow();
});
it('direct lifecycle mutation refuses workspace/member lock inversion without claiming revocation committed',async()=>{
 const a=await ready(),holder=await db.connect();try{await holder.query('BEGIN');await holder.query("SELECT id FROM ll_orgs WHERE id='one' FOR UPDATE");
 await expect(db.query('UPDATE ll_members SET active=false WHERE email=$1',[manager.subject])).rejects.toMatchObject({code:'55P03'});
 expect((await holder.query('SELECT active FROM ll_members WHERE email=$1',[manager.subject])).rows[0].active).toBe(true);
 expect(await connectorMembershipCurrent(holder,'one',a,true)).toBe(true);
 }finally{await holder.query('ROLLBACK');holder.release();}
});

it('actual recovery quarantine clears approval but retains original bound snapshot and prevents rebinding',async()=>{
 const a=await ready();const old=(await db.query('SELECT membership_approval FROM ll_connector_actions WHERE id=$1',[a.id])).rows[0].membership_approval;
 await db.query(await readFile('lib/durable/recovery-schema.sql','utf8'));await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('one',$1)",[randomUUID()]);
 await quarantineRestore(db,'one',randomUUID(),'b'.repeat(64));const restored=(await db.query('SELECT * FROM ll_connector_actions WHERE id=$1',[a.id])).rows[0];
 expect(restored.state).toBe('uncertain');expect(restored.approved_by).toBeNull();expect(restored.membership_approval).toEqual(old);expect(restored.id).toBe(a.id);
 expect((await db.query("SELECT reserved FROM ll_agents WHERE id='agent'")).rows[0].reserved).toBe(1);
 await expect(db.query('UPDATE ll_connector_actions SET approved_by=$2 WHERE id=$1',[a.id,manager.subject])).rejects.toThrow('rebound');
});
it('actual saved enquiry start after owner cycle refuses before enrolling or creating a run',async()=>{
 const workflow=new WorkflowControl(db,control),enquiries=new EnquiryControl(db,workflow,async()=>({id:'1001',email:'customer@example.test',lifecycle:'customer',version:'v1'}));
 const id=randomUUID(),saved=await enquiries.prepareChat(owner,id) as {saved:{plan_hash:string}};
 await cycle(owner.subject);await expect(enquiries.start(owner,id,saved.saved.plan_hash,'new-crm','new-email',true)).rejects.toThrow('membership changed');
 expect((await db.query('SELECT * FROM ll_workflow_runs')).rows).toHaveLength(0);expect((await db.query("SELECT * FROM ll_agents WHERE id LIKE 'new-%'")).rows).toHaveLength(0);expect(calls).toBe(0);
});
it('explicit nonmember legacy fixture retains current-token behavior; becoming a named member never inherits it',async()=>{
 await db.query("DELETE FROM ll_agent_profiles WHERE agent_id='agent'");
 for(const [hash,subject]of [['legacy-requester','legacy-requester'],['legacy-manager','legacy-manager']])await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one',$2,'operator')",[hash,subject]);
 const requester={...owner,subject:'legacy-requester',tokenHash:'legacy-requester'},reviewer={...manager,subject:'legacy-manager',tokenHash:'legacy-manager'};
 const a=await control.propose(requester,proposal());await control.review(reviewer,a.id,a.payload_hash,true);
 await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('legacy-manager','one','New','fixture')");
 expect((await control.execute(executor,a.id)).state).toBe('cancelled');expect(calls).toBe(0);
 const fresh=await control.propose(requester,proposal());await control.review(manager,fresh.id,fresh.payload_hash,true);expect((await control.execute(executor,fresh.id)).state).toBe('succeeded');
});

it('separate named requesting operator and enrolled agent owner are independently generation-bound',async()=>{
 const a=await control.propose(executor,proposal());await control.review(manager,a.id,a.payload_hash,true);await cycle(owner.subject);
 expect((await control.execute(executor,a.id)).state).toBe('cancelled');expect(calls).toBe(0);
 const b=await control.propose(executor,proposal());await control.review(manager,b.id,b.payload_hash,true);await cycle(executor.subject);
 expect((await control.execute(owner,b.id)).state).toBe('cancelled');expect(calls).toBe(0);
});
it('member row contention refuses proposal atomically without reservation or partially captured authority',async()=>{
 const blocker=await db.connect();try{await blocker.query('BEGIN');await blocker.query('SELECT email FROM ll_members WHERE email=$1 FOR UPDATE',[owner.subject]);
 await expect(control.propose(owner,proposal())).rejects.toMatchObject({code:'55P03'});
 expect((await db.query('SELECT * FROM ll_connector_actions')).rows).toHaveLength(0);expect((await db.query("SELECT reserved FROM ll_agents WHERE id='agent'")).rows[0].reserved).toBe(0);
 }finally{await blocker.query('ROLLBACK');blocker.release();}
 expect((await ready()).state).toBe('ready');
});
it('old enquiry NULL history is display data and cannot obtain new action authority',async()=>{
 const id=randomUUID();await db.query('ALTER TABLE ll_enquiry_plans DISABLE TRIGGER ll_00_enquiry_membership_insert23');
 await db.query("INSERT INTO ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by) VALUES('one',$1,'old','v1','{}','{}','hash',$2)",[id,owner.subject]);
 await db.query('ALTER TABLE ll_enquiry_plans ENABLE TRIGGER ll_00_enquiry_membership_insert23');
 expect((await db.query('SELECT created_by FROM ll_enquiry_plans WHERE id=$1',[id])).rows[0].created_by).toBe(owner.subject);
 expect(await transaction(db,'one',c=>enquiryMembershipCurrent(c,'one',id))).toBe(false);
});

it('direct approval action-row to workspace inversion refuses promptly and leaves exact old authority unchanged',async()=>{
 const a=await control.propose(owner,proposal()),workspace=await db.connect(),writer=await db.connect();
 try{await workspace.query('BEGIN');await workspace.query("SELECT id FROM ll_orgs WHERE id='one' FOR UPDATE");await writer.query('BEGIN');
 await writer.query('SELECT id FROM ll_connector_actions WHERE id=$1 FOR UPDATE',[a.id]);
 await expect(writer.query('UPDATE ll_connector_actions SET approved_by=$2 WHERE id=$1',[a.id,manager.subject])).rejects.toMatchObject({code:'55P03'});
 await writer.query('ROLLBACK');const updated=await workspace.query("UPDATE ll_connector_actions SET reason='Authority unchanged' WHERE id=$1 RETURNING *",[a.id]);
 expect(updated.rows[0].state).toBe('held');expect(updated.rows[0].approved_by).toBeNull();expect(updated.rows[0].membership_approval).toBeNull();await workspace.query('COMMIT');
 }finally{await workspace.query('ROLLBACK');await writer.query('ROLLBACK');workspace.release();writer.release();}
 expect((await control.review(manager,a.id,a.payload_hash,true)).state).toBe('ready');
});
it('enquiry named session gate rejects active legacy impersonation before source request and enrollment',async()=>{
 await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('legacy-owner','one',$1,'operator')",[owner.subject]);
 let reads=0;const enquiries=new EnquiryControl(db,new WorkflowControl(db,control),async()=>{reads++;return{id:'1001',email:'customer@example.test',lifecycle:'customer',version:'v1'};});
 const actor={...owner,tokenHash:'legacy-owner'};
 await expect(enquiries.prepareChat(actor,randomUUID())).rejects.toThrow('named');await expect(enquiries.start(actor,randomUUID(),'a'.repeat(64),'a','b',true)).rejects.toThrow('named');
 expect(reads).toBe(0);expect((await db.query('SELECT * FROM ll_enquiry_plans')).rows).toHaveLength(0);expect(calls).toBe(0);
});
it('current saved chat plan follows existing managed workflow engine through independent approval and verified effects',async()=>{
 const workflow=new WorkflowControl(db,control),enquiries=new EnquiryControl(db,workflow,async()=>({id:'1001',email:'customer@example.test',lifecycle:'customer',version:'v1'}));
 const id=randomUUID(),saved=await enquiries.prepareChat(owner,id) as {saved:{plan_hash:string}};
 const {runId}=await enquiries.rehearse(owner,id,saved.saved.plan_hash);expect(runId).toBe(id);
 const run=await workflow.read(owner,runId);for(const s of run.steps){expect(s.state).toBe('held');await control.review(manager,s.action_id,s.payload_hash,true);expect((await control.execute(executor,s.action_id)).state).toBe('succeeded');}
 expect(calls).toBe(2);expect((await workflow.verify(executor,runId)).verified).toBe(true);expect((await workflow.read(executor,runId)).state).toBe('completed');
});
it('saved plan owner distinct from requester and agent owner is permanently generation fenced',async()=>{
 const workflow=new WorkflowControl(db,control),enquiries=new EnquiryControl(db,workflow,async()=>({id:'1001',email:'customer@example.test',lifecycle:'customer',version:'v1'}));
 // Prepared by executor, manually bound to existing owner-owned agents.
 await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('one','email-agent',ARRAY['twin.email'],100)");
 await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES('one','email-agent','Email',$1,'email_agent','email_twin')",[owner.subject]);
 await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('email-token','one','email-agent','agent')");
 const id=randomUUID(),saved=await enquiries.prepareChat(executor,id) as {saved:{plan_hash:string}};await enquiries.start(executor,id,saved.saved.plan_hash,'agent','email-agent');
 const run=await workflow.read(executor,id),step=run.steps[0];const actor:Actor={orgId:'one',subject:'agent',role:'agent',tokenHash:'agent-token'};
 const a=await control.propose(actor,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});await control.review(manager,a.id,a.payload_hash,true);
 await cycle(executor.subject);expect((await control.execute(owner,a.id)).state).toBe('cancelled');expect(calls).toBe(0);
});

it('legacy worker token cannot impersonate an existing named member',async()=>{
 const a=await ready();await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('worker-spoof','one',$1,'worker')",[executor.subject]);
 await expect(control.execute({...executor,role:'worker',tokenHash:'worker-spoof'},a.id)).rejects.toThrow('named');expect(calls).toBe(0);
});

it('Temporal transfer requires named session and current saved-plan history before new or repeated scheduling intent',async()=>{
 await db.query(await readFile('lib/enquiries/temporal-schema.sql','utf8'));
 const workflow=new WorkflowControl(db,control),enquiries=new EnquiryControl(db,workflow,async()=>({id:'1001',email:'customer@example.test',lifecycle:'customer',version:'v1'})),outbox=new TemporalOutbox(db);
 const plans=[];
 for(let i=0;i<2;i++){const id=randomUUID(),prepared=await enquiries.prepareChat(owner,id) as {saved:{plan_hash:string}};await enquiries.rehearse(owner,id,prepared.saved.plan_hash);plans.push(id);}
 await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('outbox-owner-spoof','one',$1,'operator')",[owner.subject]);
 await expect(outbox.transfer({...owner,tokenHash:'outbox-owner-spoof'},plans[0])).rejects.toThrow('named');
 expect((await db.query("SELECT count(*)::int n FROM ll_temporal_dispatch")).rows[0].n).toBe(0);
 const intent=await outbox.transfer(owner,plans[0]);expect(await outbox.transfer(owner,plans[0])).toBe(intent);
 await cycle(owner.subject);
 for(const id of plans)await expect(outbox.transfer(owner,id)).rejects.toThrow('membership changed');
 expect((await db.query("SELECT workflow_id FROM ll_temporal_dispatch")).rows).toEqual([{workflow_id:intent}]);
 expect((await db.query("SELECT state FROM ll_connector_actions")).rows.every(a=>a.state==='held')).toBe(true);expect(calls).toBe(0);
});

it('column-only immutable identity permission permits runtime membership locks while denying lifecycle/history writes and identity rename',async()=>{
 const role=`membership_lock_${randomBytes(8).toString('hex')}`;let runtime:Pool|undefined;
 await db.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
 try{
  await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  await db.query(`GRANT SELECT,UPDATE ON ll_orgs TO ${role}`);
  await db.query(`GRANT SELECT ON ll_members,ll_sessions,ll_tokens,ll_quote_member_generations TO ${role}`);
  // Apply the exact reviewed provisioner permission, never a table-wide UPDATE.
  const source=await readFile('scripts/membership-authority-setup.ts','utf8');
  const grant=[...source.matchAll(/client\.query\(\s*("(?:[^"\\]|\\.)*")/g)].map(m=>JSON.parse(m[1]) as string).filter(sql=>sql.startsWith('GRANT '));
  expect(grant).toEqual(['GRANT UPDATE(email) ON ll_members TO ll_runtime']);
  await db.query(grant[0].replace(' TO ll_runtime',` TO ${role}`));
  runtime=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema} -c role=${role}`});
  expect(await transaction(runtime,'one',c=>namedActorCurrent(c,owner))).toBe(true);
  expect((await runtime.query("SELECT ll_member_snapshot23('one',$1,NULL) snapshot",[owner.subject])).rows[0].snapshot).toEqual({kind:'member',subject:owner.subject,generation:'1'});
  for(const sql of ['UPDATE ll_members SET active=false',"UPDATE ll_members SET org_id='two'",'UPDATE ll_quote_member_generations SET generation=generation+1'])await expect(runtime.query(sql)).rejects.toMatchObject({code:'42501'});
  await expect(runtime.query("UPDATE ll_members SET email=email||'.renamed'")).rejects.toMatchObject({code:'23514'});
  const holder=await db.connect();try{await holder.query('BEGIN');await holder.query('SELECT email FROM ll_members WHERE email=$1 FOR UPDATE',[owner.subject]);await expect(transaction(runtime,'one',c=>namedActorCurrent(c,owner))).rejects.toMatchObject({code:'55P03'});}finally{await holder.query('ROLLBACK');holder.release();}
  expect((await db.query('SELECT active,org_id FROM ll_members WHERE email=$1',[owner.subject])).rows[0]).toEqual({active:true,org_id:'one'});
 }finally{await runtime?.end();await db.query(`DROP OWNED BY ${role}`);await db.query(`DROP ROLE ${role}`);}
});
