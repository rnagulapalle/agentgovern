import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {createInstalledTenantFixture} from './installed-tenant-fixture';
import {passwordHash,signIn} from './auth';
import {registerAgent} from './agents';
import {authenticate,DurableControl} from '../durable/service';

// Real installed PostgreSQL roles, named sessions and controlled record effects.
// These are service tests, not independent human/browser acceptance.
async function fixture(run:(f:Awaited<ReturnType<typeof setup>>)=>Promise<void>){const f=await setup();try{await run(f);}finally{await f.installed.close();}}
async function setup(){
 const password='owned-demo-safety-fixture-password';
 const installed=await createInstalledTenantFixture({tenants:['safety','foreign'],salesOrg:'safety',seed:async db=>{
  for(const [email,org]of [['requester@example.test','safety'],['reviewer@example.test','safety'],['foreign@example.test','foreign']])await db.query('INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,$2,$1,$3)',[email,org,passwordHash(password)]);
  await db.query("INSERT INTO ll_records(org_id) VALUES('safety'),('foreign')");
  await db.query("INSERT INTO ll_agents(org_id,id,tools) VALUES('safety','unrelated-crm',ARRAY['twin.crm'])");
 }});
 try{
  const db=installed.web('safety'),control=new DurableControl(db);
  const requester=await authenticate(db,await signIn(db,{email:'requester@example.test',password}));
  const reviewer=await authenticate(db,await signIn(db,{email:'reviewer@example.test',password}));
  const foreignDb=installed.web('foreign'),foreign=await authenticate(foreignDb,await signIn(foreignDb,{email:'foreign@example.test',password}));
  const enrolled=await registerAgent(db,requester,{id:'pricing',name:'Sample pricing agent',owner:requester.subject,role:'discount_agent',connector:'discount_record',actionLimit:20});
  const agent=await authenticate(db,enrolled.agentToken);
  const propose=(discount=25)=>({actionId:randomUUID(),agentId:enrolled.id,discount,expectedVersion:1});
  return {installed,db,control,requester,reviewer,foreign,agent,propose};
 }catch(e){await installed.close();throw e;}
}

it('changed amounts cannot rewrite an approved request or inherit its approval; policy change cancels old work',async()=>fixture(async f=>{
 const original=f.propose(),a=await f.control.propose(f.requester,original);
 const approved=await f.control.review(f.reviewer,a.id,true,a.payload_hash);
 await expect(f.control.propose(f.requester,{...original,discount:26})).rejects.toMatchObject({status:409});
 expect(await f.control.readAction(f.requester,a.id)).toEqual(approved);
 const changed=await f.control.propose(f.requester,f.propose(26));expect(changed.state).toBe('held');expect(changed.approved_by).toBeNull();
 await expect(f.control.review(f.reviewer,changed.id,true,a.payload_hash)).rejects.toMatchObject({status:409});
 expect((await f.control.execute(f.requester,changed.id)).state).toBe('held');
 await f.control.configure(f.reviewer,{autoLimit:15});
 expect((await f.control.execute(f.requester,a.id)).state).toBe('cancelled');
 expect((await f.control.snapshot(f.requester)).effects).toHaveLength(0);
 expect((await f.control.snapshot(f.requester)).record).toEqual({discount:0,version:1});
}));

it.each(['before claim','after claim'] as const)('expired approval %s refuses a new sample-record effect',async phase=>fixture(async f=>{
 const a=await f.control.propose(f.requester,f.propose());const approved=await f.control.review(f.reviewer,a.id,true,a.payload_hash);
 const dbNow=(await f.db.query('SELECT clock_timestamp() AS now')).rows[0].now;
 expect(new Date(approved.approval_until!).getTime()-dbNow.getTime()).toBeGreaterThan(890000);
 expect(new Date(approved.approval_until!).getTime()-dbNow.getTime()).toBeLessThanOrEqual(900000);
 const lease=phase==='after claim'?await f.control.claim(f.requester,a.id):null;
 // Test-owner timestamp fixture only: never exposed by the app, never a claim
 // that a real 15-minute production wait was recorded.
 await f.installed.owner.query("UPDATE ll_actions SET approval_until=clock_timestamp()-interval '1 second' WHERE org_id='safety' AND id=$1",[a.id]);
 if(lease)expect(await f.control.applyEffect(f.requester,a.id,lease.lease_token!)).toBeNull();
 expect((await f.control.execute(f.requester,a.id)).state).toBe('cancelled');
 expect((await f.control.execute(f.requester,a.id)).state).toBe('cancelled');
 const observed=await f.control.snapshot(f.requester);expect(observed.effects).toHaveLength(0);expect(observed.record).toEqual({discount:0,version:1});
 expect(observed.actions[0].reason).toBe('Approval is missing or expired.');
}));

for(const mode of ['connector','all agents','policy'] as const)for(const phase of ['executing','uncertain'] as const){
 it.each([5,25])(`contained ${phase} work after ${mode} change cannot regain old authorization (%i percent)`,async discount=>fixture(async f=>{
  const a=await f.control.propose(f.requester,f.propose(discount));if(a.state==='held')await f.control.review(f.reviewer,a.id,true,a.payload_hash);
  const lease=await f.control.claim(f.requester,a.id);expect(lease.state).toBe('executing');
  if(phase==='uncertain')expect((await f.control.finish(f.requester,a.id,lease.lease_token!,true)).state).toBe('uncertain');
  if(mode==='connector'){await f.control.configureDiscountConnector(f.reviewer,false);await f.control.configureDiscountConnector(f.reviewer,true);}
  else if(mode==='all agents'){await f.control.configure(f.reviewer,{agentActive:false});await f.control.configure(f.reviewer,{agentActive:true});}
  else await f.control.configure(f.reviewer,{autoLimit:15});
  const resumed=new DurableControl(f.db);
  expect((await resumed.readAction(f.requester,a.id)).state).toBe('uncertain');
  await expect(resumed.applyEffect(f.requester,a.id,lease.lease_token!)).rejects.toMatchObject({status:409});
  expect((await resumed.reconcile(f.reviewer,a.id)).state).toBe('cancelled');
  expect((await resumed.execute(f.requester,a.id)).state).toBe('cancelled');
  const observed=await resumed.snapshot(f.requester);expect(observed.effects).toHaveLength(0);expect(observed.record).toEqual({discount:0,version:1});
  expect(observed.events.filter(e=>e.action_id===a.id).map(e=>e.kind)).toContain('authorization_invalidated');
 }));
}

it.each(['executing','uncertain'] as const)('containment of %s work after a committed effect verifies that one effect, never reverses it or repeats it',async phase=>fixture(async f=>{
 const a=await f.control.propose(f.requester,f.propose());await f.control.review(f.reviewer,a.id,true,a.payload_hash);
 const lease=await f.control.claim(f.requester,a.id);await f.control.applyEffect(f.requester,a.id,lease.lease_token!);
 if(phase==='uncertain')await f.control.finish(f.requester,a.id,lease.lease_token!,true);
 const queued=await f.control.propose(f.requester,{...f.propose(5),expectedVersion:2});
 await expect(f.control.configureDiscountConnector(f.agent,false)).rejects.toMatchObject({status:403});
 await expect(f.control.configureDiscountConnector(f.foreign,false)).rejects.toMatchObject({status:403});
 await f.control.configureDiscountConnector(f.reviewer,false);
 expect((await f.control.readAction(f.requester,a.id)).state).toBe('uncertain');expect((await f.control.readAction(f.requester,queued.id)).state).toBe('cancelled');
 expect((await f.control.finish(f.requester,a.id,lease.lease_token!)).state).toBe('uncertain');
 await expect(f.control.applyEffect(f.requester,a.id,lease.lease_token!)).rejects.toMatchObject({status:409});
 const restarted=new DurableControl(f.db);expect((await restarted.reconcile(f.reviewer,a.id)).state).toBe('succeeded');
 await restarted.configureDiscountConnector(f.reviewer,true);expect((await restarted.execute(f.requester,queued.id)).state).toBe('cancelled');expect((await restarted.execute(f.requester,a.id)).state).toBe('succeeded');
 const observed=await restarted.snapshot(f.requester);expect(observed.effects).toHaveLength(1);expect(observed.record).toEqual({discount:25,version:2});expect(observed.agents.find(a=>a.id==='unrelated-crm')?.active).toBe(true);
 expect(observed.events.filter(e=>e.action_id===a.id).map(e=>e.kind)).toEqual(expect.arrayContaining(['executing','effect_recorded','authorization_invalidated','uncertain','succeeded']));
}));


it.each(['Discount connector contained; previous authorization invalidated.','Authority changed; previous authorization invalidated.'])('pre-upgrade containment remains fenced without a new audit marker: %s',async reason=>fixture(async f=>{
 const a=await f.control.propose(f.requester,f.propose(5));
 // Explicit old-row fixture, representing the previously shipped transition.
 await f.installed.owner.query("UPDATE ll_actions SET state='uncertain',reason=$2,lease_token=NULL,lease_until=NULL WHERE id=$1",[a.id,reason]);
 expect((await f.control.reconcile(f.reviewer,a.id)).state).toBe('cancelled');
 expect((await f.control.execute(f.requester,a.id)).state).toBe('cancelled');
 expect((await f.control.snapshot(f.requester)).effects).toHaveLength(0);
}));


it('immutable invalidation history fences an action even if a later status description changes',async()=>fixture(async f=>{
 const a=await f.control.propose(f.requester,f.propose(5));await f.control.claim(f.requester,a.id);
 await f.control.configureDiscountConnector(f.reviewer,false);await f.control.configureDiscountConnector(f.reviewer,true);
 // Metadata fixture isolates the audit marker from the legacy-reason fallback.
 await f.installed.owner.query("UPDATE ll_actions SET reason='Awaiting current effect evidence.' WHERE id=$1",[a.id]);
 await expect(f.db.query("DELETE FROM ll_events WHERE action_id=$1 AND kind='authorization_invalidated'",[a.id])).rejects.toMatchObject({code:'42501'});
 expect((await f.control.reconcile(f.reviewer,a.id)).state).toBe('cancelled');
 expect((await f.control.execute(f.requester,a.id)).state).toBe('cancelled');
 expect((await f.control.snapshot(f.requester)).effects).toHaveLength(0);
}));
