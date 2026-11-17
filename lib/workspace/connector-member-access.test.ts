import {EnquiryControl} from "../enquiries/service";
import {agentDirectory,registerAgent} from "./agents";
import {companyDirectory} from "./company-profile";
import {beforeAll,beforeEach,afterAll,expect,it} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {createInstalledTenantFixture} from './installed-tenant-fixture';
import {passwordHash} from './auth';
import {memberAuthority} from './identity';
import {transaction} from '../durable/database';
import {ConnectorControl} from '../connectors/service';
import {WorkflowControl} from '../workflows/service';
import {authorize} from '../durable/service';
import {ScopeControl} from '../connectors/scopes';
import {savedProvider} from '../connectors/routing';
import type {FetchSandboxConnectors} from '../connectors/twin';
import type {ConnectorProvider} from '../connectors/contracts';
import type {Actor} from '../durable/contracts';
import {installConnectorMemberAccess} from './connector-member-access-migration';
import {parseConnectorMemberAccess,memberConnectorAllowed,connectorMemberContext,type ConnectorMemberAccess} from './connector-member-access';
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>,policy:ConnectorMemberAccess,control:ConnectorControl,scopeId:string;
const actors:Record<string,Actor>={};let calls=0;
const provider:ConnectorProvider={workspaceId:'company',bindingId:'b'.repeat(64),recordScope:{version:'record-scope-1',workspaceId:'company',contactId:'4001',recipient:'assigned@example.test'},contactId:'4001',source:async()=> 'v1',write:async()=>{calls++;return{outcome:'verified',detail:'Unit provider observation'};},inspect:async()=>({outcome:'verified',detail:'Unit provider observation'})};
beforeAll(async()=>{
 const passwords=new Map<string,string>();fixture=await createInstalledTenantFixture({tenants:['company','foreign'],salesOrg:'company',seed:async db=>{
  for(const role of ['admin','owner','reviewer','executor','observer']){const password=randomBytes(24).toString('base64url');passwords.set(role,password);await db.query('INSERT INTO ll_members(org_id,email,name,password_hash)VALUES($1,$2,$3,$4)',['company',role+'@fetchsandbox.example',role,passwordHash(password)]);}
  await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit)VALUES('company','crm',ARRAY['twin.crm'],100),('company','mail',ARRAY['twin.email'],100)");
  await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector)VALUES('company','crm','CRM','owner@fetchsandbox.example','crm_agent','crm_twin'),('company','mail','Mail','owner@fetchsandbox.example','email_agent','email_twin')");
  await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role)VALUES('crm-key','company','crm','agent'),('mail-key','company','mail','agent')");
  await db.query("INSERT INTO ll_connector_policies(org_id,connector)VALUES('company','crm'),('company','email')");
 }});
 for(const [role,password]of passwords){const token=await fixture.context.login({email:role+'@fetchsandbox.example',password});actors[role]=(await fixture.context.authenticated(token)).actor;}
 const scopes=new ScopeControl(fixture.web('company'),provider);scopeId=randomUUID();await scopes.enroll(actors.admin,scopeId);await scopes.grant(actors.admin,scopeId,'crm');await scopes.grant(actors.admin,scopeId,'mail');
 control=new ConnectorControl(fixture.web('company'),provider);
 policy={contract:'connector-member-access-1',version:1,administrators:[actors.admin.subject],members:['owner','reviewer','executor','observer'].map((role,i)=>({subject:actors[role].subject,personId:`person-${String(i+2).padStart(3,'0')}`,grants:[{agentId:'crm',connector:'crm',scopeId,bindingId:provider.bindingId,permissions:role==='owner'?['read','propose']:role==='reviewer'?['read','review']:role==='executor'?['read','execute','reconcile']:['read'],expiresAt:new Date(Date.now()+3600000).toISOString()}]}))};
 await installConnectorMemberAccess(fixture.owner,'company',policy);
},30000);
afterAll(async()=>fixture?.close());
beforeEach(async()=>{calls=0;policy.version++;await installConnectorMemberAccess(fixture.owner,'company',policy);});
const proposal=()=>({actionId:randomUUID(),agentId:'crm',connector:'crm',payload:{lifecycle:'customer'}});
const ready=async()=>{const a=await control.propose(actors.owner,proposal());return control.review(actors.reviewer,a.id,a.payload_hash,true);};
it('routes a saved scoped action for its named reader without requiring company administration',async()=>{
 const a=await control.propose(actors.owner,proposal());
 expect((await control.read(actors.owner,a.id)).id).toBe(a.id);
 const resolved=await savedProvider(fixture.web('company'),actors.owner,'action',a.id,null,false,()=>provider as FetchSandboxConnectors);
 expect(resolved.bindingId).toBe(provider.bindingId);
});
it('saved routing denies an observer mutation, another record, and a changed connection before dispatch',async()=>{
 const a=await control.propose(actors.owner,proposal());
 const resolve=(operation:'read'|'execute'='read',selected:string|null=null,factory=()=>provider as FetchSandboxConnectors)=>savedProvider(fixture.web('company'),actors.observer,'action',a.id,selected,false,factory,operation);
 await expect(resolve('execute')).rejects.toMatchObject({status:403});
 await expect(resolve('read',randomUUID())).rejects.toMatchObject({status:409});
 await expect(resolve('read',null,()=>({...provider,bindingId:'c'.repeat(64)}) as FetchSandboxConnectors)).rejects.toMatchObject({status:409});
 expect(calls).toBe(0);
});
it('employee agent directory exposes only granted agents and never offers registration authority',async()=>{
 const view=await agentDirectory(fixture.web('company'),actors.observer);
 expect(view.canManage).toBe(false);expect(view.agents.map(a=>a.id)).toEqual(['crm']);expect(view.owners).toEqual([]);
 const admin=await agentDirectory(fixture.web('company'),actors.admin);expect(admin.canManage).toBe(true);expect(admin.agents).toHaveLength(2);
 await expect(registerAgent(fixture.web('company'),actors.observer,{id:'forbidden',name:'Forbidden',owner:actors.observer.subject,role:'crm_agent',connector:'crm_twin',actionLimit:1})).rejects.toMatchObject({status:403});
});
it('named members receive only exact connector operations, broad member authority remains admin-only',async()=>{
 for(const [role,allowed]of [['admin',true],['owner',false],['observer',false]]as const)expect(await transaction(fixture.web('company'),'company',c=>memberAuthority(c,actors[role]))).toBe(allowed);
 const a=await ready();await expect(control.review(actors.observer,a.id,a.payload_hash,true)).rejects.toMatchObject({status:403});await expect(control.execute(actors.owner,a.id)).rejects.toMatchObject({status:403});expect((await control.execute(actors.executor,a.id)).state).toBe('succeeded');expect((await control.execute(actors.executor,a.id)).state).toBe('succeeded');expect(calls).toBe(1);
});
it('owner-only installation preserves idempotence, forbids runtime writes and denies unknown people or capabilities',async()=>{
 expect(await installConnectorMemberAccess(fixture.owner,'company',policy)).toMatchObject({repeated:true,version:policy.version});await expect(installConnectorMemberAccess(fixture.web('company'),'company',policy)).rejects.toThrow('owner');
 await expect(fixture.web('company').query('UPDATE ll_orgs SET connector_member_access=$2 WHERE id=$1',['company',JSON.stringify({...policy,version:policy.version+1})])).rejects.toThrow();
 await expect(installConnectorMemberAccess(fixture.owner,'foreign',{...policy,version:1})).rejects.toThrow('member');
 const bad=structuredClone(policy);bad.version++;bad.members[0].grants[0].agentId='missing';await expect(installConnectorMemberAccess(fixture.owner,'company',bad)).rejects.toThrow('capability');
 await expect(installConnectorMemberAccess(fixture.owner,'company',{...policy,version:policy.version+2})).rejects.toThrow();
});
it('wrong tool, binding, record, recipient, expired grant and absent human permission fail closed',async()=>{
 const context=connectorMemberContext(provider,'propose','crm','crm');
 for(const change of [{connector:'email'},{agentId:'mail'},{bindingId:'c'.repeat(64)},{contactId:'foreign'},{recipient:'wrong@example.test'},{operation:'execute' as const}])expect(await transaction(fixture.web('company'),'company',c=>memberConnectorAllowed(c,'company',actors.owner.subject,{...context,...change}))).toBe(false);
 expect(await transaction(fixture.web('company'),'company',c=>memberConnectorAllowed(c,'company','unknown@fetchsandbox.example',context))).toBe(false);
 const old=policy.members[0].grants[0].expiresAt;policy.members[0].grants[0].expiresAt='2020-01-01T00:00:00.000Z';policy.version++;await installConnectorMemberAccess(fixture.owner,'company',policy);await expect(control.propose(actors.owner,proposal())).rejects.toMatchObject({status:403});policy.members[0].grants[0].expiresAt=old;
});
it('policy permission reactivation never revives prior request and approval generations',async()=>{
 const a=await ready(),original=(await fixture.owner.query('SELECT membership_approval FROM ll_connector_actions WHERE id=$1',[a.id])).rows[0].membership_approval;
 const grants=structuredClone(policy.members[0].grants);policy.members[0].grants=[];policy.version++;await installConnectorMemberAccess(fixture.owner,'company',policy);await expect(control.propose(actors.owner,proposal())).rejects.toThrow();
 policy.members[0].grants=grants;policy.version++;await installConnectorMemberAccess(fixture.owner,'company',policy);expect((await control.execute(actors.executor,a.id)).state).toBe('cancelled');expect(calls).toBe(0);expect((await fixture.owner.query('SELECT membership_approval FROM ll_connector_actions WHERE id=$1',[a.id])).rows[0].membership_approval).toEqual(original);
});
it('delegated agents cannot exceed the current named owner tool and record permissions',async()=>{
 const actor:Actor={orgId:'company',role:'agent',subject:'crm',tokenHash:'crm-key'};const grants=structuredClone(policy.members[0].grants);policy.members[0].grants=[];policy.version++;await installConnectorMemberAccess(fixture.owner,'company',policy);await expect(control.propose(actor,proposal())).rejects.toThrow('owner');policy.members[0].grants=grants;
});
it('malformed owner policy and attempts to reset authority deny rather than fall back to operator',async()=>{
 await expect(fixture.owner.query("UPDATE ll_orgs SET connector_member_access=NULL WHERE id='company'")).rejects.toThrow();
 policy.version++;await fixture.owner.query("UPDATE ll_orgs SET connector_member_access=$1 WHERE id='company'",[JSON.stringify({...policy,unexpected:true})]);await expect(control.read(actors.admin,randomUUID())).rejects.toThrow();
 expect(await transaction(fixture.web('company'),'company',c=>memberConnectorAllowed(c,'company',actors.admin.subject))).toBe(false);
});
it.each(['unknown-root','bad-contract','bad-version','no-admin','duplicate-admin','invalid-member','duplicate-person','bad-tool','bad-scope','bad-binding','wildcard','duplicate-operation','duplicate-grant','bad-expiry'])( 'rejects malformed permission data: %s',kind=>{
 const p=structuredClone(policy),g=p.members[0].grants[0];if(kind==='unknown-root')Object.assign(p,{permissions:['all']});if(kind==='bad-contract')Object.assign(p,{contract:'other'});if(kind==='bad-version')p.version=0;if(kind==='no-admin')p.administrators=[];if(kind==='duplicate-admin')p.administrators.push(p.administrators[0]);if(kind==='invalid-member')p.members[0].subject='not-an-email';if(kind==='duplicate-person')p.members[1].personId=p.members[0].personId;if(kind==='bad-tool')Object.assign(g,{connector:'stripe'});if(kind==='bad-scope')g.scopeId='foreign';if(kind==='bad-binding')g.bindingId='url';if(kind==='wildcard')Object.assign(g,{permissions:['*']});if(kind==='duplicate-operation')g.permissions.push(g.permissions[0]);if(kind==='duplicate-grant')p.members[0].grants.push(g);if(kind==='bad-expiry')g.expiresAt='tomorrow';expect(()=>parseConnectorMemberAccess(p)).toThrow();
});

it('scoped members can read their company directory without being labeled administrators or saving it',async()=>{
 const snapshot=await companyDirectory(fixture.web('company'),actors.owner);expect(snapshot.canManage).toBe(false);expect(snapshot.members.find(m=>m.email===actors.owner.subject)?.access).toBe('Scoped company member');expect(snapshot.members.find(m=>m.email===actors.admin.subject)?.access).toBe('Company administrator');await expect(companyDirectory(fixture.web('company'),actors.owner,{})).rejects.toMatchObject({status:403});
});

it('scoped members cannot read a malformed run with no authorization-bearing steps',async()=>{
 const id=randomUUID();await fixture.owner.query("INSERT INTO ll_workflow_runs(org_id,id,created_by)VALUES('company',$1,$2)",[id,actors.admin.subject]);
 const workflows=new WorkflowControl(fixture.web('company'),control);
 await expect(workflows.read(actors.observer,id)).rejects.toMatchObject({status:403});
 expect((await workflows.read(actors.admin,id)).id).toBe(id);
});
it('a legacy operator token cannot impersonate a named administrator in an opted-in company',async()=>{
 const tokenHash=randomBytes(32).toString('hex');await fixture.owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role)VALUES($1,'company',$2,'operator')",[tokenHash,actors.admin.subject]);
 const legacy={...actors.admin,tokenHash};await expect(transaction(fixture.web('company'),'company',c=>authorize(c,legacy,['operator']))).rejects.toMatchObject({status:403});
});

it('lists only readable administrator-prepared record runs and fails closed after grant removal',async()=>{
 const grants=structuredClone(policy.members.map(m=>m.grants));
 try{
  for(const member of policy.members)member.grants.push({...member.grants[0],agentId:'mail',connector:'email'});
  policy.version++;await installConnectorMemberAccess(fixture.owner,'company',policy);
  const workflows=new WorkflowControl(fixture.web('company'),control);
  const enquiry=new EnquiryControl(fixture.web('company'),workflows,async()=>({id:'4001',email:'assigned@example.test',version:'v1',lifecycle:'lead'}));
  const id=randomUUID(),prepared=await enquiry.prepare(actors.admin,id,'service');
  if(!('saved' in prepared))throw Error('Saved plan required');
  await enquiry.start(actors.admin,id,prepared.saved.plan_hash,'crm','mail');
  const factory=()=>provider as FetchSandboxConnectors;
  expect((await workflows.list(actors.observer,factory)).map(r=>r.id)).toContain(id);
  const unscopedDirectory=new WorkflowControl(fixture.web('company'),new ConnectorControl(fixture.web('company'),{...provider,workspaceId:'unscoped-placeholder'}));
  expect((await unscopedDirectory.list(actors.observer,factory)).map(r=>r.id)).toContain(id);
  const selected=await savedProvider(fixture.web('company'),actors.owner,'run',id,null,false,factory,'propose');expect(selected.bindingId).toBe(provider.bindingId);
  policy.members.find(m=>m.subject===actors.observer.subject)!.grants=[];policy.version++;await installConnectorMemberAccess(fixture.owner,'company',policy);
  expect((await workflows.list(actors.observer,factory)).map(r=>r.id)).not.toContain(id);
  await expect(savedProvider(fixture.web('company'),actors.observer,'run',id,null,false,factory)).rejects.toMatchObject({status:403});
 }finally{policy.members.forEach((m,i)=>{m.grants=grants[i];});}
});
