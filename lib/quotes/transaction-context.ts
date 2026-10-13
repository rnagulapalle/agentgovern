import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolClient } from 'pg';
import type { Actor } from '../durable/contracts';
import { ControlError } from '../durable/contracts';
import { assertTenantPool, tenantPoolBinding, tenantPoolTransport } from '../durable/tenant-pool';

const claimedClients=new WeakMap<PoolClient,QuoteTransactionContext>();

type Borrow = { client: PoolClient; actor: Readonly<Actor>; callerActor: Actor; xid: string; active: boolean };
/** One instance per trusted quote factory. It cannot grant authority or start a
 * transaction. Awaited provider hooks reuse only their caller's current client;
 * detached descendants, released clients and other pools are refused. */
export class QuoteTransactionContext {
  private readonly storage = new AsyncLocalStorage<Borrow>();
  constructor(readonly pool: Pool) {}
  private async validate(borrow: Borrow) {
    if ((['orgId','subject','role','tokenHash'] as const).some(key=>borrow.callerActor[key]!==borrow.actor[key]))throw new ControlError(503,'Quote callback identity changed.');
    if (!borrow.active || !tenantPoolBinding(this.pool) || tenantPoolBinding(this.pool) !== tenantPoolBinding(borrow.client))
      throw new ControlError(503, 'Current exact quote transaction required.');
    // Revalidate original construction even though SQL runs on the acquired
    // client. No cached database role/epoch or copied construction is trusted.
    tenantPoolTransport(this.pool);
    await assertTenantPool(borrow.client, borrow.actor.orgId);
    const xid = (await borrow.client.query('SELECT pg_current_xact_id_if_assigned()::text xid')).rows[0]?.xid;
    if ((['orgId','subject','role','tokenHash'] as const).some(key=>borrow.callerActor[key]!==borrow.actor[key]))throw new ControlError(503,'Quote callback identity changed.');
    if (!borrow.active || xid !== borrow.xid || tenantPoolBinding(this.pool) !== tenantPoolBinding(borrow.client))
      throw new ControlError(503, 'Current exact quote transaction required.');
    tenantPoolTransport(this.pool);
  }
  async connection(): Promise<Pool | PoolClient> {
    const borrow = this.storage.getStore();
    if (!borrow) return this.pool;
    await this.validate(borrow);
    return borrow.client;
  }
  async run<T>(client: PoolClient, actor: Actor, callback: () => Promise<T>): Promise<T> {
    const previous = this.storage.getStore();
    if (previous) {
      if (previous.client !== client || previous.actor.orgId !== actor.orgId || previous.actor.subject !== actor.subject || previous.actor.role !== actor.role || previous.actor.tokenHash !== actor.tokenHash)
        throw new ControlError(403, 'Quote transaction identity cannot change.');
      await this.validate(previous);
      const result = await callback();
      await this.validate(previous);
      return result;
    }
    if (!tenantPoolBinding(this.pool) || tenantPoolBinding(this.pool) !== tenantPoolBinding(client) || tenantPoolBinding(client)?.org !== actor.orgId)
      throw new ControlError(403, 'Exact installed quote transaction client required.');
    if(claimedClients.has(client))throw new ControlError(403,'Quote client is already borrowed by another callback context.');
    claimedClients.set(client,this);
    const borrow: Borrow = {client, actor:Object.freeze({...actor}), callerActor:actor, xid:'', active:true};
    const release = client.release;
    const guardedRelease: PoolClient['release'] = function(error) { borrow.active = false; return release.call(client, error); };
    client.release = guardedRelease;
    try {
      await assertTenantPool(client, borrow.actor.orgId);
      if(!borrow.active)throw new ControlError(503,'Current exact quote transaction required.');
      const xid = (await client.query('SELECT pg_current_xact_id_if_assigned()::text xid')).rows[0]?.xid;
      if (typeof xid !== 'string' || !/^[1-9][0-9]*$/.test(xid)) throw new ControlError(503, 'Active quote transaction required.');
      borrow.xid=xid;
      return await this.storage.run(borrow, async () => {
        await this.validate(borrow);
        const result = await callback();
        await this.validate(borrow);
        return result;
      });
    } finally {
      borrow.active = false;
      if(claimedClients.get(client)===this)claimedClients.delete(client);
      if (client.release === guardedRelease) client.release = release;
    }
  }
}
