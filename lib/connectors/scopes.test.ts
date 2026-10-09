import {TemporalOutbox} from "../../runtime/temporal/outbox";
import {recordActivities} from "../../runtime/temporal/record-routing";
import {versionedActivities,type RunContract} from "../../runtime/temporal/version-contract";
import {activities} from "../../runtime/temporal/activities";
import {EnquiryRunner} from "../enquiries/runner";
import {readFile} from "node:fs/promises";
import {randomBytes,randomUUID} from "node:crypto";
import {Pool} from "pg";
import {beforeAll,beforeEach,afterAll,it,expect,vi} from "vitest";
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
vi.mock("../durable/database",async original=>({...await original<typeof import("../durable/database")>(),database:()=>db}));
const scope={version:"record-scope-1" as const,workspaceId:"one",contactId:"2001",recipient:"alice@example.test"};
beforeAll(async()=>{
 if(!process.env.LOOPLABS_TEST_DATABASE_URL)throw Error("Dedicated PostgreSQL is required.");
 admin=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 db=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 for(const f of ["lib/durable/schema.sql","lib/workspace/schema.sql","lib/refunds/schema.sql","lib/connectors/schema.sql","lib/workflows/schema.sql","lib/durable/proposal-schema.sql","lib/durable/recovery-schema.sql","lib/enquiries/schema.sql","lib/enquiries/managed-schema.sql","lib/connectors/scope-schema.sql","lib/enquiries/temporal-schema.sql","lib/enquiries/record-routing-schema.sql"])await db.query(await readFile(f,"utf8"));
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

it("onboards only trusted catalog records and requires explicit non-stale record authority changes",async()=>{
 const {RecordOnboarding,providerForScope}=await import("./catalog");const old=process.env.LOOPLABS_RECORD_CATALOG,hosted=process.env.LOOPLABS_FETCHSANDBOX_BINDING;
 process.env.LOOPLABS_RECORD_CATALOG=JSON.stringify({records:[scope]});delete process.env.LOOPLABS_FETCHSANDBOX_BINDING;
 try{
 const service=new RecordOnboarding(db,()=>provider),id=randomUUID();
 const list=await service.list(operator);expect(list.available).toBe(true);expect(list.records).toEqual([]);expect(list.grants).toEqual([]);expect(JSON.stringify(list)).not.toContain(provider.bindingId);
 await expect(service.list(agent)).rejects.toThrow();expect((await service.list(other)).candidates).toEqual([]);
 await expect(service.change(agent,{operation:"enroll",id,recordKey:list.candidates[0].key})).rejects.toThrow();
 await expect(service.change(operator,{operation:"enroll",id,recordKey:"forged"})).rejects.toThrow("supported record");
 for(const p of [{operation:"enroll",id,recordKey:list.candidates[0].key,recipient:"forged@example.test"},{operation:"unknown"},{operation:"grant",scopeId:"bad",agentId:"agent"}])await expect(service.change(operator,p)).rejects.toThrow();
 await service.change(operator,{operation:"enroll",id,recordKey:list.candidates[0].key});await service.change(operator,{operation:"enroll",id,recordKey:list.candidates[0].key});
 await expect(providerForScope(db,other,id,()=>provider)).rejects.toThrow("not found");await expect(providerForScope(db,operator,id,()=>({...provider,bindingId:"b".repeat(64)}))).rejects.toThrow("differs");
 await service.change(operator,{operation:"grant",scopeId:id,agentId:"agent"});await service.change(operator,{operation:"grant",scopeId:id,agentId:"agent"});
 expect((await service.list(operator)).grants).toHaveLength(1);expect(writes).toBe(0);
 await service.change(operator,{operation:"setGrantActive",scopeId:id,agentId:"agent",active:false,expectedVersion:1});
 await expect(service.change(operator,{operation:"setGrantActive",scopeId:id,agentId:"agent",active:true,expectedVersion:1})).rejects.toThrow("Refresh");
 await service.change(operator,{operation:"setGrantActive",scopeId:id,agentId:"agent",active:true,expectedVersion:2});
 await service.change(operator,{operation:"setScopeActive",scopeId:id,active:false,expectedVersion:1});
 await expect(service.change(operator,{operation:"setScopeActive",scopeId:id,active:true,expectedVersion:1})).rejects.toThrow("Refresh");
 await service.change(operator,{operation:"setScopeActive",scopeId:id,active:true,expectedVersion:2});
 for(const version of [0,NaN,1.2])await expect(scopes.setActive(operator,id,false,undefined,version)).rejects.toThrow("valid");
 for(const p of [{operation:"setScopeActive",scopeId:id,active:true,expectedVersion:0},{operation:"grant",scopeId:id,agentId:"agent",extra:true},{operation:"setGrantActive",scopeId:id,active:true,expectedVersion:3}])await expect(service.change(operator,p)).rejects.toThrow("supported record operation");
 process.env.LOOPLABS_FETCHSANDBOX_BINDING="configured";expect((await service.list(operator)).available).toBe(false);expect((await service.list(operator)).candidates).toEqual([]);await expect(service.change(operator,{operation:"grant",scopeId:id,agentId:"agent"})).rejects.toThrow("does not support");
 delete process.env.LOOPLABS_FETCHSANDBOX_BINDING;
 await db.query("ALTER TABLE ll_connector_scopes RENAME TO hidden_scopes");try{expect((await service.list(operator)).available).toBe(false);await expect(providerForScope(db,operator,id,()=>provider)).rejects.toThrow("unavailable");}finally{await db.query("ALTER TABLE hidden_scopes RENAME TO ll_connector_scopes");}
 }finally{if(old===undefined)delete process.env.LOOPLABS_RECORD_CATALOG;else process.env.LOOPLABS_RECORD_CATALOG=old;if(hosted===undefined)delete process.env.LOOPLABS_FETCHSANDBOX_BINDING;else process.env.LOOPLABS_FETCHSANDBOX_BINDING=hosted;}
});

it("resolves saved plan/run/action destinations without caller retargeting or legacy fallback",async()=>{
 const {savedProvider,selectedProvider}=await import("./routing");type Connected=import("./routing").ConnectedProvider;
 const bound={...provider,contact:async()=>({id:scope.contactId,properties:{email:scope.recipient,lifecyclestage:"lead"},updatedAt:"v1"})} as unknown as Connected;
 let defaults=0;const factory=(s?:typeof scope)=>{if(!s){defaults++;return {...bound,recordScope:undefined} as Connected;}expect(s).toEqual(scope);return bound;};
 const {scopeId,flow,plan}=await routed();
 expect(await selectedProvider(db,operator,scopeId,factory)).toBe(bound);
 expect(await savedProvider(db,operator,"plan",plan.id,null,false,factory)).toBe(bound);
 expect(await savedProvider(db,operator,"run",plan.id,null,false,factory)).toBe(bound);
 const step=(await flow.read(operator,plan.id)).steps[0];expect(await savedProvider(db,operator,"action",step.action_id,null,false,factory)).toBe(bound);
 expect(await savedProvider(db,operator,"proposal",step.action_id,null,false,factory)).toBe(bound);
 for(const [kind,id] of [["plan",plan.id],["run",plan.id],["action",step.action_id]] as const){await expect(savedProvider(db,operator,kind,id,randomUUID(),false,factory)).rejects.toThrow("record saved");await expect(savedProvider(db,other,kind,id,null,false,factory)).rejects.toThrow("not found");}
 const emailStep=(await flow.read(operator,plan.id)).steps[1];await expect(savedProvider(db,agent,"action",emailStep.action_id,null,false,factory)).rejects.toThrow("not found");await expect(savedProvider(db,agent,"proposal",emailStep.action_id,null,false,factory)).rejects.toThrow("not found");
 await expect(savedProvider(db,agent,"plan",plan.id,null,false,factory)).rejects.toThrow();
 await expect(savedProvider(db,operator,"run",randomUUID(),null,false,factory)).rejects.toThrow("not found");
 expect(await savedProvider(db,operator,"plan",randomUUID(),scopeId,true,factory)).toBe(bound);
 await expect(savedProvider(db,operator,"plan",randomUUID(),scopeId,false,factory)).rejects.toThrow("not found");
 expect(defaults).toBe(0);
 await selectedProvider(db,operator,null,factory);await savedProvider(db,operator,"proposal",randomUUID(),null,false,factory);expect(defaults).toBe(2);expect(writes).toBe(0);
});
it("submits scoped chat with existing grants, saves held actions idempotently and pins durable ownership",async()=>{
 const {submitScoped}=await import("../enquiries/submission"),{EnquiryChat}=await import("../enquiries/chat");
 const id=await enrolled();await scopes.grant(operator,id,"email");const flow=new WorkflowControl(db,control),enquiries=new EnquiryControl(db,flow,async()=>({id:scope.contactId,email:scope.recipient,version:"v1",lifecycle:"lead"}));
 const intent={job:"acknowledgement",customerEmail:scope.recipient,askFirst:true,rehearsal:true,extraActions:false};const chat=new EnquiryChat(enquiries,{interpret:async()=>intent});
 const mismatch=await chat.respond(operator,randomUUID(),[{role:"user",text:"Rehearse customer@example.test and ask first"}]);expect(mismatch).toHaveProperty("clarification");expect((await enquiries.list(operator)).length).toBe(0);
 const missing=new EnquiryChat(enquiries,{interpret:async()=>({...intent,customerEmail:null})});expect(await missing.respond(operator,randomUUID(),[{role:"user",text:"Rehearse and ask first"}])).toHaveProperty("clarification",expect.stringContaining(scope.recipient));
 const result=await chat.respond(operator,randomUUID(),[{role:"user",text:`Check CRM for ${scope.recipient}, prepare an acknowledgement, ask first and rehearse.`}]);const plan=(result as {saved:{id:string;plan_hash:string}}).saved;
 expect(plan).toBeDefined();expect(writes).toBe(0);
 await expect(submitScoped(enquiries,operator,plan.id,plan.plan_hash,"agent","email","")).rejects.toThrow("compatible durable");expect((await flow.list(operator)).length).toBe(0);
 const requests=await Promise.all([submitScoped(enquiries,operator,plan.id,plan.plan_hash,"agent","email","ack-"+"c".repeat(64)),submitScoped(enquiries,operator,plan.id,plan.plan_hash,"agent","email","ack-"+"c".repeat(64))]);expect(requests[0]).toEqual(requests[1]);expect(writes).toBe(0);
 const run=await flow.read(operator,plan.id);expect(run.steps.map((s:{state:string|null})=>s.state)).toEqual(["held","held"]);expect(run.steps[1].proposedRequest?.body).toHaveProperty("to",[scope.recipient]);
 expect((await db.query("SELECT count(*)::int n FROM ll_temporal_dispatch")).rows[0].n).toBe(1);expect((await db.query("SELECT count(*)::int n FROM ll_connector_actions")).rows[0].n).toBe(2);
 await expect(submitScoped(enquiries,reviewer,plan.id,plan.plan_hash,"agent","email","ack-"+"c".repeat(64))).rejects.toThrow("Only the plan owner");
 await scopes.setActive(operator,id,false,"email");await expect(submitScoped(enquiries,operator,plan.id,plan.plan_hash,"agent","email","ack-"+"c".repeat(64))).rejects.toThrow("record grant");expect(writes).toBe(0);
});

it("refuses malformed scoped saved metadata and preserves legacy destination semantics",async()=>{
 const {savedProvider}=await import("./routing");const {plan}=await routed();const id=randomUUID();
 await db.query("INSERT INTO ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by) SELECT org_id,$2,fixture_id,source_version,policy_versions,plan-'recordEnrollment',plan_hash,created_by FROM ll_enquiry_plans WHERE id=$1",[plan.id,id]);
 await expect(savedProvider(db,operator,"plan",id)).rejects.toThrow("missing or inconsistent");
 const legacy=randomUUID();await db.query("INSERT INTO ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by) SELECT org_id,$2,fixture_id,source_version,policy_versions,plan-'recordEnrollment'-'requests',plan_hash,created_by FROM ll_enquiry_plans WHERE id=$1",[plan.id,legacy]);
 await expect(savedProvider(db,operator,"plan",legacy,randomUUID())).rejects.toThrow("record saved");
 await expect(savedProvider(db,operator,"plan","bad")).rejects.toThrow("stable enquiry ID");expect(writes).toBe(0);
});

it("exposes bounded scoped submission through the invited API without weaker legacy paths or approval",async()=>{
 const hosted=await import("./hosted"),{NextRequest}=await import("next/server"),{GET,POST}=await import("@/app/api/workspace/enquiries/route");
 const scopeId=await enrolled();await scopes.grant(operator,scopeId,"email");
 const bound={...provider,contact:async()=>({id:scope.contactId,properties:{email:scope.recipient,lifecyclestage:"lead"},updatedAt:"v1"})} as unknown as import("./routing").ConnectedProvider;
 const mocked=vi.spyOn(hosted,"connectorProvider").mockImplementation((()=>bound) as typeof hosted.connectorProvider);
 const key=randomBytes(32).toString("base64url");await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','operator','operator')",[tokenHash(key)]);
 const origin="https://looplabs.run",url=origin+"/api/workspace/enquiries?scope="+scopeId;
 const req=(p?:object,scopeIdOverride?:string)=>new NextRequest(scopeIdOverride?origin+"/api/workspace/enquiries?scope="+scopeIdOverride:url,{method:p?"POST":"GET",headers:{Authorization:`Bearer ${key}`,Origin:origin,"Content-Type":"application/json"},...(p?{body:JSON.stringify(p)}:{})});
 const oldWorkspace=process.env.LOOPLABS_TEMPORAL_WORKSPACE,oldBuild=process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID,oldEpoch=process.env.LOOPLABS_RECOVERY_EPOCH;
 const recoveryEpoch=randomUUID();await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('one',$1),('two',$1)",[recoveryEpoch]);
 try{
 const plan=(await new EnquiryControl(db,new WorkflowControl(db,control),async()=>({id:scope.contactId,email:scope.recipient,version:"v1",lifecycle:"lead"})).prepareChat(operator,randomUUID())).saved;
 const p={operation:"submit",id:plan.id,planHash:plan.plan_hash,crmAgent:"agent",emailAgent:"email"};
 delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;delete process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID;
 expect((await POST(req(p))).status).toBe(409);expect((await db.query("SELECT count(*)::int n FROM ll_workflow_runs")).rows[0].n).toBe(0);
 process.env.LOOPLABS_TEMPORAL_WORKSPACE="staging";delete process.env.LOOPLABS_RECOVERY_EPOCH;expect((await POST(req(p))).status).toBe(503);process.env.LOOPLABS_RECOVERY_EPOCH=recoveryEpoch;expect((await POST(req(p))).status).toBe(409);expect((await db.query("SELECT count(*)::int n FROM ll_workflow_runs")).rows[0].n).toBe(0);
 process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID="ack-"+"c".repeat(64);
 expect(await (await GET(req())).json()).toHaveProperty("connections.recordDurableAvailable",true);
 expect((await POST(req({...p,recipient:"wrong@example.test"}))).status).toBe(400);
 expect((await POST(req({...p,operation:"start"}))).status).toBe(409);expect((await POST(req({operation:"rehearse",id:plan.id,planHash:plan.plan_hash}))).status).toBe(409);
 expect((await POST(req(p,randomUUID()))).status).toBe(409);
 expect((await POST(req(p))).status).toBe(200);expect((await POST(req({operation:"resume",id:plan.id,planHash:plan.plan_hash}))).status).toBe(200);
 expect((await db.query("SELECT count(*)::int n FROM ll_connector_actions WHERE state='held'")).rows[0].n).toBe(2);expect(writes).toBe(0);
 const before=(await db.query("SELECT count(*)::int n FROM ll_agents")).rows[0].n;expect(before).toBe(3);
 }finally{if(oldEpoch===undefined)delete process.env.LOOPLABS_RECOVERY_EPOCH;else process.env.LOOPLABS_RECOVERY_EPOCH=oldEpoch;mocked.mockRestore();if(oldWorkspace===undefined)delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;else process.env.LOOPLABS_TEMPORAL_WORKSPACE=oldWorkspace;if(oldBuild===undefined)delete process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID;else process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID=oldBuild;}
});
