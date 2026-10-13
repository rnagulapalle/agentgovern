import { expect, it, vi } from 'vitest';
import { createServer } from 'node:net';
import { acquireConnectorTwinLease } from './owned-connector-twin-lease';

it('separate database sessions wait for actual owner release, timeout cleanly and can reacquire', async () => {
  const first = await acquireConnectorTwinLease(120000, 18018);
  try {
    await expect(acquireConnectorTwinLease(150, 18018)).rejects.toThrow('lease timed out');
    let acquired = false;
    const second = acquireConnectorTwinLease(2000, 18018).then(value => { acquired = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(acquired).toBe(false);
    await first.release();
    const lease = await second;
    await lease.release();
    await lease.release();
    const third = await acquireConnectorTwinLease(1000, 18018);
    await third.release();
  } finally { await first.release(); }
}, 125000);

it('a noncooperative listener is untouched and failed startup does not retain its database session', async () => {
  const first = await acquireConnectorTwinLease(120000, 18018);
  const server = createServer();
  try {
    await new Promise<void>(resolve => server.listen(18018, '127.0.0.1', resolve));
    await expect(first.release()).rejects.toThrow('listener untouched');
    await expect(acquireConnectorTwinLease(1000, 18018)).rejects.toThrow('listener untouched');
    expect(server.listening).toBe(true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await first.release();
  }
  const lease = await acquireConnectorTwinLease(1000, 18018);
  await lease.release();
}, 125000);

it('refuses missing, remote or unbounded fixture inputs without leaking driver credentials', async () => {
  const original = process.env.LOOPLABS_TEST_DATABASE_URL;
  try {
    vi.stubEnv('LOOPLABS_TEST_DATABASE_URL', '');
    await expect(acquireConnectorTwinLease(120000, 18018)).rejects.toThrow('Dedicated bounded');
    vi.stubEnv('LOOPLABS_TEST_DATABASE_URL', 'postgres://secret:secret@remote.invalid/db');
    await expect(acquireConnectorTwinLease(120000, 18018)).rejects.toThrow('Dedicated local');
    vi.stubEnv('LOOPLABS_TEST_DATABASE_URL', original!);
    await expect(acquireConnectorTwinLease(0)).rejects.toThrow('Dedicated bounded');
    await expect(acquireConnectorTwinLease(120001)).rejects.toThrow('Dedicated bounded');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(acquireConnectorTwinLease(120000, 18018)).rejects.toThrow('Dedicated bounded');
  } finally { vi.unstubAllEnvs(); }
});

it('queued connector sessions acquire in arrival order instead of starvation by reacquisition',async()=>{
 const {Pool}=await import('pg');const observer=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,max:1});
 const first=await acquireConnectorTwinLease(10000,18019);let secondLease:Awaited<ReturnType<typeof acquireConnectorTwinLease>>|undefined,thirdLease:Awaited<ReturnType<typeof acquireConnectorTwinLease>>|undefined;
 const order:string[]=[];
 const queued=async(count:number)=>{for(let n=0;n<100;n++){const r=await observer.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=1819043187::oid AND objid=18019::oid AND NOT granted");if(r.rows[0].n===count)return;await new Promise(r=>setTimeout(r,10));}throw Error('Owned advisory queue not observed');};
 try{
  const second=acquireConnectorTwinLease(10000,18019).then(v=>{secondLease=v;order.push('second');return v;});
  await queued(1);
  const third=acquireConnectorTwinLease(10000,18019).then(v=>{thirdLease=v;order.push('third');return v;});
  await queued(2);await first.release();await second;expect(order).toEqual(['second']);
  await secondLease!.release();await third;expect(order).toEqual(['second','third']);
 }finally{await first.release();await secondLease?.release();await thirdLease?.release();await observer.end();}
},20000);
