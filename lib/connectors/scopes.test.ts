import {TemporalOutbox} from "../../runtime/temporal/outbox";
import {recordActivities} from "../../runtime/temporal/record-routing";
import {versionedActivities,type RunContract} from "../../runtime/temporal/version-contract";
import {activities} from "../../runtime/temporal/activities";
import {EnquiryRunner} from "../enquiries/runner";
import {readFile} from "node:fs/promises";
import {randomBytes,randomUUID} from "node:crypto";
import {Pool} from "pg";
import {beforeAll,beforeEach,afterAll,it,expect} from "vitest";
import {authenticate,tokenHash} from "../durable/service";
import {transaction} from "../durable/database";
import type {Actor} from "../durable/contracts";
import type {ConnectorAction,ConnectorProvider} from "./contracts";
import {ScopeControl,currentScopeGrant,scopeEnrollment,scopedGrantMatches} from "./scopes";
import {ConnectorControl} from "./service";
import {WorkflowControl} from "../workflows/service";
import {EnquiryControl} from "../enquiries/service";
const schema=`scopes_${randomBytes(8).toString("hex")}`;
let db:Pool,admin:Pool,operator:Actor,reviewer:Actor,agent:Actor,worker:Actor,other:Actor,scopes:ScopeControl,control:ConnectorControl;
let writes=0,source:string|null="v1",gate:Promise<void>|undefined;
let provider:ConnectorProvider;
const scope={version:"record-scope-1" as const,workspaceId:"one",contactId:"2001",recipient:"alice@example.test"};
beforeAll(async()=>{
 if(!process.env.LOOPLABS_TEST_DATABASE_URL)throw Error("Dedicated PostgreSQL is required.");
 admin=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 db=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 for(const f of ["lib/durable/schema.sql","lib/workspace/schema.sql","lib/refunds/schema.sql","lib/connectors/schema.sql","lib/workflows/schema.sql","lib/durable/proposal-schema.sql","lib/enquiries/schema.sql","lib/enquiries/managed-schema.sql","lib/connectors/scope-schema.sql","lib/enquiries/temporal-schema.sql","lib/enquiries/record-routing-schema.sql"])await db.query(await readFile(f,"utf8"));
});
beforeEach(async()=>{
 await db.query("TRUNCATE ll_orgs CASCADE");await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
 await db.query("INSERT INTO ll_members(org_id,email,name,password_hash) VALUES('one','owner','Owner','unused'),('one','operator','Operator','unused'),('one','reviewer','Reviewer','unused')");
 await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('one','agent',ARRAY['twin.crm','twin.email'],100),('one','email',ARRAY['twin.email'],100),('one','unowned',ARRAY['twin.crm'],100)");
 await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES('one','agent','CRM','owner','crm_agent','crm_twin'),('one','email','Email','owner','email_agent','email_twin')");
 await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('one','crm'),('one','email')");
 const actors:Actor[]=[];
 for(const [org,subject,role] of [["one","operator","operator"],["one","reviewer","operator"],["one","agent","agent"],["one","worker","worker"],["two","other","operator"],["one","email","agent"],["one","unowned","agent"]]){
  const key=randomBytes(32).toString("base64url");await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,$4)",[tokenHash(key),org,subject,role]);actors.push(await authenticate(db,key));
 }
 [operator,reviewer,agent,worker,other]=actors;writes=0;source="v1";gate=undefined;
 provider={bindingId:"a".repeat(64),workspaceId:"one",contactId:scope.contactId,recordScope:scope,source:async()=>source,write:async()=>{writes++;if(gate)await gate;return {outcome:"verified",detail:"Fixture accepted"};},inspect:async()=>({outcome:"verified",detail:"Fixture readback"})};
 scopes=new ScopeControl(db,provider);control=new ConnectorControl(db,provider);
});
afterAll(async()=>{await db?.end();await admin?.query(`DROP SCHEMA ${schema} CASCADE`);await admin?.end();});
async function enrolled(){const id=randomUUID();await scopes.enroll(operator,id);await scopes.grant(operator,id,"agent");return id;}
async function proposed(){return control.propose(agent,{actionId:randomUUID(),agentId:"agent",connector:"crm",payload:{lifecycle:"lead"}});}
it("enrolls idempotently and never reactivates authority on repeat enrollment/grant",async()=>{
 const id=randomUUID(),rows=await Promise.all([scopes.enroll(operator,id),scopes.enroll(operator,id)]);expect(rows[0]).toEqual(rows[1]);
 const grants=await Promise.all([scopes.grant(operator,id,"agent"),scopes.grant(operator,id,"agent")]);expect(grants[0]).toEqual(grants[1]);
 expect((await db.query("SELECT kind FROM ll_connector_scope_events ORDER BY id")).rows.map(r=>r.kind)).toEqual(["enrolled","agent_granted"]);
 expect(await transaction(db,"one",c=>currentScopeGrant(c,"one","agent",provider))).toEqual({scopeId:id,scopeVersion:1,grantVersion:1});
 await scopes.setActive(operator,id,false,"agent");expect((await scopes.grant(operator,id,"agent")).active).toBe(false);
 await scopes.setActive(operator,id,false);expect((await scopes.enroll(operator,id)).active).toBe(false);
 await expect(scopes.enroll(operator,randomUUID())).rejects.toThrow("another scope");
});
it("requires current enrollment and named-owner agent grant and rejects scope injection",async()=>{
 await expect(proposed()).rejects.toThrow("record grant");const id=randomUUID();await scopes.enroll(operator,id);await expect(proposed()).rejects.toThrow("record grant");
 await expect(scopes.grant(operator,id,"unowned")).rejects.toThrow("invited owner");
 await scopes.grant(operator,id,"agent");const a=await proposed();expect(a.payload.scopeGrant).toEqual({scopeId:id,scopeVersion:1,grantVersion:1});
 await expect(control.propose(agent,{actionId:randomUUID(),agentId:"agent",connector:"crm",payload:{lifecycle:"lead",scopeGrant:a.payload.scopeGrant}})).rejects.toThrow("prepared");
 expect((await control.review(reviewer,a.id,a.payload_hash,true)).state).toBe("ready");expect((await control.execute(worker,a.id)).state).toBe("succeeded");expect(writes).toBe(1);
 expect((await control.propose(agent,{actionId:a.id,agentId:"agent",connector:"crm",payload:{lifecycle:"lead"}})).payload_hash).toBe(a.payload_hash);
});
it.each(["grant","scope","owner"])("revokes %s before approval/dispatch and reactivation cannot revive old approvals",async kind=>{
 const id=await enrolled(),a=await proposed();await control.review(reviewer,a.id,a.payload_hash,true);
 if(kind==="owner")await db.query("UPDATE ll_members SET active=false WHERE email='owner'");else await scopes.setActive(operator,id,false,kind==="grant"?"agent":undefined);
 expect((await control.execute(worker,a.id)).state).toBe("cancelled");expect(writes).toBe(0);
 if(kind==="owner")return;
 await scopes.setActive(operator,id,true,kind==="grant"?"agent":undefined);
 expect((await control.execute(worker,a.id)).state).toBe("cancelled");expect(writes).toBe(0);
 const b=await proposed();expect(b.payload.scopeGrant?.[kind==="grant"?"grantVersion":"scopeVersion"]).toBe(3);expect((await control.review(reviewer,b.id,b.payload_hash,true)).state).toBe("ready");
});
it("revocation after a possible effect preserves uncertainty through reconciliation and cannot resend",async()=>{
 const id=await enrolled(),a=await proposed();await control.review(reviewer,a.id,a.payload_hash,true);let release!:()=>void;gate=new Promise<void>(r=>{release=r;});
 const execution=control.execute(worker,a.id);while(writes===0)await new Promise(r=>setTimeout(r,1));await scopes.setActive(operator,id,false,"agent");release();
 expect((await execution).state).toBe("uncertain");const reconciled=await control.reconcile(operator,a.id);expect(reconciled.state).toBe("uncertain");expect(reconciled.evidence).toMatchObject({outcome:"verified"});
 await scopes.setActive(operator,id,true,"agent");expect((await control.reconcile(operator,a.id)).state).toBe("uncertain");await control.execute(worker,a.id);expect(writes).toBe(1);
});
it("freezes enrollment into plans and requires grants for both agents before starting",async()=>{
 const flow=new WorkflowControl(db,control),enquiry=new EnquiryControl(db,flow,async()=>({id:"2001",email:scope.recipient,version:"v1",lifecycle:"lead"}));
 await expect(enquiry.prepare(operator,randomUUID(),"service")).rejects.toThrow("enrolled record");const id=await enrolled(),plan=(await enquiry.prepare(operator,randomUUID(),"service") as {saved:{id:string;plan_hash:string;plan:object}}).saved;
 expect(plan.plan).toHaveProperty("recordEnrollment",{id,version:1});await expect(enquiry.start(operator,plan.id,plan.plan_hash,"agent","email")).rejects.toThrow("record grant");
 await scopes.grant(operator,id,"email");await enquiry.start(operator,plan.id,plan.plan_hash,"agent","email");const run=await flow.read(operator,plan.id);
 await scopes.setActive(operator,id,false);await scopes.setActive(operator,id,true);
 await expect(enquiry.start(operator,plan.id,plan.plan_hash,"agent","email")).rejects.toThrow("enrollment changed");
 const step=run.steps[0];await expect(control.propose(agent,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload})).rejects.toThrow("authority changed after plan review");expect(writes).toBe(0);
});
it("rejects malformed, cross-workspace, missing and unavailable administrative operations",async()=>{
 for(const id of ["", "bad",42 as unknown as string])await expect(scopes.enroll(operator,id)).rejects.toThrow("valid");
 await expect(scopes.enroll(agent,randomUUID())).rejects.toThrow();await expect(scopes.enroll(other,randomUUID())).rejects.toThrow("workspace");
 await expect(new ScopeControl(db,{...provider,recordScope:undefined}).enroll(operator,randomUUID())).rejects.toThrow("server-enrolled");
 await expect(new ScopeControl(db,{...provider,bindingId:"bad"}).enroll(operator,randomUUID())).rejects.toThrow("destination");
 source=null;await expect(scopes.enroll(operator,randomUUID())).rejects.toThrow("version");source="v1";
 const id=await enrolled();await expect(scopes.grant(operator,id,"bad/agent")).rejects.toThrow("registered");await expect(scopes.grant(operator,randomUUID(),"agent")).rejects.toThrow("matching enrollment");
 await expect(scopes.setActive(operator,id,"true" as unknown as boolean)).rejects.toThrow("authority change");await expect(scopes.setActive(operator,id,true,"bad/agent")).rejects.toThrow();await expect(scopes.setActive(operator,randomUUID(),false)).rejects.toThrow("Scope not found");await expect(scopes.setActive(operator,id,false,"missing")).rejects.toThrow("Grant not found");
 expect((await scopes.setActive(operator,id,true)).version).toBe(1);
 await db.query("ALTER TABLE ll_connector_scopes RENAME TO hidden_scopes");try{
  await expect(scopes.enroll(operator,id)).rejects.toThrow("administrator setup");expect(await transaction(db,"one",c=>scopeEnrollment(c,"one",provider))).toBeNull();
 }finally{await db.query("ALTER TABLE hidden_scopes RENAME TO ll_connector_scopes");}
});
it("strictly validates saved grant snapshots instead of adopting current authority",async()=>{
 const id=await enrolled(),a=await proposed();for(const saved of [undefined,null,[],{...a.payload.scopeGrant,scopeId:"bad"},{...a.payload.scopeGrant,scopeVersion:0},{...a.payload.scopeGrant,grantVersion:0},{...a.payload.scopeGrant,extra:true},{...a.payload.scopeGrant,scopeId:randomUUID()},{...a.payload.scopeGrant,scopeVersion:2}])expect(await transaction(db,"one",c=>scopedGrantMatches(c,"one",{...a,payload:{...a.payload,scopeGrant:saved}} as ConnectorAction,provider))).toBe(false);
 expect(await transaction(db,"one",c=>scopedGrantMatches(c,"one",a,{...provider,recordScope:undefined}))).toBe(false);
 await expect(scopes.grant(operator,id,"missing")).rejects.toThrow();
});
it("database refuses scope/grant retargeting, deletion and authority version rollback",async()=>{
 const id=await enrolled();for(const sql of ["UPDATE ll_connector_scopes SET recipient='other@example.test'", "UPDATE ll_connector_scopes SET binding_id=repeat('b',64)","DELETE FROM ll_connector_scopes","UPDATE ll_connector_scopes SET active=false","UPDATE ll_connector_scopes SET version=2","UPDATE ll_connector_scope_grants SET agent_id='email'","DELETE FROM ll_connector_scope_grants","UPDATE ll_connector_scope_grants SET active=false"]){await expect(db.query(sql)).rejects.toMatchObject({code:"23514"});}
 await scopes.setActive(operator,id,false);await expect(db.query("UPDATE ll_connector_scopes SET active=true,version=1")).rejects.toMatchObject({code:"23514"});
});
it("refuses authority revoked before approval and freezes the saved grant snapshot in PostgreSQL",async()=>{
 const id=await enrolled(),a=await proposed();await scopes.setActive(operator,id,false,"agent");expect((await control.review(reviewer,a.id,a.payload_hash,true)).state).toBe("cancelled");
 await expect(db.query("UPDATE ll_connector_actions SET payload=jsonb_set(payload,'{scopeGrant,grantVersion}','3'::jsonb) WHERE id=$1",[a.id])).rejects.toMatchObject({code:"23514"});
 expect(writes).toBe(0);
});
it("holds downstream execution when an independently approved predecessor's record grant is revoked",async()=>{
 const id=await enrolled();await scopes.grant(operator,id,"email");const flow=new WorkflowControl(db,control),runId=randomUUID();await flow.create(operator,"agent","email",runId,"lead");const run=await flow.read(operator,runId);
 for(const step of run.steps){const a=await control.propose(operator,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});await control.review(reviewer,a.id,a.payload_hash,true);}
 expect((await control.execute(worker,run.steps[0].action_id)).state).toBe("succeeded");await scopes.setActive(operator,id,false,"agent");
 await expect(control.execute(worker,run.steps[1].action_id)).rejects.toThrow("preceding step");expect(writes).toBe(1);
});

async function routed(){
 const scopeId=await enrolled();await scopes.grant(operator,scopeId,"email");
 const flow=new WorkflowControl(db,control),enquiry=new EnquiryControl(db,flow,async()=>({id:"2001",email:scope.recipient,version:"v1",lifecycle:"lead"}));
 const plan=(await enquiry.prepare(operator,randomUUID(),"service") as {saved:{id:string;plan_hash:string}}).saved;
 await enquiry.start(operator,plan.id,plan.plan_hash,"agent","email",true);
 for(const step of (await flow.read(operator,plan.id)).steps)await control.propose(operator,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});
 const key=randomBytes(32).toString("base64url");await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','enquiry-temporal','worker')",[tokenHash(key)]);
 const temporal=await authenticate(db,key),input:RunContract={runId:plan.id,planHash:plan.plan_hash,planVersion:"acknowledgement-1",connectorVersion:"private-record-twin-2"};
 return {scopeId,flow,plan,temporal,input};
}
it("persists immutable scoped Temporal ownership and resolves only that run's enrolled provider",async()=>{
 const {flow,plan,temporal,input}=await routed(),outbox=new TemporalOutbox(db,"ack-"+"c".repeat(64));
 await expect(new TemporalOutbox(db,"").transfer(operator,plan.id)).rejects.toThrow("explicit compatible");
 const ids=await Promise.all([outbox.transfer(operator,plan.id),outbox.transfer(operator,plan.id)]);expect(ids[0]).toBe(ids[1]);
 const route=(await db.query("SELECT * FROM ll_temporal_record_routes")).rows[0];expect(route.scope_version).toBe(1);expect(route.worker_build_id).toBe("ack-"+"c".repeat(64));
 const factory=(s:typeof scope)=>{expect(s).toEqual(scope);return provider;};
 const next=versionedActivities(db,temporal,activities(flow,temporal),recordActivities(db,temporal,factory,"ack-"+"c".repeat(64)));
 expect(await next.advanceContract(input)).toBe("waiting");expect(writes).toBe(0);
 for(const step of (await flow.read(operator,plan.id)).steps)await control.review(reviewer,step.action_id,step.payload_hash,true);
 expect(await next.advanceContract(input)).toBe("completed");expect(writes).toBe(2);
 expect(await next.advanceContract(input)).toBe("completed");expect(writes).toBe(2);
 for(const sql of ["UPDATE ll_temporal_record_routes SET scope_version=2","DELETE FROM ll_temporal_record_routes","UPDATE ll_temporal_dispatch SET connector_version='private-twin-1'"])await expect(db.query(sql)).rejects.toThrow();
});
it("excludes scoped work from legacy runner before transfer and refuses stale grants at transfer",async()=>{
 const {scopeId,flow,plan}=await routed();
 const key=randomBytes(32).toString("base64url");await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','enquiry-runner','worker')",[tokenHash(key)]);
 const legacy=await authenticate(db,key);expect(await new EnquiryRunner(db,flow).tick(legacy)).toBe(0);expect(writes).toBe(0);
 await scopes.setActive(operator,scopeId,false,"agent");await scopes.setActive(operator,scopeId,true,"agent");
 await expect(new TemporalOutbox(db,"ack-"+"c".repeat(64)).transfer(operator,plan.id)).rejects.toThrow("exact record grants");
 expect((await db.query("SELECT count(*)::int n FROM ll_temporal_dispatch")).rows[0].n).toBe(0);expect(writes).toBe(0);
});
it("refuses absent routes, tenant substitution, provider changes and revoked scope without fallback",async()=>{
 const {scopeId,flow,plan,temporal,input}=await routed();let factories=0;
 const next=recordActivities(db,temporal,()=>{factories++;return provider;},"ack-"+"c".repeat(64));
 await expect(next(input)).rejects.toThrow("unavailable");expect(factories).toBe(0);
 await new TemporalOutbox(db,"ack-"+"c".repeat(64)).transfer(operator,plan.id);
 await expect(recordActivities(db,temporal,()=>provider,"ack-"+"d".repeat(64))(input)).rejects.toThrow("pinned worker");
 await expect(recordActivities(db,temporal,()=>({...provider,bindingId:"b".repeat(64)}),"ack-"+"c".repeat(64))(input)).rejects.toThrow("Configured provider");
 await expect(recordActivities(db,worker,()=>provider,"ack-"+"c".repeat(64))(input)).rejects.toThrow("Compatible Temporal");
 await expect(next({...input,planHash:"b".repeat(64)})).rejects.toThrow("unavailable");
 await expect(recordActivities(db,temporal,()=>provider,"")(input)).rejects.toThrow("verified record worker");
 await expect(next({...input,connectorVersion:"private-twin-1"})).rejects.toThrow("Unsupported");
 await expect(recordActivities(db,temporal,()=>({...provider,recordScope:undefined}),"ack-"+"c".repeat(64))(input)).rejects.toThrow("Configured provider");
 const otherKey=randomBytes(32).toString("base64url");await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'two','enquiry-temporal','worker')",[tokenHash(otherKey)]);
 await expect(recordActivities(db,await authenticate(db,otherKey),()=>provider,"ack-"+"c".repeat(64))(input)).rejects.toThrow("unavailable");
 await db.query("ALTER TABLE ll_temporal_record_routes RENAME TO hidden_routes");try{await expect(next(input)).rejects.toThrow("routing is unavailable");}finally{await db.query("ALTER TABLE hidden_routes RENAME TO ll_temporal_record_routes");}
 await scopes.setActive(operator,scopeId,false);await expect(next(input)).rejects.toThrow("unavailable");await scopes.setActive(operator,scopeId,true);await expect(next(input)).rejects.toThrow("unavailable");
 expect(factories).toBe(0);expect(writes).toBe(0);expect((await flow.read(operator,plan.id)).steps[0].state).toBe("held");
});
