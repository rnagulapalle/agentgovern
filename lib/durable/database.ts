import { type Pool, type PoolClient } from "pg";
import { ControlError } from "./contracts";

/** Scoped deployments never construct a singleton fallback. */
export function database(): never { throw new ControlError(503, "Authenticated scoped database context required."); }
export async function transaction<T>(
  db: Pool,
  orgId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout = '5s'");
    await c.query("SET LOCAL statement_timeout = '10s'");
    // One serial order per workspace. Scale to narrower locks after measuring contention.
    await c.query("SELECT id FROM ll_orgs WHERE id=$1 FOR UPDATE", [orgId]);
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
