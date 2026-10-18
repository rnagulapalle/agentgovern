import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "../durable/contracts";
import { recoveryFence } from "../durable/recovery";
export const WORKSPACE_COOKIE = "looplabs_workspace_session";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function memberSession(
  db: Pool | PoolClient,
  token: string,
): Promise<Actor | null> {
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token)) return null;
  const hash = digest(token);
  const { rows } = await db.query(
    "SELECT m.org_id,m.email FROM ll_sessions s JOIN ll_members m ON m.email=s.email WHERE s.hash=$1 AND s.expires_at>now() AND m.active=true",
    [hash],
  );
  if (rows[0]) await recoveryFence(db, rows[0].org_id);
  return rows[0]
    ? {
        orgId: rows[0].org_id,
        subject: rows[0].email,
        role: "operator",
        tokenHash: hash,
      }
    : null;
}
export async function memberAuthority(c: PoolClient, actor: Actor) {
  if (actor.role !== "operator") return false;
  const { rows } = await c.query(
    "SELECT 1 FROM ll_sessions s JOIN ll_members m ON m.email=s.email WHERE s.hash=$1 AND s.expires_at>now() AND m.active=true AND m.org_id=$2 AND m.email=$3",
    [actor.tokenHash, actor.orgId, actor.subject],
  );
  if (rows[0]) await recoveryFence(c, actor.orgId);
  return Boolean(rows[0]);
}
export async function activeApprover(
  c: PoolClient,
  org: string,
  subject: string,
) {
  const legacy = await c.query(
    "SELECT 1 FROM ll_tokens WHERE org_id=$1 AND subject=$2 AND role='operator' AND active=true",
    [org, subject],
  );
  if (legacy.rows[0]) return true;
  return Boolean(
    (
      await c.query(
        "SELECT 1 FROM ll_members WHERE org_id=$1 AND email=$2 AND active=true",
        [org, subject],
      )
    ).rows[0],
  );
}
