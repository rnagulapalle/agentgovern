import {expect,it,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import type {Actor} from '../durable/contracts';
const fake=vi.hoisted(()=>({bindings:new WeakMap<object,unknown>(),assert:vi.fn(),transport:vi.fn()}));
vi.mock('../durable/tenant-pool',()=>({tenantPoolBinding:(v:object)=>fake.bindings.get(v),assertTenantPool:fake.assert,tenantPoolTransport:fake.transport}));
import {QuoteTransactionContext} from './transaction-context';
function fixture(){
 const binding={org:'one',epoch:'epoch',purpose:'web'},pool={} as Pool;
 let xid:string|null='123';const release=vi.fn(),query=vi.fn(async()=>({rows:[{xid}]}));
 const client={query,release} as unknown as PoolClient;
 fake.bindings.set(pool,binding);fake.bindings.set(client,binding);
 fake.assert.mockImplementation(async(db:object,org:string)=>{if(fake.bindings.get(db)!==binding||org!=='one')throw Error('refused');return binding;});
 fake.transport.mockImplementation(()=>({purpose:'web'}));
 return {pool,client,release,query,setXid:(v:string|null)=>{xid=v;},actor:{orgId:'one',subject:'owner@example.test',role:'operator',tokenHash:'session-one'} as Actor,context:new QuoteTransactionContext(pool)};
}
it('returns pool outside scope and exact client only inside awaited callback; no pool SQL borrowing',async()=>{const f=fixture();expect(await f.context.connection()).toBe(f.pool);await f.context.run(f.client,f.actor,async()=>{await Promise.resolve();expect(await f.context.connection()).toBe(f.client);});expect(await f.context.connection()).toBe(f.pool);expect(f.client.release).toBe(f.release);});
it('rejects another registered pool client even with equivalent value metadata',async()=>{const f=fixture(),other={...f.client} as PoolClient;fake.bindings.set(other,{org:'one',epoch:'epoch',purpose:'web'});await expect(f.context.run(other,f.actor,async()=>null)).rejects.toMatchObject({status:403});});
it.each([{orgId:'two'},{subject:'manager@example.test'},{role:'worker'},{tokenHash:'other-session'}])('refuses nested identity change %j',async change=>{const f=fixture();await f.context.run(f.client,f.actor,async()=>{await expect(f.context.run(f.client,{...f.actor,...change} as Actor,async()=>null)).rejects.toMatchObject({status:403});});});
it('refuses autocommit rather than starting or fabricating a transaction',async()=>{const f=fixture();f.setXid(null);await expect(f.context.run(f.client,f.actor,async()=>null)).rejects.toMatchObject({status:503});});
it('refuses transaction replacement during await',async()=>{const f=fixture();await expect(f.context.run(f.client,f.actor,async()=>{f.setXid('124');return f.context.connection();})).rejects.toMatchObject({status:503});});
it('refuses released client even before a replacement transaction appears',async()=>{const f=fixture();await expect(f.context.run(f.client,f.actor,async()=>{f.client.release();return f.context.connection();})).rejects.toMatchObject({status:503});expect(f.release).toHaveBeenCalledTimes(1);});
it('inherited detached continuation expires when the awaited callback finishes',async()=>{const f=fixture();let resume!:()=>void;const gate=new Promise<void>(r=>{resume=r;});let detached!:Promise<unknown>;await f.context.run(f.client,f.actor,async()=>{detached=gate.then(()=>f.context.connection());});resume();await expect(detached).rejects.toMatchObject({status:503});});
it('original pool construction tamper is rechecked after await',async()=>{const f=fixture();await expect(f.context.run(f.client,f.actor,async()=>{fake.transport.mockImplementation(()=>{throw Error('construction refused');});return null;})).rejects.toThrow('construction refused');});
it('scope remains isolated between simultaneous same-factory transactions',async()=>{const f=fixture(),other={query:f.query,release:vi.fn()} as unknown as PoolClient;fake.bindings.set(other,fake.bindings.get(f.pool));let resume!:()=>void;const gate=new Promise<void>(r=>{resume=r;});const first=f.context.run(f.client,f.actor,async()=>{await gate;expect(await f.context.connection()).toBe(f.client);});await f.context.run(other,{...f.actor,subject:'manager@example.test'},async()=>{expect(await f.context.connection()).toBe(other);});resume();await first;});

it('another factory cannot reenter an already borrowed client even with same pool and actor',async()=>{const f=fixture(),other=new QuoteTransactionContext(f.pool);await f.context.run(f.client,f.actor,async()=>{await expect(other.run(f.client,f.actor,async()=>null)).rejects.toMatchObject({status:403});});expect(await other.run(f.client,f.actor,async()=>other.connection())).toBe(f.client);});

it('caller identity mutation during an awaited operation invalidates the borrow',async()=>{const f=fixture();await expect(f.context.run(f.client,f.actor,async()=>{await Promise.resolve();f.actor.subject='other@example.test';return f.context.connection();})).rejects.toMatchObject({status:503});});

it('identity change while live authority SQL awaits is refused before returning client',async()=>{const f=fixture();await expect(f.context.run(f.client,f.actor,async()=>{fake.assert.mockImplementation(async()=>{await Promise.resolve();f.actor.tokenHash='other-session';return fake.bindings.get(f.pool);});return f.context.connection();})).rejects.toMatchObject({status:503});});

it('release during initial borrowed-client authority check is refused before callback',async()=>{const f=fixture(),callback=vi.fn(async()=>null);fake.assert.mockImplementation(async()=>{await Promise.resolve();f.client.release();return fake.bindings.get(f.pool);});await expect(f.context.run(f.client,f.actor,callback)).rejects.toMatchObject({status:503});expect(callback).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledTimes(1);});
