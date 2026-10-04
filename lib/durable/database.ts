import { Pool, type PoolClient } from "pg";
import { ControlError } from "./contracts";

let pool: Pool | undefined;
export function database() {
  const url = process.env.LOOPLABS_DATABASE_URL;
  if (!url)
    throw new ControlError(
      503,
      "The workspace is temporarily unavailable. Please contact the LoopLabs team.",
    );
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", () =>
      console.error(
        "Durable database idle connection failed. New requests will reconnect.",
      ),
    );
  }
  return pool;
}
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
