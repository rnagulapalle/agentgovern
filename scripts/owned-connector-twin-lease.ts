import { Pool, type PoolClient } from 'pg';
import { createServer } from 'node:net';

// Test-only coordination for the fixed native connector port. PostgreSQL releases
// the dedicated session lock on process loss; it is not execution authority.
export async function assertConnectorTwinPortFree(port = 8018) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => reject(Error('Fixed connector fixture port unavailable; listener untouched')));
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(Error('Fixture port check failed')) : resolve()));
  });
}
export async function acquireConnectorTwinLease(waitMs = 120000, port = 8018) {
  const value = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (process.env.NODE_ENV !== 'test' || !value || !Number.isInteger(waitMs) || waitMs < 1 || waitMs > 120000 || !Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('Dedicated bounded test fixture required');
  let url: URL;
  try { url = new URL(value); } catch { throw Error('Dedicated bounded test fixture required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.length < 2)
    throw Error('Dedicated local test database required');
  const key = [1819043187, port];
  const pool = new Pool({connectionString: value, max: 1, connectionTimeoutMillis: 5000, query_timeout: waitMs + 1000});
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    // A blocking advisory wait joins PostgreSQL's queue. Repeated try-lock
    // polling lets a releasing suite reacquire before older waiters can run.
    await client.query("SELECT set_config('statement_timeout', $1, false)", [String(waitMs)]);
    try { await client.query('SELECT pg_advisory_lock($1,$2)', key); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '57014')
        throw Error('Fixed connector fixture lease timed out');
      throw error;
    }
    await assertConnectorTwinPortFree(port);
    let released = false;
    return {async release() {
      if (released) return;
      released = true;
      try { await assertConnectorTwinPortFree(port); }
      finally { client!.release(true); await pool.end(); }
    }};
  } catch (error) {
    client?.release(true);
    await pool.end();
    // Never expose connection URLs or driver diagnostics.
    if (error instanceof Error && ['Fixed connector fixture lease timed out', 'Fixed connector fixture port unavailable; listener untouched', 'Fixture port check failed'].includes(error.message)) throw error;
    throw Error('Dedicated connector fixture lease unavailable');
  }
}
