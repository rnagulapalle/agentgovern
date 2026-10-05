import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "../durable/database";
import { authorize, tokenHash } from "../durable/service";
import { activeApprover } from "../workspace/identity";
import { ControlError, type Actor } from "../durable/contracts";
import { RefundControl } from "../refunds/service";
import { PAYMENT } from "../refunds/contracts";
import { compilePrompt, type Plan } from "./plan";
import type { CaseProvider } from "./provider";
export type Case = {
  id: string;
  plan_id: string;
  amount: number;
  created_by: string;
  approved_by: string | null;
  approval_until: string | null;
  payload_hash: string;
  policy_version: number;
  state: string;
  reason: string;
  refund_id: string;
  lease_until: string | null;
};
const uuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
export class BackOffice {
  constructor(
    readonly db: Pool,
    readonly refunds: RefundControl,
    readonly provider: CaseProvider,
  ) {}
  async access(c: PoolClient, actor: Actor) {
    await authorize(c, actor, ["operator"]);
    if (actor.orgId !== this.refunds.provider.workspaceId)
      throw new ControlError(
        403,
        "This process belongs to the private provider-twin workspace.",
      );
  }
  async get(c: PoolClient, actor: Actor, id: string): Promise<Case> {
    if (!uuid(id)) throw new ControlError(400, "Choose a valid case.");
    const a = (
      await c.query(
        "SELECT * FROM ll_backoffice_cases WHERE org_id=$1 AND id=$2",
        [actor.orgId, id],
      )
    ).rows[0];
    if (!a) throw new ControlError(404, "Case not found.");
    return a;
  }
  async state(
    c: PoolClient,
    actor: Actor,
    a: Case,
    state: string,
    reason: string,
  ) {
    await c.query(
      "UPDATE ll_backoffice_cases SET state=$3,reason=$4,lease_until=NULL WHERE org_id=$1 AND id=$2",
      [actor.orgId, a.id, state, reason],
    );
    await c.query(
      "INSERT INTO ll_backoffice_events(org_id,case_id,kind,subject) VALUES($1,$2,$3,$4)",
      [actor.orgId, a.id, state, actor.subject],
    );
    return { ...a, state, reason, lease_until: null };
  }
  async list(actor: Actor) {
    return transaction(this.db, actor.orgId, async (c) => {
      await this.access(c, actor);
      return {
        plans: (
          await c.query(
            "SELECT * FROM ll_backoffice_plans WHERE org_id=$1 ORDER BY created_at DESC LIMIT 20",
            [actor.orgId],
          )
        ).rows,
        cases: (
          await c.query(
            "SELECT * FROM ll_backoffice_cases WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50",
            [actor.orgId],
          )
        ).rows,
      };
    });
  }
  async draft(actor: Actor, id: string, prompt: unknown) {
    if (!uuid(id))
      throw new ControlError(400, "A stable draft ID is required.");
    const plan = compilePrompt(prompt),
      hash = tokenHash(JSON.stringify(plan));
    return transaction(this.db, actor.orgId, async (c) => {
      await this.access(c, actor);
      const old = (
        await c.query(
          "SELECT * FROM ll_backoffice_plans WHERE org_id=$1 AND id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      if (old) {
        if (old.hash !== hash)
          throw new ControlError(
            409,
            "This draft ID already has a different plan.",
          );
        return old;
      }
      return (
        await c.query(
          "INSERT INTO ll_backoffice_plans(org_id,id,plan,hash,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [actor.orgId, id, JSON.stringify(plan), hash, actor.subject],
        )
      ).rows[0];
    });
  }
  async publish(actor: Actor, id: string, hash: string) {
    if (!uuid(id)) throw new ControlError(400, "Choose a valid draft.");
    return transaction(this.db, actor.orgId, async (c) => {
      await this.access(c, actor);
      const p = (
        await c.query(
          "SELECT * FROM ll_backoffice_plans WHERE org_id=$1 AND id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      if (!p || p.hash !== hash)
        throw new ControlError(
          409,
          "Review the exact plan before enabling it.",
        );
      if (
        !(
          await c.query(
            "SELECT 1 FROM ll_backoffice_cases WHERE org_id=$1 AND plan_id=$2 AND state='completed'",
            [actor.orgId, id],
          )
        ).rows[0]
      )
        throw new ControlError(
          409,
          "Complete one provider-twin test case before enabling this plan.",
        );
      await c.query(
        "UPDATE ll_backoffice_plans SET published=true WHERE org_id=$1 AND id=$2",
        [actor.orgId, id],
      );
      return { ...p, published: true };
    });
  }
  async create(actor: Actor, id: string, planId: string, amount: number) {
    if (
      !uuid(id) ||
      !uuid(planId) ||
      !Number.isSafeInteger(amount) ||
      amount < 1
    )
      throw new ControlError(
        400,
        "Choose a plan, stable case ID and an amount in cents.",
      );
    return transaction(this.db, actor.orgId, async (c) => {
      await this.access(c, actor);
      const old = (
        await c.query(
          "SELECT * FROM ll_backoffice_cases WHERE org_id=$1 AND id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      if (old) {
        if (old.amount !== amount || old.plan_id !== planId)
          throw new ControlError(409, "Changed replay refused.");
        return old as Case;
      }
      const p = (
        await c.query(
          "SELECT * FROM ll_backoffice_plans WHERE org_id=$1 AND id=$2",
          [actor.orgId, planId],
        )
      ).rows[0];
      if (!p || amount > (p.plan as Plan).limit)
        throw new ControlError(
          409,
          "Choose a reviewed plan and stay within its refund ceiling.",
        );
      const policy = (
        await c.query(
          "SELECT version FROM ll_refund_policies WHERE org_id=$1",
          [actor.orgId],
        )
      ).rows[0];
      if (!policy) throw new ControlError(503, "Refund policy is unavailable.");
      const hash = tokenHash(
        JSON.stringify([
          p.hash,
          id,
          amount,
          PAYMENT,
          "customer@example.test",
          policy.version,
        ]),
      );
      return (
        await c.query(
          "INSERT INTO ll_backoffice_cases(org_id,id,plan_id,amount,created_by,payload_hash,policy_version,state,reason,refund_id) VALUES($1,$2,$3,$4,$5,$6,$7,'held','A second person must approve this exact cancellation and refund.',$8) RETURNING *",
          [
            actor.orgId,
            id,
            planId,
            amount,
            actor.subject,
            hash,
            policy.version,
            randomUUID(),
          ],
        )
      ).rows[0] as Case;
    });
  }
  async valid(c: PoolClient, actor: Actor, a: Case) {
    const p = (
      await c.query("SELECT version FROM ll_refund_policies WHERE org_id=$1", [
        actor.orgId,
      ])
    ).rows[0];
    return (
      p?.version === a.policy_version &&
      !!a.approved_by &&
      a.approved_by !== a.created_by &&
      !!a.approval_until &&
      new Date(a.approval_until).getTime() > Date.now() &&
      (await activeApprover(c, actor.orgId, a.approved_by))
    );
  }
  async approve(actor: Actor, id: string, hash: string) {
    return transaction(this.db, actor.orgId, async (c) => {
      await this.access(c, actor);
      const a = await this.get(c, actor, id);
      if (a.payload_hash !== hash || a.created_by === actor.subject)
        throw new ControlError(
          403,
          "A different person must approve the exact case payload.",
        );
      if (a.state !== "held") return a;
      const p = (
        await c.query(
          "SELECT version FROM ll_refund_policies WHERE org_id=$1",
          [actor.orgId],
        )
      ).rows[0];
      if (p?.version !== a.policy_version)
        return this.state(
          c,
          actor,
          a,
          "blocked",
          "Policy changed. Create a newly reviewed case.",
        );
      const approved = (
        await c.query(
          "UPDATE ll_backoffice_cases SET approved_by=$3,approval_until=clock_timestamp()+interval '15 minutes' WHERE org_id=$1 AND id=$2 RETURNING *",
          [actor.orgId, id, actor.subject],
        )
      ).rows[0];
      return this.state(
        c,
        actor,
        approved,
        "ready",
        "Approved for 15 minutes. Cancel the sample order first.",
      );
    });
  }
  async advance(actor: Actor, id: string, loseResponse = false) {
    let claimed = false;
    const a = await transaction(this.db, actor.orgId, async (c) => {
      await this.access(c, actor);
      const a = await this.get(c, actor, id);
      if (!["ready", "refund_ready", "email_ready"].includes(a.state)) return a;
      if (!(await this.valid(c, actor, a)))
        return this.state(
          c,
          actor,
          a,
          "blocked",
          "Approval expired, was revoked, or policy changed. No new effects dispatched.",
        );
      if (a.state === "refund_ready" && actor.subject !== a.approved_by)
        throw new ControlError(
          403,
          "The case approver must release the payment step.",
        );
      const state =
        a.state === "ready"
          ? "cancelling"
          : a.state === "refund_ready"
            ? "refunding"
            : "emailing";
      claimed = true;
      const claim = await this.state(
        c,
        actor,
        a,
        state,
        "Dispatch recorded. An unavailable response requires inspection.",
      );
      return (
        await c.query(
          "UPDATE ll_backoffice_cases SET lease_until=clock_timestamp()+interval '30 seconds' WHERE org_id=$1 AND id=$2 RETURNING *",
          [actor.orgId, claim.id],
        )
      ).rows[0] as Case;
    });
    if (!claimed) return a;
    return this.perform(actor, a, loseResponse);
  }
  async perform(actor: Actor, a: Case, lost: boolean) {
    try {
      if (a.state === "cancelling") {
        const o = await this.provider.order(a.id);
        if (o.status !== "open")
          throw new ControlError(409, "Order is no longer cancellable.");
        await this.preflight(actor, a);
        await this.provider.cancel(a.id, o.version, lost);
      } else if (a.state === "refunding") {
        const o = await this.provider.order(a.id);
        if (o.status !== "cancelled" || o.actionId !== a.id)
          throw new ControlError(409, "Order cancellation is not verified.");
        await this.preflight(actor, a);
        let r = await this.refunds.propose(actor, {
          actionId: a.refund_id,
          agentId: "refund-agent",
          paymentId: PAYMENT,
          amount: a.amount,
          currency: "usd",
        });
        if (r.state === "held") {
          // The case approval cannot substitute the active approver's authenticated action.
          if (actor.subject !== a.approved_by)
            throw new ControlError(
              409,
              "The case approver must release the payment step.",
            );
          r = await this.refunds.review(actor, r.id, r.payload_hash, true);
        }
        if (r.state === "ready") await this.refunds.execute(actor, r.id, lost);
      } else {
        const r = await this.refunds.reconcile(actor, a.refund_id);
        if (
          r.state !== "succeeded" ||
          !r.provider_id ||
          r.amount !== a.amount ||
          r.payment_id !== PAYMENT
        )
          throw new ControlError(
            409,
            "Refund is not verified; confirmation held.",
          );
        await this.preflight(actor, a);
        await this.provider.send(
          {
            caseId: a.id,
            refundId: r.provider_id,
            amount: a.amount,
            recipient: "customer@example.test",
            status: "accepted",
          },
          lost,
        );
      }
    } catch {
      /* Persist uncertainty; never mistake a failed response for no effect. */
    }
    return this.inspect(actor, a.id, true);
  }
  async preflight(actor: Actor, a: Case) {
    return transaction(this.db, actor.orgId, async (c) => {
      await this.access(c, actor);
      const now = await this.get(c, actor, a.id);
      if (
        now.state !== a.state ||
        !now.lease_until ||
        new Date(now.lease_until).getTime() <= Date.now() ||
        !(await this.valid(c, actor, now))
      )
        throw new ControlError(409, "Dispatch authority changed.");
    });
  }
  async inspect(actor: Actor, id: string, ownDispatch = false) {
    const a = await transaction(this.db, actor.orgId, async (c) => {
      await this.access(c, actor);
      const a = await this.get(c, actor, id);
      if (
        !ownDispatch &&
        a.lease_until &&
        new Date(a.lease_until).getTime() > Date.now()
      )
        throw new ControlError(
          409,
          "Wait for the in-flight operation before inspecting.",
        );
      return a;
    });
    let next = a.state,
      reason = a.reason;
    try {
      if (["cancelling", "cancel_uncertain"].includes(a.state)) {
        const o = await this.provider.order(a.id);
        next =
          o.status === "cancelled" && o.actionId === id
            ? "refund_ready"
            : "cancel_uncertain";
        reason =
          next === "refund_ready"
            ? "Cancellation verified. Payment step is ready."
            : "Cancellation is not proven. No refund is allowed.";
      } else if (["refunding", "refund_uncertain"].includes(a.state)) {
        const r = await this.refunds.reconcile(actor, a.refund_id);
        next =
          r.state === "succeeded" &&
          r.amount === a.amount &&
          r.payment_id === PAYMENT
            ? "email_ready"
            : "refund_uncertain";
        reason =
          next === "email_ready"
            ? "Refund verified. Confirmation can now be sent."
            : "Refund is not verified. Confirmation stays held; no second refund is submitted.";
      } else if (["emailing", "email_uncertain"].includes(a.state)) {
        const m = await this.provider.message(a.id);
        const r = await this.refunds.reconcile(actor, a.refund_id);
        next =
          m &&
          m.refundId === r.provider_id &&
          m.amount === a.amount &&
          r.state === "succeeded"
            ? "completed"
            : "email_uncertain";
        reason =
          next === "completed"
            ? "Order cancelled, refund verified, confirmation accepted by the email twin. This is not proof of inbox delivery."
            : "Email acceptance is not proven. Do not resend blindly.";
      }
    } catch {
      next =
        a.state === "cancelling"
          ? "cancel_uncertain"
          : a.state === "refunding"
            ? "refund_uncertain"
            : a.state === "emailing"
              ? "email_uncertain"
              : a.state;
      reason = "Provider evidence unavailable. Keep this case contained.";
    }
    return transaction(this.db, actor.orgId, async (c) => {
      await this.access(c, actor);
      const current = await this.get(c, actor, id);
      if (current.state !== a.state) return current;
      return next === a.state && reason === a.reason
        ? current
        : this.state(c, actor, current, next, reason);
    });
  }
}
