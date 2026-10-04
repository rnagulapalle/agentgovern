import { activeApprover } from "../workspace/identity";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "../durable/database";
import { authorize, tokenHash } from "../durable/service";
import { ControlError, type Actor } from "../durable/contracts";
import {
  parseRefund,
  type RefundAction,
  type RefundProvider,
  type RefundSnapshot,
  type ProviderRefund,
} from "./contracts";

export class RefundControl {
  constructor(
    readonly db: Pool,
    readonly provider: RefundProvider,
  ) {}
  async authorize(c: PoolClient, actor: Actor, roles: Actor["role"][]) {
    await authorize(c, actor, roles);
    if (actor.orgId !== this.provider.workspaceId)
      throw new ControlError(
        403,
        "This workspace has no refund-provider binding.",
      );
  }
  async get(c: PoolClient, actor: Actor, id: string): Promise<RefundAction> {
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new ControlError(400, "Invalid refund action ID.");
    const a = (
      await c.query(
        "SELECT * FROM ll_refund_actions WHERE org_id=$1 AND id=$2",
        [actor.orgId, id],
      )
    ).rows[0];
    if (!a || (actor.role === "agent" && a.agent_id !== actor.subject))
      throw new ControlError(404, "Refund action not found.");
    return a;
  }
  async event(c: PoolClient, actor: Actor, id: string, kind: string) {
    await c.query(
      "INSERT INTO ll_refund_events(org_id,action_id,kind,subject) VALUES($1,$2,$3,$4)",
      [actor.orgId, id, kind, actor.subject],
    );
  }
  async state(
    c: PoolClient,
    actor: Actor,
    a: RefundAction,
    state: RefundAction["state"],
    reason: string,
  ) {
    if (
      ["held", "ready"].includes(a.state) &&
      ["cancelled", "rejected"].includes(state)
    )
      await c.query(
        "UPDATE ll_refund_policies SET reserved=reserved-$2 WHERE org_id=$1",
        [actor.orgId, a.amount],
      );
    await c.query(
      "UPDATE ll_refund_actions SET state=$3,reason=$4,lease_token=NULL,lease_until=NULL WHERE org_id=$1 AND id=$2",
      [actor.orgId, a.id, state, reason],
    );
    await this.event(c, actor, a.id, state);
    return { ...a, state, reason, lease_token: null, lease_until: null };
  }
  async context(c: PoolClient, actor: Actor) {
    const policy = (
      await c.query("SELECT * FROM ll_refund_policies WHERE org_id=$1", [
        actor.orgId,
      ])
    ).rows[0];
    const agent = (
      await c.query(
        "SELECT * FROM ll_agents WHERE org_id=$1 AND id='refund-agent'",
        [actor.orgId],
      )
    ).rows[0];
    const active = (
      await c.query(
        "SELECT 1 FROM ll_tokens WHERE org_id=$1 AND subject='refund-agent' AND role='agent' AND active=true",
        [actor.orgId],
      )
    ).rowCount;
    return { policy, agent, active };
  }
  async invalid(
    c: PoolClient,
    actor: Actor,
    a: RefundAction,
    approving = false,
  ) {
    const { policy, agent, active } = await this.context(c, actor);
    if (
      !policy ||
      !active ||
      !agent?.active ||
      !agent.tools.includes("stripe.refund")
    )
      return "Refund agent identity or refund permission is unavailable.";
    if (a.policy_version !== policy.version || a.amount > policy.hard_limit)
      return "Refund policy changed; propose a new action.";
    const valid = a.approved_by ? await activeApprover(c, actor.orgId, a.approved_by) : false;
    if (
      !approving &&
      a.amount > policy.auto_limit &&
      (!valid ||
        !a.approval_until ||
        new Date(a.approval_until).getTime() <= Date.now())
    )
      return "Exact approval is missing, expired, or revoked.";
    return null;
  }
  async read(actor: Actor, id: string) {
    return transaction(this.db, actor.orgId, async (c) => {
      await this.authorize(c, actor, ["agent", "operator", "worker"]);
      return { ...(await this.get(c, actor, id)), lease_token: null };
    });
  }
  async snapshot(actor: Actor): Promise<RefundSnapshot> {
    const s = await transaction(this.db, actor.orgId, async (c) => {
      await this.authorize(c, actor, ["operator"]);
      const { policy, agent } = await this.context(c, actor);
      if (!policy)
        throw new ControlError(
          503,
          "Run refund setup before opening this workspace.",
        );
      const actions = (
        await c.query(
          "SELECT * FROM ll_refund_actions WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100",
          [actor.orgId],
        )
      ).rows.map((a) => ({ ...a, lease_token: null }));
      const events = (
        await c.query(
          "SELECT id,action_id,kind,subject,at FROM ll_refund_events WHERE org_id=$1 ORDER BY id DESC LIMIT 100",
          [actor.orgId],
        )
      ).rows;
      return {
        policy,
        agent: agent
          ? { id: agent.id, active: agent.active, tools: agent.tools }
          : null,
        actions,
        events,
      };
    });
    try {
      return {
        ...s,
        provider: {
          available: true,
          payment: await this.provider.payment(),
          refunds: await this.provider.refunds(),
        },
      };
    } catch {
      return {
        ...s,
        provider: { available: false, payment: null, refunds: [] },
      };
    }
  }
  async propose(actor: Actor, input: unknown) {
    const p = parseRefund(input);
    return transaction(this.db, actor.orgId, async (c) => {
      await this.authorize(c, actor, ["agent", "operator"]);
      if (actor.role === "agent" && actor.subject !== p.agentId)
        throw new ControlError(
          403,
          "Authenticated agent must match the proposal.",
        );
      const digest = tokenHash(
        JSON.stringify([p.agentId, p.paymentId, p.amount, p.currency]),
      );
      const old = (
        await c.query(
          "SELECT * FROM ll_refund_actions WHERE org_id=$1 AND id=$2",
          [actor.orgId, p.actionId],
        )
      ).rows[0];
      if (old) {
        if (old.payload_hash !== digest)
          throw new ControlError(
            409,
            "Action ID belongs to a different refund.",
          );
        return { ...old, lease_token: null };
      }
      const { policy, agent, active } = await this.context(c, actor);
      if (!policy || !agent)
        throw new ControlError(503, "Provision the refund workspace first.");
      let state: RefundAction["state"] = "ready",
        reason = "Within authority. Ready for the controlled refund worker.";
      if (!active || !agent.active || !agent.tools.includes("stripe.refund")) {
        state = "blocked";
        reason = "Refund agent is contained or lacks permission.";
      } else if (p.amount > policy.hard_limit) {
        state = "blocked";
        reason = "Refund exceeds the hard per-action limit.";
      } else if (policy.reserved + p.amount > policy.budget) {
        state = "blocked";
        reason = "Workspace refund allowance is exhausted.";
      } else {
        try {
          const payment = await this.provider.payment();
          const reserved = Number(
            (
              await c.query(
                "SELECT COALESCE(sum(amount),0) AS total FROM ll_refund_actions WHERE org_id=$1 AND state IN ('held','ready','executing','uncertain','conflict')",
                [actor.orgId],
              )
            ).rows[0].total,
          );
          if (p.amount + reserved + payment.amount_refunded > payment.amount) {
            state = "blocked";
            reason =
              "Refund exceeds the unreserved refundable payment balance.";
          } else if (p.amount > policy.auto_limit) {
            state = "held";
            reason = "A named operator must approve this exact refund amount.";
          }
        } catch {
          state = "blocked";
          reason = "Trusted payment evidence is unavailable; refund denied.";
        }
      }
      if (state !== "blocked")
        await c.query(
          "UPDATE ll_refund_policies SET reserved=reserved+$2 WHERE org_id=$1",
          [actor.orgId, p.amount],
        );
      const a = (
        await c.query(
          "INSERT INTO ll_refund_actions(org_id,id,agent_id,payment_id,amount,currency,policy_version,payload_hash,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
          [
            actor.orgId,
            p.actionId,
            p.agentId,
            p.paymentId,
            p.amount,
            p.currency,
            policy.version,
            digest,
            state,
            reason,
          ],
        )
      ).rows[0];
      await this.event(c, actor, a.id, state);
      return a as RefundAction;
    });
  }
  async review(actor: Actor, id: string, hash: string, approve: boolean) {
    return transaction(this.db, actor.orgId, async (c) => {
      await this.authorize(c, actor, ["operator"]);
      const a = await this.get(c, actor, id);
      if (a.payload_hash !== hash)
        throw new ControlError(
          409,
          "Approval must match the exact refund payload.",
        );
      if (a.state !== "held") return { ...a, lease_token: null };
      if (!approve)
        return this.state(
          c,
          actor,
          a,
          "rejected",
          "Operator rejected this refund.",
        );
      const reason = await this.invalid(c, actor, a, true);
      if (reason) return this.state(c, actor, a, "cancelled", reason);
      await c.query(
        "UPDATE ll_refund_actions SET approved_by=$3,approval_until=clock_timestamp()+interval '15 minutes' WHERE org_id=$1 AND id=$2",
        [actor.orgId, id, actor.subject],
      );
      const ready = await this.state(
        c,
        actor,
        a,
        "ready",
        "Exact refund approved for 15 minutes.",
      );
      return { ...ready, approved_by: actor.subject };
    });
  }
  matching(a: RefundAction, r: ProviderRefund) {
    return (
      r &&
      typeof r.id === "string" &&
      r.id.startsWith("re_") &&
      r.metadata?.looplabs_action === a.id &&
      r.charge === a.payment_id &&
      r.amount === a.amount &&
      r.currency === a.currency &&
      ["pending", "succeeded", "failed", "canceled"].includes(r.status)
    );
  }
  async observe(
    c: PoolClient,
    actor: Actor,
    a: RefundAction,
    r: ProviderRefund,
  ) {
    if (!this.matching(a, r))
      return this.state(
        c,
        actor,
        a,
        "conflict",
        "Provider evidence does not match the authorized refund. Manual review required.",
      );
    await c.query(
      "UPDATE ll_refund_actions SET provider_id=$3,provider_status=$4 WHERE org_id=$1 AND id=$2",
      [actor.orgId, a.id, r.id, r.status],
    );
    return this.state(
      c,
      actor,
      { ...a, provider_id: r.id, provider_status: r.status },
      r.status === "succeeded" ? "succeeded" : "uncertain",
      r.status === "succeeded"
        ? "Provider confirms one matching refund. No further write is needed."
        : `Provider refund is ${r.status}. Keep the reservation and review; do not issue another refund.`,
    );
  }
  async execute(actor: Actor, id: string, lostResponse = false) {
    // Persist intent before the HTTP boundary. A worker crash leaves a lease, not a fabricated success.
    const claim = await transaction(this.db, actor.orgId, async (c) => {
      await this.authorize(c, actor, ["operator", "worker"]);
      const a = await this.get(c, actor, id);
      if (
        a.state === "executing" &&
        a.lease_until &&
        new Date(a.lease_until).getTime() <= Date.now()
      )
        return this.state(
          c,
          actor,
          a,
          "uncertain",
          "Worker lease expired. Reconcile before any further action.",
        );
      if (a.state !== "ready") return { ...a, lease_token: null };
      const reason = await this.invalid(c, actor, a);
      if (reason) return this.state(c, actor, a, "cancelled", reason);
      const lease = randomUUID();
      await c.query(
        "UPDATE ll_refund_actions SET state='executing',lease_token=$3,lease_until=clock_timestamp()+interval '30 seconds',reason='Refund worker claimed the authorized action.' WHERE org_id=$1 AND id=$2",
        [actor.orgId, id, lease],
      );
      await this.event(c, actor, id, "executing");
      return { ...a, state: "executing" as const, lease_token: lease };
    });
    if (!claim.lease_token) return claim;
    return transaction(this.db, actor.orgId, async (c) => {
      await this.authorize(c, actor, ["operator", "worker"]);
      const a = await this.get(c, actor, id);
      if (
        a.state !== "executing" ||
        a.lease_token !== claim.lease_token ||
        !a.lease_until ||
        new Date(a.lease_until).getTime() <= Date.now()
      )
        return { ...a, lease_token: null };
      const reason = await this.invalid(c, actor, a);
      if (reason) return this.state(c, actor, a, "cancelled", reason);
      try {
        const payment = await this.provider.payment();
        if (payment.amount_refunded + a.amount > payment.amount)
          return this.state(
            c,
            actor,
            a,
            "conflict",
            "Payment balance changed. Refund cannot safely continue.",
          );
        return await this.observe(
          c,
          actor,
          a,
          await this.provider.create(a, lostResponse),
        );
      } catch {
        return this.state(
          c,
          actor,
          a,
          "uncertain",
          "Provider response was not verified. Inspect the provider before any retry.",
        );
      }
    });
  }
  async reconcile(actor: Actor, id: string) {
    return transaction(this.db, actor.orgId, async (c) => {
      await this.authorize(c, actor, ["operator"]);
      const a = await this.get(c, actor, id);
      if (
        a.state === "executing" &&
        a.lease_until &&
        new Date(a.lease_until).getTime() > Date.now()
      )
        throw new ControlError(
          409,
          "Wait for the worker lease before reconciliation.",
        );
      if (!["uncertain", "executing", "succeeded"].includes(a.state))
        return { ...a, lease_token: null };
      let matches: ProviderRefund[];
      try {
        matches = (await this.provider.refunds()).filter(
          (r) => r.metadata.looplabs_action === a.id,
        );
      } catch {
        return this.state(
          c,
          actor,
          a,
          "uncertain",
          "Provider lookup failed. Keep contained; no retry performed.",
        );
      }
      if (matches.length > 1)
        return this.state(
          c,
          actor,
          a,
          "conflict",
          "Multiple provider refunds match this action. Manual review required.",
        );
      if (!matches.length)
        return this.state(
          c,
          actor,
          a,
          "uncertain",
          "No matching refund observed. Absence is not proof of safe retry; manual review required.",
        );
      return this.observe(c, actor, a, matches[0]);
    });
  }
  async configure(actor: Actor, input: Record<string, unknown>) {
    const keys = Object.keys(input);
    if (
      keys.length !== 1 ||
      (keys[0] === "agentActive"
        ? typeof input.agentActive !== "boolean"
        : keys[0] !== "autoLimit" ||
          !Number.isSafeInteger(input.autoLimit) ||
          Number(input.autoLimit) < 0 ||
          Number(input.autoLimit) > 10000)
    )
      throw new ControlError(400, "Change exactly one valid refund control.");
    return transaction(this.db, actor.orgId, async (c) => {
      await this.authorize(c, actor, ["operator"]);
      if (keys[0] === "agentActive")
        await c.query(
          "UPDATE ll_agents SET active=$2 WHERE org_id=$1 AND id='refund-agent'",
          [actor.orgId, input.agentActive],
        );
      else
        await c.query(
          "UPDATE ll_refund_policies SET auto_limit=$2,version=version+1 WHERE org_id=$1",
          [actor.orgId, input.autoLimit],
        );
      if (input.agentActive === false || keys[0] === "autoLimit") {
        const rows = (
          await c.query(
            "SELECT * FROM ll_refund_actions WHERE org_id=$1 AND state IN ('held','ready','executing')",
            [actor.orgId],
          )
        ).rows;
        for (const a of rows)
          await this.state(
            c,
            actor,
            a,
            a.state === "executing" ? "uncertain" : "cancelled",
            "Authority changed. Prior authorization invalidated.",
          );
      }
      return { completed: true };
    });
  }
}
