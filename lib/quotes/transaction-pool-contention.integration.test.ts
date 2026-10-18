import { expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createInstalledTenantFixture } from '../workspace/installed-tenant-fixture';
import {QuoteTransactionContext} from './transaction-context';
import { tokenHash } from '../durable/service';
import { assertTenantPool, tenantPoolBinding } from '../durable/tenant-pool';

/** Actual restricted-role component reproducer, not proof that a particular
 * browser failure had this cause. Long lock wait is explicit fixture contention;
 * original three-client production construction/connect deadline is unchanged. */
it('pool-based revalidation starves behind workspace readers; the exact bound transaction client remains usable', async () => {
  const key = randomBytes(32).toString('base64url');
  const fixture = await createInstalledTenantFixture({ tenants: ['one'], salesOrg: 'one', seed: async owner => {
    await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@company.example','one','Owner','fixture')");
    await owner.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'owner@company.example',now()+interval '1 hour')", [tokenHash(key)]);
  }});
  const clients: PoolClient[] = [];
  const waits: Promise<unknown>[] = [];
  try {
    const { db } = await fixture.context.authenticated(key);
    expect(db.options.max).toBe(3);
    expect(db.options.connectionTimeoutMillis).toBe(5000);
    const holding = await db.connect(); clients.push(holding);
    await holding.query('BEGIN');
    await holding.query("SELECT id FROM ll_orgs WHERE id='one' FOR UPDATE");
    const pids: number[] = [];
    for (let i = 0; i < 2; i++) {
      const reader = await db.connect(); clients.push(reader);
      await reader.query('BEGIN');
      // Owner-controlled contention fixture only. No production timeout change.
      await reader.query("SET LOCAL lock_timeout='15s'");
      await reader.query("SET LOCAL statement_timeout='15s'");
      pids.push((await reader.query('SELECT pg_backend_pid() pid')).rows[0].pid);
      waits.push(reader.query("SELECT id FROM ll_orgs WHERE id='one' FOR UPDATE").catch(error => error));
    }
    const until = Date.now() + 2000;
    let blocked = 0;
    while (Date.now() < until) {
      blocked = Number((await fixture.owner.query("SELECT count(*) n FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].n);
      if (blocked === 2) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(blocked).toBe(2);
    expect(db.totalCount).toBe(3); expect(db.idleCount).toBe(0);
    const binding = tenantPoolBinding(db);
    expect(tenantPoolBinding(holding)).toEqual(binding);
    expect(await assertTenantPool(holding, 'one')).toEqual(binding);
    // This is the exact helper called through the pool by current factory stable().
    const started=Date.now();let classification:string|null=null;
    try { await assertTenantPool(db, 'one'); } catch(error) {
      classification=error instanceof Error&&error.message==='timeout exceeded when trying to connect'?'pool-acquisition-timeout':'unexpected';
    }
    expect(classification).toBe('pool-acquisition-timeout');
    expect(Date.now()-started).toBeGreaterThanOrEqual(4500);
    expect(Date.now()-started).toBeLessThan(9000);
    const context=new QuoteTransactionContext(db);
    await context.run(holding,{orgId:'one',subject:'owner@company.example',role:'operator',tokenHash:tokenHash(key)},async()=>{
      expect(await context.connection()).toBe(holding);
      expect(await assertTenantPool(await context.connection(),'one')).toEqual(binding);
      expect(db.waitingCount).toBe(0);
    });
    expect(await assertTenantPool(holding, 'one')).toEqual(binding);
    expect((await holding.query("SELECT count(*) n FROM ll_connector_actions")).rows[0].n).toBe('0');
    await holding.query('ROLLBACK');
    await Promise.all(waits);
    for (const client of clients.slice(1)) await client.query('ROLLBACK');
  } finally {
    // Releasing the owner lock first allows the captured readers to terminate.
    if (clients[0]) await clients[0].query('ROLLBACK').catch(() => {});
    await Promise.all(waits);
    for (const client of clients) { await client.query('ROLLBACK').catch(() => {}); client.release(); }
    await fixture.close();
  }
}, 30000);
