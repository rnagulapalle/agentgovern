import type { PoolClient } from "pg";
import type { RefundAction } from "../refunds/contracts";
import { PAYMENT } from "../refunds/contracts";
import type { Actor } from "../durable/contracts";
import { activeApprover } from "../workspace/identity";
// Legacy refund fixtures can run before migration 6. Once a refund belongs to
// a back-office case, every entry point must honor that case's authorization.
export async function caseRefundInvalid(
  c: PoolClient,
  actor: Actor,
  refund: RefundAction,
  approving: boolean,
) {
  if (
    !(await c.query("SELECT to_regclass('ll_backoffice_cases') AS name"))
      .rows[0].name
  )
    return null;
  const a = (
    await c.query(
      "SELECT * FROM ll_backoffice_cases WHERE org_id=$1 AND refund_id=$2",
      [actor.orgId, refund.id],
    )
  ).rows[0];
  if (!a) return null;
  if (
    a.amount !== refund.amount ||
    refund.payment_id !== PAYMENT ||
    refund.agent_id !== "refund-agent" ||
    refund.currency !== "usd" ||
    a.policy_version !== refund.policy_version ||
    ![
      "refunding",
      "refund_uncertain",
      "email_ready",
      "emailing",
      "email_uncertain",
      "completed",
    ].includes(a.state) ||
    !a.approved_by ||
    a.approved_by === a.created_by ||
    !a.approval_until ||
    new Date(a.approval_until).getTime() <= Date.now() ||
    !(await activeApprover(c, actor.orgId, a.approved_by)) ||
    (approving && actor.subject !== a.approved_by)
  )
    return "The owning cancellation case no longer authorizes this refund.";
  return null;
}
