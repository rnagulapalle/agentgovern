import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "./database";
import {
  ControlError,
  parseProposal,
  type Actor,
  type DurableAction,
  type Role,
  type Snapshot,
} from "./contracts";

export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function authenticate(db: Pool, token: string): Promise<Actor> {
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token))
    throw new ControlError(401, "Valid workspace credentials are required.");
  const hash = tokenHash(token);
  const { rows } = await db.query(
    "SELECT org_id,subject,role FROM ll_tokens WHERE hash=$1 AND active=true",
    [hash],
  );
  if (!rows[0])
    throw new ControlError(401, "Valid workspace credentials are required.");
  return {
    orgId: rows[0].org_id,
    subject: rows[0].subject,
    role: rows[0].role,
    tokenHash: hash,
  };
}
async function authorize(c: PoolClient, actor: Actor, roles: Role[]) {
  const { rows } = await c.query(
    "SELECT 1 FROM ll_tokens WHERE hash=$1 AND org_id=$2 AND subject=$3 AND role=$4 AND active=true",
    [actor.tokenHash, actor.orgId, actor.subject, actor.role],
  );
  if (!rows[0] || !roles.includes(actor.role))
    throw new ControlError(403, "This identity cannot perform that operation.");
}
async function event(
  c: PoolClient,
  actor: Actor,
  id: string | null,
  kind: string,
) {
  await c.query(
    "INSERT INTO ll_events(org_id,action_id,kind,subject) VALUES($1,$2,$3,$4)",
    [actor.orgId, id, kind, actor.subject],
  );
}
async function action(
  c: PoolClient,
  actor: Actor,
  id: string,
): Promise<DurableAction> {
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new ControlError(400, "Invalid action ID.");
  const { rows } = await c.query(
    "SELECT * FROM ll_actions WHERE org_id=$1 AND id=$2",
    [actor.orgId, id],
  );
  if (!rows[0])
    throw new ControlError(404, "Action not found in this workspace.");
  return rows[0];
}
async function transition(
  c: PoolClient,
  actor: Actor,
  a: DurableAction,
  state: DurableAction["state"],
  reason: string,
) {
  await c.query(
    "UPDATE ll_actions SET state=$3,reason=$4,lease_token=NULL,lease_until=NULL WHERE org_id=$1 AND id=$2",
    [actor.orgId, a.id, state, reason],
  );
  await event(c, actor, a.id, state);
  return { ...a, state, reason, lease_token: null, lease_until: null };
}
async function current(c: PoolClient, actor: Actor, agentId: string) {
  const org = (
    await c.query("SELECT * FROM ll_orgs WHERE id=$1", [actor.orgId])
  ).rows[0];
  const agent = (
    await c.query("SELECT * FROM ll_agents WHERE org_id=$1 AND id=$2", [
      actor.orgId,
      agentId,
    ])
  ).rows[0];
  const record = (
    await c.query("SELECT * FROM ll_records WHERE org_id=$1", [actor.orgId])
  ).rows[0];
  const identityActive = Boolean(
    (
      await c.query(
        "SELECT 1 FROM ll_tokens WHERE org_id=$1 AND subject=$2 AND role='agent' AND active=true",
        [actor.orgId, agentId],
      )
    ).rows[0],
  );
  return { org, agent, record, identityActive };
}
async function approvalValid(c: PoolClient, actor: Actor, a: DurableAction) {
  if (!a.approved_by) return true;
  return Boolean(
    (
      await c.query(
        "SELECT 1 FROM ll_tokens WHERE org_id=$1 AND subject=$2 AND role='operator' AND active=true",
        [actor.orgId, a.approved_by],
      )
    ).rows[0],
  );
}
function invalid(
  a: DurableAction,
  context: Awaited<ReturnType<typeof current>>,
  now: Date,
) {
  const { org, agent, record, identityActive } = context;
  if (
    !identityActive ||
    !agent?.active ||
    !agent.tools.includes("proof.discount")
  )
    return "Agent identity or tool authority was revoked.";
  if (
    !org ||
    a.policy_version !== org.policy_version ||
    a.discount > org.hard_limit
  )
    return "Policy changed; submit a new action.";
  if (!record || record.version !== a.expected_version)
    return "Source record changed; submit a new action.";
  if (
    a.discount > org.auto_limit &&
    (!a.approved_by || !a.approval_until || new Date(a.approval_until) <= now)
  )
    return "Approval is missing or expired.";
  return null;
}

export class DurableControl {
  constructor(readonly db: Pool) {}
  async readAction(actor: Actor, id: string) {
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["operator", "agent", "worker"]);
      const a = await action(c, actor, id);
      if (actor.role === "agent" && a.agent_id !== actor.subject)
        throw new ControlError(404, "Action not found in this workspace.");
      return { ...a, lease_token: null };
    });
  }
  async snapshot(actor: Actor): Promise<Snapshot> {
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["operator"]);
      const query = async (sql: string) =>
        (await c.query(sql, [actor.orgId])).rows;
      const org = (
        await query(
          "SELECT policy_version AS version,auto_limit,hard_limit FROM ll_orgs WHERE id=$1",
        )
      )[0];
      return {
        policy: org,
        agents: await query(
          "SELECT id,active,tools,action_limit,reserved FROM ll_agents WHERE org_id=$1 ORDER BY id",
        ),
        record: (
          await query("SELECT version,discount FROM ll_records WHERE org_id=$1")
        )[0],
        actions: (
          await query(
            "SELECT * FROM ll_actions WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100",
          )
        ).map((a) => ({ ...a, lease_token: null })),
        events: await query(
          "SELECT id,action_id,kind,subject,at FROM ll_events WHERE org_id=$1 ORDER BY id DESC LIMIT 200",
        ),
        effects: await query(
          "SELECT action_id,before_discount,after_discount,after_version,recovered FROM ll_effects WHERE org_id=$1",
        ),
      };
    });
  }
  async propose(actor: Actor, input: unknown) {
    const p = parseProposal(input);
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["agent", "operator"]);
      if (actor.role === "agent" && actor.subject !== p.agentId)
        throw new ControlError(
          403,
          "Action identity must match the authenticated agent.",
        );
      const digest = tokenHash(
        JSON.stringify([p.agentId, p.discount, p.expectedVersion]),
      );
      const existing = (
        await c.query("SELECT * FROM ll_actions WHERE org_id=$1 AND id=$2", [
          actor.orgId,
          p.actionId,
        ])
      ).rows[0];
      if (existing) {
        if (existing.payload_hash !== digest)
          throw new ControlError(
            409,
            "Action ID is already bound to a different payload.",
          );
        return existing as DurableAction;
      }
      const { agent, org, record, identityActive } = await current(
        c,
        actor,
        p.agentId,
      );
      if (!agent)
        throw new ControlError(
          403,
          "Register the agent before submitting actions.",
        );
      let state: DurableAction["state"] = "ready";
      let reason = "Identity and policy verified; queued for execution.";
      if (
        !identityActive ||
        !agent.active ||
        !agent.tools.includes("proof.discount") ||
        !record ||
        !org
      ) {
        state = "blocked";
        reason = "Required identity, capability, or evidence is missing.";
      } else if (record.version !== p.expectedVersion) {
        state = "blocked";
        reason = "Source record version is stale.";
      } else if (p.discount > org.hard_limit) {
        state = "blocked";
        reason = "Discount exceeds the hard policy limit.";
      } else if (agent.reserved >= agent.action_limit) {
        state = "blocked";
        reason = "Agent action allowance is exhausted.";
      } else if (p.discount > org.auto_limit) {
        state = "held";
        reason = "Named operator approval is required.";
      }
      if (state !== "blocked")
        await c.query(
          "UPDATE ll_agents SET reserved=reserved+1 WHERE org_id=$1 AND id=$2",
          [actor.orgId, p.agentId],
        );
      const { rows } = await c.query(
        "INSERT INTO ll_actions(org_id,id,agent_id,discount,expected_version,policy_version,payload_hash,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          actor.orgId,
          p.actionId,
          p.agentId,
          p.discount,
          p.expectedVersion,
          org.policy_version,
          digest,
          state,
          reason,
        ],
      );
      await event(c, actor, p.actionId, state);
      return rows[0] as DurableAction;
    });
  }
  async review(
    actor: Actor,
    id: string,
    approve: boolean,
    payloadHash: string,
  ) {
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["operator"]);
      const a = await action(c, actor, id);
      if (a.payload_hash !== payloadHash)
        throw new ControlError(
          409,
          "Review must bind the exact action payload.",
        );
      if (a.state !== "held") return a;
      if (!approve)
        return transition(c, actor, a, "rejected", "Rejected by the operator.");
      const context = await current(c, actor, a.agent_id);
      // Approval must be checked without treating the not-yet-issued approval as missing.
      const now = (await c.query("SELECT clock_timestamp() AS now")).rows[0]
        .now;
      const reason = invalid(
        {
          ...a,
          approved_by: actor.subject,
          approval_until: new Date(now.getTime() + 900000).toISOString(),
        },
        context,
        now,
      );
      if (reason) return transition(c, actor, a, "cancelled", reason);
      await c.query(
        "UPDATE ll_actions SET state='ready',reason='Approved exact payload; queued.',approved_by=$3,approval_until=clock_timestamp()+interval '15 minutes' WHERE org_id=$1 AND id=$2",
        [actor.orgId, id, actor.subject],
      );
      await event(c, actor, id, "approved");
      return action(c, actor, id);
    });
  }
  async claim(actor: Actor, id: string) {
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["worker", "operator"]);
      const a = await action(c, actor, id);
      const now = (await c.query("SELECT clock_timestamp() AS now")).rows[0]
        .now;
      if (
        a.state === "executing" &&
        a.lease_until &&
        new Date(a.lease_until) <= now
      )
        return transition(
          c,
          actor,
          a,
          "uncertain",
          "Execution lease expired. Verify the effect before retrying.",
        );
      if (a.state !== "ready") return { ...a, lease_token: null };
      const reason = invalid(a, await current(c, actor, a.agent_id), now);
      if (reason) return transition(c, actor, a, "cancelled", reason);
      if (!(await approvalValid(c, actor, a)))
        return transition(
          c,
          actor,
          a,
          "cancelled",
          "Approver authority was revoked.",
        );
      await c.query(
        "UPDATE ll_actions SET state='executing',reason='Worker lease acquired.',lease_token=$3,lease_until=clock_timestamp()+interval '30 seconds' WHERE org_id=$1 AND id=$2",
        [actor.orgId, id, randomUUID()],
      );
      await event(c, actor, id, "executing");
      return action(c, actor, id);
    });
  }
  // This is a controlled PostgreSQL connector, not an arbitrary remote API executor.
  async applyEffect(actor: Actor, id: string, lease: string) {
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["worker", "operator"]);
      const a = await action(c, actor, id);
      const now = (await c.query("SELECT clock_timestamp() AS now")).rows[0]
        .now;
      if (
        a.state !== "executing" ||
        a.lease_token !== lease ||
        !a.lease_until ||
        new Date(a.lease_until) <= now
      )
        throw new ControlError(409, "Execution lease is invalid or expired.");
      const existing = (
        await c.query(
          "SELECT * FROM ll_effects WHERE org_id=$1 AND action_id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      if (existing) return existing;
      const context = await current(c, actor, a.agent_id);
      const reason = invalid(a, context, now);
      if (reason) {
        await transition(c, actor, a, "cancelled", reason);
        return null;
      }
      if (!(await approvalValid(c, actor, a))) {
        await transition(
          c,
          actor,
          a,
          "cancelled",
          "Approver authority was revoked.",
        );
        return null;
      }
      const { rows } = await c.query(
        "UPDATE ll_records SET discount=$2,version=version+1 WHERE org_id=$1 AND version=$3 RETURNING version",
        [actor.orgId, a.discount, a.expected_version],
      );
      if (!rows[0])
        throw new ControlError(409, "Record changed during execution.");
      const effect = (
        await c.query(
          "INSERT INTO ll_effects(org_id,action_id,before_discount,after_discount,after_version) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [
            actor.orgId,
            id,
            context.record.discount,
            a.discount,
            rows[0].version,
          ],
        )
      ).rows[0];
      await event(c, actor, id, "effect_recorded");
      return effect;
    });
  }
  async finish(actor: Actor, id: string, lease: string, lostResponse = false) {
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["worker", "operator"]);
      const a = await action(c, actor, id);
      if (a.state !== "executing" || a.lease_token !== lease) return a;
      const effect = (
        await c.query(
          "SELECT 1 FROM ll_effects WHERE org_id=$1 AND action_id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      const now = (await c.query("SELECT clock_timestamp() AS now")).rows[0]
        .now;
      if (
        lostResponse ||
        !effect ||
        !a.lease_until ||
        new Date(a.lease_until) <= now
      )
        return transition(
          c,
          actor,
          a,
          "uncertain",
          "Outcome uncertain; reconciliation required.",
        );
      return transition(
        c,
        actor,
        a,
        "succeeded",
        "Controlled connector effect recorded.",
      );
    });
  }
  async execute(actor: Actor, id: string, lostResponse = false) {
    const a = await this.claim(actor, id);
    if (a.state !== "executing" || !a.lease_token) return a;
    // Only the caller that acquired a fresh lease receives the lease token.
    await this.applyEffect(actor, id, a.lease_token);
    return this.finish(actor, id, a.lease_token, lostResponse);
  }
  async reconcile(actor: Actor, id: string) {
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["operator"]);
      const a = await action(c, actor, id);
      const now = (await c.query("SELECT clock_timestamp() AS now")).rows[0]
        .now;
      if (
        a.state === "executing" &&
        a.lease_until &&
        new Date(a.lease_until) > now
      )
        throw new ControlError(
          409,
          "Wait for the worker lease to expire before reconciliation.",
        );
      if (!["uncertain", "executing"].includes(a.state)) return a;
      const effect = (
        await c.query(
          "SELECT * FROM ll_effects WHERE org_id=$1 AND action_id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      const context = await current(c, actor, a.agent_id);
      if (effect) {
        if (
          context.record.version !== effect.after_version ||
          context.record.discount !== effect.after_discount
        )
          return transition(
            c,
            actor,
            a,
            "conflict",
            "Effect exists, but the record changed afterward. Manual review required.",
          );
        return transition(
          c,
          actor,
          a,
          "succeeded",
          "Reconciliation verified the existing effect. No retry performed.",
        );
      }
      const reason = invalid(a, context, now);
      if (reason) return transition(c, actor, a, "cancelled", reason);
      return transition(
        c,
        actor,
        a,
        "ready",
        "Controlled connector confirms no effect. Old lease fenced; safe to execute.",
      );
    });
  }
  async recover(actor: Actor, id: string) {
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["operator"]);
      const a = await action(c, actor, id);
      if (a.state !== "succeeded") return a;
      const context = await current(c, actor, a.agent_id);
      if (context.agent.active)
        throw new ControlError(
          409,
          "Contain the agent before restoring state.",
        );
      const effect = (
        await c.query(
          "SELECT * FROM ll_effects WHERE org_id=$1 AND action_id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      if (
        !effect ||
        effect.recovered ||
        context.record.version !== effect.after_version ||
        context.record.discount !== effect.after_discount
      )
        return transition(
          c,
          actor,
          a,
          "conflict",
          "Recovery refused: record no longer matches the observed effect.",
        );
      await c.query(
        "UPDATE ll_records SET discount=$2,version=version+1 WHERE org_id=$1",
        [actor.orgId, effect.before_discount],
      );
      await c.query(
        "UPDATE ll_effects SET recovered=true WHERE org_id=$1 AND action_id=$2",
        [actor.orgId, id],
      );
      return transition(
        c,
        actor,
        a,
        "recovered",
        "Previous discount restored as a new version. Agent remains contained.",
      );
    });
  }
  async configure(
    actor: Actor,
    command: { agentActive?: boolean; autoLimit?: number },
  ) {
    if (
      !command ||
      typeof command !== "object" ||
      Array.isArray(command) ||
      Object.keys(command).some(
        (k) => !["agentActive", "autoLimit"].includes(k),
      ) ||
      (command.agentActive === undefined && command.autoLimit === undefined) ||
      (command.agentActive !== undefined &&
        typeof command.agentActive !== "boolean") ||
      (command.autoLimit !== undefined &&
        (!Number.isInteger(command.autoLimit) ||
          command.autoLimit < 0 ||
          command.autoLimit > 50)) ||
      Object.keys(command).length !== 1
    )
      throw new ControlError(400, "Change exactly one valid control.");
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["operator"]);
      if (command.agentActive !== undefined) {
        await c.query("UPDATE ll_agents SET active=$2 WHERE org_id=$1", [
          actor.orgId,
          command.agentActive,
        ]);
        await event(
          c,
          actor,
          null,
          command.agentActive ? "agents_enabled" : "agents_contained",
        );
      } else {
        await c.query(
          "UPDATE ll_orgs SET auto_limit=$2,policy_version=policy_version+1 WHERE id=$1",
          [actor.orgId, command.autoLimit],
        );
        await event(c, actor, null, "policy_changed");
      }
      if (command.agentActive === false || command.autoLimit !== undefined) {
        const { rows } = await c.query(
          "SELECT * FROM ll_actions WHERE org_id=$1 AND state IN ('held','ready','executing')",
          [actor.orgId],
        );
        for (const a of rows)
          await transition(
            c,
            actor,
            a,
            a.state === "executing" ? "uncertain" : "cancelled",
            "Authority changed; previous authorization invalidated.",
          );
      }
    });
  }
}
