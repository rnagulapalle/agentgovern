import type { PoolClient } from "pg";
/** Saved-proposal history only. Missing migration/history always refuses authority. */
export async function currentSavedQuoteMembership(client: PoolClient, row: Record<string, unknown>): Promise<boolean> {
  if (row.requester_membership_generation == null || row.manager_membership_generation == null) return false;
  const plan = row.plan as { approver?: unknown };
  const members = (await client.query(
    "SELECT g.email,g.generation FROM ll_quote_member_generations g JOIN ll_members m ON m.email=g.email AND m.org_id=g.org_id AND m.active=true WHERE g.org_id=$1 AND g.email=ANY($2::text[]) FOR SHARE OF m NOWAIT",
    [row.org_id, [row.created_by, plan.approver]],
  )).rows;
  return members.length === 2 && members.some(m => m.email === row.created_by && String(m.generation) === String(row.requester_membership_generation)) &&
    members.some(m => m.email === plan.approver && String(m.generation) === String(row.manager_membership_generation));
}
