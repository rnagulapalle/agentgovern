import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createInstalledTenantFixture } from './installed-tenant-fixture';
import { passwordHash, signIn } from './auth';
import { agentDirectory, registerAgent } from './agents';
import { authenticate, DurableControl, tokenHash } from '../durable/service';

// Actual scoped PostgreSQL roles and product services, not Chrome acceptance,
// a real customer connection, or a process-kill/restart test.
it('executes the exact named-member pricing script and reconciles one lost acknowledgement using installed roles', async () => {
  const requesterEmail='pratibha@example.test', reviewerEmail='raj@example.test';
  const password='owned-disposable-demo-password';
  const fixture=await createInstalledTenantFixture({tenants:['script'],salesOrg:'script',seed:async owner=>{
    for(const email of [requesterEmail,reviewerEmail])
      await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,'script',$1,$2)",[email,passwordHash(password)]);
    await owner.query("INSERT INTO ll_records(org_id) VALUES('script')");
    await owner.query("INSERT INTO ll_agents(org_id,id,tools) VALUES('script','unrelated-quote',ARRAY['twin.quote'])");
  }});
  try {
    const db=fixture.web('script'), control=new DurableControl(db);
    const requester=await authenticate(db,await signIn(db,{email:requesterEmail,password}));
    const reviewer=await authenticate(db,await signIn(db,{email:reviewerEmail,password}));
    const enrolled=await registerAgent(db,requester,{id:'special-pricing',name:'Special pricing agent',owner:requesterEmail,role:'discount_agent',connector:'discount_record',actionLimit:10});
    const agent=await authenticate(db,enrolled.agentToken);
    const directory=await agentDirectory(db,reviewer);
    expect(directory.agents.find(a=>a.id===enrolled.id)).toMatchObject({owner:requesterEmail,tools:['proof.discount'],action_limit:10});
    expect((await db.query("SELECT hash FROM ll_tokens WHERE subject=$1",[enrolled.id])).rows[0].hash).toBe(tokenHash(enrolled.agentToken));
    await expect(control.configure(agent,{autoLimit:15})).rejects.toMatchObject({status:403});
    await control.configure(requester,{autoLimit:15});
    expect((await control.snapshot(reviewer)).policy).toMatchObject({auto_limit:15,hard_limit:50});
    const input=(discount:number,expectedVersion:number)=>({actionId:randomUUID(),agentId:enrolled.id,discount,expectedVersion});

    const allowed=await control.propose(requester,input(5,1));
    expect(allowed.state).toBe('ready');
    await expect(control.execute(agent,allowed.id)).rejects.toMatchObject({status:403});
    expect((await control.readAction(agent,allowed.id)).id).toBe(allowed.id);
    expect((await control.execute(requester,allowed.id)).state).toBe('succeeded');
    expect((await control.snapshot(reviewer)).record).toEqual({discount:5,version:2});

    const heldInput=input(25,2),held=await control.propose(requester,heldInput);
    expect(held.state).toBe('held');
    await expect(control.review(requester,held.id,true,held.payload_hash)).rejects.toMatchObject({status:403});
    await expect(control.review(agent,held.id,true,held.payload_hash)).rejects.toMatchObject({status:403});
    await expect(control.propose(agent,{...heldInput,discount:26})).rejects.toMatchObject({status:409});
    const approved=await control.review(reviewer,held.id,true,held.payload_hash);
    expect(approved.approved_by).toBe(reviewerEmail);
    expect(new Date(approved.approval_until!).getTime()-Date.now()).toBeGreaterThan(890000);
    expect(new Date(approved.approval_until!).getTime()-Date.now()).toBeLessThanOrEqual(900000);
    expect((await control.execute(requester,held.id)).state).toBe('succeeded');

    const blocked=await control.propose(requester,input(70,3));
    expect(blocked.state).toBe('blocked');
    expect((await control.execute(requester,blocked.id)).state).toBe('blocked');
    expect((await control.snapshot(reviewer)).effects).toHaveLength(2);
    expect((await db.query('SELECT 1 FROM ll_effects WHERE action_id=$1',[blocked.id])).rowCount).toBe(0);

    const lost=await control.propose(requester,input(5,3));
    expect((await control.execute(requester,lost.id,true)).state).toBe('uncertain');
    expect((await control.execute(requester,lost.id)).state).toBe('uncertain');
    const reopened=new DurableControl(db);
    expect((await reopened.reconcile(reviewer,lost.id)).state).toBe('succeeded');
    expect((await reopened.execute(requester,lost.id)).state).toBe('succeeded');
    const observed=await reopened.snapshot(reviewer);
    expect(observed.record).toEqual({discount:5,version:4});
    expect(observed.effects).toHaveLength(3);
    expect(observed.effects.filter(e=>e.action_id===lost.id)).toHaveLength(1);
    expect(observed.events.filter(e=>e.action_id===lost.id).map(e=>e.kind)).toContain('uncertain');
    await expect(db.query('UPDATE ll_events SET kind=$1 WHERE action_id=$2',['rewritten',held.id])).rejects.toBeTruthy();
    await expect(db.query('DELETE FROM ll_events WHERE action_id=$1',[held.id])).rejects.toBeTruthy();
    await reopened.configureDiscountConnector(requester,false);
    expect((await agentDirectory(db,reviewer)).agents.find(a=>a.id==='unrelated-quote')?.active).toBe(true);
  } finally { await fixture.close(); }
},30000);
