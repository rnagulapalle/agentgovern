import { ScopeControl } from "../connectors/scopes";
import { parseRevision } from "./revision";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { ConnectorControl } from "../connectors/service";
import type { Actor } from "../durable/contracts";
import type { ConnectorProvider } from "../connectors/contracts";
import { EnquiryControl } from "../enquiries/service";
import { WorkflowControl } from "../workflows/service";
const schema=`revision24_${randomBytes(8).toString('hex')}`;
let admin:Pool,db:Pool,control:ConnectorControl,calls=0,gate:Promise<void>|null=null;
const owner:Actor={orgId:'one',subject:'owner@company.example',role:'operator',tokenHash:'owner-session'};
const manager:Actor={orgId:'one',subject:'manager@company.example',role:'operator',tokenHash:'manager-session'};
const executor:Actor={orgId:'one',subject:'executor@company.example',role:'operator',tokenHash:'executor-session'};
const provider:ConnectorProvider={workspaceId:'one',bindingId:'a'.repeat(64),source:async()=> 'v1',write:async()=>{calls++;if(gate)await gate;return{outcome:'verified',detail:'Fixture effect'};},inspect:async()=>{return{outcome:'verified',detail:'Fixture effect'};}};
beforeAll(async()=>{
 if(!process.env.LOOPLABS_TEST_DATABASE_URL)throw Error('Dedicated PostgreSQL required');
 admin=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 db=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:12});
},20000);
beforeEach(async()=>{
 await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.query(`CREATE SCHEMA ${schema}`);
 for(const f of ['lib/durable/schema.sql','lib/workspace/schema.sql','lib/refunds/schema.sql','lib/connectors/schema.sql','lib/workflows/schema.sql','lib/enquiries/schema.sql','lib/enquiries/managed-schema.sql','lib/durable/proposal-schema.sql','lib/quotes/schema.sql','lib/connectors/scope-schema.sql','lib/quotes/authority-schema.sql','lib/quotes/plan-v2-schema.sql','lib/quotes/membership-schema.sql','lib/workspace/membership-authority-schema.sql','lib/enquiries/revision-schema.sql'])await db.query(await readFile(f,'utf8'));
await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
 for(const a of [owner,manager,executor]){await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,'one','Fixture','fixture')",[a.subject]);await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')",[a.tokenHash,a.subject]);}
 await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('one','agent',ARRAY['twin.crm','twin.email'],100)");
 await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES('one','agent','Agent',$1,'crm_agent','crm_twin')",[owner.subject]);
 await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('agent-token','one','agent','agent')");
 await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('one','crm'),('one','email')");
 calls=0;gate=null;control=new ConnectorControl(db,provider);
});
afterAll(async()=>{await db?.end();await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin?.end();});

async function fixture() {
 const state = {id:'1001',email:'customer@example.test',lifecycle:'lead' as 'lead'|'customer',version:'v1'};
 const workflow = new WorkflowControl(db,control);
 const service = new EnquiryControl(db,workflow,async()=>({...state}));
 const parent = (await service.prepareChat(owner,randomUUID())).saved!;
 return {service,workflow,state,parent};
}
it('creates one immutable changed-stage successor with no actions, approvals, run or effects',async()=>{
 const {service,parent}=await fixture();const id=randomUUID();const input={parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'};
 const [one,two]=await Promise.all([service.revise(owner,id,input),service.revise(owner,id,input)]);
 expect(one).toEqual(two);expect(one.saved!.id).toBe(id);expect(one.saved!.plan.crm.lifecycle).toBe('customer');expect(one.saved!.plan.observedLifecycle).toBe('lead');expect(one.saved!.plan.reply).toEqual(parent.plan.reply);
 expect((await db.query('SELECT * FROM ll_enquiry_revisions')).rowCount).toBe(1);expect((await db.query('SELECT * FROM ll_connector_actions')).rowCount).toBe(0);expect(calls).toBe(0);
 await expect(service.start(owner,parent.id,parent.plan_hash,'agent','agent')).rejects.toThrow('newer immutable');
 const fresh=new EnquiryControl(db,new WorkflowControl(db,control),async()=>({id:'1001',email:'customer@example.test',lifecycle:'lead',version:'v1'}));
 expect((await fresh.revise(owner,id,input)).saved!.id).toBe(id);
 await expect(service.revise(owner,id,{...input,lifecycle:'lead'})).rejects.toThrow('different work');
});
it('concurrent different revisions produce exactly one current successor',async()=>{
 const {service,parent}=await fixture();const input={parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'};
 const results=await Promise.allSettled([service.revise(owner,randomUUID(),input),service.revise(owner,randomUUID(),input)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);expect((await db.query('SELECT * FROM ll_enquiry_plans')).rowCount).toBe(2);
});
it('refuses foreign owner, stale parent hash, changed source and policy, without orphan successor',async()=>{
 const {service,parent,state}=await fixture();const input={parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'};
 await expect(service.revise(manager,randomUUID(),input)).rejects.toThrow('owner');await expect(service.revise(owner,randomUUID(),{...input,parentHash:'0'.repeat(64)})).rejects.toThrow('exact parent');
 await expect(service.revise({...owner,orgId:'two'},randomUUID(),input)).rejects.toThrow();
 state.version='v2';await expect(service.revise(owner,randomUUID(),input)).rejects.toThrow('Source or policy');state.version='v1';
 await db.query("UPDATE ll_connector_policies SET version=version+1 WHERE connector='crm'");await expect(service.revise(owner,randomUUID(),input)).rejects.toThrow('Source or policy');expect((await db.query('SELECT * FROM ll_enquiry_plans')).rowCount).toBe(1);
});
it('refuses revoked-reactivated owner and retains original plan bytes',async()=>{
 const {service,parent}=await fixture();await db.query('UPDATE ll_members SET active=false WHERE email=$1',[owner.subject]);await db.query('UPDATE ll_members SET active=true WHERE email=$1',[owner.subject]);
 await expect(service.revise(owner,randomUUID(),{parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'})).rejects.toThrow('membership changed');expect((await db.query('SELECT plan FROM ll_enquiry_plans WHERE id=$1',[parent.id])).rows[0].plan).toEqual(parent.plan);
});
it('revision versus submission serializes, preserving exactly one selectable path',async()=>{
 const {service,parent}=await fixture();const results=await Promise.allSettled([
 service.revise(owner,randomUUID(),{parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'}),
 service.start(owner,parent.id,parent.plan_hash,'revision-crm','revision-email',true)
 ]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 const links=(await db.query('SELECT * FROM ll_enquiry_revisions')).rowCount;const runs=(await db.query('SELECT * FROM ll_workflow_runs')).rowCount;expect((links??0)+(runs??0)).toBe(1);expect(calls).toBe(0);
});
it('submitted and uncertain work cannot be revised; preserves effect IDs and reservations',async()=>{
 const {service,parent,workflow}=await fixture();await service.start(owner,parent.id,parent.plan_hash,'revision-crm','revision-email',true);
 const run=await workflow.read(owner,parent.id);const first=run.steps[0];const a=await control.propose(owner,{actionId:first.action_id,agentId:first.agent_id,connector:'crm',payload:first.payload});await control.review(manager,a.id,a.payload_hash,true);await db.query("UPDATE ll_connector_actions SET state='uncertain' WHERE id=$1",[a.id]);
 const before=(await db.query('SELECT * FROM ll_connector_actions')).rows;
 await expect(service.revise(owner,randomUUID(),{parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'})).rejects.toThrow('Submitted');expect((await db.query('SELECT * FROM ll_connector_actions')).rows).toEqual(before);expect(calls).toBe(0);
});
it('successor gets fresh independent approval, no inherited parent approval or effect',async()=>{
 const {service,parent,workflow}=await fixture();const successor=(await service.revise(owner,randomUUID(),{parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'})).saved!;
 await service.start(owner,successor.id,successor.plan_hash,'revision-crm','revision-email',true);const run=await workflow.read(owner,successor.id);expect(run.steps[0].payload).toMatchObject({lifecycle:'customer'});
 const first=run.steps[0];const action=await control.propose(owner,{actionId:first.action_id,agentId:first.agent_id,connector:'crm',payload:first.payload});expect(action.state).toBe('held');await expect(control.review(owner,action.id,action.payload_hash,true)).rejects.toThrow('Independent');expect((await control.review(manager,action.id,action.payload_hash,true)).state).toBe('ready');expect(calls).toBe(0);
});
it('database immutable links and direct stale parent submission refuse',async()=>{
 const {service,parent}=await fixture();const successor=(await service.revise(owner,randomUUID(),{parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'})).saved!;
 await expect(db.query('DELETE FROM ll_enquiry_revisions')).rejects.toThrow('immutable');await expect(db.query("UPDATE ll_enquiry_revisions SET lifecycle='lead'")).rejects.toThrow('immutable');
 await db.query('INSERT INTO ll_workflow_runs(org_id,id,created_by) VALUES($1,$2,$3)',[owner.orgId,parent.id,owner.subject]);await expect(db.query('UPDATE ll_enquiry_plans SET run_id=$1 WHERE id=$1',[parent.id])).rejects.toThrow('Superseded');
 expect(successor.run_id).toBeNull();
});
it('source change while async lookup is in flight refuses the saved parent association',async()=>{
 const {parent}=await fixture();const service=new EnquiryControl(db,new WorkflowControl(db,control),async()=>{await db.query('UPDATE ll_members SET active=false WHERE email=$1',[owner.subject]);await db.query('UPDATE ll_members SET active=true WHERE email=$1',[owner.subject]);return{id:'1001',email:'customer@example.test',lifecycle:'lead',version:'v1'};});
 await expect(service.revise(owner,randomUUID(),{parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'})).rejects.toThrow('membership changed');expect((await db.query('SELECT * FROM ll_enquiry_revisions')).rowCount).toBe(0);
});

it('bounded structured revision refuses malformed money/content/recipient/authority fields',()=>{
 const valid={parentId:randomUUID(),parentHash:'a'.repeat(64),lifecycle:'customer'};
 expect(parseRevision(valid)).toEqual(valid);
 for(const bad of [null,[],{}, {...valid,subject:'changed'}, {...valid,recipient:'other@example.test'}, {...valid,approved:true}, {...valid,lifecycle:'discount'}, {...valid,parentHash:'bad'}, {...valid,parentId:'bad'}])expect(()=>parseRevision(bad)).toThrow();
});
it('linked chain preserves old versions, disallows revising an older leaf, and refreshes no authority',async()=>{
 const {service,parent}=await fixture();const one=(await service.revise(owner,randomUUID(),{parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'})).saved!;
 const two=(await service.revise(owner,randomUUID(),{parentId:one.id,parentHash:one.plan_hash,lifecycle:'lead'})).saved!;
 expect(two.plan.crm.lifecycle).toBe('lead');expect((await db.query('SELECT * FROM ll_enquiry_plans')).rowCount).toBe(3);
 const replay=await service.revise(owner,one.id,{parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'});expect(replay.saved!.id).toBe(one.id); // Historical artifact only; the next check still denies its submission.
 await expect(service.start(owner,one.id,one.plan_hash,'agent','agent')).rejects.toThrow('newer immutable');
 expect((await db.query('SELECT * FROM ll_connector_actions')).rowCount).toBe(0);expect(calls).toBe(0);
});

it('partial installation does not silently treat historical plan as eligible',async()=>{
 const {service,parent}=await fixture();await db.query('DROP FUNCTION ll_enquiry_revision24()');
 await expect(service.start(owner,parent.id,parent.plan_hash,'agent','agent')).rejects.toThrow('incomplete');expect((await db.query('SELECT * FROM ll_workflow_runs')).rowCount).toBe(0);
});
it('refuses aliasing, absent parent, existing successor IDs and unsupported prepared fixtures',async()=>{
 const {service,parent}=await fixture();const input={parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'};
 await expect(service.revise(owner,parent.id,input)).rejects.toThrow('new immutable');
 await expect(service.revise(owner,randomUUID(),{...input,parentId:randomUUID()})).rejects.toThrow('not found');
 const existing=(await service.prepareChat(owner,randomUUID())).saved!;await expect(service.revise(owner,existing.id,input)).rejects.toThrow('other work');
 const example=(await service.prepare(owner,randomUUID(),'service') as {saved:{id:string;plan_hash:string}}).saved;
 await expect(service.revise(owner,randomUUID(),{...input,parentId:example.id,parentHash:example.plan_hash})).rejects.toThrow('supported acknowledgement');
});

it('record enrollment revoke-reactivate cannot silently rebind the parent to fresh scope authority',async()=>{
 const scope={version:'record-scope-1' as const,workspaceId:'one',contactId:'2001',recipient:'alice@example.test'};
 const scopedProvider={...provider,contactId:scope.contactId,recordScope:scope};const scopes=new ScopeControl(db,scopedProvider);const scopeId=randomUUID();await scopes.enroll(owner,scopeId);
 const service=new EnquiryControl(db,new WorkflowControl(db,new ConnectorControl(db,scopedProvider)),async()=>({id:scope.contactId,email:scope.recipient,version:'v1',lifecycle:'lead'}));
 const parent=(await service.prepareChat(owner,randomUUID())).saved!;
 await scopes.setActive(owner,scopeId,false);await scopes.setActive(owner,scopeId,true);
 expect((await db.query('SELECT version FROM ll_connector_scopes WHERE id=$1',[scopeId])).rows[0].version).toBe(3);
 await expect(service.revise(owner,randomUUID(),{parentId:parent.id,parentHash:parent.plan_hash,lifecycle:'customer'})).rejects.toThrow('Record enrollment changed');
 expect((await db.query('SELECT * FROM ll_enquiry_plans')).rowCount).toBe(1);expect((await db.query('SELECT * FROM ll_enquiry_revisions')).rowCount).toBe(0);expect((await db.query('SELECT * FROM ll_connector_actions')).rowCount).toBe(0);expect(calls).toBe(0);
});
